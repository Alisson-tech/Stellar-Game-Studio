# Pass Game - Contract Integration Guide

## Overview
The Pass game frontend is fully integrated with the Stellar Pass contract. This document describes how each frontend function maps to contract functions.

## Contract Functions

### 1. `start_game()`
**Frontend Call:**
```typescript
passService.startGame(sessionId, player1, player2, player1Points, player2Points, signer)
// OR (multi-sig)
passService.prepareStartGame() // Player 1 prepares and exports auth entry
passService.importAndSignAuthEntry() // Player 2 imports and signs
passService.finalizeStartGame() // Either player finalizes
```

**Contract Behavior:**
- Requires auth from both players
- Calls GameHub to lock points in a session
- Creates game state with status=Setup
- Both players must authorize with their points commitment

---

### 2. `register_secret()`
**Frontend Call:**
```typescript
passService.registerSecret(sessionId, playerAddress, secretHash, signer)
```

**Contract Behavior:**
- Registers player's secret hash (currently just a u32)
- Can only be called in Setup status
- Returns error if already registered
- When both players register, status changes to Playing

**Frontend Mapping:**
- Called in SETUP phase
- `handleDarkUISubmit()` with `gamePhase === 'setup'`
- User enters a number, which is directly passed as `secretHash`

---

### 3. `submit_guess()`
**Frontend Call:**
```typescript
passService.submitGuess(sessionId, playerAddress, guess, signer)
```

**Contract Behavior:**
- Records player's guess
- Can only be called in Playing status
- Stores in `player1_last_guess` or `player2_last_guess`
- No verification happens yet (stored for later comparison)

**Frontend Mapping:**
- Called in GUESS phase
- `handleDarkUISubmit()` with `gamePhase === 'guess'`
- User enters a guess number
- Guess is stored on-chain for verification

---

### 4. `submit_proof()`
**Frontend Call:**
```typescript
passService.submitProof(sessionId, proof)
```

**Contract Behavior:**
- Stores a proof bytes object
- Currently a placeholder for future ZK proof integration
- Proof is stored in `verification_proof` field
- Used as "signal" that verification is ready

**Frontend Mapping:**
- Not currently called in the flow
- Reserved for future ZK implementation
- Would be called between GUESS and REVEAL phases

---

### 5. `verify_proof()`
**Frontend Call:**
```typescript
passService.verifyProof(sessionId, playerAddress, signer)
// OR (backwards compatible)
passService.revealWinner(sessionId, playerAddress, signer)
```

**Contract Logic:**
```rust
// Compare player guesses with opponent secrets
let player1_wins = p1_guess == s2_hash;
let player2_wins = p2_guess == s1_hash;

// Determine winner
if player1_wins {
    winner = player1
} else if player2_wins {
    winner = player2
} else {
    // No one guessed correctly - reset guesses and try again
    p1_guess = None
    p2_guess = None
}

// If winner found:
// - Set status to Finished
// - Call GameHub.end_game() to distribute points
// - Return winner address
```

**Frontend Mapping:**
- Called in REVEAL phase
- `handleRevealWinner()`
- Compares stored guesses with opponent's secrets
- Determines and announces winner
- Transitions to COMPLETE phase

---

### 6. `get_game()`
**Frontend Call:**
```typescript
const game = await passService.getGame(sessionId)
```

**Contract Behavior:**
- Reads game state from storage
- Returns full `Game` struct with all fields
- Does not modify state (read-only)
- Returns null if game doesn't exist

**Frontend Mapping:**
- Called continuously via polling (every 5 seconds)
- Used to detect phase changes
- Determines when to transition between phases
- Shows real-time game state to players

---

## Contract Data Structures

### Game Struct
```rust
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    pub player1_secret_hash: Option<u32>,        // Registered secret
    pub player2_secret_hash: Option<u32>,        // Registered secret
    pub player1_last_guess: Option<u32>,         // Current guess
    pub player2_last_guess: Option<u32>,         // Current guess
    pub verification_proof: Option<Bytes>,       // For future ZK
    pub winner: Option<Address>,                 // Winner address
    pub status: GameStatus,                      // Game state enum
}

pub enum GameStatus {
    WaitingForPlayers,
    Setup,       // Waiting for secret registration
    Playing,     // Waiting for guesses
    Finished,    // Winner determined
}
```

