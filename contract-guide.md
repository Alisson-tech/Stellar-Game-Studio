# Guia de Implementação do Contrato Mastermind

Este guia detalha as modificações necessárias no arquivo `contracts/pass/src/lib.rs` para transformar o jogo "Pass" em um jogo "Mastermind" com verificação Zero-Knowledge (ZK).

## Visão Geral

O objetivo é criar um jogo onde dois jogadores tentam adivinhar o "segredo" um do outro. O segredo é oculto via Hash e a validação do palpite será feita futuramente através de provas ZK (Zero-Knowledge). O primeiro a acertar o segredo do adversário vence.

## Estrutura de Dados (`Game` Struct)

A struct `Game` precisa ser atualizada para suportar a lógica do Mastermind.

### Alterações na Struct `Game`

```rust
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    
    // [NOVO] Hashes dos segredos registrados
    pub player1_secret_hash: Option<BytesN<32>>, 
    pub player2_secret_hash: Option<BytesN<32>>,
    
    // [MODIFICADO] Armazenamento dos palpites (pode ser um histórico ou o último)
    // Sugestão: Armazenar o último palpite para verificação
    pub player1_last_guess: Option<u32>, // ou Bytes, dependendo do formato do segredo
    pub player2_last_guess: Option<u32>,
    
    // [NOVO] Armazenamento da Prova ZK (inicialmente opaco)
    pub verification_proof: Option<Bytes>,
    
    // Estado do jogo
    pub winner: Option<Address>,
    pub status: GameStatus, // Enum para controlar o fluxo (Setup, Playing, Verifying, Finished)
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GameStatus {
    WaitingForPlayers,
    Setup,   // Aguardando registro dos segredos
    Playing, // Palpites liberados
    Finished
}
```

## Funções Existentes

### Manter (Sem Alterações ou Mínimas)
*   **`__constructor`**: Mantém a inicialização do admin e GameHub.
*   **`get_admin` / `set_admin`**: Mantém para administração.
*   **`get_hub` / `set_hub`**: Mantém a integração com o GameHub.
*   **`upgrade`**: Mantém a capacidade de upgrade.
*   **`get_game`**: Mantém, mas retornará a nova estrutura `Game`.

### Modificar
*   **`start_game`**: 
    *   **Lógica Atual**: Inicializa o jogo e define `player1` e `player2`.
    *   **Mudança**: Deve inicializar os novos campos (`secret_hashes` como `None`, status como `Setup`).

*   **`make_guess`** (Renomear para `submit_guess`):
    *   **Lógica Atual**: Verifica intervalo 1-10.
    *   **Mudança**: 
        *   Aceitar o formato do palpite do Mastermind (ex: 4 dígitos).
        *   Verificar se o jogo está no status `Playing`.
        *   Armazenar o palpite no contrato para ser verificado.

### Remover / Substituir
*   **`reveal_winner`**: 
    *   **Ação**: REMOVER a lógica atual de geração de número aleatório. 
    *   **Substituição**: A vitória não será mais definida por sorteio, mas pela função `verify_proof` (quem acertar primeiro).

## Novas Funções

### 1. `register_secret`
Registra o hash do número secreto de um jogador.

*   **Argumentos**: `secret_hash: BytesN<32>`.
*   **Lógica**: 
    *   Verificar autoria (`player.require_auth()`).
    *   Verificar se o jogo está no status `Setup`.
    *   Armazenar o hash no slot do jogador correspondente.
    *   Se ambos os jogadores registraram, mudar status para `Playing`.

```rust
pub fn register_secret(env: Env, session_id: u32, player: Address, secret_hash: BytesN<32>) -> Result<(), Error> {
    // ... validações ...
    // Armazena hash
    // Verifica se pode iniciar o jogo (ambos registraram)
}
```

### 2. `submit_proof` (Placeholder)
Método para enviar a prova ZK que valida um palpite ou resultado.

*   **Argumentos**: `proof: Bytes`.
*   **Lógica Inicial**: 
    *   Apenas armazenar a prova na struct `Game` para disponibilidade de dados (Data Availability).
    *   Pode ser chamado pelo jogador que detém o segredo para provar que o palpite do adversário está Correto ou Incorreto (feedback).

```rust
pub fn submit_proof(env: Env, session_id: u32, proof: Bytes) -> Result<(), Error> {
    // Armazena a prova
}
```

### 3. `verify_proof` (Placeholder)
Verifica a prova e define o vencedor.

*   **Lógica Futura**:
    *   Receber a prova e inputs públicos (hash do segredo, palpite).
    *   Executar verificador ZK (ex: via `verify_groth16` ou similar, se disponível, ou lógica nativa).
    *   **Regra de Vitória**: Se a prova confirmar que o palpite do `Player A` corresponde ao segredo do `Player B`, então `Player A` vence.
    *   Chamar `game_hub.end_game`.

```rust
pub fn verify_proof(env: Env, session_id: u32) -> Result<(), Error> {
    // Verifica prova
    // Se palpite correto -> Define vencedor -> game_hub.end_game(...)
}
```

## Fluxo do Jogo Sugerido

1.  **Start**: Jogo criado no GameHub -> `start_game`. Status: `Setup`.
2.  **Setup**: 
    *   Player 1 chama `register_secret(hash1)`.
    *   Player 2 chama `register_secret(hash2)`.
    *   Status muda para `Playing`.
