import { useState } from 'react';
import '../styles/PassDarkTheme.css';

interface PassDarkUIProps {
    gamePhase: 'setup' | 'guess' | 'win';
    onSubmit: (value: string) => void;
    loading?: boolean;
    winner?: string | null;
    feedback?: {
        acertos: number;
        erros: number;
        permutados: number;
    } | null;
}

/**
 * PASS Game Dark Mode UI Component
 * Minimalist design with blockchain/cryptography aesthetic
 * Features: Dark mode, glassmorphism, neon accents, premium animations
 */
export function PassDarkUI({ gamePhase, onSubmit, loading = false, winner = null, feedback = null }: PassDarkUIProps) {
    const [inputValue, setInputValue] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputValue.trim() && !loading) {
            onSubmit(inputValue);
            setInputValue('');
        }
    };

    const getGuidanceText = () => {
        switch (gamePhase) {
            case 'setup':
                return 'Enter the secret for player two';
            case 'guess':
                return 'Enter your guess';
            case 'win':
                return '';
            default:
                return 'Waiting...';
        }
    };

    const getButtonText = () => {
        if (loading) return 'Processing...';
        switch (gamePhase) {
            case 'setup':
                return 'Register Secret';
            case 'guess':
                return 'Send Guess';
            default:
                return 'Confirm';
        }
    };

    return (
        <div className="pass-game-dark">
            <div className="pass-container">
                {/* Main Game Card */}
                {gamePhase !== 'win' && (
                    <div className="pass-card">
                        {/* Status/Guidance */}
                        <div className="pass-status">
                            <p className="pass-status-text">{getGuidanceText()}</p>
                            {gamePhase === 'guess' && feedback && (
                                <div className="pass-feedback-badges">
                                    <span className="pass-badge pass-badge-success">{feedback.acertos} Correct</span>
                                    <span className="pass-badge pass-badge-warning">{feedback.permutados} Misplaced</span>
                                    <span className="pass-badge pass-badge-error">{feedback.erros} Wrong</span>
                                </div>
                            )}
                        </div>

                        {/* Input Form */}
                        <form onSubmit={handleSubmit}>
                            <div className="pass-input-container">
                                <label htmlFor="pass-input" className="pass-input-label">
                                    {gamePhase === 'setup' ? 'Your Secret' : 'Your Guess'}
                                </label>
                                <input
                                    id="pass-input"
                                    type="text"
                                    className="pass-input"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder={gamePhase === 'setup' ? 'Enter a secret number' : 'Enter your guess'}
                                    disabled={loading}
                                    autoComplete="off"
                                    autoFocus
                                />
                            </div>

                            <button
                                type="submit"
                                className="pass-button"
                                disabled={loading || !inputValue.trim()}
                            >
                                {loading && <span className="pass-loading"></span>}
                                {!loading && getButtonText()}
                            </button>
                        </form>
                    </div>
                )}

                {/* Win State Overlay */}
                {gamePhase === 'win' && winner && (
                    <div className="pass-win-overlay">
                        <div className="pass-win-content">
                            <h2 className="pass-win-title">
                                {winner.toUpperCase()} WIN
                            </h2>
                            <p className="pass-win-subtitle">Blockchain Verified</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Example usage:
 * 
 * // Setup phase
 * <PassDarkUI 
 *   gamePhase="setup" 
 *   onSubmit={(secret) => handleSecretSubmit(secret)}
 *   loading={false}
 * />
 * 
 * // Guess phase
 * <PassDarkUI 
 *   gamePhase="guess" 
 *   onSubmit={(guess) => handleGuessSubmit(guess)}
 *   loading={false}
 * />
 * 
 * // Win state
 * <PassDarkUI 
 *   gamePhase="win" 
 *   onSubmit={() => {}}
 *   winner="PLAYER 1"
 * />
 */
