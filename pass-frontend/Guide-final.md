# 📋 Planejamento de Refatoração - PASS Game Submit Proof

## 📌 Visão Geral da Refatoração

O objetivo principal é refatorar a lógica de `submitProof` e `verifyProof` para implementar um fluxo mais robusto e claro, onde:

1. **Cada player armazena LOCALMENTE seu próprio secret** (nunca puxa do contrato)
2. **A prova só é enviável quando AMBOS os players já fizeram seus palpites**
3. **Feedback de acertos/erros/permutados é calculado no frontend** e enviado ao contrato
4. **O contrato valida e determina o vencedor**
5. **Se ninguém acerta, volta para a tela de palpites** (sem avançar de fase automaticamente)
6. **Na segunda rodada de palpites, `verify_proof` é chamado automaticamente** com feedback visual para cada player

---

## 🏗️ Arquitetura Atual vs Nova

### Problemas Identificados na Arquitetura Atual

| Problema | Local | Impacto |
|----------|-------|--------|
| **Secret armazenado no contrato** | `Game.player1_secret_hash` | Players podem ver o hash do secret do oponente |
| **Lógica de prova mockada** | `handleSubmitProof()` gera números aleatórios | Feedback não corresponde ao secret real |
| **Transição de fase automática** | `verifyProof` muda status antes de ambos enviarem | One player fica bloqueado esperando |
| **Falta de feedback de rodada anterior** | `lastProofResult` não é utilizado | Player não vê o que errou na rodada anterior |
| **Estado de proof desorganizado** | `player1ProofSubmitted`, `player2ProofSubmitted` flags soltas | Difícil rastrear quem fez o quê |
| **Contrato armazena secrets em hash** | Podem ser vistos no `get_game()` | Privacidade comprometida |

---

## 📐 Nova Arquitetura Proposta

### 1. **Armazenamento de Secrets (Frontend)**

```typescript
// LocalGameSession.ts - Nova estrutura local por sessão
interface LocalGameSession {
  sessionId: number;
  mySecret: number;           // MEU secret (guardado no localStorage/memory)
  opponentSecret: number | null; // Secret do oponente (só revelado se eu ganhar)
  rounds: RoundHistory[];     // Histórico de rodadas
}

interface RoundHistory {
  roundNumber: number;
  myGuess: number;
  opponentGuess: number | null; // Só fica visível após enviar prova
  myProof: ProofStats | null;
  opponentProof: ProofStats | null;
  result: RoundResult | null;
}

interface ProofStats {
  acertos: number;      // Dígitos corretos na posição correta
  erros: number;        // Dígitos incorretos
  permutados: number;   // Dígitos corretos em posição errada
}

interface RoundResult {
  winner: 'player1' | 'player2' | 'draw' | 'none';
  myResult: ProofStats;
  opponentResult: ProofStats;
}
```

**Armazenamento:** 
- `sessionStorage` ou `localStorage` com chave `pass_game_${sessionId}`
- Criptografado opcionalmente com sala key derivada de `userAddress + sessionId`

### 2. **Estrutura de Estado do Componente (PassGame.tsx)**

```typescript
// Adicionar novo estado para gerenciar secrets e feedback
const [localSession, setLocalSession] = useState<LocalGameSession | null>(null);
const [currentRound, setCurrentRound] = useState<number>(1);
const [proofFeedback, setProofFeedback] = useState<{
  myFeedback: ProofStats | null;
  opponentFeedback: ProofStats | null;
  roundNumber: number;
} | null>(null);

// Estado de submissão de prova
const [proofState, setProofState] = useState<{
  player1Submitted: boolean;
  player2Submitted: boolean;
  bothReadyForVerify: boolean;
}>({
  player1Submitted: false,
  player2Submitted: false,
  bothReadyForVerify: false,
});
```

### 3. **Fases do Jogo (Nova Definição)**

