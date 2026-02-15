# 🎯 PASS Game - Mastermind Refatoração Completa

## 📋 Visão Geral da Nova Arquitetura

A refatoração implementa um fluxo Mastermind puro onde:
- **Secrets NUNCA saem do frontend** (armazenados localmente por player)
- **Cada player valida localmente** seu secret contra o palpite do oponente
- **Feedback é DIFERENTE para cada player** (depende do seu secret local)
- **Alternância de carteiras** recarrega automaticamente o feedback correto

## 🔐 Armazenamento de Secrets (localStorage)

### Estrutura de Dados

```typescript
// Chave: pass_game_secrets_{sessionId}
// Valor:
{
  sessionId: 123456,
  secrets: {
    "GAWNSHGN...": 1234,  // Secret do Player 1
    "GAF2JGUX...": 5678   // Secret do Player 2
  }
}
```

### Hook: `useLocalGameSession(sessionId)`

```typescript
// Obtém o secret do PLAYER ATUAL (baseado em sua carteira)
const mySecret = getMySecret(currentPlayerAddress);

// Salva o secret localmente (só saído do frontend com playerAddress)
saveMySecret(currentPlayerAddress, secretNumber);

// Para debug/teste: obtém secret de OUTRO player
const otherSecret = getOtherPlayerSecret(otherPlayerAddress);

// Limpa todos os secrets (ao final do jogo)
clearAllSecrets();
```

## 🎮 Fluxo de Jogo Completo

### 1️⃣ CREATE - Criar Jogo

```
Player 1 (Carteira 1) cria o jogo
  └─ Gera invitation XDR
  └─ Player 2 (Carteira 2) importa e assina
```

### 2️⃣ SETUP - Registrar Secrets

```
Player 1 (Carteira 1):
  1. Clica em "Registrar Segredo"
  2. Digite: 1234
  3. Chama: passService.registerSecret(sessionId, player1, 1234)
  4. Contrato: Armazena hash em player1_secret_hash
  5. Frontend: Armazena 1234 em localStorage[player1_address]

Player 2 (Carteira 2):
  1. Clica em "Registrar Segredo"
  2. Digite: 5678
  3. Chama: passService.registerSecret(sessionId, player2, 5678)
  4. Contrato: Armazena hash em player2_secret_hash
  5. Frontend: Armazena 5678 em localStorage[player2_address]

⚠️ IMPORTANTE:
- Nenhum secret é enviado ao contrato em texto claro
- Cada player armazena seu secret LOCALMENTE
- O contrato só vê hashes criptografados
```

### 3️⃣ GUESS - Fazer Palpites

```
Player 1 (Carteira 1) - Palpite do Secret de Player 2:
  1. Clica em "Enviar Palpite"
  2. Digite: 5000 (tentando adivinhar o 5678)
  3. Chama: passService.submitGuess(sessionId, player1, 5000)
  4. Contrato: Armazena em player1_last_guess = 5000

Player 2 (Carteira 2) - Palpite do Secret de Player 1:
  1. Clica em "Enviar Palpite"
  2. Digite: 1200 (tentando adivinhar o 1234)
  3. Chama: passService.submitGuess(sessionId, player2, 1200)
  4. Contrato: Armazena em player2_last_guess = 1200

Status:
✅ Ambos palpitaram → Transição para PROOF
```

### 4️⃣ PROOF - Validar Palpites com Secrets Locais

```
Player 1 (Carteira 1) - Validar palpite:
  1. Recupera secret LOCAL: 1234 (de localStorage[player1])
  2. Recupera palpite do oponente: player2_last_guess = 1200 (do contrato)
  3. Calcula: calculateProof(1234, 1200)
     - Acertos: 2 (1, 2)
     - Permutados: 0
     - Erros: 2 (0, 0)
  4. Envia ao contrato: passService.submitProof(sessionId, player1, 2, 0, 2)
  5. Contrato: Armazena em player1_proof = [{ acertos: 2, erros: 2, permutados: 0 }]

Player 2 (Carteira 2) - Validar palpite:
  1. Recupera secret LOCAL: 5678 (de localStorage[player2])
  2. Recupera palpite do oponente: player1_last_guess = 5000 (do contrato)
  3. Calcula: calculateProof(5678, 5000)
     - Acertos: 2 (5, 7)
     - Permutados: 0
     - Erros: 2 (0, 0)
  4. Envia ao contrato: passService.submitProof(sessionId, player2, 2, 0, 2)
  5. Contrato: Armazena em player2_proof = [{ acertos: 2, erros: 2, permutados: 0 }]

⚠️ IMPORTANTE:
- CADA PLAYER usa SEU PRÓPRIO secret local
- O feedback é DIFERENTE para cada player porque seus secrets são diferentes
- Player 1 vê: "Seu palpite 1200 vs secret 1234: 2 acertos..."
- Player 2 vê: "Seu palpite 5000 vs secret 5678: 2 acertos..."
```

