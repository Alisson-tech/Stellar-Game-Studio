import { useState, useEffect, useRef } from 'react';
import { PassService } from './passService';
import { requestCache, createCacheKey } from '@/utils/requestCache';
import { useWallet } from '@/hooks/useWallet';
import { PASS_CONTRACT } from '@/utils/constants';
import { getFundedSimulationSourceAddress } from '@/utils/simulationUtils';
import { devWalletService, DevWalletService } from '@/services/devWalletService';
import type { Game } from './bindings';
import { PassDarkUI } from './components';

/**
 * PASS GAME - Mastermind Style Guessing Game
 * 
 * GAME FLOW:
 * 1. CREATE: Ambos os jogadores devem estar conectados via wallet
 *    - Player 1 gera um convite (prepareStartGame) 
 *    - Player 2 importa o convite e finaliza o jogo (importAndSignAuthEntry + finalizeStartGame)
 *    - Transição para SETUP
 * 
 * 2. SETUP: Registrar Segredos
 *    - Player 1 registra seu segredo (registerSecret)
 *    - Player 2 registra seu segredo (registerSecret)
 *    - Quando ambos registrarem, o contrato muda para Playing
 *    - Transição para GUESS
 * 
 * 3. GUESS: Fazer Palpites
 *    - Player 1 faz um palpite sobre o segredo de Player 2 (submitGuess)
 *    - Player 2 faz um palpite sobre o segredo de Player 1 (submitGuess)
 *    - Quem acertar o segredo do outro primeiro vence
 *    - Quando ambos tiverem palpitado, mostrar "ENVIAR PROVA"
 * 
 * 4. PROOF: Enviar e Verificar Provas
 *    - Após ambos fazerem palpites, cada player clica "ENVIAR PROVA" (submitProof com mock proof)
 *    - Após submitProof ser enviado, o player chama verifyProof para determinar vencedor
 *    - Resultado: empate (ambos acertaram), vencedor (um acertou), ou continua na tela de palpites
 * 
 * 5. RESULTADO: Exibir Status do Jogo
 *    - Se houver vencedor/empate: Exibir com opção de novo jogo
 *    - Se ninguém acertou: Continuar na tela de palpites com resultado (sem pular para nova rodada automática)
 */

const createRandomSessionId = (): number => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    let value = 0;
    const buffer = new Uint32Array(1);
    while (value === 0) {
      crypto.getRandomValues(buffer);
      value = buffer[0];
    }
    return value;
  }

  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
};

// Create service instance with the contract ID
const passService = new PassService(PASS_CONTRACT);

interface PassGameProps {
  userAddress: string;
  currentEpoch: number;
  availablePoints: bigint;
  initialXDR?: string | null;
  initialSessionId?: number | null;
  onStandingsRefresh: () => void;
  onGameComplete: () => void;
}