```typescript
type GamePhase = 
  | 'create'      // Fase de criação: Player 1 cria, Player 2 importa
  | 'setup'       // Fase de setup: Ambos registram secrets
  | 'guess'       // Fase de palpites: Players fazem palpites
  | 'proof'       // Fase de prova: Players enviam provas
  | 'feedback'    // Fase de feedback: Mostrar resultado da rodada
  | 'complete';   // Jogo terminado

// Transições de fase
// create -> setup (ambos signed startGame)
// setup -> guess (ambos registraram secrets)
// guess -> proof (ambos fizeram palpites)
// proof -> feedback (ambos enviaram provas e verifyProof foi chamado)
// feedback -> guess (ninguém acertou - volta para nova rodada)
// feedback -> complete (alguém ganhou ou houve empate)
```

---

## 🔄 Fluxo Detalhado da Refatoração

### FASE 1: SETUP ✅ (Sem mudanças)

```
┌─────────────────────────┐
│ Player 1 & 2 Conectados │
└────────────┬────────────┘
             │
             ├─ Player 1: registerSecret(mySecret) 
             │  ↓ Armazenar localmente: localSession.mySecret
             │
             ├─ Player 2: registerSecret(mySecret)
             │  ↓ Armazenar localmente: localSession.mySecret
             │
             └─→ status = Playing (contrato)
                 ↓
            Transição para GUESS
```

### FASE 2: GUESS (Com mudanças)

```
┌─────────────────────────┐
│ GUESS Phase - Round 1   │
└────────────┬────────────┘
             │
             ├─ Player 1: submitGuess(1234)
             │  ↓ Armazenar: localSession.rounds[0].myGuess = 1234
             │  ↓ Exibir UI: "Seu palpite: 1234 ✓"
             │
             ├─ Player 2: submitGuess(5678)
             │  ↓ Armazenar: localSession.rounds[0].myGuess = 5678
             │  ↓ Exibir UI: "Seu palpite: 5678 ✓"
             │
             ├─ Verificar ambos palpitaram?
             │  ✓ SIM → Habilitar botão "ENVIAR PROVA"
             │  ✗ NÃO → Manter botão desabilitado
             │
             └─→ Transição para PROOF
```

**Mudanças importantes:**
- ✅ Mostrar visualmente que ambos palpitaram
- ✅ Desabilitar botão "ENVIAR PROVA" até ambos palpitarem
- ✅ Não exibir o guess do oponente até ele enviar sua prova

### FASE 3: PROOF (Mudança Principal) 🔑

#### Antes (Atual):
```
Player 1 submitProof(randomStats) → Contrato armazena
Player 2 submitProof(randomStats) → Contrato armazena
Auto-call verifyProof → Determina vencedor
```

#### Depois (Proposto):
```
┌──────────────────────────────────┐
│ PROOF Phase - Ambos Palpitaram   │
└────────────┬─────────────────────┘
             │
             ├─ Player 1: calculateProof()
             │  ├─ Pegar mySecret (localStorage): 5555
             │  ├─ Pegar opponentGuess (contrato): 1234
             │  ├─ Comparar 5555 vs 1234
             │  ├─ Calcular: acertos=0, erros=2, permutados=1
             │  └─ Armazenar: localSession.rounds[0].myProof
             │
             ├─ Player 1: submitProof(0, 2, 1)
             │  └─ Contrato armazena em player1_proof
             │
             ├─ Player 2: calculateProof()
             │  ├─ Pegar mySecret (localStorage): 2222
             │  ├─ Pegar opponentGuess (contrato): 5678
             │  ├─ Comparar 2222 vs 5678
             │  ├─ Calcular: acertos=4, erros=0, permutados=0 ✓ ACERTOU!
             │  └─ Armazenar: localSession.rounds[0].myProof
             │
             ├─ Player 2: submitProof(4, 0, 0)
             │  └─ Contrato armazena em player2_proof
             │
             ├─ Polling detecta ambos submitidos? 
             │  ✓ SIM → Auto-call verifyProof()
             │
             └─→ Transição para FEEDBACK
```

