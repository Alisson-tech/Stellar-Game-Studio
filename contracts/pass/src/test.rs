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
    client.register_secret(&session_id, &player1, &1235);

    // Status should still be Setup
    let game_p1 = client.get_game(&session_id);
    assert_eq!(game_p1.status, GameStatus::Setup);

    client.register_secret(&session_id, &player2, &2232);

    // Verify status changed to Playing
    let game_playing = client.get_game(&session_id);
    assert_eq!(game_playing.status, GameStatus::Playing);

    // 3. Submit Guesses
    client.submit_guess(&session_id, &player1, &2232);
    client.submit_guess(&session_id, &player2, &9999);

    let game_guessed = client.get_game(&session_id);
    println!("game_guessed: {:?}", game_guessed);
    assert_eq!(game_guessed.player1_last_guess, Some(2232));
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
fn test_mastermind_multi_round_flow() {
    extern crate std;
    use std::println;

    let (env, client, _hub, player1, player2) = setup_test();
    let session_id = 1u32;
    let points = 100_0000000;

    // --- SETUP DO JOGO ---
    client.start_game(&session_id, &player1, &player2, &points, &points);

    // Definindo segredos reais para o Mock
    let p1_secret_value = 1111u32;
    let p2_secret_value = 2222u32;

    client.register_secret(&session_id, &player1, &p1_secret_value);
    client.register_secret(&session_id, &player2, &p2_secret_value);

    println!("\n--- FASE 1: RODADA DE ERRO ---\n");

    // Player 1 chuta 5555 (Errado, o de P2 é 2222)
    // Player 2 chuta 6666 (Errado, o de P1 é 1111)
    client.submit_guess(&session_id, &player1, &5555);
    client.submit_guess(&session_id, &player2, &6666);
    client.submit_proof(&session_id, &Bytes::from_array(&env, &[0x00; 1])); // Placeholder proof

    // Tentativa de verificação (esperamos que falhe/panic pois ninguém acertou)
    let res_v1 = client.try_verify_proof(&session_id);
    println!("\nResultado Rodada 1 (Esperado Erro): {:?}", res_v1);

    // Verificando se os palpites foram limpos para a próxima rodada
    let game_after_fail = client.get_game(&session_id);
    assert_eq!(game_after_fail.player1_last_guess, None);
    assert_eq!(game_after_fail.status, GameStatus::Playing);
    println!(
        "\nStatus: {:?} - Palpites resetados com sucesso.",
        game_after_fail.status
    );

    println!("\n--- FASE 2: RODADA DE VITORIA (PLAYER 2) ---\n");

    // Player 1 chuta 7777 (Errado de novo)
    // Player 2 chuta 1111 (CORRETO! O segredo de P1 é 1111)
    client.submit_guess(&session_id, &player1, &7777);
    client.submit_guess(&session_id, &player2, &1111);
    client.submit_proof(&session_id, &Bytes::from_array(&env, &[0x01; 1]));

    let winner = client.verify_proof(&session_id);
    println!("\nVENCEDOR ENCONTRADO: {:?}", winner);

    // --- ASSERTS FINAIS ---
    let final_game = client.get_game(&session_id);
    assert_eq!(winner, player2);
    assert_eq!(final_game.status, GameStatus::Finished);
    assert_eq!(final_game.winner, Some(player2));

    println!("\n--- TESTE CONCLUIDO COM SUCESSO ---\n");
    println!("\nFinal Game State: {:#?}", final_game);
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

    client.register_secret(&session_id, &player1, &1239);

    // Try register again
    let result = client.try_register_secret(&session_id, &player1, &1239);

    match result {
        Err(Ok(error)) => assert_eq!(error, Error::SecretAlreadyRegistered),
        _ => panic!("Expected SecretAlreadyRegistered error"),
    }
}