export function PassGame({
  userAddress,
  availablePoints,
  initialXDR,
  initialSessionId,
  onStandingsRefresh,
  onGameComplete
}: PassGameProps) {
  const DEFAULT_POINTS = '0.1';
  const { getContractSigner, walletType } = useWallet();
  // Use a random session ID that fits in u32 (avoid 0 because UI validation treats <=0 as invalid)
  const [sessionId, setSessionId] = useState<number>(() => createRandomSessionId());
  const [player1Address, setPlayer1Address] = useState(userAddress);
  const [player1Points, setPlayer1Points] = useState(DEFAULT_POINTS);
  const [guess, setGuess] = useState<number | null>(null);
  const [gameState, setGameState] = useState<Game | null>(null);
  const [loading, setLoading] = useState(false);
  const [quickstartLoading, setQuickstartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [gamePhase, setGamePhase] = useState<'create' | 'setup' | 'guess' | 'complete'>('create');
  const [createMode, setCreateMode] = useState<'create' | 'import' | 'load'>('create');
  const [exportedAuthEntryXDR, setExportedAuthEntryXDR] = useState<string | null>(null);
  const [importAuthEntryXDR, setImportAuthEntryXDR] = useState('');
  const [importSessionId, setImportSessionId] = useState('');
  const [importPlayer1, setImportPlayer1] = useState('');
  const [importPlayer1Points, setImportPlayer1Points] = useState('');
  const [importPlayer2Points, setImportPlayer2Points] = useState(DEFAULT_POINTS);
  const [loadSessionId, setLoadSessionId] = useState('');
  const [authEntryCopied, setAuthEntryCopied] = useState(false);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const [xdrParsing, setXdrParsing] = useState(false);
  const [xdrParseError, setXdrParseError] = useState<string | null>(null);
  const [xdrParseSuccess, setXdrParseSuccess] = useState(false);
  const [player1ProofSubmitted, setPlayer1ProofSubmitted] = useState(false);
  const [player2ProofSubmitted, setPlayer2ProofSubmitted] = useState(false);
  const [lastProofResult, setLastProofResult] = useState<string | null>(null);


  useEffect(() => {
    setPlayer1Address(userAddress);
  }, [userAddress]);

  useEffect(() => {
    if (createMode === 'import' && !importPlayer2Points.trim()) {
      setImportPlayer2Points(DEFAULT_POINTS);
    }
  }, [createMode, importPlayer2Points]);

  const POINTS_DECIMALS = 7;
  const isBusy = loading || quickstartLoading;
  const actionLock = useRef(false);
  const quickstartAvailable = walletType === 'dev'
    && DevWalletService.isDevModeAvailable()
    && DevWalletService.isPlayerAvailable(1)
    && DevWalletService.isPlayerAvailable(2);

  const runAction = async (action: () => Promise<void>) => {
    if (actionLock.current || isBusy) {
      return;
    }
    actionLock.current = true;
    try {
      await action();
    } finally {
      actionLock.current = false;
    }
  };

  const handleStartNewGame = () => {
    if (gameState?.winner) {
      onGameComplete();
    }

    actionLock.current = false;
    setGamePhase('create');
    setSessionId(createRandomSessionId());
    setGameState(null);
    setGuess(null);
    setLoading(false);
    setQuickstartLoading(false);
    setError(null);
    setSuccess(null);
    setCreateMode('create');
    setExportedAuthEntryXDR(null);
    setImportAuthEntryXDR('');
    setImportSessionId('');
    setImportPlayer1('');
    setImportPlayer1Points('');
    setImportPlayer2Points(DEFAULT_POINTS);
    setLoadSessionId('');
    setAuthEntryCopied(false);
    setShareUrlCopied(false);
    setXdrParsing(false);
    setXdrParseError(null);
    setXdrParseSuccess(false);
    setPlayer1ProofSubmitted(false);
    setPlayer2ProofSubmitted(false);
    setLastProofResult(null);
    setPlayer1Address(userAddress);
    setPlayer1Points(DEFAULT_POINTS);

  };

  const parsePoints = (value: string): bigint | null => {
    try {
      const cleaned = value.replace(/[^\d.]/g, '');
      if (!cleaned || cleaned === '.') return null;

      const [whole = '0', fraction = ''] = cleaned.split('.');
      const paddedFraction = fraction.padEnd(POINTS_DECIMALS, '0').slice(0, POINTS_DECIMALS);
      return BigInt(whole + paddedFraction);
    } catch {
      return null;
    }
  };

  const loadGameState = async () => {
    try {
      // Always fetch latest game state to avoid stale cached results after transactions.
      const game = await passService.getGame(sessionId);
      setGameState(game);

      // Determine game phase based on state
      if (game && game.winner !== null && game.winner !== undefined) {
        // Game ended - show complete phase
        setGamePhase('complete');
      } else if (game && game.player1_secret_hash !== null && game.player1_secret_hash !== undefined &&
        game.player2_secret_hash !== null && game.player2_secret_hash !== undefined) {
        // Both secrets registered - in guess phase
        setGamePhase('guess');
      } else {
        // Waiting for secrets
        setGamePhase('setup');
      }
    } catch (err) {
      // Game doesn't exist yet
      setGameState(null);
    }
  };

  useEffect(() => {
    if (gamePhase !== 'create' && gameState !== null) {
      // Only poll if we're not in create phase and game state is loaded
      loadGameState();
      const interval = setInterval(loadGameState, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [sessionId, gamePhase]);

  // Auto-refresh standings when game completes (for passive player who didn't call reveal_winner)
  useEffect(() => {
    if (gamePhase === 'complete' && gameState?.winner) {
      console.log('Game completed! Refreshing standings and dashboard data...');
      onStandingsRefresh(); // Refresh standings and available points; don't call onGameComplete() here or it will close the game!
    }
  }, [gamePhase, gameState?.winner]);

  // Handle initial values from URL deep linking or props
  // Expected URL formats:
  //   - With auth entry: ?game=pass&auth=AAAA... (Session ID, P1 address, P1 points parsed from auth entry)
  //   - With session ID: ?game=pass&session-id=123 (Load existing game)
  // Note: GamesCatalog cleans URL params, so we prioritize props over URL
  useEffect(() => {
    // Priority 1: Check initialXDR prop (from GamesCatalog after URL cleanup)
    if (initialXDR) {
      console.log('[Deep Link] Using initialXDR prop from GamesCatalog');

      try {
        const parsed = passService.parseAuthEntry(initialXDR);
        const sessionId = parsed.sessionId;

        console.log('[Deep Link] Parsed session ID from initialXDR:', sessionId);

        // Check if game already exists (both players have signed)
        passService.getGame(sessionId)
          .then((game) => {
            if (game) {
              // Game exists! Load it directly instead of going to import mode
              console.log('[Deep Link] Game already exists, loading directly to guess phase');
              console.log('[Deep Link] Game data:', game);

              // Auto-load the game - bypass create phase entirely
              setGameState(game);
              setGamePhase('guess');
              setSessionId(sessionId); // Set session ID for the game
            } else {
              // Game doesn't exist yet, go to import mode
              console.log('[Deep Link] Game not found, entering import mode');
              setCreateMode('import');
              setImportAuthEntryXDR(initialXDR);
              setImportSessionId(sessionId.toString());
              setImportPlayer1(parsed.player1);
              setImportPlayer1Points((Number(parsed.player1Points) / 10_000_000).toString());
              setImportPlayer2Points('0.1');
            }
          })
          .catch((err) => {
            console.error('[Deep Link] Error checking game existence:', err);
            console.error('[Deep Link] Error details:', {
              message: err?.message,
              stack: err?.stack,
              sessionId: sessionId,
            });
            // If we can't check, default to import mode
            setCreateMode('import');
            setImportAuthEntryXDR(initialXDR);
            setImportSessionId(parsed.sessionId.toString());
            setImportPlayer1(parsed.player1);
            setImportPlayer1Points((Number(parsed.player1Points) / 10_000_000).toString());
            setImportPlayer2Points('0.1');
          });
      } catch (err) {
        console.log('[Deep Link] Failed to parse initialXDR, will retry on import');
        setCreateMode('import');
        setImportAuthEntryXDR(initialXDR);
        setImportPlayer2Points('0.1');
      }
      return; // Exit early - we processed initialXDR
    }

    // Priority 2: Check URL parameters (for direct navigation without GamesCatalog)
    const urlParams = new URLSearchParams(window.location.search);
    const authEntry = urlParams.get('auth');
    const urlSessionId = urlParams.get('session-id');

    if (authEntry) {
      // Simplified URL format - only auth entry is needed
      // Session ID, Player 1 address, and points are parsed from auth entry
      console.log('[Deep Link] Auto-populating game from URL with auth entry');

      // Try to parse auth entry to get session ID
      try {
        const parsed = passService.parseAuthEntry(authEntry);
        const sessionId = parsed.sessionId;

        console.log('[Deep Link] Parsed session ID from URL auth entry:', sessionId);

        // Check if game already exists (both players have signed)
        passService.getGame(sessionId)
          .then((game) => {
            if (game) {
              // Game exists! Load it directly instead of going to import mode
              console.log('[Deep Link] Game already exists (URL), loading directly to guess phase');
              console.log('[Deep Link] Game data:', game);

              // Auto-load the game - bypass create phase entirely
              setGameState(game);
              setGamePhase('guess');
              setSessionId(sessionId); // Set session ID for the game
            } else {
              // Game doesn't exist yet, go to import mode
              console.log('[Deep Link] Game not found (URL), entering import mode');
              setCreateMode('import');
              setImportAuthEntryXDR(authEntry);
              setImportSessionId(sessionId.toString());
              setImportPlayer1(parsed.player1);
              setImportPlayer1Points((Number(parsed.player1Points) / 10_000_000).toString());
              setImportPlayer2Points('0.1');
            }
          })
          .catch((err) => {
            console.error('[Deep Link] Error checking game existence (URL):', err);
            console.error('[Deep Link] Error details:', {
              message: err?.message,
              stack: err?.stack,
              sessionId: sessionId,
            });
            // If we can't check, default to import mode
            setCreateMode('import');
            setImportAuthEntryXDR(authEntry);
            setImportSessionId(parsed.sessionId.toString());
            setImportPlayer1(parsed.player1);
            setImportPlayer1Points((Number(parsed.player1Points) / 10_000_000).toString());
            setImportPlayer2Points('0.1');
          });
      } catch (err) {
        console.log('[Deep Link] Failed to parse auth entry from URL, will retry on import');
        setCreateMode('import');
        setImportAuthEntryXDR(authEntry);
        setImportPlayer2Points('0.1');
      }
    } else if (urlSessionId) {
      // Load existing game by session ID
      console.log('[Deep Link] Auto-populating game from URL with session ID');
      setCreateMode('load');
      setLoadSessionId(urlSessionId);
    } else if (initialSessionId !== null && initialSessionId !== undefined) {
      console.log('[Deep Link] Auto-populating session ID from prop:', initialSessionId);
      setCreateMode('load');
      setLoadSessionId(initialSessionId.toString());
    }
  }, [initialXDR, initialSessionId]);

  // Auto-parse Auth Entry XDR when pasted
  useEffect(() => {
    // Only parse if in import mode and XDR is not empty
    if (createMode !== 'import' || !importAuthEntryXDR.trim()) {
      // Reset parse states when XDR is cleared
      if (!importAuthEntryXDR.trim()) {
        setXdrParsing(false);
        setXdrParseError(null);
        setXdrParseSuccess(false);
        setImportSessionId('');
        setImportPlayer1('');
        setImportPlayer1Points('');
      }
      return;
    }

    // Auto-parse the XDR
    const parseXDR = async () => {
      setXdrParsing(true);
      setXdrParseError(null);
      setXdrParseSuccess(false);

      try {
        console.log('[Auto-Parse] Parsing auth entry XDR...');
        const gameParams = passService.parseAuthEntry(importAuthEntryXDR.trim());

        // Check if user is trying to import their own auth entry (self-play prevention)
        if (gameParams.player1 === userAddress) {
          throw new Error('You cannot play against yourself. This auth entry was created by you (Player 1).');
        }

        // Successfully parsed - auto-fill fields
        setImportSessionId(gameParams.sessionId.toString());
        setImportPlayer1(gameParams.player1);
        setImportPlayer1Points((Number(gameParams.player1Points) / 10_000_000).toString());
        setXdrParseSuccess(true);
        console.log('[Auto-Parse] Successfully parsed auth entry:', {
          sessionId: gameParams.sessionId,
          player1: gameParams.player1,
          player1Points: (Number(gameParams.player1Points) / 10_000_000).toString(),
        });
      } catch (err) {
        console.error('[Auto-Parse] Failed to parse auth entry:', err);
        const errorMsg = err instanceof Error ? err.message : 'Invalid auth entry XDR';
        setXdrParseError(errorMsg);
        // Clear auto-filled fields on error
        setImportSessionId('');
        setImportPlayer1('');
        setImportPlayer1Points('');
      } finally {
        setXdrParsing(false);
      }
    };

    // Debounce parsing to avoid parsing on every keystroke
    const timeoutId = setTimeout(parseXDR, 500);
    return () => clearTimeout(timeoutId);
  }, [importAuthEntryXDR, createMode, userAddress]);

  const handlePrepareTransaction = async () => {
    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);

        const p1Points = parsePoints(player1Points);

        if (!p1Points || p1Points <= 0n) {
          throw new Error('Enter a valid points amount');
        }

        const signer = getContractSigner();

        // Use placeholder values for Player 2 (they'll rebuild with their own values).
        // We still need a real, funded account as the transaction source for build/simulation.
        const placeholderPlayer2Address = await getFundedSimulationSourceAddress([player1Address, userAddress]);
        const placeholderP2Points = p1Points; // Same as P1 for simulation

        console.log('Preparing transaction for Player 1 to sign...');
        console.log('Using placeholder Player 2 values for simulation only');
        const authEntryXDR = await passService.prepareStartGame(
          sessionId,
          player1Address,
          placeholderPlayer2Address,
          p1Points,
          placeholderP2Points,
          signer
        );

        console.log('Transaction prepared successfully! Player 1 has signed their auth entry.');
        setExportedAuthEntryXDR(authEntryXDR);
        setSuccess('Auth entry signed! Copy the auth entry XDR or share URL below and send it to Player 2. Waiting for them to sign...');

        // Start polling for the game to be created by Player 2
        const pollInterval = setInterval(async () => {
          try {
            // Try to load the game
            const game = await passService.getGame(sessionId);
            if (game) {
              console.log('Game found! Player 2 has finalized the transaction. Transitioning to guess phase...');
              clearInterval(pollInterval);

              // Update game state
              setGameState(game);
              setExportedAuthEntryXDR(null);
              setSuccess('Game created! Player 2 has signed and submitted.');
              setGamePhase('guess');

              // Refresh dashboard to show updated available points (locked in game)
              onStandingsRefresh();

              // Clear success message after 2 seconds
              setTimeout(() => setSuccess(null), 2000);
            } else {
              console.log('Game not found yet, continuing to poll...');
            }
          } catch (err) {
            // Game doesn't exist yet, keep polling
            console.log('Polling for game creation...', err instanceof Error ? err.message : 'checking');
          }
        }, 3000); // Poll every 3 seconds

        // Stop polling after 5 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          console.log('Stopped polling after 5 minutes');
        }, 300000);
      } catch (err) {
        console.error('Prepare transaction error:', err);
        // Extract detailed error message
        let errorMessage = 'Failed to prepare transaction';
        if (err instanceof Error) {
          errorMessage = err.message;

          // Check for common errors
          if (err.message.includes('insufficient')) {
            errorMessage = `Insufficient points: ${err.message}. Make sure you have enough points for this game.`;
          } else if (err.message.includes('auth')) {
            errorMessage = `Authorization failed: ${err.message}. Check your wallet connection.`;
          }
        }

        setError(errorMessage);

        // Keep the component in 'create' phase so user can see the error and retry
      } finally {
        setLoading(false);
      }
    });
  };

  const handleQuickStart = async () => {
    await runAction(async () => {
      try {
        setQuickstartLoading(true);
        setError(null);
        setSuccess(null);
        if (walletType !== 'dev') {
          throw new Error('Quickstart only works with dev wallets in the Games Library.');
        }

        if (!DevWalletService.isDevModeAvailable() || !DevWalletService.isPlayerAvailable(1) || !DevWalletService.isPlayerAvailable(2)) {
          throw new Error('Quickstart requires both dev wallets. Run "bun run setup" and connect a dev wallet.');
        }

        const p1Points = parsePoints(player1Points);
        if (!p1Points || p1Points <= 0n) {
          throw new Error('Enter a valid points amount');
        }

        const originalPlayer = devWalletService.getCurrentPlayer();
        let player1AddressQuickstart = '';
        let player2AddressQuickstart = '';
        let player1Signer: ReturnType<typeof devWalletService.getSigner> | null = null;
        let player2Signer: ReturnType<typeof devWalletService.getSigner> | null = null;

        try {
          await devWalletService.initPlayer(1);
          player1AddressQuickstart = devWalletService.getPublicKey();
          player1Signer = devWalletService.getSigner();

          await devWalletService.initPlayer(2);
          player2AddressQuickstart = devWalletService.getPublicKey();
          player2Signer = devWalletService.getSigner();
        } finally {
          if (originalPlayer) {
            await devWalletService.initPlayer(originalPlayer);
          }
        }

        if (!player1Signer || !player2Signer) {
          throw new Error('Quickstart failed to initialize dev wallet signers.');
        }

        if (player1AddressQuickstart === player2AddressQuickstart) {
          throw new Error('Quickstart requires two different dev wallets.');
        }

        const quickstartSessionId = createRandomSessionId();
        setSessionId(quickstartSessionId);
        setPlayer1Address(player1AddressQuickstart);
        setCreateMode('create');
        setExportedAuthEntryXDR(null);
        setImportAuthEntryXDR('');
        setImportSessionId('');
        setImportPlayer1('');
        setImportPlayer1Points('');
        setImportPlayer2Points(DEFAULT_POINTS);
        setLoadSessionId('');

        const placeholderPlayer2Address = await getFundedSimulationSourceAddress([
          player1AddressQuickstart,
          player2AddressQuickstart,
        ]);

        const authEntryXDR = await passService.prepareStartGame(
          quickstartSessionId,
          player1AddressQuickstart,
          placeholderPlayer2Address,
          p1Points,
          p1Points,
          player1Signer
        );

        const fullySignedTxXDR = await passService.importAndSignAuthEntry(
          authEntryXDR,
          player2AddressQuickstart,
          p1Points,
          player2Signer
        );

        await passService.finalizeStartGame(
          fullySignedTxXDR,
          player2AddressQuickstart,
          player2Signer
        );

        try {
          const game = await passService.getGame(quickstartSessionId);
          setGameState(game);
        } catch (err) {
          console.log('Quickstart game not available yet:', err);
        }
        setGamePhase('guess');

        onStandingsRefresh();
        setSuccess('Quickstart complete! Both players signed and the game is ready.');
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        console.error('Quickstart error:', err);
        setError(err instanceof Error ? err.message : 'Quickstart failed');
      } finally {
        setQuickstartLoading(false);
      }
    });
  };

  const handleImportTransaction = async () => {
    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        // Validate required inputs (only auth entry and player 2 points)
        if (!importAuthEntryXDR.trim()) {
          throw new Error('Enter auth entry XDR from Player 1');
        }
        if (!importPlayer2Points.trim()) {
          throw new Error('Enter your points amount (Player 2)');
        }

        // Parse Player 2's points
        const p2Points = parsePoints(importPlayer2Points);
        if (!p2Points || p2Points <= 0n) {
          throw new Error('Invalid Player 2 points');
        }

        // Parse auth entry to extract game parameters
        // The auth entry contains: session_id, player1, player1_points
        console.log('Parsing auth entry to extract game parameters...');
        const gameParams = passService.parseAuthEntry(importAuthEntryXDR.trim());

        console.log('Extracted from auth entry:', {
          sessionId: gameParams.sessionId,
          player1: gameParams.player1,
          player1Points: gameParams.player1Points.toString(),
        });

        // Auto-populate read-only fields from parsed auth entry (for display)
        setImportSessionId(gameParams.sessionId.toString());
        setImportPlayer1(gameParams.player1);
        setImportPlayer1Points((Number(gameParams.player1Points) / 10_000_000).toString());

        // Verify the user is Player 2 (prevent self-play)
        if (gameParams.player1 === userAddress) {
          throw new Error('Invalid game: You cannot play against yourself (you are Player 1 in this auth entry)');
        }

        // Additional validation: Ensure Player 2 address is different from Player 1
        // (In case user manually edits the Player 2 field)
        if (userAddress === gameParams.player1) {
          throw new Error('Cannot play against yourself. Player 2 must be different from Player 1.');
        }

        const signer = getContractSigner();

        // Step 1: Import Player 1's signed auth entry and rebuild transaction
        // New simplified API - only needs: auth entry, player 2 address, player 2 points
        console.log('Importing Player 1 auth entry and rebuilding transaction...');
        const fullySignedTxXDR = await passService.importAndSignAuthEntry(
          importAuthEntryXDR.trim(),
          userAddress, // Player 2 address (current user)
          p2Points,
          signer
        );

        // Step 2: Player 2 finalizes and submits (they are the transaction source)
        console.log('Simulating and submitting transaction...');
        await passService.finalizeStartGame(
          fullySignedTxXDR,
          userAddress,
          signer
        );

        // If we get here, transaction succeeded! Now update state.
        console.log('Transaction submitted successfully! Updating state...');
        setSessionId(gameParams.sessionId);
        setSuccess('Game created successfully! Both players signed.');
        setGamePhase('guess');

        // Clear import fields
        setImportAuthEntryXDR('');
        setImportSessionId('');
        setImportPlayer1('');
        setImportPlayer1Points('');
        setImportPlayer2Points(DEFAULT_POINTS);

        // Load the newly created game state
        await loadGameState();

        // Refresh dashboard to show updated available points (locked in game)
        onStandingsRefresh();

        // Clear success message after 2 seconds
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        console.error('Import transaction error:', err);
        // Extract detailed error message if available
        let errorMessage = 'Failed to import and sign transaction';
        if (err instanceof Error) {
          errorMessage = err.message;

          // Check for common Soroban errors
          if (err.message.includes('simulation failed')) {
            errorMessage = `Simulation failed: ${err.message}. Check that you have enough Points and the game parameters are correct.`;
          } else if (err.message.includes('transaction failed')) {
            errorMessage = `Transaction failed: ${err.message}. The game could not be created on the blockchain.`;
          }
        }

        setError(errorMessage);

        // Keep the component in 'create' phase so user can see the error and retry
        // Don't change gamePhase or clear any fields - let the user see what went wrong
      } finally {
        setLoading(false);
      }
    });
  };

  const handleLoadExistingGame = async () => {
    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        const parsedSessionId = parseInt(loadSessionId.trim());
        if (isNaN(parsedSessionId) || parsedSessionId <= 0) {
          throw new Error('Enter a valid session ID');
        }

        // Try to load the game (use cache to prevent duplicate calls)
        const game = await requestCache.dedupe(
          createCacheKey('game-state', parsedSessionId),
          () => passService.getGame(parsedSessionId),
          5000
        );

        // Verify game exists and user is one of the players
        if (!game) {
          throw new Error('Game not found');
        }

        if (game.player1 !== userAddress && game.player2 !== userAddress) {
          throw new Error('You are not a player in this game');
        }

        // Load successful - update session ID and transition to game
        setSessionId(parsedSessionId);
        setGameState(game);
        setLoadSessionId('');

        // Determine game phase based on game state
        if (game.winner !== null && game.winner !== undefined) {
          // Game is complete - show complete phase with winner
          setGamePhase('complete');
          const isWinner = game.winner === userAddress;
          setSuccess(isWinner ? '🎉 You won this game!' : 'Game complete. Winner revealed.');
        } else if (game.player1_secret_hash !== null && game.player1_secret_hash !== undefined &&
          game.player2_secret_hash !== null && game.player2_secret_hash !== undefined) {
          // Both secrets registered, in guessing phase
          setGamePhase('guess');
          setSuccess('Game loaded! Make your guess.');
        } else {
          // Still in setup phase (waiting for secrets)
          setGamePhase('setup');
          setSuccess('Game loaded! Register your secret.');
        }

        // Clear success message after 2 seconds
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        console.error('Load game error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load game');
      } finally {
        setLoading(false);
      }
    });
  };

  const copyAuthEntryToClipboard = async () => {
    if (exportedAuthEntryXDR) {
      try {
        await navigator.clipboard.writeText(exportedAuthEntryXDR);
        setAuthEntryCopied(true);
        setTimeout(() => setAuthEntryCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy auth entry XDR:', err);
        setError('Failed to copy to clipboard');
      }
    }
  };

  const copyShareGameUrlWithAuthEntry = async () => {
    if (exportedAuthEntryXDR) {
      try {
        // Build URL with only Player 1's info and auth entry
        // Player 2 will specify their own points when they import
        const params = new URLSearchParams({
          'game': 'pass',
          'auth': exportedAuthEntryXDR,
        });

        const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
        await navigator.clipboard.writeText(shareUrl);
        setShareUrlCopied(true);
        setTimeout(() => setShareUrlCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy share URL:', err);
        setError('Failed to copy to clipboard');
      }
    }
  };

  const copyShareGameUrlWithSessionId = async () => {
    if (loadSessionId) {
      try {
        const shareUrl = `${window.location.origin}${window.location.pathname}?game=pass&session-id=${loadSessionId}`;
        await navigator.clipboard.writeText(shareUrl);
        setShareUrlCopied(true);
        setTimeout(() => setShareUrlCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy share URL:', err);
        setError('Failed to copy to clipboard');
      }
    }
  };

  const handleMakeGuess = async () => {
    if (guess === null) {
      setError('Select a number to guess');
      return;
    }

    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);

        const signer = getContractSigner();
        await passService.submitGuess(sessionId, userAddress, guess, signer);

        setSuccess(`Guess submitted: ${guess}`);
        await loadGameState();
      } catch (err) {
        console.error('Make guess error:', err);
        setError(err instanceof Error ? err.message : 'Failed to make guess');
      } finally {
        setLoading(false);
      }
    });
  };

  const waitForWinner = async () => {
    let updatedGame = await passService.getGame(sessionId);
    let attempts = 0;
    while (attempts < 5 && (!updatedGame || updatedGame.winner === null || updatedGame.winner === undefined)) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      updatedGame = await passService.getGame(sessionId);
      attempts += 1;
    }
    return updatedGame;
  };

  // Auto-call verifyProof when both players have submitted their proofs
  useEffect(() => {
    if (gamePhase !== 'guess' || !gameState || !player1ProofSubmitted || !player2ProofSubmitted) {
      return;
    }

    const verifyAndComplete = async () => {
      try {
        console.log('[AutoVerify] Both proofs submitted, calling verify_proof...');
        const signer = getContractSigner();
        const result = await passService.verifyProof(sessionId, userAddress, signer);
        console.log('[AutoVerify] Verify result:', result);

        // Fetch updated on-chain state
        await new Promise((resolve) => setTimeout(resolve, 500));
        const updatedGame = await passService.getGame(sessionId);
        console.log('[AutoVerify] Updated game state:', updatedGame);
        
        setGameState(updatedGame);

        // Determine outcome
        if (updatedGame?.winner) {
          // Game ended with a winner
          console.log('[AutoVerify] Game has winner:', updatedGame.winner);
          setGamePhase('complete');
          const isWinner = updatedGame.winner === userAddress;
          setSuccess(isWinner ? '🎉 Você venceu!' : '💔 Você perdeu!');
          onStandingsRefresh();
        } else if (updatedGame?.status.tag === 'Draw') {
          // Draw game
          console.log('[AutoVerify] Game is a draw');
          setGamePhase('complete');
          setSuccess('🤝 Empate! Ambos acertaram!');
          onStandingsRefresh();
        } else {
          // No one guessed correctly yet - continue playing
          console.log('[AutoVerify] No winner yet, game continues');
          setLastProofResult('Ninguém acertou esta rodada. Faça outro palpite!');
          setSuccess('Jogo continua! Ninguém acertou ainda.');
          // Reset proof states and guesses for next round
          setPlayer1ProofSubmitted(false);
          setPlayer2ProofSubmitted(false);
          setGuess(null);
        }
      } catch (err) {
        console.error('[AutoVerify] Error verifying proofs:', err);
        const errorMsg = err instanceof Error ? err.message : 'Erro ao verificar provas';
        
        // If the error is that both players haven't submitted yet, just wait
        if (errorMsg.includes('InvalidStatus') || errorMsg.includes('BothPlayersNotGuessed')) {
          console.log('[AutoVerify] Players still submitting proofs, will retry...');
          // Will retry on next effect run
        } else {
          console.error('[AutoVerify] Verification failed:', errorMsg);
        }
      }
    };

    // Debounce to avoid multiple calls
    const timeoutId = setTimeout(verifyAndComplete, 1000);
    return () => clearTimeout(timeoutId);
  }, [gamePhase, player1ProofSubmitted, player2ProofSubmitted, sessionId, gameState]);

  const handleSubmitProof = async () => {
    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        setLastProofResult(null);

        const signer = getContractSigner();
        
        // STEP 1: Calculate proof statistics (acertos, erros, permutados)
        // For now, use mock values - in real ZK proof, these would be from proof verification
        console.log('[SubmitProof] Calculating proof statistics for game:', sessionId);
        
        const playerGuess = isPlayer1 ? gameState?.player1_last_guess : gameState?.player2_last_guess;
        const opponentSecret = isPlayer1 ? gameState?.player2_secret_hash : gameState?.player1_secret_hash;
        
        // Simple logic: if guess == secret, then acertos=4 (all digits correct, simplified for demo)
        // Otherwise use mock stats
        let acertos = 0;
        let erros = 0;
        let permutados = 0;
        
        if (playerGuess !== null && playerGuess !== undefined && opponentSecret !== null && opponentSecret !== undefined) {
          if (playerGuess === opponentSecret) {
            acertos = 4; // All correct (in real Mastermind, would be actual digit matches)
            erros = 0;
            permutados = 0;
          } else {
            // Generate mock stats for wrong guess
            acertos = Math.floor(Math.random() * 4);
            erros = Math.floor(Math.random() * 4);
            permutados = Math.floor(Math.random() * 2);
          }
        }
        
        console.log('[SubmitProof] Proof stats:', { acertos, erros, permutados });
        
        // STEP 2: Submit proof to the contract (requires authentication)
        console.log('[SubmitProof] Submitting proof to contract...');
        await passService.submitProof(sessionId, userAddress, acertos, erros, permutados, signer);
        
        // Mark current player as having submitted proof
        if (isPlayer1) {
          setPlayer1ProofSubmitted(true);
        } else {
          setPlayer2ProofSubmitted(true);
        }
        
        setSuccess('✓ Prova enviada! Aguardando a prova do outro jogador...');
        
        // STEP 3: Fetch updated on-chain state
        console.log('[SubmitProof] Fetching updated game state...');
        await new Promise((resolve) => setTimeout(resolve, 500));
        const updatedGame = await passService.getGame(sessionId);
        console.log('[SubmitProof] Updated game state:', updatedGame);
        
        setGameState(updatedGame);
        
        // NOTE: verifyProof will be called automatically by the polling mechanism
        // when both players have submitted their proofs.
        // Do NOT call verifyProof here - it will fail if the other player hasn't submitted yet!
      } catch (err) {
        console.error('Submit proof error:', err);
        
        const errorMsg = err instanceof Error ? err.message : 'Falha ao enviar prova';
        
        // Provide specific error feedback
        if (errorMsg.includes('BothPlayersNotGuessed') || errorMsg.includes('InvalidStatus')) {
          setError('Ambos os jogadores devem fazer seus palpites antes de enviar prova');
        } else if (errorMsg.includes('Transaction failed')) {
          setError('Falha na transação. Verifique se ambos fizeram seus palpites.');
        } else {
          setError(errorMsg);
        }
      } finally {
        setLoading(false);
      }
    });
  };

  const isPlayer1 = gameState && gameState.player1 === userAddress;
  const isPlayer2 = gameState && gameState.player2 === userAddress;
  const hasGuessed = isPlayer1 ? gameState?.player1_last_guess !== null && gameState?.player1_last_guess !== undefined :
    isPlayer2 ? gameState?.player2_last_guess !== null && gameState?.player2_last_guess !== undefined : false;

  const player1Guess = gameState?.player1_last_guess;
  const player2Guess = gameState?.player2_last_guess;

  // For the Pass game, there's no "winning_number" - the winner is determined by comparing guesses to opponent's secrets
  const player1Distance =
    player1Guess !== null && player1Guess !== undefined && gameState?.player2_secret_hash !== null && gameState?.player2_secret_hash !== undefined
      ? Math.abs(Number(player1Guess) - Number(gameState.player2_secret_hash))
      : null;
  const player2Distance =
    player2Guess !== null && player2Guess !== undefined && gameState?.player1_secret_hash !== null && gameState?.player1_secret_hash !== undefined
      ? Math.abs(Number(player2Guess) - Number(gameState.player1_secret_hash))
      : null;


  const handleDarkUISubmit = async (value: string) => {
    const numValue = parseInt(value);
    if (isNaN(numValue)) {
      setError('Digite um número válido');
      return;
    }

    await runAction(async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);

        const signer = getContractSigner();

        // Determine action based on game phase
        if (gamePhase === 'setup') {
          // SETUP PHASE: Register secret
          console.log('[Setup] Registering secret:', numValue, 'for player:', userAddress);
          
          await passService.registerSecret(sessionId, userAddress, numValue, signer);
          setSuccess(`Segredo registrado com sucesso! ✓`);
          
          // Load updated game state to check if both secrets are registered
          await loadGameState();
          
        } else if (gamePhase === 'guess') {
          // GUESS PHASE: Submit guess
          console.log('[Guess] Submitting guess:', numValue, 'for player:', userAddress);
          
          await passService.submitGuess(sessionId, userAddress, numValue, signer);
          setSuccess(`Palpite enviado com sucesso! ✓`);
          
          // Load updated game state to check if both players have guessed
          await loadGameState();
          
          // If both players have guessed, transition to reveal phase
          // The polling in the useEffect will handle this
        }
      } catch (err) {
        console.error('Action error:', err);
        const errorMsg = err instanceof Error ? err.message : 'Falha ao executar ação';
        
        // Provide specific error feedback
        if (errorMsg.includes('already registered') || errorMsg.includes('already guessed')) {
          setError('Você já completou esta ação neste jogo');
        } else if (errorMsg.includes('not a player') || errorMsg.includes('NotPlayer')) {
          setError('Você não é um jogador neste jogo');
        } else if (errorMsg.includes('InvalidStatus')) {
          setError('O jogo não está na fase correta para esta ação');
        } else {
          setError(errorMsg);
        }
      } finally {
        setLoading(false);
      }
    });
  };

  return (
    <div className="pass-game-dark">
      <div className="pass-container">
        {/* Header */}
        <header className="pass-header">
          <h1 className="pass-title">PASS</h1>
          <p className="pass-subtitle">Blockchain Cryptography Game</p>
          <p className="text-xs font-mono opacity-50 mt-2">
            Session ID: {sessionId}
          </p>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center animate-pulse">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm text-center">
            {success}
          </div>
        )}

        {/* CREATE GAME PHASE (Lobby) */}
        {gamePhase === 'create' && (
          <div className="space-y-6 w-full">
            {/* Mode Toggle */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 p-2 bg-white/5 rounded-xl backdrop-blur-md border border-white/10">
              <button
                onClick={() => setCreateMode('create')}
                className={`flex-1 py-3 px-4 rounded-lg font-bold text-xs transition-all ${createMode === 'create' ? 'bg-blue-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
              >
                Create & Export
              </button>
              <button
                onClick={() => setCreateMode('import')}
                className={`flex-1 py-3 px-4 rounded-lg font-bold text-xs transition-all ${createMode === 'import' ? 'bg-blue-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
              >
                Import Auth Entry
              </button>
              <button
                onClick={() => setCreateMode('load')}
                className={`flex-1 py-3 px-4 rounded-lg font-bold text-xs transition-all ${createMode === 'load' ? 'bg-blue-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
              >
                Load Existing Game
              </button>
            </div>

            {/* QuickStart Card */}
            <div className="pass-card bg-yellow-500/5 border-yellow-500/20">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-yellow-500 flex items-center gap-2">
                    ⚡ Quickstart (Dev Mode)
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Play instantly with two local dev wallets.
                  </p>
                </div>
                <button
                  onClick={handleQuickStart}
                  disabled={isBusy || !quickstartAvailable}
                  className="pass-button h-auto py-2.5 px-6 !bg-yellow-500 !text-black border-none font-black hover:scale-105"
                >
                  {quickstartLoading ? 'Creating...' : 'PLAY NOW'}
                </button>
              </div>
            </div>

            {createMode === 'create' && (
              <div className="pass-card">
                <div className="space-y-4">
                  <div className="pass-input-container !mb-4">
                    <label className="pass-input-label !text-left">Your Address (Player 1)</label>
                    <input
                      type="text"
                      value={player1Address}
                      onChange={(e) => setPlayer1Address(e.target.value.trim())}
                      className="pass-input !text-left !text-sm font-mono"
                    />
                  </div>

                  <div className="pass-input-container !mb-4">
                    <label className="pass-input-label !text-left">Points to Lock</label>
                    <input
                      type="text"
                      value={player1Points}
                      onChange={(e) => setPlayer1Points(e.target.value)}
                      className="pass-input !text-left"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Available: {(Number(availablePoints) / 10000000).toFixed(2)} Points</p>
                  </div>

                  {!exportedAuthEntryXDR ? (
                    <button onClick={handlePrepareTransaction} disabled={isBusy} className="pass-button">
                      {loading ? 'Preparing Signature...' : 'GENERATE INVITE'}
                    </button>
                  ) : (
                    <div className="space-y-4 pt-4 border-t border-white/10">
                      <p className="text-xs font-bold text-green-500 mb-2">Invite Ready! Copy and send to Player 2:</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={copyAuthEntryToClipboard} className="pass-button !py-3 text-[10px]">
                          {authEntryCopied ? '✓ COPIED' : 'COPY XDR'}
                        </button>
                        <button onClick={copyShareGameUrlWithAuthEntry} className="pass-button !py-3 text-[10px]">
                          {shareUrlCopied ? '✓ COPIED' : 'SHARE LINK'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {createMode === 'import' && (
              <div className="pass-card">
                <div className="space-y-4">
                  <div className="pass-input-container !mb-4">
                    <label className="pass-input-label !text-left">Auth Entry (from Player 1)</label>
                    <textarea
                      value={importAuthEntryXDR}
                      onChange={(e) => setImportAuthEntryXDR(e.target.value)}
                      rows={3}
                      className="pass-input !text-left !text-[10px] font-mono p-4"
                      placeholder="Paste XDR here..."
                    />
                  </div>

                  <div className="pass-input-container !mb-4">
                    <label className="pass-input-label !text-left">Your Points (Player 2)</label>
                    <input
                      type="text"
                      value={importPlayer2Points}
                      onChange={(e) => setImportPlayer2Points(e.target.value)}
                      className="pass-input !text-left"
                    />
                  </div>

                  <button
                    onClick={handleImportTransaction}
                    disabled={isBusy || !importAuthEntryXDR.trim() || !importPlayer2Points.trim()}
                    className="pass-button"
                  >
                    {loading ? 'Joining Game...' : 'JOIN GAME'}
                  </button>
                </div>
              </div>
            )}

            {createMode === 'load' && (
              <div className="pass-card">
                <div className="space-y-4">
                  <div className="pass-input-container !mb-4">
                    <label className="pass-input-label !text-left">Session ID</label>
                    <input
                      type="text"
                      value={loadSessionId}
                      onChange={(e) => setLoadSessionId(e.target.value)}
                      className="pass-input !text-left font-mono"
                      placeholder="e.g. 123456"
                    />
                  </div>
                  <button onClick={handleLoadExistingGame} disabled={isBusy || !loadSessionId.trim()} className="pass-button">
                    {loading ? 'Loading...' : 'LOAD GAME'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* GAMEPLAY PHASE (Setup and Guessing) */}
        {(gamePhase === 'setup' || gamePhase === 'guess') && gameState && (
          <div className="w-full">
            {/* Game Status Header */}
            <div className="pass-card mb-8 bg-blue-500/5 border-blue-500/30">
              <p className="text-xs text-blue-400 font-bold uppercase tracking-widest mb-2">
                {gamePhase === 'setup' ? '🔐 Fase de Configuração' : '🎯 Fase de Palpites'}
              </p>
              <p className="text-sm text-gray-300">
                {gamePhase === 'setup' 
                  ? 'Ambos os jogadores devem registrar seus segredos para iniciar o jogo'
                  : 'Ambos os jogadores devem fazer seus palpites. Quem acertar o segredo do outro primeiro vence!'
                }
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className={`p-4 rounded-xl border ${isPlayer1 ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 bg-white/5'} transition-all`}>
                <p className="text-[10px] font-bold text-gray-500 uppercase">Player 1</p>
                <p className="text-xs font-mono mt-1">{gameState.player1.slice(0, 8)}...{gameState.player1.slice(-4)}</p>
                <div className="mt-3 space-y-2">
                  {gamePhase === 'setup' ? (
                    gameState.player1_secret_hash !== null ? (
                      <span className="text-[10px] text-green-500 font-bold">✓ SEGREDO REGISTRADO</span>
                    ) : (
                      <span className="text-[10px] text-yellow-500/70">⏳ AGUARDANDO...</span>
                    )
                  ) : (
                    gameState.player1_last_guess !== null ? (
                      <>
                        <span className="text-[10px] text-green-500 font-bold">✓ PALPITE: {gameState.player1_last_guess}</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-yellow-500/70">⏳ AGUARDANDO...</span>
                    )
                  )}
                </div>
              </div>
              <div className={`p-4 rounded-xl border ${isPlayer2 ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 bg-white/5'} transition-all`}>
                <p className="text-[10px] font-bold text-gray-500 uppercase">Player 2</p>
                <p className="text-xs font-mono mt-1">{gameState.player2.slice(0, 8)}...{gameState.player2.slice(-4)}</p>
                <div className="mt-3 space-y-2">
                  {gamePhase === 'setup' ? (
                    gameState.player2_secret_hash !== null ? (
                      <span className="text-[10px] text-green-500 font-bold">✓ SEGREDO REGISTRADO</span>
                    ) : (
                      <span className="text-[10px] text-yellow-500/70">⏳ AGUARDANDO...</span>
                    )
                  ) : (
                    gameState.player2_last_guess !== null ? (
                      <>
                        <span className="text-[10px] text-green-500 font-bold">✓ PALPITE: {gameState.player2_last_guess}</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-yellow-500/70">⏳ AGUARDANDO...</span>
                    )
                  )}
                </div>
              </div>
            </div>

            {!hasGuessed ? (
              <PassDarkUI
                gamePhase={gamePhase}
                onSubmit={handleDarkUISubmit}
                loading={loading}
              />
            ) : (
              // Both players have guessed - show proof submission UI
              <div className="space-y-6">
                <div className="pass-card bg-yellow-500/5 border-yellow-500/30">
                  <p className="text-xs text-yellow-400 font-bold uppercase tracking-widest mb-3">
                    ✓ Ambos fizeram palpites
                  </p>
                  <p className="text-sm text-gray-300">
                    Clique em "ENVIAR PROVA" para verificar o resultado da rodada.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="pass-card">
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Seu Palpite</p>
                    <p className="text-2xl font-black text-blue-400">
                      {isPlayer1 ? gameState.player1_last_guess : gameState.player2_last_guess}
                    </p>
                  </div>
                  <div className="pass-card">
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Outro Jogador</p>
                    <p className="text-2xl font-black text-purple-400">
                      {isPlayer1 ? gameState.player2_last_guess : gameState.player1_last_guess}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleSubmitProof}
                  disabled={isBusy}
                  className="pass-button w-full !text-lg"
                >
                  {loading ? '⏳ ENVIANDO PROVA...' : '📤 ENVIAR PROVA'}
                </button>

                {lastProofResult && (
                  <div className="pass-card bg-blue-500/5 border-blue-500/30">
                    <p className="text-xs text-blue-400 font-bold uppercase tracking-widest mb-2">Resultado da Rodada</p>
                    <p className="text-sm text-gray-300">{lastProofResult}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* COMPLETE PHASE */}
        {gamePhase === 'complete' && gameState && (
          <div className="w-full space-y-6">
            {gameState.winner ? (
              // Winner exists
              <div className={`pass-card text-center border-2 ${gameState.winner === userAddress ? 'border-green-500/50 bg-green-500/5' : 'border-red-500/50 bg-red-500/5'}`}>
                <div className={`text-6xl mb-4 ${gameState.winner === userAddress ? 'animate-bounce' : ''}`}>
                  {gameState.winner === userAddress ? '🏆' : '💔'}
                </div>
                <h2 className={`pass-win-title !text-5xl mb-2 ${gameState.winner === userAddress ? 'text-green-400' : 'text-gray-300'}`}>
                  {gameState.winner === userAddress ? 'VITÓRIA!' : 'DERROTA'}
                </h2>
                <p className="font-mono text-xs text-gray-500 mb-6 break-all">
                  Vencedor: {gameState.winner?.slice(0, 16)}...
                </p>

                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/10">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Seu Palpite</p>
                    <p className="text-3xl font-black text-blue-400">
                      {isPlayer1 ? gameState.player1_last_guess : gameState.player2_last_guess}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Resultado</p>
                    <p className={`text-3xl font-black ${gameState.winner === userAddress ? 'text-green-400' : 'text-red-400'}`}>
                      {gameState.winner === userAddress ? 'ACERTOU' : 'ERROU'}
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-white/10">
                  <p className="text-[10px] text-gray-600 uppercase font-bold mb-2">Comparação</p>
                  <div className="space-y-2 text-left">
                    <p className="text-xs text-gray-400">
                      <span className="font-mono">Player 1 palpite: {gameState.player1_last_guess}</span>
                      <span className="text-gray-600"> vs </span>
                      <span className="font-mono">Player 2 segredo: {gameState.player2_secret_hash}</span>
                      {gameState.player1_last_guess === gameState.player2_secret_hash && <span className="text-green-400 ml-2">✓ ACERTOU!</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      <span className="font-mono">Player 2 palpite: {gameState.player2_last_guess}</span>
                      <span className="text-gray-600"> vs </span>
                      <span className="font-mono">Player 1 segredo: {gameState.player1_secret_hash}</span>
                      {gameState.player2_last_guess === gameState.player1_secret_hash && <span className="text-green-400 ml-2">✓ ACERTOU!</span>}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              // Draw case (winner is None but status is Draw)
              <div className="pass-card text-center border-2 border-yellow-500/50 bg-yellow-500/5">
                <div className="text-6xl mb-4">🤝</div>
                <h2 className="pass-win-title !text-5xl mb-2 text-yellow-400">EMPATE!</h2>
                <p className="text-sm text-gray-300 mb-6">Ambos os jogadores acertaram no mesmo turno.</p>

                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/10">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Seu Palpite</p>
                    <p className="text-3xl font-black text-blue-400">
                      {isPlayer1 ? gameState.player1_last_guess : gameState.player2_last_guess}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Resultado</p>
                    <p className="text-3xl font-black text-yellow-400">ACERTOU</p>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-white/10">
                  <p className="text-[10px] text-gray-600 uppercase font-bold mb-2">Comparação</p>
                  <div className="space-y-2 text-left">
                    <p className="text-xs text-gray-400">
                      <span className="font-mono">Player 1 palpite: {gameState.player1_last_guess}</span>
                      <span className="text-gray-600"> = </span>
                      <span className="font-mono">Player 2 segredo: {gameState.player2_secret_hash}</span>
                      {gameState.player1_last_guess === gameState.player2_secret_hash && <span className="text-green-400 ml-2">✓</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      <span className="font-mono">Player 2 palpite: {gameState.player2_last_guess}</span>
                      <span className="text-gray-600"> = </span>
                      <span className="font-mono">Player 1 segredo: {gameState.player1_secret_hash}</span>
                      {gameState.player2_last_guess === gameState.player1_secret_hash && <span className="text-green-400 ml-2">✓</span>}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button onClick={handleStartNewGame} className="pass-button w-full !text-lg">
              🎮 VOLTAR AO LOBBY
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
