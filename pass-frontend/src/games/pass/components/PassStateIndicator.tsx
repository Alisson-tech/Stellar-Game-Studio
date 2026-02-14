import '../styles/PassDarkTheme.css';

interface PassStateIndicatorProps {
    currentState: 'waiting' | 'setup' | 'playing' | 'verifying' | 'complete';
    message?: string;
}

/**
 * State Indicator Component for PASS Game
 * Shows current game state with visual feedback
 */
export function PassStateIndicator({ currentState, message }: PassStateIndicatorProps) {
    const getStateLabel = () => {
        switch (currentState) {
            case 'waiting':
                return 'Aguardando Jogadores';
            case 'setup':
                return 'Configurando Segredos';
            case 'playing':
                return 'Em Jogo';
            case 'verifying':
                return 'Verificando Blockchain';
            case 'complete':
                return 'Jogo Finalizado';
            default:
                return 'Carregando...';
        }
    };

    const getStateIcon = () => {
        switch (currentState) {
            case 'waiting':
                return '⏳';
            case 'setup':
                return '🔐';
            case 'playing':
                return '🎮';
            case 'verifying':
                return '⚡';
            case 'complete':
                return '✓';
            default:
                return '○';
        }
    };

    return (
        <div className="pass-status">
            <p className="pass-status-text">
                <span style={{ marginRight: '0.5rem' }}>{getStateIcon()}</span>
                {message || getStateLabel()}
            </p>
        </div>
    );
}
