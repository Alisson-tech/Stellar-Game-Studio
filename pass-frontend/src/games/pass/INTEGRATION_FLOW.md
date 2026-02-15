# PASS Game - Integração Completa

## 📋 Visão Geral do Fluxo

O jogo PASS (Mastermind) implementa um fluxo completo de 5 fases na integração entre frontend e contrato inteligente na blockchain Stellar.

## 🎮 Fases do Jogo

### 1️⃣ CRIAR JOGO (Create Phase)

**Objetivo:** Conectar dois jogadores e criar a sessão de jogo

**Fluxo:**
```
Player 1                          Blockchain              Player 2
  |                                  |                      |
  |-- prepareStartGame() ---------->|                       |
  |    (gera auth entry P1)          |                       |
  |                                  |                       |
  |-- Envia XDR para P2 ------------->|                       |
  |                                  |                       |
  |                                  |<-- importAndSignAuthEntry()
  |                                  |    (P2 importa e assina)
  |                                  |                       |
  |                                  |<-- finalizeStartGame()
  |                                  |    (submete transação)
  |                                  |                       |
  |<-- Jogo criado! Transição para SETUP
```

**Funções do Contrato:**
- `start_game(session_id, player1, player2, player1_points, player2_points)`

**Serviço:**
- `prepareStartGame()` - Player 1 prepara e exporta seu auth entry assinado
- `importAndSignAuthEntry()` - Player 2 importa e reconstrói a transação
- `finalizeStartGame()` - Submete a transação finalizada na blockchain

---

### 2️⃣ REGISTRAR SEGREDOS (Setup Phase)

**Objetivo:** Ambos os jogadores registram seus segredos (números secretos)

**Fluxo:**
```
Player 1                    Blockchain              Player 2
  |                             |                      |
  |-- registerSecret(P1_secret)->|                      |
  |                             |-- emit evento         |
  |                             |                      |
  |                             |<-- registerSecret(P2_secret)
  |                             |
  |<-- Status muda para Playing quando ambos registrarem
  |    Transição para GUESS
```

**Funções do Contrato:**
- `register_secret(session_id, player, secret_hash)`

**Serviço:**
- `registerSecret(sessionId, player, secretHash, signer)`

**Detalhes:**
- O jogador digita um número secreto (e.g., 4567)
- O frontend envia este número diretamente ao contrato
- Quando ambos registrarem, o status automático muda para `Playing`

---

### 3️⃣ FAZER PALPITES (Guess Phase)

**Objetivo:** Cada jogador tenta adivinhar o segredo do outro

**Fluxo:**
```
Player 1                    Blockchain              Player 2
  |                             |                      |
  |-- submitGuess(guess_P1)----->|                      |
  |    "Qual é o segredo?"       |-- emit evento        |
  |                             |                      |
  |                             |<-- submitGuess(guess_P2)
  |                             |    "Qual é o segredo?"
  |                             |
  |<-- Ambos palpitaram! Transição para REVEAL
```

**Funções do Contrato:**
- `submit_guess(session_id, player, guess)`

**Serviço:**
- `submitGuess(sessionId, player, guess, signer)`

**Detalhes:**
- Player 1 palpita o número de P2: `player1_last_guess`
- Player 2 palpita o número de P1: `player2_last_guess`
- Ambos tentam adivinhar o segredo do outro
- **PRIMEIRA PESSOA A ACERTAR VENCE!**

---

### 4️⃣ REVELAR VENCEDOR (Reveal Phase)

**Objetivo:** Comparar palpites com segredos e determinar o vencedor

**Fluxo:**
```
Player 1 ou 2               Blockchain              Contrato
  |                             |                      |
  |-- submitProof(mockProof)---->|                      |
  |   (Prova mock, placeholder)  |-- armazena prova    |
  |                             |                      |
  |-- verifyProof() ------------->|                      |
  |                             |-- Compara:           |
  |                             |   P1_guess == P2_secret?
  |                             |   P2_guess == P1_secret?
  |                             |                      |
  |<-- Vencedor: Player X        |                      |
  |    Transição para COMPLETE   |                      |
```

**Funções do Contrato:**
- `submit_proof(session_id, proof)` - Submete a prova (mock)
- `verify_proof(session_id)` - Verifica a prova e retorna o vencedor

**Serviço:**
- `submitProof(sessionId, proof)` - Envia prova mock (32 bytes aleatórios)
- `verifyProof(sessionId, player, signer)` - Verifica e revela vencedor

**Lógica de Vitória:**
```rust
Player 1 vence se:  player1_guess == player2_secret
Player 2 vence se:  player2_guess == player1_secret

Se ninguém acertou:  Nenhum vencedor (None)
```