3.  **Game Loop**:
    *   Player 1 chama `submit_guess(guess_para_p2)`.
    *   Player 2 (ou verificador off-chain) gera prova sobre o palpite.
    *   Player 2 chama `submit_proof(prova)`.
    *   Qualquer um chama `verify_proof`.
    *   Se incorreto: Jogo segue.
    *   Se correto: Player 1 vence.

## Considerações de Segurança

*   **Front-running**: No Mastermind, ver o palpite do outro não necessariamente quebra o jogo, mas em um ambiente blockchain, todos os dados são públicos. O segredo deve permanecer oculto (hash).
*   **Disponibilidade**: Se o Player 2 se recusar a gerar a prova de que o Player 1 acertou, o jogo pode travar. (Futuramente, pode ser necessário um mecanismo de "timeout" ou desafio).

## Testando o Contrato

Esta seção guia a criação de testes unitários e interação via CLI para validar a lógica do Mastermind.

### Estratégia de Testes Unitários (`test.rs`)

Você deve criar um novo arquivo de teste ou substituir o conteúdo de `contracts/pass/src/test.rs`. Os testes devem usar `soroban-sdk` para simular o ambiente.

#### 1. Setup do Teste
Mantenha a função `setup_test` existente, pois ela já configura o `MockGameHub`, Admin e Players corretamente.

#### 2. Testando o Fluxo Feliz (Happy Path)
Crie um teste `test_mastermind_flow` que simula uma partida completa:

```rust
#[test]
fn test_mastermind_flow() {
    let (env, client, _hub, player1, player2) = setup_test();
    let session_id = 1u32;
    let points = 100_0000000;

    // 1. Iniciar Jogo
    client.start_game(&session_id, &player1, &player2, &points, &points);

    // 2. Registrar Segredos
    // Segredo P1: "1234" (hash simulado)
    let secret1 = BytesN::from_array(&env, &[1u8; 32]); 
    let secret2 = BytesN::from_array(&env, &[2u8; 32]);
    
    client.register_secret(&session_id, &player1, &secret1);
    client.register_secret(&session_id, &player2, &secret2);

    // Verificar se status mudou para Playing
    let game = client.get_game(&session_id);
    assert!(game.status == GameStatus::Playing);

    // 3. Fazer Palpites
    client.submit_guess(&session_id, &player1, &1234); // P1 chuta "1234" (incorreto pois o segredo de P2 é outro)
    client.submit_guess(&session_id, &player2, &9999);

    // 4. Verificar Prova (Simulação)
    // Supondo que P1 acertou o segredo de P2 (vamos fingir para o teste)
    let proof = Bytes::from_array(&env, &[0xAA; 10]); // Prova "fake"
    
    // No mundo real, a prova validaria matematicamente. Aqui, vamos confiar no verify_proof
    // Se o seu verify_proof for um placeholder que sempre aceita, o teste passa.
    client.verify_proof(&session_id); 
    
    // Verificar vencedor
    // assert!(client.get_game(&session_id).winner.is_some());
}
```

#### 3. Testes de Erro
*   `test_cannot_play_without_register`: Tentar `submit_guess` antes de ambos registrarem segredos.
*   `test_cannot_register_twice`: Tentar chamar `register_secret` novamente.
*   `test_invalid_guess_range`: Tentar chutar número fora do permitido (se houver regra de dígitos).

### Comandos CLI (Soroban)

Para testar "na mão" ou via terminal, use o `soroban-cli`.

#### 1. Configuração e Build
Compilar o contrato:
```bash
cargo build --target le-unknown-unknown --release
```

#### 2. Deploy (Simulado em Localhost/Standalone)
Se estiver rodando uma rede local (standalone):
```bash
soroban contract deploy \
    --wasm target/wasm32-unknown-unknown/release/pass.wasm \
    --source alice \
    --network standalone
```
*Anote o Contract ID retornado (ex: CARQ...)*

#### 3. Invocar Funções

**Iniciar Jogo:**
```bash
soroban contract invoke \
    --id <CONTRACT_ID> \
    --source alice \
    --network standalone \
    -- \
    start_game \
    --session_id 1 \
    --player1 <ADDR_ALICE> \
    --player2 <ADDR_BOB> \
    --player1_points 100 \
    --player2_points 100
```

**Registrar Segredo (Alice):**
Gere um hash (ex: sha256 de "1234") e passe como hex/bytes.
```bash
soroban contract invoke \
    --id <CONTRACT_ID> \
    --source alice \
    --network standalone \
    -- \
    register_secret \
    --session_id 1 \
    --player <ADDR_ALICE> \
    --secret_hash <HASH_BYTES_32>
```

**Fazer Palpite:**
```bash
soroban contract invoke \
    --id <CONTRACT_ID> \
    --source alice \
    --network standalone \
    -- \
    submit_guess \
    --session_id 1 \
    --player <ADDR_ALICE> \
    --guess 5678
```

**Ler Estado do Jogo:**
```bash
soroban contract invoke \
    --id <CONTRACT_ID> \
    --source alice \
    --network standalone \
    -- \
    get_game \
    --session_id 1
```

### Rodando os Testes Automatizados
Para executar os testes definidos em `test.rs`:

```bash
cargo test
```

Para ver logs de debug (`std::println!` não funciona, use `env.logger().log(...)`):
```bash
cargo test -- --nocapture
```

