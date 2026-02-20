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
    BytesN, Env, IntoVal, Symbol, Vec,
};

// Import code for ZK verification
use ultrahonk_soroban_verifier::verifier::UltraHonkVerifier;

// Import GameHub contract interface
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
    pub acertos: u32,
    pub erros: u32,
    pub permutados: u32,
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
    pub player1_proof: soroban_sdk::Vec<ProofData>,
    pub player2_proof: soroban_sdk::Vec<ProofData>,
    pub p1_proof_verified: bool,
    pub p2_proof_verified: bool,
    pub p1_is_fraud: bool,
    pub p2_is_fraud: bool,
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
    Draw,
    Winner,
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
const GAME_TTL_LEDGERS: u32 = 518_400;

// ============================================================================
// Contract Definition
// ============================================================================

#[contract]
pub struct PassContract;

#[contractimpl]
impl PassContract {
    pub fn initialize(env: Env, admin: Address, game_hub: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::GameHubAddress, &game_hub);
    }

    pub fn start_game(
        env: Env,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    ) -> Result<(), Error> {
        if player1 == player2 {
            panic!("Cannot play against yourself");
        }

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

        let game_hub_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set");

        let game_hub = GameHubClient::new(&env, &game_hub_addr);

        game_hub.start_game(
            &env.current_contract_address(),
            &session_id,
            &player1,
            &player2,
            &player1_points,
            &player2_points,
        );

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
            p1_proof_verified: false,
            p2_proof_verified: false,
            p1_is_fraud: false,
            p2_is_fraud: false,
            winner: None,
            status: GameStatus::Setup,
            player1_result: soroban_sdk::Vec::new(&env),
            player2_result: soroban_sdk::Vec::new(&env),
        };

        let game_key = DataKey::Game(session_id);
        env.storage().temporary().set(&game_key, &game);

        env.storage()
            .temporary()
            .extend_ttl(&game_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

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

        if game.player1_secret_hash.is_some() && game.player2_secret_hash.is_some() {
            game.status = GameStatus::Playing;
        }

        env.storage().temporary().set(&key, &game);
        Ok(())
    }

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

        let proof_data = ProofData {
            player: player.clone(),
            acertos,
            permutados,
            erros,
            proof,
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

    pub fn verify_proof(
        env: Env,
        session_id: u32,
        caller: Address,
    ) -> Result<Option<(GameResult, GameResult)>, Error> {
        caller.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if game.status != GameStatus::Playing {
            // Se já foi finalizado, retorna os resultados
            if game.player1_result.len() > 0 && game.player2_result.len() > 0 {
                return Ok(Some((
                    game.player1_result.get_unchecked(0),
                    game.player2_result.get_unchecked(0),
                )));
            }
            return Err(Error::InvalidStatus);
        }

        let p1_guess = game
            .player1_last_guess
            .ok_or(Error::BothPlayersNotGuessed)?;
        let p2_guess = game
            .player2_last_guess
            .ok_or(Error::BothPlayersNotGuessed)?;

        // VERIFICA APENAS A PROVA DE QUEM CHAMOU A TRANSAÇÃO
        if caller == game.player1 && !game.p2_proof_verified {
            let p2_proof = game.player2_proof.get(0).ok_or(Error::InvalidStatus)?;
            let p2_secret = game
                .player2_secret_hash
                .clone()
                .ok_or(Error::InvalidStatus)?;

            // Player 1 prova seu segredo contra o palpite do Player 2
            let is_valid = Self::verify_zk_proof_internal(&env, &p2_proof, &p2_secret, p1_guess);
            if !is_valid {
                // Fraude detectada. Player 2 ganha automaticamente.
                game.p2_is_fraud = true;
                env.storage().temporary().set(&key, &game);
            }
            // Marca a prova 1 como verificada
            game.p2_proof_verified = true;
            env.storage().temporary().set(&key, &game);
        } else if caller == game.player2 && !game.p1_proof_verified {
            let p1_proof = game.player1_proof.get(0).ok_or(Error::InvalidStatus)?;
            let p1_secret = game
                .player1_secret_hash
                .clone()
                .ok_or(Error::InvalidStatus)?;

            // Player 2 prova seu segredo contra o palpite do Player 1
            let is_valid = Self::verify_zk_proof_internal(&env, &p1_proof, &p1_secret, p2_guess);

            if !is_valid {
                game.p1_is_fraud = true;
                env.storage().temporary().set(&key, &game);
            }
            // Marca a prova 2 como verificada
            game.p1_proof_verified = true;
            env.storage().temporary().set(&key, &game);
        }

        if game.p1_proof_verified && game.p2_proof_verified {
            if game.p1_is_fraud && game.p2_is_fraud {
                game.status = GameStatus::Draw;
            } else if game.p1_is_fraud {
                game.status = GameStatus::Winner;
                game.winner = Some(game.player2.clone());
            } else if game.p2_is_fraud {
                game.status = GameStatus::Winner;
                game.winner = Some(game.player1.clone());
            }

            let p1_proof = game.player1_proof.get(0).unwrap();
            let p2_proof = game.player2_proof.get(0).unwrap();

            let p2_guessed_correctly = p1_proof.acertos == 3;
            let p1_guessed_correctly = p2_proof.acertos == 3;

            let result_p1 = GameResult {
                player: game.player1.clone(),
                acertos: p2_proof.acertos,
                erros: p2_proof.erros,
                permutados: p2_proof.permutados,
            };

            let result_p2 = GameResult {
                player: game.player2.clone(),
                acertos: p1_proof.acertos,
                erros: p1_proof.erros,
                permutados: p1_proof.permutados,
            };

            match (p1_guessed_correctly, p2_guessed_correctly) {
                (true, true) => {
                    game.status = GameStatus::Draw;
                    game.winner = None;
                }
                (true, false) => {
                    game.status = GameStatus::Winner;
                    game.winner = Some(game.player1.clone());
                }
                (false, true) => {
                    game.status = GameStatus::Winner;
                    game.winner = Some(game.player2.clone());
                }
                (false, false) => {
                    game.status = GameStatus::Playing;
                    // Prepara para o próximo round
                    game.player1_proof = vec![&env];
                    game.player2_proof = vec![&env];
                    game.player1_last_guess = None;
                    game.player2_last_guess = None;
                    game.p1_proof_verified = false; // Reseta as flags!
                    game.p2_proof_verified = false;
                }
            }

            game.player1_result = vec![&env, result_p1.clone()];
            game.player2_result = vec![&env, result_p2.clone()];

            env.storage().temporary().set(&key, &game);
            env.storage()
                .temporary()
                .extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

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

            return Ok(Some((result_p1, result_p2)));
        }

        // Se chegou aqui, apenas uma das provas foi verificada (ou P1 ou P2).
        // Retornamos um erro "benigno" indicando que falta a verificação do oponente.
        // O frontend pode ignorar esse erro especificamente.
        Ok(None)
    }

    // Renamed to avoid conflicts and made internal-only (not a contract endpoint)
    fn verify_zk_proof_internal(
        env: &Env,
        proof_data: &ProofData,
        secret_hash: &BytesN<32>,
        opponent_guess: u32,
    ) -> bool {
        let vk: Bytes = env
            .storage()
            .instance()
            .get(&DataKey::VerificationKey)
            .expect("VK not set");

        let d1 = (opponent_guess / 100) % 10;
        let d2 = (opponent_guess / 10) % 10;
        let d3 = opponent_guess % 10;

        let mut full_inputs = [0u8; 224];

        let guess_digits = [d1, d2, d3];
        for i in 0..3 {
            let offset = i * 32;
            let b = guess_digits[i].to_be_bytes();
            full_inputs[offset + 28] = b[0];
            full_inputs[offset + 29] = b[1];
            full_inputs[offset + 30] = b[2];
            full_inputs[offset + 31] = b[3];
        }

        let hash_bytes = secret_hash.to_array();
        for i in 0..32 {
            full_inputs[96 + i] = hash_bytes[i];
        }

        let results = [proof_data.acertos, proof_data.permutados, proof_data.erros];
        for i in 0..3 {
            let offset = (4 + i) * 32;
            let b = results[i].to_be_bytes();
            full_inputs[offset + 28] = b[0];
            full_inputs[offset + 29] = b[1];
            full_inputs[offset + 30] = b[2];
            full_inputs[offset + 31] = b[3];
        }

        let public_inputs_bytes = Bytes::from_array(env, &full_inputs);

        match UltraHonkVerifier::new(env, &vk) {
            Ok(verifier) => {
                let result = verifier.verify(&proof_data.proof, &public_inputs_bytes);
                result.is_ok()
            }
            Err(_) => false,
        }
    }

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

    pub fn get_game_status(env: Env, session_id: u32) -> Result<GameStatus, Error> {
        let key = DataKey::Game(session_id);
        let game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        Ok(game.status)
    }

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

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set")
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    pub fn get_hub(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set")
    }

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
        env.storage().instance().get(&DataKey::VerificationKey)
    }

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
