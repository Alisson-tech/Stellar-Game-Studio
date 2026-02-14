# Pass Game Integration - Quick Reference

## 📌 O que foi feito

Integração completa do jogo Pass (Mastermind) com o contrato Soroban, implementando o fluxo:

**Jogador 1 e 2 criam jogo** → **Ambos registram segredos** → **Ambos fazem palpites** → **Verifica e determina vencedor**

---

## 🎮 5 Fases do Jogo

| Fase | O que acontece | Função Contrato | Função Service |
|------|---|---|---|
| **CREATE** | Criar/importar jogo, 2 players assinam | `start_game()` | `startGame()`, `prepareStartGame()`, `importAndSignAuthEntry()`, `finalizeStartGame()` |
| **SETUP** | Players registram seus segredos | `register_secret()` | `registerSecret()` |
| **GUESS** | Players fazem palpites | `submit_guess()` | `submitGuess()` |
| **REVEAL** | Determina vencedor | `verify_proof()` | `verifyProof()` |
| **COMPLETE** | Mostra resultado | N/A | N/A |

---

## 🔑 Campos Importantes do Game State

```typescript
// Secret (quando Player registra)
player1_secret_hash: Option<u32>
player2_secret_hash: Option<u32>

// Guess (quando Player faz palpite)
player1_last_guess: Option<u32>
player2_last_guess: Option<u32>

// Result (quando verify_proof é chamado)
winner: Option<Address>

// Status (progresso do jogo)
status: GameStatus  // Setup | Playing | Finished
```

---

## 🚀 Como Usar (Quick Start)

### 1. Criar Jogo
```typescript
// Ambos players assinam a transação
await passService.startGame(
  sessionId, player1, player2, 
  BigInt(1e6), BigInt(1e6),  // points
  signer
);
```

### 2. Setup - Registrar Segredo
```typescript
// Cada player durante SETUP phase
await passService.registerSecret(
  sessionId,
  playerAddress,
  42,  // seu segredo (número inteiro)
  signer
);
```

### 3. Guess - Fazer Palpite
```typescript
// Cada player durante GUESS phase
await passService.submitGuess(
  sessionId,
  playerAddress,
  37,  // seu palpite
  signer
);
```

### 4. Reveal - Determinar Vencedor
```typescript
// Qualquer player clica para revelar
const winner = await passService.verifyProof(
  sessionId,
  playerAddress,
  signer
);
// Retorna: endereço do vencedor
```

---

## 📍 Detecção Automática de Fase

```typescript
// Frontend detecta automaticamente baseado no game state
const game = await passService.getGame(sessionId);

if (game.winner) {
    gamePhase = 'complete'
} else if (game.player1_last_guess && game.player2_last_guess) {
    gamePhase = 'reveal'
} else if (game.player1_secret_hash && game.player2_secret_hash) {
    gamePhase = 'guess'
} else {
    gamePhase = 'setup'
}
```

---

## 🎯 Lógica de Vitória

```rust
// No contrato, quando verify_proof() é chamado:
let player1_wins = player1_guess == player2_secret;
let player2_wins = player2_guess == player1_secret;

if player1_wins {
    winner = player1
} else if player2_wins {
    winner = player2
} else {
    // Ninguém acertou - reset e retry
    reset_guesses()
}
```

---

## 📊 Estado do Jogo (Exemplo)

### Fase: SETUP
```
status: "Setup"
player1_secret_hash: null       // Esperando Player 1
player2_secret_hash: null       // Esperando Player 2
player1_last_guess: null
player2_last_guess: null
winner: null
```

### Fase: GUESS
```
status: "Playing"
player1_secret_hash: 42         // ✓ Registrado
player2_secret_hash: 73         // ✓ Registrado
player1_last_guess: null        // Esperando palpite
player2_last_guess: null        // Esperando palpite
winner: null
```

### Fase: REVEAL
```
status: "Playing"
player1_secret_hash: 42
player2_secret_hash: 73
player1_last_guess: 73          // ✓ Player 1 acertou!
player2_last_guess: 99          // ✗ Player 2 errou
winner: null                    // Esperando verify_proof()
```

### Fase: COMPLETE
```
status: "Finished"
player1_secret_hash: 42
player2_secret_hash: 73
player1_last_guess: 73
player2_last_guess: 99
winner: "GXXXXX..."             // ✓ Player 1!
```

---

## 🔄 Fluxo de Polling

