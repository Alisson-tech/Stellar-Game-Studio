# Guia do Jogo Pass e Tutoriais

Este guia oferece uma visão geral da estrutura do repositório, explica o funcionamento do contrato inteligente do jogo "Pass" e inclui um tutorial sobre como integrar Zero-Knowledge Proofs (ZK).

## 1. Estrutura do Repositório

Caminhos a partir da raiz do projeto (`/l/disk0/alisson/Documentos/Projetos/Stellar-Game-Studio`):

- **`contracts/pass/`**: O diretório do seu jogo específico.
    - **`contracts/pass/src/lib.rs`**: A lógica principal do contrato (Smart Contract).
    - **`contracts/pass/src/test.rs`**: Testes unitários e de integração.
    - **`contracts/pass/Cargo.toml`**: Gerenciador de dependências do Rust.
    - **`contracts/pass/README.md`**: Documentação do contrato.
- **`pass-frontend/`**: O frontend do jogo (interface gráfica).
- **`scripts/`**: Scripts auxiliares para deploy, inicialização ou tarefas de manutenção.

## 2. Análise do Contrato `Pass` (`contracts/pass/src/lib.rs`)

O contrato implementa um jogo de adivinhação simples (1-10) entre dois jogadores.

### Estruturas de Dados (`DataKey` e `Game`)
- **`Game`**: Armazena o estado de uma partida:
    - `player1`/`player2`: Endereços dos jogadores.
    - `player1_points`/`player2_points`: Pontos apostados.
    - `player1_guess`/`player2_guess`: Os palpites (armazenados como `Option<u32>`).
    - `winner`: Quem ganhou.
    - `winning_number`: O número sorteado (gerado apenas no final).
- **`DataKey`**: Chaves para armazenar dados no ledger (banco de dados da blockchain).
    - `Game(u32)`: Mapeia um ID de sessão para um jogo.
    - `GameHubAddress`: Endereço do contrato central "Game Hub".

### Funções Principais
1.  **`start_game`**:
    - Inicializa o jogo.
    - Verifica se os jogadores são diferentes.
    - Chama o `GameHub` para bloquear os pontos dos jogadores.
    - Define um TTL (tempo de vida) para os dados do jogo não expirarem rapidamente.
2.  **`make_guess`**:
    - Recebe o palpite de um jogador.
    - Verifica se está entre 1 e 10.
    - Armazena o palpite no estado do jogo.
3.  **`reveal_winner`**:
    - **Crucial**: Gera o número aleatório (`env.prng()`) usando uma semente (seed) baseada nos palpites e endereços. Isso garante que o resultado é determinístico e auditável, mas imprevisível antes dos palpites.
    - Calcula a distância de cada palpite ao número sorteado.
    - Define o vencedor e notifica o `GameHub` para liberar os prêmios.

## 3. Como Programar e Extender o Contrato

Para modificar o jogo, você editará principalmente o `contracts/pass/src/lib.rs`.

**Exemplo: Alterar o intervalo de números para 1-100**

1.  Localize a validação em `make_guess`:
    ```rust
    // Antes
    if guess < 1 || guess > 10 { panic!("..."); }
    // Depois
    if guess < 1 || guess > 100 { panic!("Guess must be between 1 and 100"); }
    ```
2.  Atualize a geração do número em `reveal_winner`:
    ```rust
    // Antes
    let winning_number = env.prng().gen_range::<u64>(1..=10) as u32;
    // Depois
    let winning_number = env.prng().gen_range::<u64>(1..=100) as u32;
    ```

**Dica**: Sempre execute `cargo test` no diretório `contracts/pass` após alterações para garantir que nada quebrou.

## 4. Soroban ZK: Noir vs Risc0 (Experimental)

Ambas as tecnologias são **altamente experimentais** no contexto do Soroban, pois a verificação de provas ZK on-chain (dentro do contrato WASM) é computacionalmente cara e pode exceder os limites de gas atuais.

### Comparação

| Feature | **Noir** | **Risc0** |
| :--- | :--- | :--- |
| **Linguagem** | DSL específica (Noir) baseada em Rust. | Rust puro (zkVM). |
| **Abordagem** | Gera circuitos aritméticos. | Executa binários em uma VM virtual (RISC-V). |
| **Prova (Proof)** | Tamanho menor (focado em Snarks como Plonk). | Tamanho maior (STARKs), verificação mais pesada. |
| **Verificação On-Chain** | Implementar um Verifier (normalmente Solidity) em Rust/WASM. | Biblioteca `risc0-verifier` compilada para WASM. |
| **Compatibilidade Soroban** | **Difícil.** Requer transcrever a lógica do Verifier (normalmente Solidity) para Rust compatível com `no_std`. | **Mais compatível (teoricamente).** Risc0 é Rust-native, mas as bibliotecas de verificação podem ser pesadas demais para o limite de CPU/RAM do Soroban atual. |

### Veredito: Qual usar?

1.  **Noir**: Se você precisa de provas pequenas e rápidas.
    *   **Desafio**: Você terá que escrever ou encontrar um *Verifier* em Rust puro que compile para WASM e rode dentro do orçamento de gas do Soroban. A maioria dos exemplos do Noir foca em EVM (Solidity).
2.  **Risc0**: Se você prefere escrever tudo em Rust.
    *   **Desafio**: O verificador do Risc0 é pesado criptograficamente (SHA-256 intensivo). O Soroban tem funções `sha256` nativas baratas, mas a lógica de verificação completa do STARK pode estourar o limite de instruções.

### O "Caminho das Pedras" Atual

Para **ambos**, a solução recomendada hoje no Soroban é **Híbrida/Off-chain**:
1.  O usuário gera a prova localmente.
2.  Um serviço off-chain (seu backend) verifica a prova.
3.  O backend assina uma mensagem dizendo "Prova Válida para o input X".
4.  O contrato Soroban apenas verifica a assinatura do seu backend (muito barato).

Se você **realmente** quer verificação on-chain descentralizada (sem confiar no backend):
*   **Noir** com um verificador customizado em Rust (WASM) é a aposta mais leve em termos de *tamanho da prova*, mas a matemática de curvas elípticas (BN254) sem precompiles pode ser muito lenta no WASM.
*   **Aguarde**: A Stellar está discutindo adicionar precompiles (funções nativas) para curvas elípticas ou verificação ZK (como BLS12-381), o que tornaria Noir/Risc0 viáveis on-chain.

### Tutorial Básico (Conceitual - Off-chain Generation)

1.  **Instalar Noir**:
    ```bash
    curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
    noirup
    ```
2.  **Criar Circuito**:
    ```bash
    nargo new guess_proof
    ```
3.  **Lógica (`src/main.nr`)**:
    ```rust
    fn main(guess: u32, salt: Field, public_hash: pub Field) {
        let calculated = std::hash::pedersen_hash([guess as Field, salt]);
        assert(calculated == public_hash);
    }
    ```
4.  **Integração**:
    O frontend gera a prova. Infelizmente, sem um Verifier WASM otimizado, você não consegue validar `proof` diretamente no `contracts/pass/src/lib.rs` hoje com facilidade.
