#![no_std]

//! # Pass Game
//!
//! A simple two-player guessing game where players guess a number between 1 and 10.
//! The player whose guess is closest to the randomly generated number wins.
//!
//! **Game Hub Integration:**
//! This game is Game Hub-aware and enforces all games to be played through the
//! Game Hub contract. Games cannot be started or completed without points involvement.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, vec, Address, BytesN, Env,
    IntoVal,
};

// Import GameHub contract interface
// This allows us to call into the GameHub contract
#[contractclient(name = "GameHubClient")]
pub trait GameHub {
    fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    );

    fn end_game(env: Env, session_id: u32, player1_won: bool);
}

// ============================================================================
// Errors
// ============================================================================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    GameNotFound = 1,
    NotPlayer = 2,
    AlreadyGuessed = 3,
    GameAlreadyEnded = 5,
    InvalidStatus = 6,
    SecretAlreadyRegistered = 7,
    BothPlayersNotGuessed = 8,
}

// ============================================================================
// Data Types
// ============================================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GameResult {
    pub player: Address,
    pub acertos: u32,    // Números corretos na posição correta
    pub erros: u32,      // Números incorretos
    pub permutados: u32, // Números corretos mas na posição errada
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProofData {
    pub player: Address,
    pub acertos: u32,
    pub erros: u32,
    pub permutados: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    pub player1_secret_hash: Option<BytesN<32>>,
    pub player2_secret_hash: Option<BytesN<32>>,
    pub player1_last_guess: Option<u32>,
    pub player2_last_guess: Option<u32>,
    pub player1_proof: soroban_sdk::Vec<ProofData>, // Prova enviada pelo frontend
    pub player2_proof: soroban_sdk::Vec<ProofData>, // Prova enviada pelo frontend
    pub winner: Option<Address>,
    pub status: GameStatus,
    pub player1_result: soroban_sdk::Vec<GameResult>,
    pub player2_result: soroban_sdk::Vec<GameResult>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GameStatus {
    WaitingForPlayers,
    Setup,
    Playing,
    Draw,   // Empatado - ambos acertaram
    Winner, // Alguém venceu
    Finished,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Game(u32),
    GameHubAddress,
    Admin,
}

// ============================================================================
// Storage TTL Management
// ============================================================================
// TTL (Time To Live) ensures game data doesn't expire unexpectedly
// Games are stored in temporary storage with a minimum 30-day retention

/// TTL for game storage (30 days in ledgers, ~5 seconds per ledger)
/// 30 days = 30 * 24 * 60 * 60 / 5 = 518,400 ledgers
const GAME_TTL_LEDGERS: u32 = 518_400;

// ============================================================================
// Contract Definition
// ============================================================================

#[contract]
pub struct PassContract;

#[contractimpl]
impl PassContract {
    /// Initialize the contract with GameHub address and admin
    ///
    /// # Arguments
    /// * `admin` - Admin address (can upgrade contract)
    /// * `game_hub` - Address of the GameHub contract
    pub fn __constructor(env: Env, admin: Address, game_hub: Address) {
        // Store admin and GameHub address
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::GameHubAddress, &game_hub);
    }

    /// Start a new game between two players with points.
    /// This creates a session in the Game Hub and locks points before starting the game.
    ///
    /// **CRITICAL:** This method requires authorization from THIS contract (not players).
    /// The Game Hub will call `game_id.require_auth()` which checks this contract's address.
    ///
    /// # Arguments
    /// * `session_id` - Unique session identifier (u32)
    /// * `player1` - Address of first player
    /// * `player2` - Address of second player
    /// * `player1_points` - Points amount committed by player 1
    /// * `player2_points` - Points amount committed by player 2
    pub fn start_game(
        env: Env,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    ) -> Result<(), Error> {
        // Prevent self-play: Player 1 and Player 2 must be different
        if player1 == player2 {
            panic!(
                "Cannot play against yourself: Player 1 and Player 2 must be different addresses"
            );
        }

        // Require authentication from both players (they consent to committing points)
        player1.require_auth_for_args(vec![
            &env,
            session_id.into_val(&env),
            player1_points.into_val(&env),
        ]);
        player2.require_auth_for_args(vec![
            &env,
            session_id.into_val(&env),
            player2_points.into_val(&env),
        ]);

        // Get GameHub address
        let game_hub_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set");

        // Create GameHub client
        let game_hub = GameHubClient::new(&env, &game_hub_addr);

        // Call Game Hub to start the session and lock points
        // This requires THIS contract's authorization (env.current_contract_address())
        game_hub.start_game(
            &env.current_contract_address(),
            &session_id,
            &player1,
            &player2,
            &player1_points,
            &player2_points,
        );

        // Create game
        let game = Game {
            player1: player1.clone(),
            player2: player2.clone(),
            player1_points,
            player2_points,
            player1_secret_hash: None,
            player2_secret_hash: None,
            player1_last_guess: None,
            player2_last_guess: None,
            player1_proof: soroban_sdk::Vec::new(&env),
            player2_proof: soroban_sdk::Vec::new(&env),
            winner: None,
            status: GameStatus::Setup,
            player1_result: soroban_sdk::Vec::new(&env),
            player2_result: soroban_sdk::Vec::new(&env),
        };

        // Store game in temporary storage with 30-day TTL
        let game_key = DataKey::Game(session_id);
        env.storage().temporary().set(&game_key, &game);

        // Set TTL to ensure game is retained for at least 30 days
        env.storage()
            .temporary()
            .extend_ttl(&game_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

    /// Register the secret hash for a player.
    /// Both players must register their secret hash to start the game.
    ///
    /// # Arguments
    /// * `session_id` - The session ID of the game
    /// * `player` - Address of the player registering the secret
    /// * `secret_hash` - SHA256 hash of the secret number
    pub fn register_secret(
        env: Env,
        session_id: u32,
        player: Address,
        secret_hash: BytesN<32>,
    ) -> Result<(), Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if game.status != GameStatus::Setup {
            return Err(Error::InvalidStatus);
        }

        if player == game.player1 {
            if game.player1_secret_hash.is_some() {
                return Err(Error::SecretAlreadyRegistered);
            }
            game.player1_secret_hash = Some(secret_hash);
        } else if player == game.player2 {
            if game.player2_secret_hash.is_some() {
                return Err(Error::SecretAlreadyRegistered);
            }
            game.player2_secret_hash = Some(secret_hash);
        } else {
            return Err(Error::NotPlayer);
        }

        // Check if both players have registered secrets
        if game.player1_secret_hash.is_some() && game.player2_secret_hash.is_some() {
            game.status = GameStatus::Playing;
        }

        env.storage().temporary().set(&key, &game);
        Ok(())
    }

    /// Submit a guess for the opponent's secret.
    ///
    /// # Arguments
    /// * `session_id` - The session ID of the game
    /// * `player` - Address of the player making the guess
    /// * `guess` - The guessed number
    pub fn submit_guess(
        env: Env,
        session_id: u32,
        player: Address,
        guess: u32,
    ) -> Result<(), Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if game.status != GameStatus::Playing {
            return Err(Error::InvalidStatus);
        }

        if player == game.player1 {
            game.player1_last_guess = Some(guess);
        } else if player == game.player2 {
            game.player2_last_guess = Some(guess);
        } else {
            return Err(Error::NotPlayer);
        }

        env.storage().temporary().set(&key, &game);
        Ok(())
    }

    /// Submit proof with game statistics calculated by frontend.
    /// Each player submits their results: acertos, erros, permutados
    ///
    /// # Arguments
    /// * `session_id` - The session ID of the game
    /// * `player` - Address of the player submitting the proof
    /// * `acertos` - Number of correct digits in correct positions
    /// * `erros` - Number of wrong digits
    /// * `permutados` - Number of correct digits in wrong positions
    pub fn submit_proof(
        env: Env,
        session_id: u32,
        player: Address,
        acertos: u32,
        erros: u32,
        permutados: u32,
    ) -> Result<(), Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if game.status != GameStatus::Playing {
            return Err(Error::InvalidStatus);
        }

        let proof_data = ProofData {
            player: player.clone(),
            acertos,
            erros,
            permutados,
        };

        if player == game.player1 {
            game.player1_proof = vec![&env, proof_data];
        } else if player == game.player2 {
            game.player2_proof = vec![&env, proof_data];
        } else {
            return Err(Error::NotPlayer);
        }

        env.storage().temporary().set(&key, &game);
        env.storage()
            .temporary()
            .extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

    /// Verify proofs submitted by both players and determine the winner.
    /// This function checks if both players have submitted their proofs,
    /// validates the results, and updates the game status accordingly.
    ///
    /// Status changes:
    /// - Playing: se ninguém acertou (ambos continuam jogando)
    /// - Draw: se ambos acertaram (acertos == 4)
    /// - Winner: se apenas um jogador acertou
    ///
    /// # Arguments
    /// * `session_id` - The session ID of the game
    ///
    /// # Returns
    /// Result containing both players' results
    pub fn verify_proof(env: Env, session_id: u32) -> Result<(GameResult, GameResult), Error> {
        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        // If game is not in Playing status, it might have been already verified
        // Return existing results if they exist to handle race conditions gracefully
        if game.status != GameStatus::Playing {
            if game.player1_result.len() > 0 && game.player2_result.len() > 0 {
                return Ok((
                    game.player1_result.get_unchecked(0),
                    game.player2_result.get_unchecked(0),
                ));
            }
            return Err(Error::InvalidStatus);
        }

        // Both players must have submitted proofs
        // Note: player1_proof is the proof submitted by player 1,
        // which contains the verification of Player 2's guess.
        let p1_submitted_proof = game.player1_proof.get(0).ok_or(Error::InvalidStatus)?;
        let p2_submitted_proof = game.player2_proof.get(0).ok_or(Error::InvalidStatus)?;

        // Check who guessed correctly
        // p1_submitted_proof contains result for Player 2
        // p2_submitted_proof contains result for Player 1
        let p2_guessed_correctly = p1_submitted_proof.acertos == 3;
        let p1_guessed_correctly = p2_submitted_proof.acertos == 3;

        // Convert proofs to results
        // result_p1 will be the result of Player 1's guess (verified by P2)
        // result_p2 will be the result of Player 2's guess (verified by P1)
        let result_p1 = GameResult {
            player: game.player1.clone(),
            acertos: p2_submitted_proof.acertos,
            erros: p2_submitted_proof.erros,
            permutados: p2_submitted_proof.permutados,
        };

        let result_p2 = GameResult {
            player: game.player2.clone(),
            acertos: p1_submitted_proof.acertos,
            erros: p1_submitted_proof.erros,
            permutados: p1_submitted_proof.permutados,
        };

        // Determine game outcome
        match (p1_guessed_correctly, p2_guessed_correctly) {
            (true, true) => {
                // Both guessed correctly - Draw
                game.status = GameStatus::Draw;
                game.winner = None;
            }
            (true, false) => {
                // Player 1 wins
                game.status = GameStatus::Winner;
                game.winner = Some(game.player1.clone());
            }
            (false, true) => {
                // Player 2 wins
                game.status = GameStatus::Winner;
                game.winner = Some(game.player2.clone());
            }
            (false, false) => {
                // No one guessed correctly - continue playing
                game.status = GameStatus::Playing;
                // We keep results in playerX_result but clear proofs/guesses for next round
                game.player1_proof = vec![&env];
                game.player2_proof = vec![&env];
                game.player1_last_guess = None;
                game.player2_last_guess = None;
            }
        }

        // Store results for the current round
        game.player1_result = vec![&env, result_p1.clone()];
        game.player2_result = vec![&env, result_p2.clone()];

        // Save updated game state
        env.storage().temporary().set(&key, &game);
        env.storage()
            .temporary()
            .extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        // If game ended (Draw or Winner), notify GameHub
        if game.status == GameStatus::Draw || game.status == GameStatus::Winner {
            let hub_addr: Address = env
                .storage()
                .instance()
                .get(&DataKey::GameHubAddress)
                .unwrap();
            let hub = GameHubClient::new(&env, &hub_addr);
            let player1_won = game.winner.as_ref().map_or(false, |w| w == &game.player1);
            hub.end_game(&session_id, &player1_won);
        }

        Ok((result_p1, result_p2))
    }

    /// Check if the game has ended and return the winner if exists.
    /// Returns:
    /// - Ok(Some(winner_address)) if there's a winner
    /// - Ok(None) if it's a draw or still playing
    pub fn has_game_ended(env: Env, session_id: u32) -> Result<Option<Address>, Error> {
        let key = DataKey::Game(session_id);
        let game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        match game.status {
            GameStatus::Winner => Ok(game.winner),
            GameStatus::Draw => Ok(None),
            _ => Err(Error::InvalidStatus),
        }
    }

    /// Get the current game status
    pub fn get_game_status(env: Env, session_id: u32) -> Result<GameStatus, Error> {
        let key = DataKey::Game(session_id);
        let game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        Ok(game.status)
    }

    /// Get the game result (statistics) for a specific player.
    pub fn get_player_result(
        env: Env,
        session_id: u32,
        player: Address,
    ) -> Result<GameResult, Error> {
        let key = DataKey::Game(session_id);
        let game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if player == game.player1 {
            game.player1_result.get(0).ok_or(Error::InvalidStatus)
        } else if player == game.player2 {
            game.player2_result.get(0).ok_or(Error::InvalidStatus)
        } else {
            Err(Error::NotPlayer)
        }
    }

    /// Get game information.
    ///
    /// # Arguments
    /// * `session_id` - The session ID of the game
    ///
    /// # Returns
    /// * `Game` - The game state (includes winning number after game ends)
    pub fn get_game(env: Env, session_id: u32) -> Result<Game, Error> {
        let key = DataKey::Game(session_id);
        env.storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    /// Get the current admin address
    ///
    /// # Returns
    /// * `Address` - The admin address
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set")
    }

    /// Set a new admin address
    ///
    /// # Arguments
    /// * `new_admin` - The new admin address
    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    /// Get the current GameHub contract address
    ///
    /// # Returns
    /// * `Address` - The GameHub contract address
    pub fn get_hub(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set")
    }

    /// Set a new GameHub contract address
    ///
    /// # Arguments
    /// * `new_hub` - The new GameHub contract address
    pub fn set_hub(env: Env, new_hub: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::GameHubAddress, &new_hub);
    }

    /// Update the contract WASM hash (upgrade contract)
    ///
    /// # Arguments
    /// * `new_wasm_hash` - The hash of the new WASM binary
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();

        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod test;
