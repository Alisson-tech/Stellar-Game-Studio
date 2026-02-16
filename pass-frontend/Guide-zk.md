# Guia: Implementação de Lógica ZK (Noir + Soroban)

Este tutorial explicativo e prático cobre desde a instalação até a implementação completa da lógica Zero-Knowledge (ZK) para o jogo **Pass** (Mastermind 3 dígitos).

---

## 1. Planejamento e Conceitos

Para implementar ZK com sucesso, precisamos entender os três pilares:
1.  **Circuit (Circuito)**: Define as regras matemáticas (Noir).
2.  **Prover (Provador)**: O frontend do jogador gera a prova sem revelar o segredo.
3.  **Verifier (Verificador)**: O Smart Contract no Stellar confirma a prova.

---

## 2. Instalação das Tecnologias

### A. Ferramentas do Desenvolvedor (Local/CLI)
Necessário para compilar o circuito e gerar chaves de verificação.
```bash
# Noir (Compilador)
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup

# Barretenberg (Backend de prova)
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash
```

### B. Dependências do Frontend
```bash
npm install @noir-lang/noir_js @noir-lang/backend_barretenberg
```

### C. Soroban & Rust
```bash
rustup target add wasm32-v1-none
```

---

## 3. O Circuito ZK Completo (`main.nr`)

Este circuito é otimizado para performance e segurança. Ele usa o algoritmo de **Frequency Counting** para lidar com números repetidos e o hash **Poseidon** para o compromisso do segredo.

```rust
use dep::std;

global N: u32 = 3; // 3 dígitos
global K: u32 = 10; // Dígitos de 0 a 9

fn main(
    secret: [u32; 3],             // Privado
    salt: Field,                  // Privado
    pub guess: [u32; 3],          // Público
    pub hash: Field,              // Público
    pub acertos: u32,             // Público
    pub permutados: u32,          // Público
    pub erros: u32                // Público
) {
    // 1. Verificar Compromisso (Secret + Salt)
    let computed_hash = std::hash::poseidon::bn254::hash_4([
        secret[0] as Field, 
        secret[1] as Field, 
        secret[2] as Field, 
        salt
    ]);
    assert(computed_hash == hash);

    // 2. Lógica Mastermind Performática (Frequency Counting)
    let mut count_acertos: u32 = 0;
    let mut secret_counts: [u32; 10] = [0; 10];
    let mut guess_counts: [u32; 10] = [0; 10];

    // Identificar acertos exatos e contar frequências para o restante
    for i in 0..N {
        if secret[i] == guess[i] {
            count_acertos += 1;
        } else {
            secret_counts[secret[i]] += 1;
            guess_counts[guess[i]] += 1;
        }
    }

    // Calcular permutados (mínimo entre as frequências)
    let mut count_permutados: u32 = 0;
    for i in 0..K {
        let sc = secret_counts[i];
        let gc = guess_counts[i];
        count_permutados += if sc < gc { sc } else { gc };
    }

    let count_erros = N - count_acertos - count_permutados;

    // 3. Validação Final
    assert(count_acertos == acertos);
    assert(count_permutados == permutados);
    assert(count_erros == erros);
}
```

---

## 4. Integração no Frontend (TypeScript)

O frontend gera a prova no navegador do usuário.

```typescript
import { Noir } from '@noir-lang/noir_js';
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import circuit from './target/main.json';

async function proveTurn(secret: number[], salt: string, guess: number[], stats: any) {
    const backend = new BarretenbergBackend(circuit);
    const noir = new Noir(circuit, backend);

    const input = {
        secret,
        salt,
        guess,
        hash: stats.hash,
        acertos: stats.acertos,
        permutados: stats.permutados,
        erros: stats.erros
    };

    const { proof, publicInputs } = await noir.generateProof(input);
    return { proof, publicInputs };
}
```

---

## 5. Integração no Contrato (Soroban)

O contrato recebe a prova e delega a verificação para o `rs-soroban-ultrahonk`.

```rust
// lib.rs
pub fn verify_proof(env: Env, proof: Bytes, public_inputs: Vec<Field>) -> bool {
    let verifier_addr = env.storage().instance().get(&DataKey::Verifier).unwrap();
    let client = UltrahonkVerifierClient::new(&env, &verifier_addr);

    // Verifica se a prova matemática é válida para as entradas públicas
    client.verify_proof(&public_inputs, &proof)
}
```

---

## 6. Fluxo de Execução Resumido
1.  **Registro**: Jogador registra `hash(segredo + salt)` no contrato.
2.  **Turno**: Oponente envia um palpite (`guess`).
3.  **Prova**: Jogador gera a Prova ZK no frontend (Prover).
4.  **On-chain**: Prova é enviada e validada no contrato (Verifier).

---

> [!IMPORTANT]
> O segredo e o salt NUNCA saem do computador do jogador. Apenas provas e hashes públicos trafegam na rede Stellar.