### FASE 4: FEEDBACK (Nova) 📊

```
┌────────────────────────────────┐
│ FEEDBACK Phase - Resultado     │
└────────────┬───────────────────┘
             │
             ├─ verifyProof() chamado
             │  ├─ Compara proofs de ambos
             │  └─ Retorna resultados para ambos
             │
             ├─ Exibir resultado para Player 1:
             │  ├─ Seu palpite: 1234
             │  ├─ Seu resultado: ❌ 0 acertos, 2 erros, 1 permutado
             │  ├─ Palpite do oponente: 5678
             │  ├─ Resultado do oponente: ✅ 4 acertos (GANHOU!)
             │
             ├─ Exibir resultado para Player 2:
             │  ├─ Seu palpite: 5678
             │  ├─ Seu resultado: ✅ 4 acertos (VOCÊ GANHOU!)
             │  ├─ Palpite do oponente: 1234
             │  ├─ Resultado do oponente: ❌ 0 acertos, 2 erros, 1 permutado
             │
             ├─ Determinar resultado:
             │  ├─ Se ambos acertaram → "EMPATE 🤝"
             │  ├─ Se um acertou → "PLAYER X VENCEU 🏆"
             │  └─ Se ninguém acertou → "Ninguém acertou..."
             │
             ├─ Se ALGUÉM acertou ou EMPATE:
             │  └─ Exibir tela de vitória/empate com opção "Novo Jogo"
             │
             ├─ Se NINGUÉM acertou:
             │  └─ Pergunta: "Jogar novamente?"
             │     ├─ SIM → Nova rodada (Round 2)
             │     │  ├─ Resetar: proofState.bothReadyForVerify = false
             │     │  ├─ Incrementar: currentRound = 2
             │     │  ├─ Limpar proofs do contrato
             │     │  └─ Transição para GUESS (nova rodada)
             │     │
             │     └─ NÃO → Transição para COMPLETE
             │
             └─ Novo estado em localStorage:
                localSession.rounds[0] = { guesses, proofs, resultado }
```

---

## 🛠️ Implementação Técnica Detalhada

### A. Novo Hook: `useLocalGameSession`

```typescript
// hooks/useLocalGameSession.ts

export function useLocalGameSession(sessionId: number, userAddress: string) {
  const [session, setSession] = useState<LocalGameSession | null>(null);

  // Carregar da storage ao montar
  useEffect(() => {
    const stored = localStorage.getItem(`pass_game_${sessionId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSession(parsed);
      } catch (err) {
        console.error('Failed to parse stored session:', err);
        initializeSession();
      }
    }
  }, [sessionId]);

  const initializeSession = () => {
    const newSession: LocalGameSession = {
      sessionId,
      mySecret: 0,
      opponentSecret: null,
      rounds: [],
    };
    setSession(newSession);
    save(newSession);
  };

  const save = (updatedSession: LocalGameSession) => {
    setSession(updatedSession);
    localStorage.setItem(`pass_game_${sessionId}`, JSON.stringify(updatedSession));
  };

  const setMySecret = (secret: number) => {
    if (!session) return;
    const updated = { ...session, mySecret: secret };
    save(updated);
  };

  const addRound = () => {
    if (!session) return;
    const newRound: RoundHistory = {
      roundNumber: session.rounds.length + 1,
      myGuess: 0,
      opponentGuess: null,
      myProof: null,
      opponentProof: null,
      result: null,
    };
    const updated = {
      ...session,
      rounds: [...session.rounds, newRound],
    };
    save(updated);
  };

  const updateMyGuess = (roundNumber: number, guess: number) => {
    if (!session) return;
    const updated = { ...session };
    const round = updated.rounds.find(r => r.roundNumber === roundNumber);
    if (round) round.myGuess = guess;
    save(updated);
  };

  const updateMyProof = (roundNumber: number, proof: ProofStats) => {
    if (!session) return;
    const updated = { ...session };
    const round = updated.rounds.find(r => r.roundNumber === roundNumber);
    if (round) round.myProof = proof;
    save(updated);
  };

  const updateOpponentGuess = (roundNumber: number, guess: number) => {
    if (!session) return;
    const updated = { ...session };
    const round = updated.rounds.find(r => r.roundNumber === roundNumber);
    if (round) round.opponentGuess = guess;
    save(updated);
  };

  const updateRoundResult = (roundNumber: number, result: RoundResult) => {
    if (!session) return;
    const updated = { ...session };
    const round = updated.rounds.find(r => r.roundNumber === roundNumber);
    if (round) round.result = result;
    save(updated);
  };

  return {
    session,
    initializeSession,
    setMySecret,
    addRound,
    updateMyGuess,
    updateMyProof,
    updateOpponentGuess,
    updateRoundResult,
  };
}
```

### B. Nova Função: `calculateProof()`

```typescript
// utils/proofCalculator.ts