### 5️⃣ VERIFY - Auto-verificar e Determinar Vencedor

```
Quando ambos enviaram proofs:
  1. Sistema detecta: player1_proof.length > 0 && player2_proof.length > 0
  2. Chama automaticamente: passService.verifyProof(sessionId)
  3. Contrato compara:
     - Se player1_proof.acertos === 4: Player 1 venceu!
     - Se player2_proof.acertos === 4: Player 2 venceu!
     - Se ambos === 4: Empate!
     - Se nenhum === 4: Continua para próxima rodada

Resultado retornado:
  - player1_result = { acertos, erros, permutados }
  - player2_result = { acertos, erros, permutados }
  - winner = playerAddress ou null
```

### 6️⃣ FEEDBACK com Troca de Players

```
Cenário: Ninguém acertou, volta para GUESS com feedback

Player 1 (Carteira 1) vê:
  ╔═══════════════════════════════════════════════════════════╗
  ║  Resultado da Rodada 1                                    ║
  ║  Seu Palpite: 1200                                        ║
  ║  Sua Prova: 2 acertos, 0 permutados, 2 erros            ║
  ║  ───────────────────────────────────────────────────────║
  ║  Palpite do Oponente: 5000                               ║
  ║  Prova do Oponente: 2 acertos, 0 permutados, 2 erros    ║
  ║  ───────────────────────────────────────────────────────║
  ║  Ninguém acertou. Tente novamente!                       ║
  ╚═══════════════════════════════════════════════════════════╝

⚠️ AGORA PLAYER ALTERNA PARA CARTEIRA 2 ⚠️

Player 2 (Carteira 2) vê:
  ╔═══════════════════════════════════════════════════════════╗
  ║  Resultado da Rodada 1                                    ║
  ║  Seu Palpite: 5000                                        ║
  ║  Sua Prova: 2 acertos, 0 permutados, 2 erros            ║
  ║  ───────────────────────────────────────────────────────║
  ║  Palpite do Oponente: 1200                               ║
  ║  Prova do Oponente: 2 acertos, 0 permutados, 2 erros    ║
  ║  ───────────────────────────────────────────────────────║
  ║  Ninguém acertou. Tente novamente!                       ║
  ╚═══════════════════════════════════════════════════════════╝

⚠️ O FEEDBACK MUDOU porque:
  - Player 1 vê: "Seu palpite: 1200"
  - Player 2 vê: "Seu palpite: 5000"
  - A ordem e os valores são DIFERENTES para cada player!
```

## 🔄 Como Funciona a Alternância de Carteiras

### Fluxo Técnico

```typescript
// Em PassGame.tsx:

const { getMySecret, saveMySecret } = useLocalGameSession(sessionId);

// Quando userAddress muda (alternância de carteira)
useEffect(() => {
  if (!gameState || !proofFeedback) return;
  
  // Recalcular qual é "meu" feedback baseado no novo userAddress
  const newIsPlayer1 = gameState.player1 === userAddress;
  
  setProofFeedback({
    myFeedback: newIsPlayer1 ? p1Res : p2Res,
    opponentFeedback: newIsPlayer1 ? p2Res : p1Res
  });
}, [userAddress]); // Dispara quando carteira muda!

// Ao recuperar secret:
const mySecret = getMySecret(userAddress); // Busca o secret do PLAYER ATUAL
```

## 🎯 Diagramas de Fluxo

### Fluxo Completo - Ninguém Acerta (Rodada 2)

