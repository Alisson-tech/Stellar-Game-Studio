# Guia de Estrutura do Frontend Pass - Mastermind

## 📋 Visão Geral

Este documento analisa a estrutura do frontend `pass-frontend` e fornece um guia completo para adaptar a interface para o jogo Mastermind implementado no contrato Stellar.

---

## 🗂️ Estrutura de Pastas

```
pass-frontend/
├── src/
│   ├── games/pass/           # 🎮 JOGO - Lógica e UI do jogo Pass
│   │   ├── PassGame.tsx      # Componente principal da UI do jogo
│   │   ├── passService.ts    # 📡 Serviço de comunicação com o contrato
│   │   └── bindings.ts       # TypeScript bindings gerados do contrato
│   │
│   ├── components/           # 🧩 Componentes reutilizáveis
│   │   ├── Layout.tsx        # Layout principal da aplicação
│   │   ├── LayoutStandalone.tsx
│   │   ├── WalletStandalone.tsx
│   │   └── WalletSwitcher.tsx
│   │
│   ├── hooks/                # 🪝 React Hooks customizados
│   │   ├── useWallet.ts      # Hook para gerenciar carteira
│   │   └── useWalletStandalone.ts
│   │
│   ├── services/             # 🔧 Serviços auxiliares
│   │   └── devWalletService.ts  # Serviço para carteiras de desenvolvimento
│   │
│   ├── utils/                # 🛠️ Utilitários
│   │   ├── constants.ts      # Constantes (RPC_URL, CONTRACT_ID, etc)
│   │   ├── transactionHelper.ts  # Helpers para transações
│   │   ├── authEntryUtils.ts     # Utilitários de autenticação
│   │   ├── ledgerUtils.ts
│   │   ├── simulationUtils.ts
│   │   └── requestCache.ts
│   │
│   ├── store/                # 📦 Estado global (Zustand)
│   │   └── walletSlice.ts
│   │
│   ├── types/                # 📝 Definições de tipos TypeScript
│   │   └── signer.ts
│   │
│   ├── App.tsx               # 🏠 Componente raiz da aplicação
│   ├── main.tsx              # Entry point
│   ├── config.ts             # Configurações
│   └── index.css             # 🎨 Estilos globais
│
├── index.html                # HTML base
├── package.json              # Dependências
├── vite.config.ts            # Configuração do Vite
├── tailwind.config.js        # Configuração do Tailwind CSS
└── tsconfig.json             # Configuração TypeScript
```

---

## 🎯 Respondendo às Perguntas

### 1️⃣ Onde está o design da tela e o jogo em si?

