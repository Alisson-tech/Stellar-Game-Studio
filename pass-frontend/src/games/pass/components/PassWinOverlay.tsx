import '../styles/PassDarkTheme.css';

interface PassWinOverlayProps {
    winner: string;
    onClose?: () => void;
    showCloseButton?: boolean;
}

/**
 * Win State Overlay Component
 * Displays winner with premium metallic gold styling
 * Features blurred background and animated entrance
 */
export function PassWinOverlay({ winner, onClose, showCloseButton = false }: PassWinOverlayProps) {
    return (
        <div className="pass-win-overlay" onClick={showCloseButton ? onClose : undefined}>
            <div className="pass-win-content" onClick={(e) => e.stopPropagation()}>
                <h2 className="pass-win-title">
                    {winner.toUpperCase()} WIN
                </h2>
                <p className="pass-win-subtitle">Blockchain Verified</p>

                {showCloseButton && onClose && (
                    <button
                        className="pass-button"
                        onClick={onClose}
                        style={{ marginTop: '2rem', maxWidth: '200px', margin: '2rem auto 0' }}
                    >
                        New Game
                    </button>
                )}
            </div>
        </div>
    );
}
