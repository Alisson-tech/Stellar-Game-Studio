/**
 * ARQUITETURA DE SECRETS PARA MASTERMIND PASS
 * 
 * Cada carteira/player armazena seu próprio secret LOCALMENTE
 * Quando alternando entre carteiras, carrega o secret da carteira atual
 * 
 * Chave: pass_game_secrets_{sessionId}
 * Valor: { secrets: { [playerAddress]: secret } }
 */

export interface RoundHistory {
    roundNumber: number;
    myGuess: number;
    opponentGuess: number | null;
    myProof: any | null;
    opponentProof: any | null;
}

export interface GameSecrets {
    sessionId: number;
    // Armazena secret para CADA player/address
    secrets: {
        [playerAddress: string]: number;
    };
}

export function useLocalGameSession(sessionId: number | null) {
    const getStorageKey = () => `pass_game_secrets_${sessionId}`;

    /**
     * Carrega TODOS os secrets armazenados para uma sessão
     */
    const loadAllSecrets = (): GameSecrets => {
        if (!sessionId) return { sessionId: 0, secrets: {} };
        
        const stored = localStorage.getItem(getStorageKey());
        if (stored) {
            try {
                return JSON.parse(stored) as GameSecrets;
            } catch (err) {
                console.error('[GameSecrets] Erro ao carregar secrets:', err);
                return { sessionId, secrets: {} };
            }
        }
        return { sessionId, secrets: {} };
    };

    /**
     * Obtém o secret do player ATUAL (currentPlayerAddress)
     */
    const getMySecret = (myAddress: string): number | null => {
        const allSecrets = loadAllSecrets();
        return allSecrets.secrets[myAddress] ?? null;
    };

    /**
     * Salva o secret de um player específico
     */
    const saveMySecret = (myAddress: string, secret: number): void => {
        if (!sessionId) return;
        
        const allSecrets = loadAllSecrets();
        allSecrets.secrets[myAddress] = secret;
        
        localStorage.setItem(getStorageKey(), JSON.stringify(allSecrets));
        console.log(`[GameSecrets] Secret salvo para ${myAddress.slice(0, 8)}...`);
    };

    /**
     * Obtém o secret de OUTRO player (para debug/teste)
     * Em produção, NUNCA deve ser usado - cada player conhece apenas seu próprio
     */
    const getOtherPlayerSecret = (otherPlayerAddress: string): number | null => {
        const allSecrets = loadAllSecrets();
        return allSecrets.secrets[otherPlayerAddress] ?? null;
    };

    /**
     * Limpa TODOS os secrets de uma sessão
     */
    const clearAllSecrets = (): void => {
        if (!sessionId) return;
        localStorage.removeItem(getStorageKey());
        console.log('[GameSecrets] Todos os secrets foram limpos');
    };

    return {
        getMySecret,
        saveMySecret,
        getOtherPlayerSecret,
        clearAllSecrets,
        loadAllSecrets,
    };
}