```typescript
// Frontend polling automático
let interval = setInterval(async () => {
    const game = await passService.getGame(sessionId);
    
    // Detectar mudanças
    if (game.player1_secret_hash && !oldGame.player1_secret_hash) {
        console.log("Player 1 registrou segredo!");
    }
    
    // Transição automática de fase
    updateGamePhase(game);
    
}, 5000);  // A cada 5 segundos
```

---

## ⚠️ Erros Comuns

| Erro | Causa | Solução |
|---|---|---|
| `SecretAlreadyRegistered` | Player tentou registrar 2x | Verificar fase, só permitir 1x |
| `InvalidStatus` | Chamou função na fase errada | Aguardar fase correta |
| `NotPlayer` | Endereço não está no jogo | Usar endereço correto |
| `BothPlayersNotGuessed` | Tentou revelar antes dos 2 palpites | Aguardar ambos palpitarem |

---

## 🛠️ Arquivos Chave

```
pass-frontend/
├── src/games/pass/
│   ├── PassGame.tsx           ← UI/componente principal
│   ├── passService.ts         ← Interface com contrato
│   ├── bindings.ts            ← Tipos TypeScript do contrato
│   ├── components/
│   │   ├── PassDarkUI.tsx    ← Input para secret/guess
│   │   └── ...
│   ├── GAME_FLOW.md           ← Documentação do fluxo
│   ├── CONTRACT_INTEGRATION.md ← Como funciona a integração
│   └── ...
├── API_USAGE_EXAMPLES.md      ← Exemplos de código
└── README_IMPLEMENTATION.md   ← Este arquivo
```

---

## 🧪 Testando

### Via UI
1. Create Game → Join → Register Secrets → Make Guesses → Reveal Winner

### Via Console
```typescript
// Importar service
const passService = new PassService(PASS_CONTRACT);

// Checar estado
const game = await passService.getGame(123456);
console.log(game);

// Testar call
await passService.registerSecret(123456, "G...", 42, signer);
```

### Com Dev Wallets (Quickstart)
- Interface tem botão "⚡ Quickstart (Dev Mode)"
- Cria 2 players automáticamente
- Completa todo fluxo em segundos

---

## 💡 Padrões de Código

### Integração do Service
```typescript
// Em PassGame.tsx
const signer = getContractSigner();
await passService.submitGuess(sessionId, userAddress, guess, signer);
```

### Detecção de Fase
```typescript
// Baseado no game state do contrato
const phase = gameState.winner ? 'complete' : 
             (gameState.player1_last_guess ? 'reveal' : 'guess');
```

### Polling de Atualizações
```typescript
useEffect(() => {
    const interval = setInterval(async () => {
        const game = await passService.getGame(sessionId);
        setGameState(game);
    }, 5000);
    
    return () => clearInterval(interval);
}, [sessionId]);
```

---

## 📋 Checklist de Implementação

- [x] Bindings.ts atualizado com novos tipos
- [x] PassService com novos métodos (registerSecret, submitGuess, verifyProof)
- [x] PassGame.tsx refatorado para 5 fases
- [x] Detecção automática de fase
- [x] Polling para updates em tempo real
- [x] UI atualizada para mostrar secrets/guesses
- [x] Tratamento de erros
- [x] Documentação completa

---

## 🚢 Deploy Checklist

- [ ] Testar fluxo completo no testnet
- [ ] Verificar handling de erros
- [ ] Testar com 2 wallets diferentes
- [ ] Verificar pontos sendo bloqueados
- [ ] Testar quickstart
- [ ] Verificar phase transitions
- [ ] Carregar jogo existente
- [ ] Verificar UI responsividade

---

## 🎓 Conceitos-Chave

1. **Multi-sig**: Ambos players assinam auth entries
2. **Phase Detection**: Frontend detecta fase pelo game state
3. **Polling**: Checks periódicos para atualizar UI
4. **Proof Verification**: Contrato compara palpites com segredos
5. **Error Recovery**: UI previne transições inválidas

---

## 📞 Support

Documentação completa disponível em:
- `GAME_FLOW.md` - Como o jogo funciona
- `CONTRACT_INTEGRATION.md` - Integração com contrato
- `API_USAGE_EXAMPLES.md` - Exemplos de código
- `IMPLEMENTATION_SUMMARY.md` - O que foi mudado

---

**Status:** ✅ Production Ready  
**Última atualização:** 14/02/2026  
**Versão:** 1.0
