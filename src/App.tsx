import { useState, useCallback, useEffect, useRef } from 'react';
import WalletGate from './components/WalletGate';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import PauseOverlay from './components/PauseOverlay';
import GameOverOverlay from './components/GameOverOverlay';
import Leaderboard from './components/Leaderboard';
import { setMuted, isMuted } from './lib/audio.js';

/** Hook to detect when custom font is loaded */
function useFontReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    document.fonts.ready.then(() => setReady(true));
  }, []);
  return ready;
}

/**
 * Game phases:
 *  'wallet'   — show WalletGate (must connect + recordPlay before playing)
 *  'starting' — re-arm a game session via recordPlay() before another play
 *  'playing'  — game is active
 *  'paused'   — game is paused
 *  'over'     — game over screen
 *  'leaderboard' — leaderboard overlay (on top of wallet or over)
 */
export default function App() {
  const fontReady = useFontReady();
  const [phase, setPhase] = useState('wallet'); // start at wallet gate
  const [hud, setHud] = useState({ score: 0, level: 1, lives: 3, highScore: 0 });
  const [finalScore, setFinalScore] = useState(0);
  const [finalLevel, setFinalLevel] = useState(1);
  const [showLB, setShowLB] = useState(false);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [crtEnabled, setCrtEnabled] = useState(true);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close settings on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    if (showSettings) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSettings]);

  // Sync mute state
  useEffect(() => { setMuted(soundMuted); }, [soundMuted]);

  // Called when wallet gate confirms recordPlay tx
  const handleWalletReady = useCallback(() => {
    setPhase('playing');
  }, []);

  // Game engine HUD updates
  const handleScoreChange = useCallback((score: number, level: number, lives: number, highScore: number) => {
    setHud({ score, level, lives, highScore });
  }, []);

  // Game over callback
  const handleGameOver = useCallback((score: number, level: number) => {
    setFinalScore(score);
    setFinalLevel(level);
    setPhase('over');
  }, []);

  // Pause / resume
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showSettings) { setShowSettings(false); e.preventDefault(); return; }
        if (showLB) { setShowLB(false); e.preventDefault(); return; }
        if (phase === 'playing') { setPhase('paused'); e.preventDefault(); return; }
        if (phase === 'paused') { setPhase('playing'); e.preventDefault(); return; }
      }
      if (e.key === 'p' || e.key === 'P') {
        if (phase === 'playing') setPhase('paused');
        else if (phase === 'paused') setPhase('playing');
      }
      // M key to toggle mute during gameplay
      if (e.key === 'm' || e.key === 'M') {
        if (phase === 'playing' || phase === 'paused') {
          setSoundMuted(m => !m);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, showLB, showSettings]);

  // Play again (from game over) — must re-arm a game session via recordPlay()
  const handlePlayAgain = useCallback(() => {
    setPhase('starting');
  }, []);

  // Cancel re-entry from the "starting" gate — return to the game over screen.
  const handleCancelStart = useCallback(() => {
    setPhase('over');
  }, []);

  // Quit to wallet gate
  const handleQuit = useCallback(() => {
    setPhase('wallet');
  }, []);

  // Leaderboard open/close
  const handleOpenLB = useCallback(() => {
    setShowLB(true);
  }, []);

  const handleCloseLB = useCallback(() => {
    setShowLB(false);
  }, []);

  const isPlaying = phase === 'playing';

  if (!fontReady) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <div className="loading-text">LOADING...</div>
      </div>
    );
  }

  return (
    <div className={isPlaying ? 'playing' : ''}>
      {/* Ambient background effects — hidden during gameplay for performance */}
      {!isPlaying && (
        <>
          <div className="ambient-grid" />
          <div className="vignette" />
          <div className="floating-blocks">
            <div className="float-block cyan" />
            <div className="float-block blue" />
            <div className="float-block green" />
            <div className="float-block purple" />
            <div className="float-block tiny" />
          </div>
        </>
      )}

      {/* CRT overlay effect */}
      {crtEnabled && <div className="crt-overlay" />}

      {/* Settings gear — always visible except during play */}
      {!isPlaying && (
        <div className="settings-container" ref={settingsRef}>
          <button
            className="settings-gear"
            onClick={() => setShowSettings(s => !s)}
            aria-label="Settings"
          >
            ⚙
          </button>
          {showSettings && (
            <div className="settings-menu" role="menu">
              <button className="settings-item" onClick={() => {
                const next = !soundMuted;
                setSoundMuted(next);
              }}>
                {soundMuted ? '🔇 Sound: OFF' : '🔊 Sound: ON'}
              </button>
              <button className="settings-item" onClick={() => {
                setCrtEnabled(c => !c);
              }}>
                {crtEnabled ? '📺 CRT Effect: ON' : '📺 CRT Effect: OFF'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Game canvas — always mounted, engine starts/stops based on phase */}
      <GameCanvas
        playing={isPlaying}
        onScoreChange={handleScoreChange}
        onGameOver={handleGameOver}
      />

      {/* HUD — visible during play */}
      <HUD
        score={hud.score}
        level={hud.level}
        lives={hud.lives}
        highScore={hud.highScore}
        visible={isPlaying}
      />

      {/* Overlays — mutually exclusive by phase */}
      {(phase === 'wallet' || phase === 'starting') && (
        <WalletGate
          onReady={handleWalletReady}
          onViewLeaderboard={phase === 'wallet' ? handleOpenLB : undefined}
          onCancel={phase === 'starting' ? handleCancelStart : undefined}
        />
      )}
      {phase === 'paused' && (
        <PauseOverlay
          onResume={() => setPhase('playing')}
          onQuit={handleQuit}
        />
      )}
      {phase === 'over' && (
        <GameOverOverlay
          score={finalScore}
          level={finalLevel}
          onPlayAgain={handlePlayAgain}
          onQuit={handleQuit}
        />
      )}

      {/* Leaderboard — can overlay on top of wallet or over screens */}
      {showLB && <Leaderboard onClose={handleCloseLB} />}
    </div>
  );
}
