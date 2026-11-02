import { useState, useCallback, useEffect, useRef } from 'react';
import GameCanvas, { type GamePhase } from './components/GameCanvas';
import HUD from './components/HUD';
import PauseOverlay from './components/PauseOverlay';
import GameOverOverlay from './components/GameOverOverlay';
import Leaderboard from './components/Leaderboard';
import InfoPanel from './components/InfoPanel';
import { setMuted } from './lib/audio.js';
import type { EngineHud, RunResult } from './lib/engine.js';
import { useSqueekPulse } from './hooks/useSqueekPulse.js';

const initialHud: EngineHud = {
  score: 0,
  rawScore: 0,
  level: 1,
  lives: 3,
  highScore: 0,
  charges: 0,
  dashActive: false,
  surgeActive: false,
  tailwind: false,
};

function useFontReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    document.fonts.ready.then(() => setReady(true));
  }, []);
  return ready;
}

export default function App() {
  const fontReady = useFontReady();
  const pulse = useSqueekPulse();
  const [phase, setPhase] = useState<GamePhase>('menu');
  const [hud, setHud] = useState<EngineHud>(initialHud);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [showLB, setShowLB] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [crtEnabled, setCrtEnabled] = useState(true);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    }
    if (showSettings) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSettings]);

  useEffect(() => { setMuted(soundMuted); }, [soundMuted]);

  const handleScoreChange = useCallback((nextHud: EngineHud) => setHud(nextHud), []);
  const handleGameOver = useCallback((result: RunResult) => {
    setRunResult(result);
    setPhase('over');
  }, []);

  const openInfo = useCallback(() => {
    setPhase('paused');
    setShowInfo(true);
  }, []);
  const closeInfo = useCallback(() => {
    setShowInfo(false);
    setPhase('playing');
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (showInfo) { closeInfo(); event.preventDefault(); return; }
        if (showSettings) { setShowSettings(false); event.preventDefault(); return; }
        if (showLB) { setShowLB(false); event.preventDefault(); return; }
        if (phase === 'playing') { setPhase('paused'); event.preventDefault(); return; }
        if (phase === 'paused') { setPhase('playing'); event.preventDefault(); return; }
      }
      if (showInfo) return;
      if (event.key === 'p' || event.key === 'P') {
        if (phase === 'playing') setPhase('paused');
        else if (phase === 'paused') setPhase('playing');
      }
      if (event.key === 'm' || event.key === 'M') {
        if (phase === 'playing' || phase === 'paused') setSoundMuted((muted) => !muted);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, showLB, showSettings, showInfo, closeInfo]);

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

      {crtEnabled && <div className="crt-overlay" />}

      {!isPlaying && (
        <div className="settings-container" ref={settingsRef}>
          <button type="button" className="settings-gear" onClick={() => setShowSettings((show) => !show)} aria-label="Settings">
            SET
          </button>
          {showSettings && (
            <div className="settings-menu" role="menu">
              <button type="button" className="settings-item" onClick={() => setSoundMuted((muted) => !muted)}>
                Sound: {soundMuted ? 'OFF' : 'ON'}
              </button>
              <button type="button" className="settings-item" onClick={() => setCrtEnabled((enabled) => !enabled)}>
                CRT Effect: {crtEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          )}
        </div>
      )}

      <main className="game-shell">
        <GameCanvas
          phase={phase}
          pulse={pulse}
          hud={hud}
          onScoreChange={handleScoreChange}
          onGameOver={handleGameOver}
          onPause={() => setPhase('paused')}
        />
        <HUD hud={hud} pulse={pulse} visible={phase === 'playing' || phase === 'paused'} onInfo={openInfo} />
      </main>

      {phase === 'menu' && (
        <div className="overlay" data-overlay>
          <div className="panel" role="dialog" aria-modal="true" aria-labelledby="game-title">
            <div className="hero-title" id="game-title">SQUEEK RUNNER</div>
            <div className="hero-subtitle">WHEELY9000 ARCADE</div>
            <p>Cross the lanes. A real hamster&apos;s settled work sets the pace.</p>
            <p className="small">ARROWS / WASD TO MOVE · SPACE TO DASH<br />+1 CHARGE EVERY 8 ROWS</p>
            <button type="button" className="primary" onClick={() => setPhase('playing')}>PLAY</button>
            <button type="button" className="alt" onClick={() => setShowLB(true)}>LEADERBOARD</button>
            <p className="small">Sepolia read-only · No wallet · No transactions</p>
          </div>
        </div>
      )}

      {phase === 'paused' && !showInfo && (
        <PauseOverlay onResume={() => setPhase('playing')} onQuit={() => setPhase('menu')} />
      )}
      {phase === 'over' && runResult && (
        <GameOverOverlay
          result={runResult}
          onPlayAgain={() => { setRunResult(null); setPhase('playing'); }}
          onQuit={() => { setRunResult(null); setPhase('menu'); }}
        />
      )}
      {showLB && <Leaderboard onClose={() => setShowLB(false)} />}
      {showInfo && <InfoPanel pulse={pulse} onClose={closeInfo} />}
    </div>
  );
}