/**
 * Calcula as estatísticas de prova comparando o secret
 * com o palpite do oponente
 * 
 * Para o game PASS (Mastermind simplificado):
 * - Número de dígitos corretos na posição correta (acertos)
 * - Número de dígitos incorretos (erros)
 * - Número de dígitos corretos em posição errada (permutados)
 */
export function calculateProof(
  mySecret: number,
  opponentGuess: number | null
): ProofStats {
  if (opponentGuess === null || opponentGuess === undefined) {
    return { acertos: 0, erros: 0, permutados: 0 };
  }

  const secretStr = mySecret.toString().padStart(4, '0');
  const guessStr = opponentGuess.toString().padStart(4, '0');

  let acertos = 0;
  let permutados = 0;
  const usedSecretDigits = new Set<number>();
  const usedGuessDigits = new Set<number>();

  // Primeira passada: contar acertos
  for (let i = 0; i < 4; i++) {
    if (secretStr[i] === guessStr[i]) {
      acertos++;
      usedSecretDigits.add(i);
      usedGuessDigits.add(i);
    }
  }

  // Segunda passada: contar permutados
  for (let i = 0; i < 4; i++) {
    if (!usedGuessDigits.has(i)) {
      // Este dígito do palpite não foi acertado em posição
      for (let j = 0; j < 4; j++) {
        if (!usedSecretDigits.has(j) && guessStr[i] === secretStr[j]) {
          permutados++;
          usedSecretDigits.add(j);
          break;
        }
      }
    }
  }

  const erros = 4 - acertos - permutados;

  return { acertos, erros, permutados };
}

/**
 * Determina o resultado da rodada baseado nos proofs de ambos players
 */
