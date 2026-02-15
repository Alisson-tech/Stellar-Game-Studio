# 🎮 PASS Game - Mastermind com Secrets Locais

## 🚀 TL;DR - O que Mudou?

```
ANTES:
  ❌ Secrets centralizados por sessão
  ❌ Feedback igual para ambos players
  ❌ Confusão ao alternar carteiras

DEPOIS:
  ✅ Secrets armazenados por PLAYER (localStorage)
  ✅ Feedback diferente para cada player
  ✅ Alternância de carteiras automática
  ✅ Validação local com secret próprio
```

## 🔑 Conceito Central

> **Cada player armazena seu secret LOCALMENTE e nunca o compartilha**

```
┌────────────────────────────────────────────┐
│         PASS Game - Mastermind             │
├────────────────────────────────────────────┤
│                                            │
│  Player 1 Secret: 1234  (localStorage)    │
│  Player 2 Secret: 5678  (localStorage)    │
│                                            │
│  Palpite P1: 5000  →  Valida com 1234    │
│  Palpite P2: 1200  →  Valida com 5678    │
│                                            │
│  Resultado P1: 2 acertos (vs seu secret)  │
│  Resultado P2: 2 acertos (vs seu secret)  │
│                                            │
└────────────────────────────────────────────┘
```

## 📱 Fluxo Visual de Alternância de Carteiras

```
┌─────────────────────────────────────────────┐
│  Carteira 1 Ativa (Player 1)                │
│  ───────────────────────────────────────────│
│  Seu Palpite: 1200                          │
│  Sua Prova: 2 acertos, 0 permutados, 2 err │
│                                             │
│  Secret Local: 1234 ← localStorage          │
└─────────────────────────────────────────────┘
                    ↓
         [Clica em Alternar Carteira]
                    ↓
┌─────────────────────────────────────────────┐
│  Carteira 2 Ativa (Player 2)                │
│  ───────────────────────────────────────────│
│  Seu Palpite: 5000                          │  ← MUDOU!
│  Sua Prova: 2 acertos, 0 permutados, 2 err │  ← MUDOU!
│                                             │
│  Secret Local: 5678 ← localStorage          │  ← MUDOU!
└─────────────────────────────────────────────┘
```

## 🏗️ Arquitetura de Armazenamento

### localStorage

```javascript
// Chave: pass_game_secrets_{sessionId}
{
  "sessionId": 123456,
  "secrets": {
    "GAWNSHGNLS...": 1234,  // Player 1's secret
    "GAF2JGUXBJ...": 5678   // Player 2's secret
  }
}
```

### passService (Contrato)

```javascript
// Armazenado no blockchain
Game {
  player1: "GAWNSHGNLS...",
  player2: "GAF2JGUXBJ...",
  player1_secret_hash: hash(1234),  // Hash, não valor!
  player2_secret_hash: hash(5678),  // Hash, não valor!
  player1_last_guess: 5000,
  player2_last_guess: 1200,
  player1_proof: { acertos: 2, erros: 2, permutados: 0 },
  player2_proof: { acertos: 2, erros: 2, permutados: 0 }
}
```

## 🎯 Fluxo de Validação

```
┌──────────────────────────────────────────────────────────┐
│  PHASE: GUESS (Ambos palpitaram)                        │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  PHASE: PROOF (Validar palpites)                         │
│                                                          │
│  Player 1 (Carteira 1):                                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 1. Carrega secret local: 1234                      │ │
│  │ 2. Pega palpite do oponente: 1200                  │ │
│  │ 3. Calcula proof(1234, 1200) = 2 acertos          │ │
│  │ 4. Envia ao contrato                               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Player 2 (Carteira 2):                                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 1. Carrega secret local: 5678                      │ │
│  │ 2. Pega palpite do oponente: 5000                  │ │
│  │ 3. Calcula proof(5678, 5000) = 2 acertos          │ │
│  │ 4. Envia ao contrato                               │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  PHASE: VERIFY (Contrato verifica)                       │
│                                                          │
│  Se nenhum acertou (acertos !== 4):                     │
│  → Volta para GUESS com feedback                         │
│  → localStorage persist                                  │
│  → Ao alternar carteira, feedback muda!                 │
└──────────────────────────────────────────────────────────┘
```

## 💡 Por Que Isso Funciona?

### 1. Segurança
- Secrets nunca saem do navegador do usuário
- O contrato só vê hashes criptografados
- Ninguém pode ver o secret de outro player

