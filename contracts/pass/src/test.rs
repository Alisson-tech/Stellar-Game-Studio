#![cfg(test)]

// Unit tests for the Mastermind contract logic.

use crate::{Error, GameStatus, PassContract, PassContractClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{contract, contractimpl, Address, Env};

extern crate std;
use std::println;

// ============================================================================
// Mock GameHub for Unit Testing
// ============================================================================

#[contract]
pub struct MockGameHub;

#[contractimpl]
impl MockGameHub {
    pub fn start_game(
        _env: Env,
        _game_id: Address,
        _session_id: u32,
        _player1: Address,
        _player2: Address,
        _player1_points: i128,
        _player2_points: i128,
    ) {
        // Mock implementation
    }

    pub fn end_game(_env: Env, _session_id: u32, _player1_won: bool) {
        // Mock implementation
    }

    pub fn add_game(_env: Env, _game_address: Address) {
        // Mock implementation
    }
}

// ============================================================================
// Test Helpers
// ============================================================================

fn setup_test() -> (
    Env,
    PassContractClient<'static>,
    MockGameHubClient<'static>,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    // Set ledger info
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 1441065600,
        protocol_version: 25,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: u32::MAX / 2,
        min_persistent_entry_ttl: u32::MAX / 2,
        max_entry_ttl: u32::MAX / 2,
    });

    // Deploy mock GameHub
    let hub_addr = env.register(MockGameHub, ());
    let game_hub = MockGameHubClient::new(&env, &hub_addr);

    // Create admin
    let admin = Address::generate(&env);

    // Deploy contract
    let contract_id = env.register(PassContract, (&admin, &hub_addr));
    let client = PassContractClient::new(&env, &contract_id);

    game_hub.add_game(&contract_id);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    (env, client, game_hub, player1, player2)
}

// ============================================================================
// Mastermind Game Flow Tests
// ============================================================================

#[test]
fn test_mastermind_flow() {
    let (_env, client, _hub, player1, player2) = setup_test();
    let session_id = 1u32;
    let points = 100_0000000;

    // 1. Start Game
    client.start_game(&session_id, &player1, &player2, &points, &points);

    // Verify initial state
    let game = client.get_game(&session_id);
    assert_eq!(game.status, GameStatus::Setup);
    assert!(game.player1_secret_hash.is_none());

    // 2. Register Secrets
    client.register_secret(&session_id, &player1, &1235);
    client.register_secret(&session_id, &player2, &2232);

    // Verify status changed to Playing
    let game_playing = client.get_game(&session_id);
    assert_eq!(game_playing.status, GameStatus::Playing);

    // 3. Submit Guesses (optional in lib.rs logic for verify_proof, but good for flow)
    client.submit_guess(&session_id, &player1, &2232);
    client.submit_guess(&session_id, &player2, &9999);

    // 4. Submit Proofs
    // Player 1 got it right (acertos = 4)
    client.submit_proof(&session_id, &player1, &4, &0, &0);
    // Player 2 got it wrong
    client.submit_proof(&session_id, &player2, &1, &2, &1);

    // 5. Verify Proof and End Game
    let (res_p1, res_p2) = client.verify_proof(&session_id);

    assert_eq!(res_p1.acertos, 4);
    assert_eq!(res_p2.acertos, 1);

    let final_game = client.get_game(&session_id);
    assert_eq!(final_game.status, GameStatus::Winner);
    assert_eq!(final_game.winner, Some(player1));
}

#[test]
fn test_mastermind_multi_round_flow() {
    let (_env, client, _hub, player1, player2) = setup_test();
    let session_id = 1u32;
    let points = 100_0000000;

    // --- SETUP DO JOGO ---
    client.start_game(&session_id, &player1, &player2, &points, &points);

    client.register_secret(&session_id, &player1, &1111);
    client.register_secret(&session_id, &player2, &2222);

    println!("\n--- FASE 1: RODADA DE ERRO ---\n");

    // Both players submit wrong proofs
    client.submit_proof(&session_id, &player1, &1, &3, &0);
    client.submit_proof(&session_id, &player2, &2, &2, &0);

    let (res_p1, res_p2) = client.verify_proof(&session_id);
    assert_eq!(res_p1.acertos, 1);
    assert_eq!(res_p2.acertos, 2);

    // Status should still be Playing because no one got acertos == 4
    let game_after_round1 = client.get_game(&session_id);
    assert_eq!(game_after_round1.status, GameStatus::Playing);
    // Proofs should be reset
    assert!(game_after_round1.player1_proof.is_empty());
    assert!(game_after_round1.player2_proof.is_empty());

    println!("\n--- FASE 2: RODADA DE VITORIA (PLAYER 2) ---\n");

    // Player 1 remains wrong
    client.submit_proof(&session_id, &player1, &0, &4, &0);
    // Player 2 hits it!
    client.submit_proof(&session_id, &player2, &4, &0, &0);

    let (res_p1_v2, res_p2_v2) = client.verify_proof(&session_id);
    assert_eq!(res_p1_v2.acertos, 0);
    assert_eq!(res_p2_v2.acertos, 4);

    let final_game = client.get_game(&session_id);
    assert_eq!(final_game.status, GameStatus::Winner);
    assert_eq!(final_game.winner, Some(player2.clone()));

    println!("\n--- TESTE CONCLUIDO COM SUCESSO ---\n");
}

#[test]
fn test_draw_scenario() {
    let (_env, client, _hub, player1, player2) = setup_test();
    let session_id = 5u32;

    client.start_game(&session_id, &player1, &player2, &100, &100);
    client.register_secret(&session_id, &player1, &1111);
    client.register_secret(&session_id, &player2, &2222);

    // Both players hit it in the same round
    client.submit_proof(&session_id, &player1, &4, &0, &0);
    client.submit_proof(&session_id, &player2, &4, &0, &0);

    let (res_p1, res_p2) = client.verify_proof(&session_id);
    assert_eq!(res_p1.acertos, 4);
    assert_eq!(res_p2.acertos, 4);

    let game = client.get_game(&session_id);
    assert_eq!(game.status, GameStatus::Draw);
    assert!(game.winner.is_none());
}

#[test]
fn test_cannot_play_without_secrets() {
    let (_env, client, _hub, player1, player2) = setup_test();
    let session_id = 2u32;

    client.start_game(&session_id, &player1, &player2, &100, &100);

    // Try to guess before registering secrets
    let result = client.try_submit_guess(&session_id, &player1, &1234);
    assert!(result.is_err());
}

#[test]
fn test_cannot_register_twice() {
    let (_env, client, _hub, player1, player2) = setup_test();
    let session_id = 3u32;
    client.start_game(&session_id, &player1, &player2, &100, &100);

    client.register_secret(&session_id, &player1, &1239);

    // Try register again
    let result = client.try_register_secret(&session_id, &player1, &1239);

    match result {
        Err(Ok(error)) => assert_eq!(error, Error::SecretAlreadyRegistered),
        _ => panic!("Expected SecretAlreadyRegistered error"),
    }
}