export function determineRoundResult(
  player1Proof: ProofStats,
  player2Proof: ProofStats
): 'player1' | 'player2' | 'draw' | 'none' {
  const p1Won = player1Proof.acertos === 4;
  const p2Won = player2Proof.acertos === 4;

  if (p1Won && p2Won) return 'draw';
  if (p1Won) return 'player1';
  if (p2Won) return 'player2';
  return 'none';
}
```

### C. Refator em `PassGame.tsx` - Seção de SETUP

```typescript
const handleSetupPhase = async (value: string) => {
  const numValue = parseInt(value);
  if (isNaN(numValue)) {
    setError('Digite um número válido');
    return;
  }

  try {
    setLoading(true);
    const signer = getContractSigner();

    // 1. Registrar no contrato (como antes)
    await passService.registerSecret(sessionId, userAddress, numValue, signer);
    setSuccess(`Segredo registrado com sucesso! ✓`);

    // 2. NOVO: Guardar secret localmente (nunca será enviado ao contrato novamente)
    const { session, setMySecret } = useLocalGameSession(sessionId, userAddress);
    setMySecret(numValue);

    // 3. Carregar estado atualizado
    await loadGameState();

    // 4. Quando ambos registrarem, transição automática para GUESS
    if (gameState?.player1_secret_hash && gameState?.player2_secret_hash) {
      setGamePhase('guess');
    }
  } catch (err) {
    handleError(err);
  } finally {
    setLoading(false);
  }
};
```

### D. Refator em `PassGame.tsx` - Seção de GUESS

```typescript
const handleGuessPhase = async (value: string) => {
  const numValue = parseInt(value);
  if (isNaN(numValue)) {
    setError('Digite um número válido');
    return;
  }

  try {
    setLoading(true);
    const signer = getContractSigner();

    // 1. Enviar palpite ao contrato
    await passService.submitGuess(sessionId, userAddress, numValue, signer);
    setSuccess(`Palpite enviado com sucesso! ✓`);

    // 2. NOVO: Guardar palpite localmente
    const { updateMyGuess } = useLocalGameSession(sessionId, userAddress);
    updateMyGuess(currentRound, numValue);

    // 3. Carregar estado e verificar se ambos palpitaram
    const updatedGame = await passService.getGame(sessionId);
    setGameState(updatedGame);

    const bothGuessed = 
      updatedGame?.player1_last_guess !== null && 
      updatedGame?.player1_last_guess !== undefined &&
      updatedGame?.player2_last_guess !== null && 
      updatedGame?.player2_last_guess !== undefined;

    if (bothGuessed) {
      // Habilitar botão "ENVIAR PROVA"
      setProofState(prev => ({ ...prev, bothReadyForVerify: true }));
    }
  } catch (err) {
    handleError(err);
  } finally {
    setLoading(false);
  }
};
```

### E. **NOVO** - Função Principal: `handleCalculateAndSubmitProof()`

```typescript
/**
 * Calcula a prova baseada no secret local e palpite do oponente
 * Depois envia ao contrato
 */
const handleCalculateAndSubmitProof = async () => {
  await runAction(async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const { session, updateMyProof } = useLocalGameSession(sessionId, userAddress);
      
      if (!session || !gameState) {
        throw new Error('Game session not found');
      }

      // 1. Recuperar meu secret do localStorage (NUNCA do contrato)
      const mySecret = session.mySecret;
      if (!mySecret) {
        throw new Error('Secret não encontrado. Inicie o jogo novamente.');
      }

      // 2. Determinar qual é meu palpite e o do oponente
      const myGuess = isPlayer1 ? gameState.player1_last_guess : gameState.player2_last_guess;
      const opponentGuess = isPlayer1 ? gameState.player2_last_guess : gameState.player1_last_guess;

      if (!myGuess || !opponentGuess) {
        throw new Error('Ambos devem fazer palpites antes de enviar prova');
      }

      // 3. CALCULAR PROVA: Comparar meu secret com o palpite do oponente
      // Se opponentGuess acertou meu secret, ele terá acertos=4
      const myProofStats = calculateProof(mySecret, opponentGuess);
      
      console.log('[Proof] Calculated proof stats:', {
        mySecret,
        opponentGuess,
        proof: myProofStats,
      });

      // 4. Guardar prova localmente
      updateMyProof(currentRound, myProofStats);

      // 5. Enviar prova ao contrato
      const signer = getContractSigner();
      await passService.submitProof(
        sessionId,
        userAddress,
        myProofStats.acertos,
        myProofStats.erros,
        myProofStats.permutados,
        signer
      );

      // 6. Marcar que eu enviei a prova
      if (isPlayer1) {
        setProofState(prev => ({ ...prev, player1Submitted: true }));
      } else {
        setProofState(prev => ({ ...prev, player2Submitted: true }));
      }

      setSuccess('✓ Prova enviada! Aguardando a prova do outro jogador...');

      // 7. Carregar estado atualizado
      const updatedGame = await passService.getGame(sessionId);
      setGameState(updatedGame);

      // 8. Verificar se ambos enviaram provas
      // (verifyProof será chamado automaticamente pelo polling)

    } catch (err) {
      console.error('Calculate and submit proof error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Erro ao calcular prova';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  });
};
```

### F. **NOVO** - Auto-trigger `verifyProof` (useEffect)

```typescript
/**
 * Polling automático para chamar verifyProof quando ambos
 * players enviarem suas provas
 */