```
SETUP
  │
  ├─ Player 1: registra secret 1234 (localStorage)
  └─ Player 2: registra secret 5678 (localStorage)
       │
GUESS - Rodada 1
  │
  ├─ Player 1: palpita 5000 (vs secret 5678)
  └─ Player 2: palpita 1200 (vs secret 1234)
       │
PROOF - Rodada 1
  │
  ├─ Player 1: valida com secret 1234 → prova: 2 acertos
  └─ Player 2: valida com secret 5678 → prova: 2 acertos
       │
VERIFY → Ninguém acertou! Volta para GUESS com feedback
       │
GUESS - Rodada 2 (COM FEEDBACK)
  │
  ├─ Player 1 vê feedback: "Seu palpite 1200: 2 acertos"
  └─ Player 2 vê feedback: "Seu palpite 5000: 2 acertos"
       │
  ├─ Player 1: palpita 5700 (novo palpite)
  └─ Player 2: palpita 1400 (novo palpite)
       │
PROOF - Rodada 2
  │
  ├─ Player 1: valida com secret 1234 → prova: 3 acertos ✅
  └─ Player 2: valida com secret 5678 → prova: 3 acertos ✅
       │
VERIFY → Empate! Ambos acertaram!
       │
COMPLETE
```

### Feedback Dinâmico ao Alternar Carteiras

```
Estado Contrato (imutável):
  player1_result = { acertos: 2, erros: 2, permutados: 0 }
  player2_result = { acertos: 2, erros: 2, permutados: 0 }

────────────────────────────────────────────────────────

Player 1 Carteira Ativa:
  proofFeedback.myFeedback = player1_result
  proofFeedback.opponentFeedback = player2_result
  
  Exibe:
    Seu Palpite: 1200
    Sua Prova: 2 acertos

────────────────────────────────────────────────────────

[Alternância de Carteira]

────────────────────────────────────────────────────────

Player 2 Carteira Ativa:
  proofFeedback.myFeedback = player2_result
  proofFeedback.opponentFeedback = player1_result
  
  Exibe:
    Seu Palpite: 5000
    Sua Prova: 2 acertos
```

## 📊 Estrutura de Dados do localStorage

```json
{
  "pass_game_secrets_123456": {
    "sessionId": 123456,
    "secrets": {
      "GAWNSHGNLSVLDWAPWXICTYZ63J2OXP5V2T7BIWO7IWMEXUUZD5TPIYZV": 1234,
      "GAF2JGUXBJWH2DTZBSANC5AN45WOXW63AYNVCHXOCWGP5XSEQFDIPAYH": 5678
    }
  }
}
```

## 🔍 Debugging: Verificando Secrets

```typescript
// No console do navegador:
const session = JSON.parse(localStorage.getItem('pass_game_secrets_123456'));
console.log('All secrets:', session.secrets);

// Ou use a função do hook:
const { loadAllSecrets } = useLocalGameSession(sessionId);
console.log(loadAllSecrets());
```

## ✅ Checklist de Funcionalidades

- [x] Armazenar secret por player (não por sessão)
- [x] Carregar secret correto ao alternar carteiras
- [x] Recalcular feedback ao alternar carteiras
- [x] Calcular proof com secret local
- [x] Verificar que cada player vê feedback diferente
- [x] Suportar múltiplas rodadas com feedback persistente
- [x] Limpar secrets ao final do jogo

## 🐛 Resolução de Problemas

### Problema: "Segredo local não encontrado"
**Solução**: Verificar que `saveMySecret()` foi chamado em `handleDarkUISubmit()` na fase SETUP

### Problema: Feedback igual para ambos players
**Solução**: Verificar que `setProofFeedback` está usando `isPlayer1` para atribuir `myFeedback` corretamente

### Problema: Feedback não muda ao alternar carteiras
**Solução**: Verificar que o `useEffect` com dependência `[userAddress]` está sendo disparado

## 📝 Resumo das Mudanças

### Antes (Arquitetura Antiga)
```
useLocalGameSession(sessionId)
  └─ Armazena 1 secret por sessão
  └─ Problema: Qual player é dono do secret?
```

### Depois (Nova Arquitetura)
```
useLocalGameSession(sessionId)
  └─ Armazena secrets para CADA player/address
  └─ localStorage: pass_game_secrets_{sessionId}[playerAddress] = secret
  └─ Recalcula feedback automaticamente ao alternar carteiras
```

## 🎓 Aprendizados Principais

1. **Secrets LOCAIS**: Nunca saem do frontend, cada player guarda apenas o seu
2. **Validação DISTRIBUÍDA**: Cada player valida usando seu secret local
3. **Feedback DINÂMICO**: Muda automaticamente ao alternar entre carteiras
4. **Sem Confiança Necessária**: O contrato não precisa confiar que a prova está correta; a própria lógica do jogo o verifica
5. **Mastermind Puro**: Implementação clássica do jogo onde cada jogador tenta adivinhar o segredo do outro