**Nota sobre ZK:** 
- Atualmente a prova é um mock (32 bytes aleatórios)
- No futuro será substituída por uma prova ZK real
- O contrato apenas armazena a prova para data availability

---

### 5️⃣ RESULTADO FINAL (Complete Phase)

**Objetivo:** Exibir o resultado do jogo

**Exibição:**
```
┌─────────────────────────┐
│      🏆 VITÓRIA 🏆      │
├─────────────────────────┤
│  Seu Palpite: 2232      │
│  Resultado: ACERTOU ✓   │
├─────────────────────────┤
│  P1 palpitou 2232 = P2  │
│  segredo (2232) ✓ WIN   │
└─────────────────────────┘
```

---

## 🔄 Fluxo de Estado Completo

```
┌─────────┐
│ CREATE  │  Iniciar e criar jogo na blockchain
└────┬────┘
     │ start_game() sucesso
     ↓
┌─────────┐
│ SETUP   │  Ambos registram segredos
└────┬────┘
     │ ambos registerSecret() completados
     ↓
┌─────────┐
│ GUESS   │  Ambos fazem palpites
└────┬────┘
     │ ambos submitGuess() completados
     ↓
┌─────────┐
│ REVEAL  │  Revelar vencedor
└────┬────┘
     │ submitProof() + verifyProof() sucesso
     ↓
┌─────────┐
│COMPLETE │  Mostrar resultado final
└─────────┘
```

---

## 📱 Componentes e Serviços

### PassGame.tsx
- **Gerencia o estado global do jogo**
- **Controla as transições de fase**
- **Renderiza a UI apropriada para cada fase**
- **Trata erros e feedback do usuário**

### PassService
- **Interage com o contrato inteligente**
- **Assina transações**
- **Gerencia auth entries para multi-sig**
- **Implementa fluxo de preparação, importação e finalização**

### Bindings.ts
- **Tipos TypeScript do contrato**
- **Interface `Client` com métodos do contrato**
- **Tipos de dados: `Game`, `GameStatus`, `Error`**

---

## 🎯 Dados Trocados

### Estado do Jogo (Game)
```typescript
interface Game {
  player1: string;
  player2: string;
  player1_secret_hash: number | null;
  player2_secret_hash: number | null;
  player1_last_guess: number | null;
  player2_last_guess: number | null;
  player1_points: bigint;
  player2_points: bigint;
  verification_proof: Buffer | null;
  winner: string | null;
  status: GameStatus; // Setup, Playing, Finished
}
```

### Transições de Dados

**Setup → Guess:**
- Pré-requisito: ambos `player1_secret_hash` e `player2_secret_hash` != null

**Guess → Reveal:**
- Pré-requisito: ambos `player1_last_guess` e `player2_last_guess` != null

**Reveal → Complete:**
- Pré-requisito: `winner` != null (determinado pela lógica de vitória)

---

## ⚙️ Configuração e Constantes

- **PASS_CONTRACT:** Endereço do contrato na testnet
- **NETWORK_PASSPHRASE:** "Test SDF Network ; September 2015"
- **RPC_URL:** Endpoint Stellar testnet

---

## 🔐 Segurança

1. **Autenticação:**
   - Cada jogador deve assinar suas transações
   - Multi-sig para o `start_game` (ambos P1 e P2 assinam)

2. **Validação:**
   - O contrato valida que o jogador é um dos participantes
   - Status do jogo é verificado antes de permitir ações

3. **Dados Sensíveis:**
   - Segredos são números simples (não hasheados em ZK atualmente)
   - Prova é placeholder (será ZK no futuro)

---

## 📊 Exemplo de Jogo Completo

```
Sessão 123456789

Phase 1: CREATE ✓
- Player 1 (GA...BC) cria convite
- Player 2 (GD...EF) importa e finaliza
- Status: Setup

Phase 2: SETUP ✓
- Player 1 registra: 1234
- Player 2 registra: 5678
- Status: Playing

Phase 3: GUESS ✓
- Player 1 palpita: 5678 (ACERTOU!)
- Player 2 palpita: 9999 (ERROU)
- Status: Finished

Phase 4: REVEAL ✓
- submitProof() enviado
- verifyProof() determina vencedor
- Winner: Player 1

Phase 5: COMPLETE ✓
- Resultado exibido
- Player 1 viu sua vitória
- Pontos desbloqueados/atualizados
```

---

## 🚀 Próximos Passos

1. **Integração de ZK Real:**
   - Substituir mock proof por prova ZK genuína
   - Implementar circuitos de prova

2. **UI Melhorada:**
   - Mostrar contagem regressiva de ledgers
   - Indicadores de rede melhores
   - Animations para feedback visual

3. **Funcionalidades Adicionais:**
   - Ranking de jogadores
   - Histórico de jogos
   - Modo espectador
