import { useEffect, useRef, useState } from 'react';
import { createEngine, type EngineHud, type RunResult } from '../lib/engine.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../lib/world.js';
import type { PulseState } from '../hooks/useSqueekPulse.js';

export type GamePhase = 'menu' | 'playing' | 'paused' | 'over';

function paceLabel(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : (value / 1000).toFixed(2);
}

export default function GameCanvas({
  phase,
  pulse,
  hud,
  onScoreChange,
  onGameOver,
  onPause,
}: {
  phase: GamePhase;
  pulse: PulseState;
  hud: EngineHud;
  onScoreChange?: (hud: EngineHud) => void;
  onGameOver?: (result: RunResult) => void;
  onPause: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);
  const previousPhaseRef = useRef<GamePhase>(phase);
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    engineRef.current = createEngine(canvas, { onScoreChange, onGameOver });

    function resize() {
      const rect = stage!.getBoundingClientRect();
      const style = window.getComputedStyle(stage!);
      const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const availableWidth = Math.max(1, Math.floor(rect.width - horizontalPadding));
      const availableHeight = Math.max(1, Math.floor(rect.height - verticalPadding));
      const ratio = GAME_WIDTH / GAME_HEIGHT;
      const height = Math.min(availableHeight, Math.floor(availableWidth / ratio));
      const width = Math.floor(height * ratio);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      engineRef.current?.resize(width, height);
    }

    resize();
    requestAnimationFrame(() => requestAnimationFrame(resize));

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(resize);
    observer?.observe(stage);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      engineRef.current?.stop();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    engineRef.current?.updatePulse(pulse);
  }, [pulse]);

  useEffect(() => {
    const previous = previousPhaseRef.current;
    if (phase === 'playing') {
      if (previous === 'paused') engineRef.current?.resume();
      else engineRef.current?.start();
    } else if (phase === 'paused') {
      engineRef.current?.pause();
    } else {
      engineRef.current?.stop();
    }
    previousPhaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase !== 'playing') {
      setShowSwipeHint(false);
      return;
    }
    const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
    if (!isTouch) return;
    setShowSwipeHint(true);
    const timer = window.setTimeout(() => setShowSwipeHint(false), 4200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => engineRef.current?.keyDown(event);
    const onKeyUp = (event: KeyboardEvent) => engineRef.current?.keyUp(event);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    const preventScroll = (event: Event) => event.preventDefault();
    window.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('wheel', preventScroll, { passive: false });
    return () => {
      window.removeEventListener('touchmove', preventScroll);
      window.removeEventListener('wheel', preventScroll);
    };
  }, [phase]);

  const press = (action: 'touchUp' | 'touchDown' | 'touchLeft' | 'touchRight' | 'touchDash') => (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    engineRef.current?.[action]();
  };

  const hearts = '♥'.repeat(Math.max(0, hud.lives)) + '♡'.repeat(Math.max(0, 3 - hud.lives));
  const showArcadeBar = phase === 'playing' || phase === 'paused';

  return (
    <div className="arena-column">
      <div className="canvas-stage" ref={stageRef}>
        <canvas ref={canvasRef} id="game" width={GAME_WIDTH} height={GAME_HEIGHT} />
        {showArcadeBar && (
          <>
            <div className="arcade-bar" aria-label="Arcade status">
              <div className="arcade-lives" aria-label={`${hud.lives} lives remaining`}>{hearts}</div>
              <div className="score-pill">
                <span className="score-caption">SCORE</span>
                <strong className="score-number">{hud.score}</strong>
                <span className="score-raw">RAW {hud.rawScore}</span>
              </div>
              <button type="button" className="pause-btn" onClick={onPause} aria-label="Pause game">II</button>
            </div>
            <div className="arcade-status" aria-label="Squeekchain compact status">
              <span>PACE {paceLabel(pulse.pace?.pacePermille)}</span>
              <span>CHARGES {hud.charges}/5</span>
              <span className={`status-${pulse.status}`}>
                {pulse.status === 'unverified' ? 'ARCADE' : pulse.status.toUpperCase()}
              </span>
            </div>
          </>
        )}
        {showSwipeHint && (
          <div className="swipe-hint" aria-hidden="true">
            <span className="swipe-arrow">⌃</span>
            <span>SWIPE UP TO MOVE</span>
          </div>
        )}
      </div>
      {phase === 'playing' && (
        <div className="touch-ctrl" id="touchControls">
          <div className="dpad">
            <button type="button" className="tbtn" onPointerDown={press('touchUp')} aria-label="Move up">▲</button>
            <div className="touch-row">
              <button type="button" className="tbtn" onPointerDown={press('touchLeft')} aria-label="Move left">◀</button>
              <button type="button" className="tbtn" onPointerDown={press('touchDown')} aria-label="Move down">▼</button>
              <button type="button" className="tbtn" onPointerDown={press('touchRight')} aria-label="Move right">▶</button>
            </div>
          </div>
          <button type="button" className="tbtn dash-btn" onPointerDown={press('touchDash')} aria-label="Use Squeek Dash">
            DASH
          </button>
        </div>
      )}
    </div>
  );
}
