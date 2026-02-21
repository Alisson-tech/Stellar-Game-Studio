import { useState } from 'react';
import { PassDarkUI, PassStateIndicator, PassWinOverlay } from './components';

/**
 * PASS Game Demo - Dark Mode Design Showcase
 * 
 * This demo shows all three game phases:
 * 1. Setup - Player enters secret
 * 2. Guess - Player makes a guess
 * 3. Win - Winner is revealed
 * 
 * NO GAME LOGIC - Pure UI demonstration
 */
export function PassGameDemo() {
    const [currentPhase, setCurrentPhase] = useState<'setup' | 'guess' | 'win'>('setup');
    const [loading, setLoading] = useState(false);
    const [showWinOverlay, setShowWinOverlay] = useState(false);

    const handleSubmit = async (value: string) => {
        console.log('Submitted value:', value);

        // Simulate loading
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 1500));
        setLoading(false);

        // Cycle through phases for demo
        if (currentPhase === 'setup') {
            setCurrentPhase('guess');
        } else if (currentPhase === 'guess') {
            setCurrentPhase('win');
            setShowWinOverlay(true);
        }
    };

    const handleNewGame = () => {
        setShowWinOverlay(false);
        setCurrentPhase('setup');
    };

    return (
        <>
            <PassDarkUI
                gamePhase={currentPhase}
                onSubmit={handleSubmit}
                loading={loading}
                winner={currentPhase === 'win' ? 'PLAYER 1' : null}
            />

            {/* Alternative: Use separate win overlay component */}
            {showWinOverlay && (
                <PassWinOverlay
                    winner="PLAYER 1"
                    onClose={handleNewGame}
                    showCloseButton={true}
                />
            )}

            {/* Demo Controls - Remove in production */}
            <div style={{
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                background: 'rgba(0, 0, 0, 0.8)',
                padding: '1rem',
                borderRadius: '10px',
                color: 'white',
                fontSize: '0.75rem',
                zIndex: 9999
            }}>
                <p style={{ marginBottom: '0.5rem' }}>Demo Controls:</p>
                <button
                    onClick={() => setCurrentPhase('setup')}
                    style={{ marginRight: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
                >
                    Setup
                </button>
                <button
                    onClick={() => setCurrentPhase('guess')}
                    style={{ marginRight: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
                >
                    Guess
                </button>
                <button
                    onClick={() => { setCurrentPhase('win'); setShowWinOverlay(true); }}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
                >
                    Win
                </button>
            </div>
        </>
    );
}

/**
 * Example with State Indicator
 */
export function PassGameWithStateIndicator() {
    const [gameState, setGameState] = useState<'waiting' | 'setup' | 'playing' | 'verifying' | 'complete'>('setup');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (value: string) => {
        console.log('Submitted:', value);
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 1500));
        setLoading(false);

        // Progress through states
        if (gameState === 'setup') setGameState('playing');
        else if (gameState === 'playing') setGameState('verifying');
        else if (gameState === 'verifying') setGameState('complete');
    };

    return (
        <div className="pass-game-dark">
            <div className="pass-container">
                <header className="pass-header">
                    <h1 className="pass-title">PASS</h1>
                    <p className="pass-subtitle">Blockchain Cryptography Game</p>
                </header>

                <PassStateIndicator
                    currentState={gameState}
                    message={gameState === 'verifying' ? 'Verifying on blockchain...' : undefined}
                />

                <div className="pass-card">
                    <form onSubmit={(e) => { e.preventDefault(); handleSubmit('test'); }}>
                        <div className="pass-input-container">
                            <label htmlFor="input" className="pass-input-label">
                                Your Input
                            </label>
                            <input
                                id="input"
                                type="text"
                                className="pass-input"
                                placeholder="Type here"
                                disabled={loading}
                            />
                        </div>
                        <button type="submit" className="pass-button" disabled={loading}>
                            {loading ? 'Processing...' : 'Send'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
