import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Barretenberg, Fr } from '@aztec/bb.js';
import initNoirC from '@noir-lang/noirc_abi';
import initACVM from '@noir-lang/acvm_js';
import acvm from '@noir-lang/acvm_js/web/acvm_js_bg.wasm?url';
import noirc from '@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url';

// Inicializa uma única vez — use uma flag global para evitar re-inicializar
let wasmInitialized = false;

async function initWasm() {
    if (wasmInitialized) return;
    await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);
    wasmInitialized = true;
}

export interface ProofStats {
    acertos: number;      // Dígitos corretos na posição correta
    permutados: number;   // Dígitos corretos em posição errada
    erros: number;        // Dígitos incorretos
}

/**
 * Calcula as estatísticas de prova comparando o secret
 * com o palpite do oponente (3 dígitos)
 */
export function calculateProof(
    mySecret: number,
    opponentGuess: number | null
): ProofStats {
    if (opponentGuess === null || opponentGuess === undefined) {
        return { acertos: 0, erros: 0, permutados: 0 };
    }

    // Garantir que temos 3 dígitos com zeros à esquerda se necessário
    const secretStr = mySecret.toString().padStart(3, '0');
    const guessStr = opponentGuess.toString().padStart(3, '0');

    let acertos = 0;
    let permutados = 0;
    const usedSecretPositions = new Set<number>();
    const usedGuessPositions = new Set<number>();

    // Primeira passada: contar acertos (posições exatas)
    for (let i = 0; i < 3; i++) {
        if (secretStr[i] === guessStr[i]) {
            acertos++;
            usedSecretPositions.add(i);
            usedGuessPositions.add(i);
        }
    }

    // Segunda passada: contar permutados (dígito existe mas em posição errada)
    for (let i = 0; i < 3; i++) {
        if (!usedGuessPositions.has(i)) {
            for (let j = 0; j < 3; j++) {
                if (!usedSecretPositions.has(j) && guessStr[i] === secretStr[j]) {
                    permutados++;
                    usedSecretPositions.add(j);
                    break;
                }
            }
        }
    }

    const erros = 3 - acertos - permutados;

    return { acertos, permutados, erros };
}

/**
 * Normaliza o salt para um BigInt, aceitando hex string ou string simples
 */
function normalizeSalt(saltString: string): bigint {
    if (saltString.startsWith('0x')) {
        return BigInt(saltString);
    } else {
        // Se for string simples, converte chars para bytes (como no PassGame/calculateHash antigo)
        let result = 0n;
        for (let i = 0; i < saltString.length; i++) {
            result = (result << 8n) + BigInt(saltString.charCodeAt(i));
        }
        return result;
    }
}

/**
 * Calcula o hash Pedersen do segredo + salt para registro no contrato
 */
export async function calculateHash(secret: number, saltString: string): Promise<Buffer> {
    const api = await Barretenberg.new({ threads: 1 });
    try {
        // Prepare inputs: [d1, d2, d3, salt]
        // Note: Contract now uses Pedersen which expects Field elements
        const secretStr = secret.toString().padStart(3, '0');
        const d1 = new Fr(BigInt(secretStr[0]));
        const d2 = new Fr(BigInt(secretStr[1]));
        const d3 = new Fr(BigInt(secretStr[2]));

        const saltBn = normalizeSalt(saltString);
        const salt = new Fr(saltBn);

        // Pedersen hash
        // We use hashIndex 0 (default generator)
        const hashFr = await api.pedersenHash([d1, d2, d3, salt], 0);

        // Return 32 bytes buffer
        return Buffer.from(hashFr.toBuffer());
    } finally {
        await api.destroy();
    }
}

/**
 * Gera a prova ZK para um turno
 */
export async function proveTurn(
    secret: number,
    salt: string,
    guess: number,
    stats: ProofStats,
): Promise<{ proof: Uint8Array; publicInputs: string[] }> {
    // Importar dinamicamente para evitar erros de SSR se necessário, 
    // mas aqui estamos no client-side.
    // O circuito deve ser importado. Assumindo que o usuário colocou o JSON em ../circuit.json
    // Se não tiver, o usuário precisará ajustar o caminho ou copiar o arquivo.
    await initWasm(); // Garantir que os WASM estão inicializados antes de usar Noir ou o backend
    let circuit;
    try {
        // @ts-ignore
        circuit = await import('../circuit.json');
    } catch (e) {
        console.error("Circuit JSON not found. Please compile the circuit and copy 'target/pass_circuit.json' to 'pass-frontend/src/games/pass/circuit.json'.");
        throw new Error("Circuit artifact not found");
    }

    const circuitData = (circuit as any).default ?? circuit;
    const backend = new UltraHonkBackend(circuitData.bytecode);
    const noir = new Noir(circuitData);

    // Preparar inputs para o circuito
    // O circuito espera arrays de u32 size 3 para secret e guess
    const secretStr = secret.toString().padStart(3, '0').split('').map(d => parseInt(d));
    const guessStr = guess.toString().padStart(3, '0').split('').map(d => parseInt(d));

    // Calculate hash needed for public input
    // The circuit returns the public inputs, which includes the hash
    // We pass 0 as placeholder if the circuit computes it, but usually we pass private inputs
    // and the circuit constraints them against public inputs or returns them.
    // In our case, the circuit has:
    // fn main(secret, salt, guess, hash, acertos, permutados, erros)
    // All inputs are provided by Prover?
    // Wait, the circuit signature in main.nr:
    // fn main(secret, salt, guess, hash, acertos, permutados, erros) -> pub (...)
    // So we provide ALL inputs.

    // Normalize salt directly to field-compatible string (hex)
    const saltBn = normalizeSalt(salt);
    const saltField = '0x' + saltBn.toString(16).padStart(64, '0');

    const hashBuffer = await calculateHash(secret, salt);
    // Para o Noir (ele precisa do 0x para entender que é HEX)
    const hashField = `0x${hashBuffer.toString('hex').padStart(64, '0')}`;

    // Para o seu controle/comparação:
    console.log("Hash Real (Buffer):", hashBuffer.toString('hex'));

    console.log('[proveTurn] Hash (from contract):', hashField);

    console.log('secrect Hash:', hashField);

    const input = {
        secret: secretStr,
        salt: saltField, // Pass formatted salt, not raw string
        guess: guessStr,
        hash: hashField,
        acertos: stats.acertos,
        permutados: stats.permutados,
        erros: stats.erros
    };


    try {
        // 1. Generate Witness
        const { witness } = await noir.execute(input);

        // 2. Generate Proof
        const proofData = await backend.generateProof(witness, { keccak: true }); // { keccak: true }

        return {
            proof: proofData.proof,
            publicInputs: proofData.publicInputs
        };
    } catch (err: any) {
        console.error('[proveTurn] ❌ ERROR generating proof:', err);
        console.error('[proveTurn] Error details:', {
            message: err.message,
            stack: err.stack
        });

        throw new Error(`Proof generation failed: ${err.message}`);
    }
}

/**
 * Determina o resultado da rodada baseado nos proofs de ambos players
 */
export function determineRoundResult(
    player1Proof: ProofStats,
    player2Proof: ProofStats
): 'player1' | 'player2' | 'draw' | 'none' {
    // Agora 3 acertos ganham o jogo
    const p1Won = player1Proof.acertos === 3;
    const p2Won = player2Proof.acertos === 3;

    if (p1Won && p2Won) return 'draw';
    if (p1Won) return 'player1';
    if (p2Won) return 'player2';
    return 'none';
}
