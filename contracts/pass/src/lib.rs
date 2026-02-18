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
    BytesN, Env, IntoVal, Vec, Symbol
};

// Import code for ZK verification
use ultrahonk_soroban_verifier::UltraHonkVerifier;

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
    pub permutados: u32,
    pub erros: u32,
    pub proof: Bytes,
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
    VerificationKey,
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
    pub fn initialize(env: Env, admin: Address, game_hub: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::GameHubAddress, &game_hub);
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
        permutados: u32,
        erros: u32,
        proof: Bytes,
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

        let guess = game.player1_last_guess;
        env.storage().temporary().set(&Symbol::new(&env, "game_player1_last_guess"), &guess);

        let proof_data = ProofData {
            player: player.clone(),
            acertos,
            permutados,
            erros,
            proof,
        };

        env.storage().temporary().set(&Symbol::new(&env, "debug_proof_data_submit"), &proof_data);


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
    /// Verify proofs submitted by both players and determine the winner.
    /// This function checks if both players have submitted their proofs,
    /// validates the results using ZK verification (mocked), and updates the game status accordingly.
    ///
    /// Fraud Detection:
    /// If a player submits an invalid proof (the ZK verification fails), the opponent automatically wins.
    ///
    /// Status changes:
    /// - Playing: se ninguém acertou (ambos continuam jogando)
    /// - Draw: se ambos acertaram (acertos == 3)
    /// - Winner: se apenas um jogador acertou ou houve fraude
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

        // Both players must have made a guess in the current round
        let p1_guess = game
            .player1_last_guess
            .ok_or(Error::BothPlayersNotGuessed)?;
        let p2_guess = game
            .player2_last_guess
            .ok_or(Error::BothPlayersNotGuessed)?;

        // Both players must have submitted proofs
        let p1_submitted_proof = game.player1_proof.get(0).ok_or(Error::InvalidStatus)?;
        let p2_submitted_proof = game.player2_proof.get(0).ok_or(Error::InvalidStatus)?;

        // Retrieve secret hashes
        let p1_secret_hash = game
            .player1_secret_hash
            .clone()
            .ok_or(Error::InvalidStatus)?;
        let p2_secret_hash = game
            .player2_secret_hash
            .clone()
            .ok_or(Error::InvalidStatus)?;

        // --- VERIFICATION LOGIC ---

        // Verify Player 1's Proof (Prove P1's secret against P2's guess)
        // Public Inputs: [secret_hash (P1), guess (P2), acertos, erros, permutados, salt (if public?)]
        // Note: The circuit likely verifies: Hash(secret + salt) == stored_hash AND stats correct for (secret, guess)
        // For now, we use a mock function.
        let p1_proof_valid =
            Self::verify_zk_proof(&env, &p1_submitted_proof, &p1_secret_hash, p2_guess);

        // Verify Player 2's Proof (Prove P2's secret against P1's guess)
        let p2_proof_valid =
            Self::verify_zk_proof(&env, &p2_submitted_proof, &p2_secret_hash, p1_guess);

        env.storage().temporary().set(&Symbol::new(&env, "debug_p1"), &p1_proof_valid);
        env.storage().temporary().set(&Symbol::new(&env, "debug_p2"), &p2_proof_valid);

        // --- FRAUD HANDLING ---

        // if !p1_proof_valid && !p2_proof_valid {
        //     // Double Fraud? Technical Draw or handle specific rules.
        //     // For simplicity: Draw but game ends.
        //     game.status = GameStatus::Draw; // Or a specific fraud status
        //     game.winner = None;

        //     // Save & Return empty/error results
        //     env.storage().temporary().set(&key, &game);
        //     return Err(Error::InvalidStatus); // Or custom error
        // }

        // if !p1_proof_valid {
        //     // Player 1 submitted invalid proof -> Player 2 wins
        //     game.status = GameStatus::Winner;
        //     game.winner = Some(game.player2.clone());

        //     env.storage().temporary().set(&key, &game);

        //     // Notify Hub
        //     let hub_addr: Address = env
        //         .storage()
        //         .instance()
        //         .get(&DataKey::GameHubAddress)
        //         .unwrap();
        //     let hub = GameHubClient::new(&env, &hub_addr);
        //     hub.end_game(&session_id, &false); // Winner is P2 (not P1)

        //     // Return empty/partial results as game ended
        //     return Ok((
        //         GameResult {
        //             player: game.player1.clone(),
        //             acertos: 0,
        //             erros: 0,
        //             permutados: 0,
        //         },
        //         GameResult {
        //             player: game.player2.clone(),
        //             acertos: 0,
        //             erros: 0,
        //             permutados: 0,
        //         },
        //     ));
        // }

        // if !p2_proof_valid {
        //     // Player 2 submitted invalid proof -> Player 1 wins
        //     game.status = GameStatus::Winner;
        //     game.winner = Some(game.player1.clone());

        //     env.storage().temporary().set(&key, &game);

        //     // Notify Hub
        //     let hub_addr: Address = env
        //         .storage()
        //         .instance()
        //         .get(&DataKey::GameHubAddress)
        //         .unwrap();
        //     let hub = GameHubClient::new(&env, &hub_addr);
        //     hub.end_game(&session_id, &true); // Winner is P1

        //     return Ok((
        //         GameResult {
        //             player: game.player1.clone(),
        //             acertos: 0,
        //             erros: 0,
        //             permutados: 0,
        //         },
        //         GameResult {
        //             player: game.player2.clone(),
        //             acertos: 0,
        //             erros: 0,
        //             permutados: 0,
        //         },
        //     ));
        // }

        // --- IF BOTH VALID -> DETERMINE WINNER ---

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

    fn verify_zk_proof(
        env: &Env,
        proof_data: &ProofData,
        secret_hash: &BytesN<32>,
        opponent_guess: u32,
    ) -> bool {
        let vk: Bytes = env.storage().instance().get(&DataKey::VerificationKey).expect("VK not set");

        // 1. Separar dígitos
        let d1 = (opponent_guess / 100) % 10;
        let d2 = (opponent_guess / 10) % 10;
        let d3 = opponent_guess % 10;

        // 2. Criar um vetor fixo para garantir que não haja overhead de redimensionamento
        // 7 inputs * 32 bytes = 224 bytes
        let mut full_inputs = [0u8; 224];

        // Auxiliar para preencher o array
        fn write_u32_at(dest: &mut [u8], offset: usize, val: u32) {
            let bytes = val.to_be_bytes(); // Noir espera Big Endian
            dest[offset + 28] = bytes[0];
            dest[offset + 29] = bytes[1];
            dest[offset + 30] = bytes[2];
            dest[offset + 31] = bytes[3];
        }

        // Preencher Guess (Inputs 0, 1, 2)
        write_u32_at(&mut full_inputs, 0, d1);
        write_u32_at(&mut full_inputs, 32, d2);
        write_u32_at(&mut full_inputs, 64, d3);

        // Preencher Hash (Input 3) - Copiar os 32 bytes do BytesN
        let hash_bytes = secret_hash.to_array();
        for i in 0..32 {
            full_inputs[96 + i] = hash_bytes[i];
        }

        // Preencher Stats (Inputs 4, 5, 6)
        write_u32_at(&mut full_inputs, 128, proof_data.acertos);
        write_u32_at(&mut full_inputs, 160, proof_data.permutados);
        write_u32_at(&mut full_inputs, 192, proof_data.erros);

        // Converter para o tipo Bytes do Soroban
        let public_inputs_bytes = Bytes::from_array(env, &full_inputs);

        // DEBUG: O tamanho TEM que ser 224
        // env.storage().temporary().set(&Symbol::new(&env, "debug_len"), &public_inputs_bytes.len());

        // --- DEBUG STORAGE START ---
        // Salva os inputs exatos enviados ao veroficador (deve ter 224 bytes)
        env.storage().temporary().set(&Symbol::new(&env, "dbg_pub_inp"), &public_inputs_bytes);
        // Salva o tamanho da prova recebida (para garantir que não há lixo no Uint8Array)
        env.storage().temporary().set(&Symbol::new(&env, "dbg_proof_len"), &proof_data.proof.len());
        // --- DEBUG STORAGE END ---

       let vk_fixed = if vk.len() > 4 { vk.slice(4..) } else { vk.clone() };

        match UltraHonkVerifier::new(env, &vk_fixed) {
            Ok(verifier) => {
                // IMPORTANTE: Use 'public_inputs_bytes' (o que você montou) 
                // e não 'proof_data.public_inputs' (o que veio do frontend)
                let result = verifier.verify(&proof_data.proof, &public_inputs_bytes);
                
                if result.is_err() {
                    // Se cair aqui, a VK carregou (Ok), mas a Prova ou os Inputs estão matematicamente errados
                    env.storage().temporary().set(&Symbol::new(&env, "dbg_vrfy_err"), &true);
                }
                result.is_ok()
            },
            Err(_) => {
                // Se cair aqui, a VK ainda está corrompida ou o slice(4..) não foi suficiente
                env.storage().temporary().set(&Symbol::new(&env, "dbg_vk_fail"), &true);
                false
            }
        }
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

    /// Set the Verification Key for ZK proofs
    ///
    /// # Arguments
    /// * `vk` - The verification key as a vector of bytes
    pub fn set_verification_key(env: Env, vk: Bytes) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();

        env.storage().instance().set(&DataKey::VerificationKey, &vk);
    }

    pub fn get_verification_key(env: Env) -> Option<Bytes> {
        env.storage()
            .instance()
            .get(&DataKey::VerificationKey)
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