#### **Design Visual (CSS/Estilos)**
- **Arquivo principal**: [`src/index.css`](file:///l/disk0/alisson/Documentos/Projetos/Stellar-Game-Studio/pass-frontend/src/index.css)
  - Define variáveis CSS (cores, fontes, bordas, sombras)
  - Estilos globais para botões, inputs, cards
  - Gradientes e temas visuais

#### **Interface do Jogo (UI Components)**
- **Arquivo principal**: [`src/games/pass/PassGame.tsx`](file:///l/disk0/alisson/Documentos/Projetos/Stellar-Game-Studio/pass-frontend/src/games/pass/PassGame.tsx)
  - **Linhas 1-1406**: Todo o componente React do jogo
  - **Componente principal**: `PassGame` (linha 37)
  - **Estados da UI** (linha 57):
    ```typescript
    'create' | 'guess' | 'reveal' | 'complete'
    ```
  - **Renderização**: A partir da linha 800+ (não mostrada completamente, mas contém JSX)

#### **Layout Geral**
- **Arquivo**: [`src/App.tsx`](file:///l/disk0/alisson/Documentos/Projetos/Stellar-Game-Studio/pass-frontend/src/App.tsx)
  - Componente raiz que envolve o jogo
  - Usa o componente `Layout` para estrutura
  - Renderiza `PassGame` quando conectado

---

### 2️⃣ Onde está a lógica?

#### **Lógica de Negócio do Jogo**
Localizada em [`src/games/pass/PassGame.tsx`](file:///l/disk0/alisson/Documentos/Projetos/Stellar-Game-Studio/pass-frontend/src/games/pass/PassGame.tsx):

| Função | Linhas | Descrição |
|--------|--------|-----------|
| `handlePrepareTransaction` | 378-469 | Player 1 prepara o jogo e assina |
| `handleQuickStart` | 471-574 | Inicia jogo rápido com 2 dev wallets |
| `handleImportTransaction` | 576-687 | Player 2 importa e finaliza o jogo |
| `handleLoadExistingGame` | 689-747 | Carrega jogo existente por session ID |
| `handleMakeGuess` | 797+ | Submete palpite do jogador |
| `loadGameState` | 146-165 | Carrega estado do jogo do contrato |

#### **Gerenciamento de Estado**
- **React State Hooks** (linhas 48-70):
  - `sessionId`: ID da sessão do jogo
  - `gameState`: Estado atual do jogo (do contrato)
  - `gamePhase`: Fase da UI ('create', 'guess', 'reveal', 'complete')
  - `guess`: Palpite do jogador
  - `loading`, `error`, `success`: Estados de UI

#### **Polling e Atualização**
- **useEffect** (linhas 167-173): Poll do estado do jogo a cada 5 segundos
- **useEffect** (linhas 176-181): Auto-refresh quando jogo completa

---

### 3️⃣ Onde está a chamada de contrato?

#### **Serviço de Comunicação com Contrato**
**Arquivo principal**: [`src/games/pass/passService.ts`](file:///l/disk0/alisson/Documentos/Projetos/Stellar-Game-Studio/pass-frontend/src/games/pass/passService.ts)

| Método | Linhas | Função no Contrato | Descrição |
|--------|--------|-------------------|-----------|
| `getGame` | 49-67 | `get_game` | Busca estado do jogo |
| `startGame` | 73-101 | `start_game` | Inicia jogo (multi-sig) |
| `prepareStartGame` | 114-229 | `start_game` | Player 1 assina auth entry |
| `importAndSignAuthEntry` | 329-437 | `start_game` | Player 2 importa e assina |
| `finalizeStartGame` | 447-473 | `start_game` | Submete transação final |
| `makeGuess` | 581-619 | `make_guess` | ❌ **NÃO EXISTE NO CONTRATO ATUAL** |
| `revealWinner` | 624-663 | `reveal_winner` | ❌ **NÃO EXISTE NO CONTRATO ATUAL** |

> **⚠️ IMPORTANTE**: Os métodos `make_guess` e `reveal_winner` **não existem** no contrato atual. O contrato implementa:
> - `register_secret` (linha 214 do contrato)
> - `submit_guess` (linha 262 do contrato)
> - `submit_proof` (linha 295 do contrato)
> - `verify_proof` (linha 312 do contrato)

#### **Client do Contrato**
- **Bindings**: [`src/games/pass/bindings.ts`](file:///l/disk0/alisson/Documentos/Projetos/Stellar-Game-Studio/pass-frontend/src/games/pass/bindings.ts)
  - Gerado automaticamente do contrato Stellar
  - Fornece tipos TypeScript e client SDK

#### **Fluxo de Chamada**
```
PassGame.tsx (UI)
    ↓
passService.ts (Service Layer)
    ↓
bindings.ts (Generated Client)
    ↓
Stellar SDK (@stellar/stellar-sdk)
    ↓
Stellar RPC (Blockchain)
```

---

## 🎮 Guia de Implementação: Adaptando para Mastermind

### 📊 Análise do Contrato Atual

O contrato [`contracts/pass/src/lib.rs`](file:///l/disk0/alisson/Documentos/Projetos/Stellar-Game-Studio/contracts/pass/src/lib.rs) implementa:

#### **Estrutura do Jogo** (linhas 57-69)
```rust
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    pub player1_secret_hash: Option<u32>,      // Hash do segredo do P1
    pub player2_secret_hash: Option<u32>,      // Hash do segredo do P2
    pub player1_last_guess: Option<u32>,       // Último palpite do P1
    pub player2_last_guess: Option<u32>,       // Último palpite do P2
    pub verification_proof: Option<Bytes>,     // Prova ZK (placeholder)
    pub winner: Option<Address>,
    pub status: GameStatus,
}
```

#### **Status do Jogo** (linhas 72-78)
```rust
pub enum GameStatus {
    WaitingForPlayers,  // Aguardando jogadores
    Setup,              // Registrando segredos
    Playing,            // Fazendo palpites
    Finished,           // Jogo finalizado
}
```

#### **Métodos Disponíveis**
1. **`start_game`** (linha 132): Inicia jogo e trava pontos
2. **`register_secret`** (linha 214): Registra hash do segredo
3. **`submit_guess`** (linha 262): Submete palpite
4. **`submit_proof`** (linha 295): Submete prova ZK (placeholder)
5. **`verify_proof`** (linha 312): Verifica prova e determina vencedor
6. **`get_game`** (linha 393): Busca informações do jogo

---

### 🔄 Mapeamento: Jogo Atual → Mastermind

| Fase Atual | Fase Mastermind | Ação |
|------------|-----------------|------|
| `create` | `create` | Player 1 prepara jogo (igual) |
| `create` (import) | `create` (import) | Player 2 finaliza jogo (igual) |
| `guess` | `setup` | **NOVO**: Ambos registram segredos |
| `guess` | `playing` | **MODIFICAR**: Submeter palpites |
| `reveal` | `verify` | **MODIFICAR**: Verificar prova e revelar vencedor |
| `complete` | `complete` | Mostrar resultado (igual) |

---

### 📝 Alterações Necessárias no Frontend

#### **1. Atualizar `passService.ts`**

##### **1.1. Adicionar método `registerSecret`**
```typescript
/**
 * Registra o hash do segredo do jogador
 */
async registerSecret(
  sessionId: number,
  playerAddress: string,
  secretHash: number,
  signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
  authTtlMinutes?: number
) {
  const client = this.createSigningClient(playerAddress, signer);
  const tx = await client.register_secret({
    session_id: sessionId,
    player: playerAddress,
    secret_hash: secretHash,
  }, DEFAULT_METHOD_OPTIONS);

  const validUntilLedgerSeq = authTtlMinutes
    ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
    : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

  const sentTx = await signAndSendViaLaunchtube(
    tx,
    DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
    validUntilLedgerSeq
  );
  return sentTx.result;
}
```

##### **1.2. Renomear `makeGuess` para `submitGuess`**
```typescript
/**
 * Submete um palpite para o segredo do oponente
 */
async submitGuess(
  sessionId: number,
  playerAddress: string,
  guess: number,
  signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
  authTtlMinutes?: number
) {
  const client = this.createSigningClient(playerAddress, signer);
  const tx = await client.submit_guess({
    session_id: sessionId,
    player: playerAddress,
    guess: guess,
  }, DEFAULT_METHOD_OPTIONS);

  const validUntilLedgerSeq = authTtlMinutes
    ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
    : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

  const sentTx = await signAndSendViaLaunchtube(
    tx,
    DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
    validUntilLedgerSeq
  );
  return sentTx.result;
}
```

##### **1.3. Adicionar métodos `submitProof` e `verifyProof`**
```typescript
/**
 * Submete prova ZK (placeholder)
 */
async submitProof(
  sessionId: number,
  proof: Uint8Array,
  signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
  authTtlMinutes?: number
) {
  const client = this.createSigningClient(signer.publicKey, signer);
  const tx = await client.submit_proof({
    session_id: sessionId,
    proof: Buffer.from(proof),
  }, DEFAULT_METHOD_OPTIONS);

  const validUntilLedgerSeq = authTtlMinutes
    ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
    : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

  const sentTx = await signAndSendViaLaunchtube(
    tx,
    DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
    validUntilLedgerSeq
  );
  return sentTx.result;
}

/**
 * Verifica a prova e determina o vencedor
 */
async verifyProof(
  sessionId: number,
  callerAddress: string,
  signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
  authTtlMinutes?: number
) {
  const client = this.createSigningClient(callerAddress, signer);
  const tx = await client.verify_proof({
    session_id: sessionId,
  }, DEFAULT_METHOD_OPTIONS);

  const validUntilLedgerSeq = authTtlMinutes
    ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
    : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

  const sentTx = await signAndSendViaLaunchtube(
    tx,
    DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
    validUntilLedgerSeq
  );
  return sentTx.result;
}
```

---

#### **2. Atualizar `PassGame.tsx`**

##### **2.1. Adicionar novos estados**
```typescript
// Adicionar após linha 70
const [mySecret, setMySecret] = useState<number | null>(null);
const [mySecretHash, setMySecretHash] = useState<number | null>(null);
const [secretRegistered, setSecretRegistered] = useState(false);
```

##### **2.2. Atualizar lógica de fases**
Modificar a função `loadGameState` (linha 146):
```typescript
const loadGameState = async () => {
  try {
    const game = await passService.getGame(sessionId);
    setGameState(game);

    if (!game) {
      setGamePhase('create');
      return;
    }

    // Determinar fase baseada no status do contrato
    if (game.status === 'Finished' && game.winner) {
      setGamePhase('complete');
    } else if (game.status === 'Playing') {
      setGamePhase('playing'); // Fazendo palpites
    } else if (game.status === 'Setup') {
      setGamePhase('setup'); // Registrando segredos
    } else {
      setGamePhase('create');
    }
  } catch (err) {
    setGameState(null);
    setGamePhase('create');
  }
};
```

##### **2.3. Adicionar função para registrar segredo**
```typescript
const handleRegisterSecret = async () => {
  if (mySecret === null) {
    setError('Digite um número secreto');
    return;
  }

  await runAction(async () => {
    try {
      setLoading(true);
      setError(null);

      // Calcular hash simples (no futuro, usar hash real)
      const secretHash = mySecret; // Por enquanto, usar o próprio número
      
      const signer = getContractSigner();
      await passService.registerSecret(
        sessionId,
        userAddress,
        secretHash,
        signer
      );

      setMySecretHash(secretHash);
      setSecretRegistered(true);
      setSuccess('Segredo registrado! Aguardando oponente...');
      
      // Recarregar estado
      await loadGameState();
    } catch (err) {
      console.error('Erro ao registrar segredo:', err);
      setError(err instanceof Error ? err.message : 'Falha ao registrar segredo');
    } finally {
      setLoading(false);
    }
  });
};
```

##### **2.4. Adicionar função para submeter palpite**
```typescript
const handleSubmitGuess = async () => {
  if (guess === null) {
    setError('Digite um palpite');
    return;
  }

  await runAction(async () => {
    try {
      setLoading(true);
      setError(null);

      const signer = getContractSigner();
      await passService.submitGuess(
        sessionId,
        userAddress,
        guess,
        signer
      );

      setSuccess('Palpite enviado! Aguardando oponente...');
      await loadGameState();
    } catch (err) {
      console.error('Erro ao enviar palpite:', err);
      setError(err instanceof Error ? err.message : 'Falha ao enviar palpite');
    } finally {
      setLoading(false);
    }
  });
};
```

##### **2.5. Adicionar função para verificar e revelar vencedor**
```typescript
const handleVerifyAndReveal = async () => {
  await runAction(async () => {
    try {
      setLoading(true);
      setError(null);

      const signer = getContractSigner();
      
      // 1. Submeter prova (placeholder - apenas um byte vazio)
      await passService.submitProof(
        sessionId,
        new Uint8Array([1]), // Prova dummy
        signer
      );

      // 2. Verificar prova e determinar vencedor
      const winner = await passService.verifyProof(
        sessionId,
        userAddress,
        signer
      );

      setSuccess('Vencedor revelado!');
      await loadGameState();
      onStandingsRefresh();
    } catch (err) {
      console.error('Erro ao verificar:', err);
      setError(err instanceof Error ? err.message : 'Falha ao verificar');
    } finally {
      setLoading(false);
    }
  });
};
```

---

#### **3. Atualizar UI (JSX)**

##### **3.1. Fase Setup - Registrar Segredo**
```tsx
{gamePhase === 'setup' && (
  <div className="card">
    <h3>Fase 1: Defina seu Segredo</h3>
    
    {!secretRegistered ? (
      <>
        <p>Escolha um número secreto para o seu oponente adivinhar:</p>
        <input
          type="number"
          min="1"
          max="10"
          value={mySecret ?? ''}
          onChange={(e) => setMySecret(parseInt(e.target.value))}
          placeholder="Digite um número de 1 a 10"
        />
        <button onClick={handleRegisterSecret} disabled={loading}>
          Registrar Segredo
        </button>
      </>
    ) : (
      <div className="notice success">
        ✅ Seu segredo foi registrado! Aguardando oponente...
      </div>
    )}
    
    {gameState && (
      <div style={{ marginTop: '1rem' }}>
        <p>Status:</p>
        <ul>
          <li>Player 1: {gameState.player1_secret_hash ? '✅' : '⏳'}</li>
          <li>Player 2: {gameState.player2_secret_hash ? '✅' : '⏳'}</li>
        </ul>
      </div>
    )}
  </div>
)}
```

##### **3.2. Fase Playing - Fazer Palpites**
```tsx
{gamePhase === 'playing' && (
  <div className="card">
    <h3>Fase 2: Adivinhe o Segredo do Oponente</h3>
    
    <p>Tente adivinhar o número secreto do seu oponente (1-10):</p>
    <input
      type="number"
      min="1"
      max="10"
      value={guess ?? ''}
      onChange={(e) => setGuess(parseInt(e.target.value))}
      placeholder="Digite seu palpite"
    />
    <button onClick={handleSubmitGuess} disabled={loading}>
      Enviar Palpite
    </button>
    
    {gameState && (
      <div style={{ marginTop: '1rem' }}>
        <p>Status dos Palpites:</p>
        <ul>
          <li>Você: {gameState.player1 === userAddress 
            ? (gameState.player1_last_guess ? `✅ ${gameState.player1_last_guess}` : '⏳')
            : (gameState.player2_last_guess ? `✅ ${gameState.player2_last_guess}` : '⏳')
          }</li>
          <li>Oponente: {gameState.player1 === userAddress
            ? (gameState.player2_last_guess ? '✅ Enviado' : '⏳ Aguardando')
            : (gameState.player1_last_guess ? '✅ Enviado' : '⏳ Aguardando')
          }</li>
        </ul>
      </div>
    )}
  </div>
)}
```

##### **3.3. Fase Verify - Revelar Vencedor**
```tsx
{gamePhase === 'verify' && (
  <div className="card">
    <h3>Fase 3: Revelar Vencedor</h3>
    
    <p>Ambos os jogadores fizeram seus palpites!</p>
    <button onClick={handleVerifyAndReveal} disabled={loading}>
      Verificar e Revelar Vencedor
    </button>
  </div>
)}
```

---

### 🎨 Melhorias Visuais Sugeridas

#### **1. Adicionar feedback visual para cada fase**
```css
/* Adicionar em index.css */
.phase-indicator {
  display: flex;
  justify-content: space-between;
  margin-bottom: 2rem;
}

.phase-step {
  flex: 1;
  text-align: center;
  padding: 1rem;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.5);
  border: 2px solid var(--color-border);
}

.phase-step.active {
  background: var(--color-accent);
  border-color: var(--color-accent-strong);
  font-weight: 600;
}

.phase-step.completed {
  background: var(--color-success);
  color: white;
}
```

#### **2. Componente de indicador de progresso**
```tsx
const PhaseIndicator = ({ currentPhase }: { currentPhase: string }) => {
  const phases = [
    { id: 'create', label: 'Criar Jogo' },
    { id: 'setup', label: 'Definir Segredo' },
    { id: 'playing', label: 'Adivinhar' },
    { id: 'verify', label: 'Verificar' },
    { id: 'complete', label: 'Finalizado' },
  ];

  return (
    <div className="phase-indicator">
      {phases.map((phase, index) => (
        <div
          key={phase.id}
          className={`phase-step ${
            phase.id === currentPhase ? 'active' :
            phases.findIndex(p => p.id === currentPhase) > index ? 'completed' : ''
          }`}
        >
          {phase.label}
        </div>
      ))}
    </div>
  );
};
```

---

## 🔐 Considerações de Segurança

### **Hash do Segredo**
Atualmente, o contrato usa `u32` para o hash do segredo. Para produção:

1. **Frontend**: Calcular hash SHA-256 do segredo
```typescript
async function hashSecret(secret: number): Promise<number> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret.toString());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  // Pegar os primeiros 4 bytes e converter para u32
  const view = new DataView(hashArray.buffer);
  return view.getUint32(0, false);
}
```

2. **Uso**:
```typescript
const secretHash = await hashSecret(mySecret);
await passService.registerSecret(sessionId, userAddress, secretHash, signer);
```

---

## 📦 Checklist de Implementação

### **Fase 1: Atualizar Bindings**
- [ ] Regenerar `bindings.ts` do contrato atualizado
- [ ] Verificar tipos TypeScript gerados

### **Fase 2: Atualizar Service**
- [ ] Adicionar `registerSecret()` em `passService.ts`
- [ ] Renomear `makeGuess()` para `submitGuess()`
- [ ] Adicionar `submitProof()` em `passService.ts`
- [ ] Adicionar `verifyProof()` em `passService.ts`
- [ ] Remover `revealWinner()` (não existe no contrato)

### **Fase 3: Atualizar UI**
- [ ] Adicionar estados para segredo (`mySecret`, `mySecretHash`, `secretRegistered`)
- [ ] Atualizar `gamePhase` para incluir 'setup' e 'verify'
- [ ] Modificar `loadGameState()` para mapear status do contrato
- [ ] Implementar `handleRegisterSecret()`
- [ ] Implementar `handleSubmitGuess()`
- [ ] Implementar `handleVerifyAndReveal()`
- [ ] Criar UI para fase 'setup'
- [ ] Atualizar UI para fase 'playing'
- [ ] Criar UI para fase 'verify'

### **Fase 4: Melhorias Visuais**
- [ ] Adicionar componente `PhaseIndicator`
- [ ] Adicionar estilos CSS para fases
- [ ] Adicionar animações de transição
- [ ] Melhorar feedback visual de loading/erro/sucesso

### **Fase 5: Testes**
- [ ] Testar fluxo completo com 2 dev wallets
- [ ] Testar cenários de erro (timeout, jogador desiste, etc)
- [ ] Testar deep linking com auth entry
- [ ] Testar polling e atualização de estado

---

## 🚀 Comandos Úteis

```bash
# Instalar dependências
bun install

# Rodar em desenvolvimento
bun run dev

# Build para produção
bun run build

# Preview da build
bun run preview

# Lint
bun run lint
```

---

## 📚 Recursos Adicionais

### **Documentação**
- [Stellar SDK](https://stellar.github.io/js-stellar-sdk/)
- [Soroban Docs](https://soroban.stellar.org/docs)
- [React Hooks](https://react.dev/reference/react)
- [Vite](https://vitejs.dev/)

### **Arquivos Importantes**
- [`package.json`](file:///l/disk0/alisson/Documentos/Projetos/Stellar-Game-Studio/pass-frontend/package.json): Dependências e scripts
- [`vite.config.ts`](file:///l/disk0/alisson/Documentos/Projetos/Stellar-Game-Studio/pass-frontend/vite.config.ts): Configuração do bundler
- [`tailwind.config.js`](file:///l/disk0/alisson/Documentos/Projetos/Stellar-Game-Studio/pass-frontend/tailwind.config.js): Configuração do Tailwind

---

## 🎯 Resumo Executivo

### **O que você precisa alterar:**

1. **`passService.ts`**: Adicionar 3 novos métodos (`registerSecret`, `submitProof`, `verifyProof`) e renomear 1 (`makeGuess` → `submitGuess`)

2. **`PassGame.tsx`**: 
   - Adicionar 3 novos estados
   - Modificar 1 função (`loadGameState`)
   - Adicionar 3 novas funções (`handleRegisterSecret`, `handleSubmitGuess`, `handleVerifyAndReveal`)
   - Atualizar JSX para 3 novas fases

3. **`index.css`**: Adicionar estilos para indicador de fases (opcional)

### **Fluxo do Jogo Mastermind:**

```
1. CREATE: Player 1 prepara → Player 2 finaliza
           ↓
2. SETUP: Ambos registram segredos (register_secret)
           ↓
3. PLAYING: Ambos fazem palpites (submit_guess)
           ↓
4. VERIFY: Qualquer um verifica (submit_proof + verify_proof)
           ↓
5. COMPLETE: Mostrar vencedor
```

---

**Boa sorte com a implementação! 🎮🚀**