### Error Codes
```rust
Error::GameNotFound = 1        // Session doesn't exist
Error::NotPlayer = 2           // Address not in game
Error::AlreadyGuessed = 3      // Already submitted this round
Error::InvalidStatus = 6       // Wrong game phase
Error::SecretAlreadyRegistered = 7  // Secret already set
Error::BothPlayersNotGuessed = 8    // Need both guesses
```

---

## Frontend Integration Points

### Phase Detection Logic
The frontend determines the game phase by checking the contract state:

```typescript
if (game.winner) {
    // Winner determined
    gamePhase = 'complete'
} else if (game.player1_last_guess && game.player2_last_guess) {
    // Both guessed, reveal winner
    gamePhase = 'reveal'
} else if (game.player1_secret_hash && game.player2_secret_hash) {
    // Both registered secrets, ready to guess
    gamePhase = 'guess'
} else {
    // Waiting for secret registration
    gamePhase = 'setup'
}
```

### UI Component Mapping

| Phase | UI Component | Input | Contract Function |
|-------|---|---|---|
| CREATE | Game lobby (mode selector) | Auth entry or session ID | `start_game()` |
| SETUP | PassDarkUI (setup mode) | Secret number | `register_secret()` |
| GUESS | PassDarkUI (guess mode) | Guess number | `submit_guess()` |
| REVEAL | Win overlay | [Button click] | `verify_proof()` |
| COMPLETE | Results display | [New game button] | [Reset state] |

---

## State Transitions

### Happy Path: Player 1 Wins
```
1. Both players register secrets
   player1_secret = 1234, player2_secret = 5678
   
2. Player 1 guesses 5678 (correct!)
3. Player 2 guesses 9999 (wrong)
   
4. verify_proof() called
   - p1_guess (5678) == p2_secret (5678) ✓ → Player 1 wins
   - Set winner = player1
   - Status → Finished
```

### Retry Path: No One Guesses Correctly
```
1. Both players register secrets
   
2. Player 1 guesses 9999 (wrong)
2. Player 2 guesses 1234 (wrong)
   
4. verify_proof() called
   - p1_guess (9999) != p2_secret (5678) ✗
   - p2_guess (1234) != p1_secret (1234)... wait, that matches!
   - Actually player 2 wins and game finishes
```

---

## Bindings Generated

The `bindings.ts` file contains TypeScript bindings for:
- Game interface (type definition)
- GameStatus enum
- Error codes
- Client interface (all contract methods)
- Network configuration

These bindings are auto-generated from the contract's Wasm specification, ensuring type safety and API compatibility.

---

## Error Handling

### Common Error Scenarios

**SecretAlreadyRegistered** (Error 7)
- Occurs if player tries to register secret twice
- Frontend should prevent this via phase checking

**InvalidStatus** (Error 6)
- Occurs if calling function in wrong game phase
- e.g., calling `submit_guess()` before both secrets registered
- Frontend prevents this via phase-based UI

**BothPlayersNotGuessed** (Error 8)
- Occurs if calling `verify_proof()` before both guesses submitted
- Frontend only enables reveal button when both ready

---

## Testing the Integration

### Manual Testing Steps
1. **Create Game**: Player 1 creates and shares link
2. **Join Game**: Player 2 imports auth entry
3. **Setup Phase**: Both enter secrets
4. **Guess Phase**: Both make guesses
5. **Reveal**: Click button to see winner
6. **Complete**: Verify results match contract state

### Quickstart (Dev Mode)
```typescript
// Automatically:
// - Creates two dev wallets
// - Prepares and signs transactions
// - Registers secrets
// - Submits guesses
// - Reveals winner
```

### Polling Verification
- Every 5 seconds, frontend fetches game state
- Transitions phase when state changes
- Shows real-time updates to players
- Ensures UI stays in sync with contract
