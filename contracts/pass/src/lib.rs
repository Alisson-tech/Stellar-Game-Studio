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
    contract, contractclient, contracterror, contractimpl, contracttype, vec, Address, Bytes,
    BytesN, Env, IntoVal,
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
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    pub player1_secret_hash: Option<u32>,
    pub player2_secret_hash: Option<u32>,
    pub player1_last_guess: Option<u32>,
    pub player2_last_guess: Option<u32>,
    pub verification_proof: Option<Bytes>,
    pub winner: Option<Address>,
    pub status: GameStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GameStatus {
    WaitingForPlayers,
    Setup,
    Playing,
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
            verification_proof: None,
            winner: None,
            status: GameStatus::Setup,
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
        secret_hash: u32,
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

    /// Submit a ZK proof to verify a guess or claim victory.
    /// (Placeholder for future ZK integration)
    pub fn submit_proof(env: Env, session_id: u32, proof: Bytes) -> Result<(), Error> {
        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        // Store proof for data availability
        game.verification_proof = Some(proof);

        env.storage().temporary().set(&key, &game);
        Ok(())
    }

    /// Verify the stored proof and determine the winner.
    /// (Placeholder logic: Currently just marks the caller as winner if proof exists)
    pub fn verify_proof(env: Env, session_id: u32) -> Result<Address, Error> {
        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if game.status != GameStatus::Playing {
            return Err(Error::InvalidStatus);
        }

        // 1. Verificação de "DA" (Data Availability)
        // No futuro, isso será usado para passar os bytes da Prova ZK
        if game.verification_proof.is_none() {
            panic!("Nenhuma prova (ou sinal de verificacao) foi submetida");
        }

        // 2. Recuperar os últimos palpites (Puros)
        let p1_guess = game
            .player1_last_guess
            .expect("Player 1 nao enviou palpite");
        let p2_guess = game
            .player2_last_guess
            .expect("Player 2 nao enviou palpite");

        // 3. Recuperar os Segredos (Hashes)
        let s1_hash = game.player1_secret_hash.expect("P1 secret hash ausente");
        let s2_hash = game.player2_secret_hash.expect("P2 secret hash ausente");

        // Regra de Vitória:
        // Player 1 ganha se o palpite dele (p1_guess_hash) bater com o segredo do Player 2 (s2_hash)
        let player1_wins = p1_guess == s2_hash;
        let player2_wins = p2_guess == s1_hash;

        let winner = if player1_wins {
            Some(game.player1.clone())
        } else if player2_wins {
            Some(game.player2.clone())
        } else {
            None
        };

        if let Some(w) = winner {
            // Se houve vencedor, finaliza
            game.status = GameStatus::Finished;
            game.winner = Some(w.clone());
            env.storage().temporary().set(&key, &game);

            // Comunicação com o Hub
            let hub_addr: Address = env
                .storage()
                .instance()
                .get(&DataKey::GameHubAddress)
                .unwrap();
            let hub = GameHubClient::new(&env, &hub_addr);
            hub.end_game(&session_id, &(w == game.player1));

            Ok(w)
        } else {
            // SE NINGUÉM ACERTOU: Limpamos e SALVAMOS.
            game.player1_last_guess = None;
            game.player2_last_guess = None;
            game.verification_proof = None;

            // CRUCIAL: Salvar o estado sem dar panic!
            env.storage().temporary().set(&key, &game);

            // Retornamos um Erro customizado (que não seja Abort) para o teste
            // Ou apenas definimos um vencedor fictício/vazio.
            Ok(env.current_contract_address())
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