### 2. Descentralização
- Cada player valida com seu próprio secret
- Não há servidor central checando respostas
- A validação é feita pelo próprio frontend

### 3. Clareza
- Player 1 vê: "Meu palpite foi 1200, acertei 2 dígitos"
- Player 2 vê: "Meu palpite foi 5000, acertei 2 dígitos"
- Feedback é personalisado por player!

## 🔄 Ciclo de Desenvolvimento

```
1. Player 1 registra secret 1234
   └─ localStorage[player1] = 1234

2. Player 2 registra secret 5678
   └─ localStorage[player2] = 5678

3. Player 1 palpita 5000
   └─ Contrato: player1_last_guess = 5000

4. Player 2 palpita 1200
   └─ Contrato: player2_last_guess = 1200

5. Player 1 clica "Enviar Prova"
   ├─ Carrega localStorage[player1] = 1234
   ├─ Valida contra palpite = 1200
   ├─ Calcula: 2 acertos
   └─ Envia ao contrato

6. Player 2 clica "Enviar Prova"
   ├─ Carrega localStorage[player2] = 5678
   ├─ Valida contra palpite = 5000
   ├─ Calcula: 2 acertos
   └─ Envia ao contrato

7. Contrato verifica:
   ├─ P1: 2 acertos (não ganhou)
   ├─ P2: 2 acertos (não ganhou)
   └─ Ninguém acertou → RODADA 2

8. Feedback mostrado COM LOCALSTORAGE:
   Player 1 vê: Palpite 1200, Resultado 2 acertos
   Player 2 vê: Palpite 5000, Resultado 2 acertos
```

## ⚙️ Implementação

### Hook: `useLocalGameSession`

```typescript
// Obtém secret do player ATUAL
const mySecret = getMySecret(userAddress);

// Salva secret do player ATUAL
saveMySecret(userAddress, secretValue);

// Carrega TODOS os secrets (debug)
const allSecrets = loadAllSecrets();

// Limpa todos os secrets
clearAllSecrets();
```

### Em PassGame.tsx

```typescript
// Setup Phase - Registrar Secret
const handleSetupPhase = async (secret: number) => {
  // Enviar ao contrato
  await passService.registerSecret(sessionId, userAddress, secret, signer);
  
  // Guardar localmente
  saveMySecret(userAddress, secret);
};

// Proof Phase - Validar Palpite
const handleSubmitProof = async () => {
  // Carregar secret local
  const mySecret = getMySecret(userAddress);
  
  // Carregar palpite do contrato
  const opponentGuess = gameState.player2_last_guess;
  
  // Calcular proof
  const proof = calculateProof(mySecret, opponentGuess);
  
  // Enviar ao contrato
  await passService.submitProof(sessionId, userAddress, proof.acertos, ...);
};
```

### Alternância de Carteiras

```typescript
// Quando userAddress muda
useEffect(() => {
  // Recalcular feedback para novo player
  const newIsPlayer1 = gameState.player1 === userAddress;
  
  setProofFeedback({
    myFeedback: newIsPlayer1 ? p1Res : p2Res,
    opponentFeedback: newIsPlayer1 ? p2Res : p1Res
  });
}, [userAddress]);
```

## 🧪 Testando Localmente

### Dev Mode com 2 Carteiras

```bash
# Terminal 1
bun run dev:game pass

# Navegador:
# 1. Connect "Wallet 1" (Player 1)
# 2. Create game, register secret 1234
# 3. Copy XDR invite

# 4. Open DevTools Console:
localStorage.getItem('pass_game_secrets_123456')

# Output:
# {"sessionId":123456,"secrets":{"GAWNSHGN...":"1234"}}

# 5. Switch to "Wallet 2" (Player 2)
# 6. Import game, register secret 5678

# 7. Check Console again:
localStorage.getItem('pass_game_secrets_123456')

# Output:
# {"sessionId":123456,"secrets":{"GAWNSHGN...":"1234","GAF2JGUX...":"5678"}}
```

## ✅ Validação

- [ ] Secrets são armazenados por player (não por sessão)
- [ ] localStorage contém DOIS secrets após ambos registrarem
- [ ] Ao alternar carteiras, o feedback muda
- [ ] Cada player valida com seu próprio secret
- [ ] Feedback é diferente para cada player
- [ ] Múltiplas rodadas funcionam com persistência

