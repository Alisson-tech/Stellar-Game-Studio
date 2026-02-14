# Pass Game - API Usage Examples

## Setup

```typescript
import { PassService } from './passService';
import { PASS_CONTRACT } from '@/utils/constants';

const passService = new PassService(PASS_CONTRACT);
```

---

## Game Creation & Joining

### Method 1: Simple Start Game (Same Wallet)
```typescript
// Both players use same wallet with sufficient points
const signer = getContractSigner();
const sessionId = 12345;

await passService.startGame(
  sessionId,
  player1Address,
  player2Address,
  BigInt(1000000),  // 0.1 points (with 7 decimals)
  BigInt(1000000),
  signer
);
```

### Method 2: Multi-Sig Flow (Two Different Wallets)

**Player 1:**
```typescript
const signer1 = getContractSigner();
const authEntryXDR = await passService.prepareStartGame(
  sessionId,
  player1Address,
  player2Address,  // Placeholder (Player 2 will update)
  BigInt(1000000),
  BigInt(1000000),
  signer1
);

// Share authEntryXDR with Player 2
console.log("Share this:", authEntryXDR);
```

**Player 2:**
```typescript
const signer2 = getContractSigner();
const fullySignedXDR = await passService.importAndSignAuthEntry(
  authEntryXDR,        // From Player 1
  player2Address,
  BigInt(1500000),     // Can specify different points
  signer2
);

// Either player can finalize:
await passService.finalizeStartGame(
  fullySignedXDR,
  player2Address,
  signer2
);
```

---

## Playing the Game

### Register Secret (SETUP Phase)
```typescript
const signer = getContractSigner();
const secretNumber = 42;  // Player's secret

await passService.registerSecret(
  sessionId,
  playerAddress,
  secretNumber,
  signer
);
```

### Submit Guess (GUESS Phase)
```typescript
const signer = getContractSigner();
const guess = 37;  // Player's guess for opponent's secret

await passService.submitGuess(
  sessionId,
  playerAddress,
  guess,
  signer
);
```

### Verify & Reveal Winner (REVEAL Phase)
```typescript
const signer = getContractSigner();

const winner = await passService.verifyProof(
  sessionId,
  playerAddress,
  signer
);

console.log("Winner:", winner);
// Output: "GXXXXXX..." (winner's address)
```

---

## Checking Game State

### Get Current Game State
```typescript
const game = await passService.getGame(sessionId);

if (game) {
  console.log({
    status: game.status,           // 'Setup', 'Playing', 'Finished', etc.
    player1: game.player1,
    player2: game.player2,
    player1SecretSet: game.player1_secret_hash !== null,
    player2SecretSet: game.player2_secret_hash !== null,
    player1Guessed: game.player1_last_guess !== null,
    player2Guessed: game.player2_last_guess !== null,
    winner: game.winner,
  });
} else {
  console.log("Game not found");
}
```

### Poll for Game Updates
```typescript
// Wait until both players have guessed
const pollForGuesses = async (maxAttempts = 10) => {
  let attempts = 0;
  while (attempts < maxAttempts) {
    const game = await passService.getGame(sessionId);
    
    if (game?.player1_last_guess && game?.player2_last_guess) {
      return game;  // Both guessed!
    }
    
    await new Promise(r => setTimeout(r, 1000));  // Wait 1 second
    attempts++;
  }
  throw new Error("Timeout waiting for guesses");
};

const game = await pollForGuesses();
```

---

## React Component Integration

### Hook for Game State
```typescript
function usePassGame(sessionId: number) {
  const [game, setGame] = useState<Game | null>(null);
  const [phase, setPhase] = useState<GamePhase>('create');
  const [loading, setLoading] = useState(false);

  const loadGame = async () => {
    const g = await passService.getGame(sessionId);
    setGame(g);
    
    // Determine phase from game state
    if (g?.winner) {
      setPhase('complete');
    } else if (g?.player1_last_guess && g?.player2_last_guess) {
      setPhase('reveal');
    } else if (g?.player1_secret_hash && g?.player2_secret_hash) {
      setPhase('guess');
    } else if (g) {
      setPhase('setup');
    }
  };

  useEffect(() => {
    loadGame();
    const interval = setInterval(loadGame, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  return { game, phase, loading };
}
```

### Using the Hook
```typescript
function GameComponent({ sessionId, userAddress }) {
  const { game, phase } = usePassGame(sessionId);

  if (phase === 'setup') {
    return <SetupPhase game={game} userAddress={userAddress} />;
  } else if (phase === 'guess') {
    return <GuessPhase game={game} userAddress={userAddress} />;
  } else if (phase === 'reveal') {
    return <RevealPhase game={game} />;
  } else if (phase === 'complete') {
    return <CompletePhase game={game} userAddress={userAddress} />;
  }
}
```

---

## Error Handling

### Catching Contract Errors
```typescript
try {
  await passService.registerSecret(sessionId, playerAddress, 42, signer);
} catch (err) {
  if (err instanceof Error) {
    if (err.message.includes('SecretAlreadyRegistered')) {
      console.error("You already registered your secret");
    } else if (err.message.includes('InvalidStatus')) {
      console.error("Game is not in setup phase");
    } else if (err.message.includes('NotPlayer')) {
      console.error("You are not a player in this game");
    } else {
      console.error("Unknown error:", err.message);
    }
  }
}
```

### Transaction Failure Handling
```typescript
try {
  await passService.submitGuess(sessionId, playerAddress, 37, signer);
} catch (err) {
  const errorMessage = err instanceof Error ? err.message : 'Unknown error';
  
  if (errorMessage.includes('simulation failed')) {
    console.error("Transaction simulation failed - check your points and game status");
  } else if (errorMessage.includes('timeout')) {
    console.error("Transaction took too long - try again");
  } else {
    console.error("Failed to submit guess:", errorMessage);
  }
}
```

