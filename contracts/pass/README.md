# ZK PASS Smart Contract

This directory contains the Soroban smart contract and Noir ZK circuits for the **ZK PASS** game.

## Overview

The contract manages the game state, handles secret commitments, accepts guesses, and verifies Zero-Knowledge proofs to ensure fair play without revealing player secrets.

## Features

- **ZK-Mastermind Logic**: Implements 3-digit number guessing with cryptographic feedback.
- **On-chain Verification**: Uses `ultrahonk-soroban-verifier` to validate ZK proofs.
- **Game Hub Integration**: Standardizes game lifecycle through a centralized Hub.
- **Fraud Detection**: Automatically handles invalid proofs and attempts to cheat.

---

## Zero-Knowledge Circuit (Noir)

The game's cryptographic logic is implemented in [Noir](https://noir-lang.org/), a domain-specific language for Zero-Knowledge circuits.

### Circuit Logic ([src/main.nr](src/main.nr))
- **Commitment Verification**: Checks that the `secret` and `salt` provided match the on-chain hash.
- **Feedback Computation**: Calculates the number of **Correct**, **Misplaced**, and **Wrong** digits for a given guess.
- **Constraint Enforcement**: Ensures the player cannot provide false feedback about their secret.

### Compilation and Setup (Docker)
Due to `glibc` version dependencies on certain Linux distributions (like Ubuntu), it is recommended to use the provided Docker environment to compile the circuit and generate the **Verification Key (VK)**.

The `dockerfile-vk` ensures a consistent environment with:
- **Nargo**: v1.0.0-beta.9
- **Barretenberg (bb)**: v0.87.0

#### 1. Build & Run the Compiler Container
```bash
# Build the image
docker build -t noir-compiler -f dockerfile-vk .

# Run the container with current directory mounted
docker run --rm -it -v $(pwd):/circuit noir-compiler bash
```

#### 2. Generate Verification Key (Inside Container)
Once inside the container, execute the following commands to compile the circuit and generate the VK:

```bash
# Compile the Noir circuit
nargo compile

# Generate the Verification Key (UltraHonk scheme with Keccak mapping)
bb write_vk -b target/pass_circuit.json -o target --scheme ultra_honk --oracle_hash keccak

# Execute the circuit to generate witness (optional for testing)
nargo execute witness

# Generate a test proof (optional)
bb prove -b target/pass_circuit.json -w target/witness.gz -o target --scheme ultra_honk --oracle_hash keccak

# Verify the test proof (optional)
bb verify -k target/vk -p target/proof --scheme ultra_honk --oracle_hash keccak

# Check public inputs size and format
wc -c target/public_inputs
od -t x1 target/public_inputs | head -20
```

The resulting `target/vk` file is what needs to be registered in the smart contract to enable on-chain verification.

---

## Contract Implementation ([src/lib.rs](src/lib.rs))

### Key Methods

- `start_game`: Initializes a session between two players.
- `register_secret`: Stores a Pedersen hash of the player's secret.
- `submit_guess`: Records a player's numeric guess.
- `submit_proof`: Stores the feedback results and the ZK proof.
- `verify_proof`: The core logic that reconstructs public inputs and calls the `UltraHonkVerifier`.

### Verification Logic
The `verify_zk_proof_internal` function translates the game state into the public input format expected by the circuit:
1. **Guess digits** (3x 32-byte fields)
2. **Committed hash** (1x 32-byte field)
3. **Feedback results** (3x 32-byte fields - Correct, Misplaced, Wrong)

---

## Automated Deployment

The project includes an automated deployment script at [scripts/deploy.ts](../../scripts/deploy.ts) that handles the entire testnet setup for the **pass** contract.

### Deployment Flow
When running `bun run deploy pass`, the script performs the following specialized steps:

1. **VK Verification**: Ensures that the Verification Key exists at `contracts/pass/target/vk` (generated via Docker).
2. **Contract Deployment**: Uploads the WASM and deploys the contract instance to Stellar Testnet.
3. **Initialization**: Automatically calls the `initialize` method with the current admin and Game Hub addresses.
4. **VK Registration**: Converts the local `vk` file to hex and registers it on-chain via the `set_verification_key` method.
5. **Environment Update**: Saves the new contract ID to `deployment.json` and `.env` for the frontend.

### Usage
```bash
# Deploys and configures the pass contract automatically
bun run deploy pass
```

## Building the Contract

```bash
stellar contract build
```

The compiled WASM will be located at `target/wasm32-unknown-unknown/release/pass.wasm`.

## Technical Notes

- **Circuit Path**: The UI expects the circuit artifact at `pass-frontend/src/games/pass/circuit.json`.
- **Backend**: Uses the **UltraHonk** proof system for optimized on-chain verification costs on Soroban.
- **Oracle Hash**: The `keccak` flag is mandatory for compatibility with the project's verifier implementation.
