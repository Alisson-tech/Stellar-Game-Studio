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
                return 'Waiting for Players';
            case 'setup':
                return 'Setting up Secrets';
            case 'playing':
                return 'In Game';
            case 'verifying':
                return 'Verifying Blockchain';
            case 'complete':
                return 'Game Finished';
            default:
                return 'Loading...';
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