---

## Advanced Usage

### Creating a Game Invite Link
```typescript
async function generateGameLink(
  sessionId: number,
  player1: string,
  player1Signer: Signer
) {
  // Player 1 prepares their auth entry
  const authEntryXDR = await passService.prepareStartGame(
    sessionId,
    player1,
    await getFundedAddress(),  // Placeholder
    BigInt(1000000),
    BigInt(1000000),
    player1Signer
  );

  // Create shareable link
  const params = new URLSearchParams({
    game: 'pass',
    auth: authEntryXDR,
  });
  
  const link = `${window.location.origin}?${params}`;
  return link;
}
```

### Automated Game Flow (for Testing)
```typescript
async function playFullGame(
  sessionId: number,
  player1: string,
  player2: string,
  signer1: Signer,
  signer2: Signer
) {
  // 1. Create game
  console.log("Creating game...");
  const authEntry = await passService.prepareStartGame(
    sessionId, player1, player2, 
    BigInt(1000000), BigInt(1000000), 
    signer1
  );
  
  const fullXDR = await passService.importAndSignAuthEntry(
    authEntry, player2, BigInt(1000000), signer2
  );
  
  await passService.finalizeStartGame(fullXDR, player2, signer2);

  // 2. Register secrets
  console.log("Registering secrets...");
  await passService.registerSecret(sessionId, player1, 42, signer1);
  await passService.registerSecret(sessionId, player2, 73, signer2);

  // 3. Submit guesses
  console.log("Submitting guesses...");
  await passService.submitGuess(sessionId, player1, 73, signer1);   // Correct!
  await passService.submitGuess(sessionId, player2, 99, signer2);   // Wrong

  // 4. Reveal winner
  console.log("Revealing winner...");
  const winner = await passService.verifyProof(sessionId, player1, signer1);

  console.log("Winner:", winner);
  // Winner should be player1 (guessed correctly)
}
```

---

## Game Logic Examples

### Checking if You Can Make a Move
```typescript
function canRegisterSecret(game: Game, userAddress: string): boolean {
  // Must be a player in the game
  if (game.player1 !== userAddress && game.player2 !== userAddress) {
    return false;
  }
  
  // Status must be Setup
  if (game.status !== 'Setup') {
    return false;
  }
  
  // Haven't already registered
  const isPlayer1 = game.player1 === userAddress;
  const hasRegistered = isPlayer1 
    ? game.player1_secret_hash !== null
    : game.player2_secret_hash !== null;
  
  return !hasRegistered;
}
```

### Determining Who's Ready
```typescript
function getReadyStatus(game: Game) {
  return {
    player1SecretReady: game.player1_secret_hash !== null,
    player2SecretReady: game.player2_secret_hash !== null,
    player1Guessed: game.player1_last_guess !== null,
    player2Guessed: game.player2_last_guess !== null,
    bothReady: (game.player1_last_guess !== null && 
                game.player2_last_guess !== null),
  };
}
```

### Checking Who Might Win
```typescript
function getWinPrediction(game: Game) {
  const p1_guessed_correct = game.player1_last_guess === game.player2_secret_hash;
  const p2_guessed_correct = game.player2_last_guess === game.player1_secret_hash;

  if (p1_guessed_correct && !p2_guessed_correct) {
    return { prediction: 'Player 1 will win', confidence: 100 };
  } else if (!p1_guessed_correct && p2_guessed_correct) {
    return { prediction: 'Player 2 will win', confidence: 100 };
  } else if (p1_guessed_correct && p2_guessed_correct) {
    // Both guessed correctly - first to call verify_proof wins
    return { prediction: 'Race condition - first to reveal wins', confidence: 50 };
  } else {
    return { prediction: 'No one guessed correctly - retry', confidence: 0 };
  }
}
```

---

## Debugging Tips

### Log Game State
```typescript
async function debugGame(sessionId: number) {
  const game = await passService.getGame(sessionId);
  
  console.log("=== GAME STATE ===");
  console.log("Session ID:", sessionId);
  console.log("Status:", game?.status);
  console.log("Player 1:", game?.player1);
  console.log("Player 2:", game?.player2);
  console.log("P1 Points:", game?.player1_points.toString());
  console.log("P2 Points:", game?.player2_points.toString());
  console.log("P1 Secret Set:", game?.player1_secret_hash !== null);
  console.log("P2 Secret Set:", game?.player2_secret_hash !== null);
  console.log("P1 Guess:", game?.player1_last_guess);
  console.log("P2 Guess:", game?.player2_last_guess);
  console.log("Winner:", game?.winner || "Not determined");
  console.log("================");
}
```

### Monitor Polling
```typescript
let pollCount = 0;
const pollInterval = setInterval(async () => {
  const game = await passService.getGame(sessionId);
  console.log(`Poll #${++pollCount}:`, {
    p1_secret: game?.player1_secret_hash !== null,
    p2_secret: game?.player2_secret_hash !== null,
    p1_guess: game?.player1_last_guess,
    p2_guess: game?.player2_last_guess,
  });
}, 1000);
```

---

## Best Practices

1. **Always check game exists** before accessing fields
2. **Handle null/undefined** for optional fields
3. **Use polling intervals** to avoid excessive RPC calls
4. **Validate input** before calling contract functions
5. **Use try-catch** around all contract calls
6. **Log errors** for debugging
7. **Show loading states** while waiting for transactions
8. **Disable buttons** while transaction is pending
