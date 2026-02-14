# PASS Game - Dark Mode Design Guide

## 🎨 Quick Start

### Import Components

```tsx
import { PassDarkUI, PassStateIndicator, PassWinOverlay } from '@/games/pass/components';
```

### Basic Usage

```tsx
function MyGame() {
  const [phase, setPhase] = useState<'setup' | 'guess' | 'win'>('setup');

  return (
    <PassDarkUI
      gamePhase={phase}
      onSubmit={(value) => console.log(value)}
      loading={false}
      winner={null}
    />
  );
}
```

## 📁 File Structure

```
src/games/pass/
├── components/
│   ├── PassDarkUI.tsx          # Main UI component
│   ├── PassStateIndicator.tsx  # State indicator
│   ├── PassWinOverlay.tsx      # Win screen overlay
│   └── index.ts                # Barrel exports
├── styles/
│   └── PassDarkTheme.css       # Complete CSS theme
└── PassGameDemo.tsx            # Demo/example file
```

## 🎯 Components

### 1. PassDarkUI (Main Component)

**Props:**
- `gamePhase`: 'setup' | 'guess' | 'win'
- `onSubmit`: (value: string) => void
- `loading?`: boolean
- `winner?`: string | null

**Features:**
- Auto-switches guidance text based on phase
- Handles form submission
- Shows loading state
- Displays win overlay when phase is 'win'

### 2. PassStateIndicator

**Props:**
- `currentState`: 'waiting' | 'setup' | 'playing' | 'verifying' | 'complete'
- `message?`: string (optional custom message)

**Usage:**
```tsx
<PassStateIndicator 
  currentState="playing"
  message="Aguardando oponente..."
/>
```

### 3. PassWinOverlay

**Props:**
- `winner`: string (player name)
- `onClose?`: () => void
- `showCloseButton?`: boolean

**Usage:**
```tsx
<PassWinOverlay
  winner="PLAYER 1"
  onClose={handleNewGame}
  showCloseButton={true}
/>
```

## 🎨 Design Tokens

### Colors
```css
--pass-bg-primary: #0B0E14       /* Deep charcoal */
--pass-neon-blue: #00D9FF         /* Neon accent */
--pass-gold: #FFD700              /* Win state */
--pass-text-primary: #FFFFFF      /* Primary text */
```

### Typography
```css
font-family: 'Inter', sans-serif
letter-spacing: 0.3em - 0.5em (titles)
font-weight: 300 - 700
```

## 🎬 Animations

All components include smooth animations:
- Fade in/out effects
- Slide transitions
- Scale animations
- Shimmer effects (win state)

## 📱 Responsive

Mobile breakpoint: 640px
- Reduced font sizes
- Adjusted spacing
- Maintained readability

## ♿ Accessibility

- Keyboard navigation
- Focus-visible outlines
- High contrast
- Semantic HTML

## 🔧 Integration Example

```tsx
import { PassDarkUI } from '@/games/pass/components';
import { passService } from '@/games/pass/passService';

function PassGame() {
  const [phase, setPhase] = useState<'setup' | 'guess' | 'win'>('setup');
  const [loading, setLoading] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);

  const handleSubmit = async (value: string) => {
    setLoading(true);
    
    try {
      if (phase === 'setup') {
        // Register secret
        await passService.registerSecret(sessionId, userAddress, value);
        setPhase('guess');
      } else if (phase === 'guess') {
        // Submit guess
        await passService.submitGuess(sessionId, userAddress, value);
        // Check for winner
        const game = await passService.getGame(sessionId);
        if (game.winner) {
          setWinner(game.winner);
          setPhase('win');
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PassDarkUI
      gamePhase={phase}
      onSubmit={handleSubmit}
      loading={loading}
      winner={winner}
    />
  );
}
```

## 🎯 Design Philosophy

- **Minimalist**: Clean, focused interface
- **Dark Mode**: Premium, easy on eyes
- **Blockchain Aesthetic**: Neon accents, tech feel
- **Glassmorphism**: Modern frosted glass effects
- **Premium**: Smooth animations, attention to detail

## 📝 Notes

- No game logic in UI components
- Pure presentation layer
- Easy to integrate with existing logic
- Follows project architecture
- Fully typed with TypeScript
