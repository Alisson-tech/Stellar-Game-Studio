# Pass Game Flow Documentation

## Overview
The Pass game is a Mastermind-style cryptographic guessing game where two players compete to guess each other's secrets first.

## Game Phases

### 1. **CREATE** (`gamePhase === 'create'`)
- Players create or join a game
- Three modes:
  - **Create & Export**: Player 1 creates a game and exports an auth entry for Player 2
  - **Import Auth Entry**: Player 2 imports Player 1's auth entry and signs the transaction
  - **Load Existing Game**: Load a game by session ID

#### Flow:
1. Player 1 clicks "GENERATE INVITE"
2. `handlePrepareTransaction()` calls `passService.prepareStartGame()`
3. Auth entry is signed and exported as XDR
4. Player 1 shares the XDR or URL with Player 2
5. Player 2 imports the auth entry and clicks "JOIN GAME"
6. Both players have signed → Game is created on-chain
7. Game transitions to **SETUP** phase

### 2. **SETUP** (`gamePhase === 'setup'`)
- Both players register their secret numbers
- Each player must submit a secret hash that will be used for verification

#### Flow:
1. Game appears with player status
2. Player sees `PassDarkUI` with phase="setup"
3. Player enters a secret number (any integer)
4. `handleDarkUISubmit()` calls `passService.registerSecret(sessionId, playerAddress, secretNumber, signer)`
5. Secret is registered on-chain via contract function `register_secret()`
6. Both players must register secrets before moving to next phase
7. Once both secrets are registered, game transitions to **GUESS** phase

#### Contract State:
- `player1_secret_hash` is set
- `player2_secret_hash` is set
- Game `status` changes to `Playing`

### 3. **GUESS** (`gamePhase === 'guess'`)
- Both players make guesses trying to match the opponent's secret
- Each player can see the opponent's status but not their secret

#### Flow:
1. Player sees `PassDarkUI` with phase="guess"
2. Player enters their guess number
3. `handleDarkUISubmit()` calls `passService.submitGuess(sessionId, playerAddress, guess, signer)`
4. Guess is submitted via contract function `submit_guess()`
5. Player status shows "GUESSED" in the UI
6. Polling checks game state every 5 seconds
7. Once both players have guessed, game transitions to **REVEAL** phase

#### Contract State:
- `player1_last_guess` is set
- `player2_last_guess` is set

### 4. **REVEAL** (`gamePhase === 'reveal'`)
- Both players have submitted their guesses
- Waiting for one player to reveal the winner

#### Flow:
1. Both players see "DUEL COMPLETE" message
2. Either player can click "REVEAL WINNER"
3. `handleRevealWinner()` calls `passService.verifyProof(sessionId, playerAddress, signer)`
4. Contract function `verify_proof()` is called:
   - Compares `player1_guess` with `player2_secret_hash`
   - Compares `player2_guess` with `player1_secret_hash`
   - Determines winner (first to match opponent's secret)
   - Updates game `status` to `Finished`
   - Sets `winner` field
5. Game transitions to **COMPLETE** phase

#### Contract Verification Logic:
```rust
let player1_wins = p1_guess == s2_hash;
let player2_wins = p2_guess == s1_hash;
```

### 5. **COMPLETE** (`gamePhase === 'complete'`)
- Game is finished, winner is displayed
- Players can see the result and return to lobby

#### Flow:
1. Shows winner address with trophy emoji
2. Displays your guess and result (WON or LOST)
3. Player clicks "RETURN TO LOBBY" to start a new game
4. All state is reset

## Key Functions in PassService

### `registerSecret(sessionId, playerAddress, secretHash, signer)`
- Registers a player's secret hash
- Called during SETUP phase
- Both players must call this before game can proceed

### `submitGuess(sessionId, playerAddress, guess, signer)`
- Submits a player's guess
- Called during GUESS phase
- Both players must call this before winner can be revealed

### `submitProof(sessionId, proof)`
- (Placeholder) Submits a proof for verification
- Currently not used in the flow
- Reserved for future ZK proof integration

### `verifyProof(sessionId, playerAddress, signer)`
- Calls contract `verify_proof()` to determine winner
- Called during REVEAL phase
- Returns the winner's address

### `revealWinner(sessionId, playerAddress, signer)`
- Backwards compatible wrapper that delegates to `verifyProof()`

## State Management

### Game State (from contract)
```typescript
interface Game {
  player1: string;
  player2: string;
  player1_points: i128;
  player2_points: i128;
  player1_secret_hash?: u32;           // Set after player1 registers secret
  player2_secret_hash?: u32;           // Set after player2 registers secret
  player1_last_guess?: u32;            // Set after player1 submits guess
  player2_last_guess?: u32;            // Set after player2 submits guess
  verification_proof?: Bytes;          // Stored proof (placeholder)
  winner?: string;                     // Set when game finishes
  status: GameStatus;                  // Playing, Finished, etc.
}
```

### Game Phase Determination
- `SETUP`: Both secrets not yet registered
- `GUESS`: Both secrets registered, both guesses not yet submitted
- `REVEAL`: Both guesses submitted, winner not yet determined
- `COMPLETE`: Winner determined

## Event Flow Diagram

```
CREATE → SETUP → GUESS → REVEAL → COMPLETE
  ↓       ↓       ↓       ↓         ↓
  │     Register  Submit  Verify   Show
  │     Secrets   Guess   Winner   Results
  │
  └─→ (Game created on-chain)
```

## Security Considerations

1. **Secret Registration**: Secrets are hashed before submission (though currently just passed as numbers)
2. **Player Authorization**: Each transaction is signed by the respective player
3. **Game Points**: Points are locked in GameHub when game starts
4. **Winner Verification**: Contract compares hashes, not raw guesses

## Testing with Dev Wallets

The game supports "Quickstart" mode when using dev wallets:
- Both players are simulated automatically
- Transaction signing is handled internally
- Useful for testing the complete game flow
