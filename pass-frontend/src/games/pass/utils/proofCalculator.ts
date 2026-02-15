export interface ProofStats {
    acertos: number;      // Dígitos corretos na posição correta
    erros: number;        // Dígitos incorretos
    permutados: number;   // Dígitos corretos em posição errada
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

    return { acertos, erros, permutados };
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