useEffect(() => {
  if (gamePhase !== 'proof') return;
  if (!gameState) return;

  // Verificar se ambos enviaram provas
  const p1ProofSent = gameState.player1_proof && gameState.player1_proof.length > 0;
  const p2ProofSent = gameState.player2_proof && gameState.player2_proof.length > 0;

  if (!p1ProofSent || !p2ProofSent) {
    // Ainda aguardando prova do outro jogador
    return;
  }

  // Ambos enviaram! Chamar verifyProof
  const callVerifyProof = async () => {
    try {
      setLoading(true);
      const signer = getContractSigner();

      // Pode ser chamado por qualquer um dos players
      const result = await passService.verifyProof(sessionId, userAddress, signer);

      // Carregar resultado atualizado
      const finalGame = await passService.getGame(sessionId);
      setGameState(finalGame);

      // Determinar resultado
      const { session } = useLocalGameSession(sessionId, userAddress);
      const roundResult: RoundResult = {
        winner: determineRoundResult(
          finalGame?.player1_result?.[0],
          finalGame?.player2_result?.[0]
        ),
        myResult: isPlayer1 
          ? finalGame?.player1_result?.[0]
          : finalGame?.player2_result?.[0],
        opponentResult: isPlayer1
          ? finalGame?.player2_result?.[0]
          : finalGame?.player1_result?.[0],
      };

      setProofFeedback({
        myFeedback: roundResult.myResult,
        opponentFeedback: roundResult.opponentResult,
        roundNumber: currentRound,
      });

      // Transição para FEEDBACK
      setGamePhase('feedback');

    } catch (err) {
      console.error('Verify proof error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Erro ao verificar prova';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  callVerifyProof();

}, [gamePhase, gameState?.player1_proof?.length, gameState?.player2_proof?.length]);
```

### G. **NOVO** - Componente de Feedback

```typescript
// components/ProofFeedback.tsx

interface ProofFeedbackProps {
  roundNumber: number;
  myGuess: number;
  opponentGuess: number;
  myProof: ProofStats;
  opponentProof: ProofStats;
  isPlayer1: boolean;
  onStartNewRound: () => void;
  onCompleteGame: () => void;
}

export function ProofFeedback({
  roundNumber,
  myGuess,
  opponentGuess,
  myProof,
  opponentProof,
  isPlayer1,
  onStartNewRound,
  onCompleteGame,
}: ProofFeedbackProps) {
  const roundResult = determineRoundResult(myProof, opponentProof);

  return (
    <div className="proof-feedback">
      <div className="round-title">Rodada {roundNumber} - Resultado</div>

      {/* Meu resultado */}
      <div className="my-result">
        <h3>Seu Palpite</h3>
        <div className="guess">{myGuess}</div>
        
        {myProof.acertos === 4 ? (
          <div className="verdict success">✅ ACERTOU!</div>
        ) : (
          <div className="verdict failure">
            <div>❌ Errado</div>
            <div className="stats">
              {myProof.acertos > 0 && <span>{myProof.acertos} acertos</span>}
              {myProof.permutados > 0 && <span>{myProof.permutados} permutados</span>}
              {myProof.erros > 0 && <span>{myProof.erros} erros</span>}
            </div>
          </div>
        )}
      </div>

      <div className="divider">vs</div>

      {/* Resultado do oponente */}
      <div className="opponent-result">
        <h3>Palpite do Oponente</h3>
        <div className="guess">{opponentGuess}</div>
        
        {opponentProof.acertos === 4 ? (
          <div className="verdict success">✅ ACERTOU!</div>
        ) : (
          <div className="verdict failure">
            <div>❌ Errado</div>
            <div className="stats">
              {opponentProof.acertos > 0 && <span>{opponentProof.acertos} acertos</span>}
              {opponentProof.permutados > 0 && <span>{opponentProof.permutados} permutados</span>}
              {opponentProof.erros > 0 && <span>{opponentProof.erros} erros</span>}
            </div>
          </div>
        )}
      </div>

      {/* Resultado geral */}
      <div className="overall-result">
        {roundResult === 'player1' || roundResult === 'player2' ? (
          <div className="winner">
            {(roundResult === 'player1' && isPlayer1) || (roundResult === 'player2' && !isPlayer1)
              ? '🏆 VOCÊ VENCEU!'
              : '😢 OPONENTE VENCEU'}
          </div>
        ) : roundResult === 'draw' ? (
          <div className="draw">🤝 EMPATE!</div>
        ) : (
          <div className="no-winner">
            <p>Ninguém acertou...</p>
            <button onClick={onStartNewRound}>Jogar Novamente</button>
            <button onClick={onCompleteGame}>Encerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 📊 Mudanças no Contrato (`lib.rs`)

### ✅ Mudanças Necessárias

O contrato **NÃO precisa ser modificado significativamente**. As mudanças são apenas de semantântica:

| Função | Antes | Depois | Notas |
|--------|-------|--------|-------|
| `register_secret()` | Armazena hash em `player1_secret_hash` | Continua igual | ✅ Hash não expõe valor |
| `submit_proof()` | Recebe stats mockadas | Recebe stats calculadas no frontend | ✅ Apenas entrada muda |
| `verify_proof()` | Verifica stats | Verifica se acertos == 4 | ✅ Lógica igual |
| `get_game()` | Retorna hashes de secrets | Continua retornando hashes | ⚠️ Frontend não exibe para outro player |

### ⚠️ Pequena Mudança Recomendada

Adicionar um campo ao `Game` para rastrear rounds:

```rust
#[contracttype]
pub struct Game {
    // ... campos existentes ...
    pub round_number: u32,  // NOVO: número da rodada atual
    pub total_rounds: u32,  // NOVO: limite de rodadas (opcional)
}
```

---

## 🔐 Segurança e Privacidade

### Problemas Resolvidos

| Problema | Solução |
|----------|---------|
| Secret expostos como hash no contrato | Frontend guarda em localStorage, nunca enviado novamente |
| Stats mockadas (números aleatórios) | Frontend calcula baseado em secret real vs guess |
| Ambos players veem guess do outro imediatamente | Só visível após enviar prova |
| Ordem de vencimento influencia resultado | verifyProof é determinístico |

### Boas Práticas Implementadas

```typescript
// ✅ FAZER:
1. Guardar secret em sessionStorage/localStorage criptografado
2. Limpar localStorage após game terminar
3. Usar HTTPS para tráfego
4. Hash do secret já fornece privacidade básica

// ❌ NÃO FAZER:
1. Envisar secret texto plano ao contrato
2. Exibir secret do oponente antes do jogo terminar
3. Permitir múltiplas tentativas de calcular proof
4. Fazer polling constante sem debounce
```

---

## 📝 Checklist de Implementação

### Backend (Contrato)
- [ ] Adicionar `round_number` ao `Game`
- [ ] Verificar lógica de `verify_proof()` com novo fluxo
- [ ] Testar casos extremos (empate, ninguém acerta)
- [ ] Documentar mudanças em comentários

### Frontend
- [ ] Criar `useLocalGameSession` hook
- [ ] Criar `proofCalculator.ts` com `calculateProof()`
- [ ] Refatorar `PassGame.tsx`:
  - [ ] Adicionar novo estado `proofState`
  - [ ] Adicionar novo estado `currentRound`
  - [ ] Refatorar `handleDarkUISubmit()` para split setup/guess/proof
  - [ ] Criar `handleCalculateAndSubmitProof()`
  - [ ] Criar useEffect para auto-trigger `verifyProof()`
- [ ] Criar `ProofFeedback` component
- [ ] Refatorar `PassDarkUI` para:
  - [ ] Mostrar "Ambos palpitaram ✓" quando aplicável
  - [ ] Desabilitar botão "ENVIAR PROVA" se não ambos palpitaram
  - [ ] Exibir feedback de rodada anterior na segunda rodada
- [ ] Atualizar `passService.ts`:
  - [ ] Verificar tipagem de retorno de `verifyProof()`
  - [ ] Adicionar helpers para parsing de resultados

### Testes
- [ ] Test: Setup -> Guess (ambos) -> Proof (ambos) -> Feedback (ninguém acerta) -> Novo Round
- [ ] Test: Setup -> Guess (ambos) -> Proof (ambos) -> Feedback (Player 1 vence)
- [ ] Test: Setup -> Guess (ambos) -> Proof (ambos) -> Feedback (Empate)
- [ ] Test: Validar que secrets não são expostos
- [ ] Test: Validar que feedback é mostrado corretamente

### UI/UX
- [ ] Criar estados visuais para cada fase
- [ ] Feedback visual de "Aguardando oponente"
- [ ] Feedback visual de "Ambos palpitaram"
- [ ] Cores/ícones para acertos/erros/permutados
- [ ] Botão "ENVIAR PROVA" desabilitado até ambos palpitarem

---

## 📚 Estrutura de Arquivos Sugerida

```
src/
├── games/pass/
│   ├── PassGame.tsx (refatorado)
│   ├── passService.ts (sem mudanças maiores)
│   ├── bindings.ts
│   ├── components/
│   │   ├── PassDarkUI.tsx (refatorado)
│   │   ├── ProofFeedback.tsx (NOVO)
│   │   ├── RoundIndicator.tsx (NOVO)
│   │   └── ...
│   ├── hooks/
│   │   ├── useLocalGameSession.ts (NOVO)
│   │   └── useProofCalculation.ts (NOVO)
│   └── utils/
│       ├── proofCalculator.ts (NOVO)
│       └── ...
```

---

## 🚀 Próximos Passos

1. **Revisar e validar** este planejamento com o time
2. **Criar branch** para esta refatoração: `feature/proof-refactor`
3. **Implementar incrementalmente**:
   - Passo 1: Hook `useLocalGameSession`
   - Passo 2: `proofCalculator`
   - Passo 3: Refator de `PassGame.tsx`
   - Passo 4: Componentes de UI
   - Passo 5: Testes E2E
4. **Testar thoroughly** com ambos dev wallets e real wallets
5. **Deploy** após QA final

---

## 📞 Dúvidas Frequentes

**P: E se um player fechar o navegador durante o jogo?**
R: localStorage persiste. Ao retornar, o jogo continua no mesmo estado. Se o secret foi armazenado, continua válido.

**P: E se alguém tentar hackear o localStorage?**
R: Mesmo que modifiquem o secret localmente, o contrato valida baseado no hash original registrado. A prova calculada estaria errada.

**P: Quantas rodadas são permitidas?**
R: Indefinidas por padrão. Pode-se adicionar `max_rounds` se necessário.

**P: O que acontece se verifyProof for chamado antes de ambos enviarem?**
R: Contrato retorna erro `InvalidStatus`. Isso não deve acontecer com o novo fluxo.

---

## 📄 Referências

- Código atual: `PassGame.tsx` (~1484 linhas)
- Contrato: `lib.rs` (PASS contract)
- Tests: `test.rs` (casos de teste existentes)
- Service: `passService.ts` (~809 linhas)

