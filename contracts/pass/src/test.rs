#![cfg(test)]

// Unit tests for the Mastermind contract logic.

use crate::{Error, GameStatus, PassContract, PassContractClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env};

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
    let (env, client, _hub, player1, player2) = setup_test();
    let session_id = 1u32;
    let points = 100_0000000;

    // 1. Start Game
    client.start_game(&session_id, &player1, &player2, &points, &points);

    // Verify initial state
    let game = client.get_game(&session_id);
    assert_eq!(game.status, GameStatus::Setup);
    assert!(game.player1_secret_hash.is_none());

    // 2. Register Secrets
    let secret1 = BytesN::from_array(&env, &[1u8; 32]);
    let secret2 = BytesN::from_array(&env, &[2u8; 32]);
    std::println!("secret2: {:?}", secret2);

    client.register_secret(&session_id, &player1, &secret1);

    // Status should still be Setup
    let game_p1 = client.get_game(&session_id);
    assert_eq!(game_p1.status, GameStatus::Setup);

    client.register_secret(&session_id, &player2, &secret2);

    // Verify status changed to Playing
    let game_playing = client.get_game(&session_id);
    assert_eq!(game_playing.status, GameStatus::Playing);

    // 3. Submit Guesses
    client.submit_guess(&session_id, &player1, &1234);
    client.submit_guess(&session_id, &player2, &9999);

    let game_guessed = client.get_game(&session_id);
    println!("game_guessed: {:?}", game_guessed);
    assert_eq!(game_guessed.player1_last_guess, Some(1234));
    assert_eq!(game_guessed.player2_last_guess, Some(9999));

    // 4. Submit Proof (Placeholder)
    let proof = Bytes::from_array(&env, &[0xAA; 10]);
    client.submit_proof(&session_id, &proof);

    // 5. Verify Proof and End Game
    let winner = client.verify_proof(&session_id);

    // In our placeholder logic, Player 1 always wins if verify_proof is called
    assert_eq!(winner, player1);

    let final_game = client.get_game(&session_id);
    assert_eq!(final_game.status, GameStatus::Finished);
    assert_eq!(final_game.winner, Some(player1));
}

#[test]
fn test_cannot_play_without_secrets() {
    let (_env, client, _hub, player1, player2) = setup_test();
    let session_id = 2u32;

    client.start_game(&session_id, &player1, &player2, &100, &100);

    // Try to guess before registering secrets
    let result = client.try_submit_guess(&session_id, &player1, &1234);
    assert!(result.is_err());

    // Check for specific error code if possible, or just Result::Err
    // result.unwrap_err().unwrap() should be Error::InvalidStatus
}

#[test]
fn test_cannot_register_twice() {
    let (env, client, _hub, player1, player2) = setup_test();
    let session_id = 3u32;
    client.start_game(&session_id, &player1, &player2, &100, &100);

    let secret = BytesN::from_array(&env, &[1u8; 32]);
    client.register_secret(&session_id, &player1, &secret.clone());

    // Try register again
    let result = client.try_register_secret(&session_id, &player1, &secret);

    match result {
        Err(Ok(error)) => assert_eq!(error, Error::SecretAlreadyRegistered),
        _ => panic!("Expected SecretAlreadyRegistered error"),
    }
}
