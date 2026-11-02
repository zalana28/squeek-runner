import { useRef, useEffect, useCallback, useState } from 'react';
import { createEngine } from '../lib/engine.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../lib/sprites.js';

/**
 * GameCanvas — mounts the canvas and initializes the game engine.
 *
 * Props:
 *   playing  {boolean} — true when the game should be running
 *   onScoreChange(score: number, level: number, lives: number)
 *   onGameOver(score: number, level: number)
 */
export default function GameCanvas({
  playing,
  onScoreChange,
  onGameOver,
}: {
  playing: boolean;
  onScoreChange?: (score: number, level: number, lives: number, highScore: number) => void;
  onGameOver?: (score: number, level: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);
  const [, setHud] = useState({ score: 0, level: 1, lives: 3, highScore: 0 });

  // Create engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || engineRef.current) return;
    engineRef.current = createEngine(canvas, {
      onScoreChange: (score, level, lives, highScore) => {
        setHud({ score, level, lives, highScore: highScore ?? 0 });
        onScoreChange?.(score, level, lives, highScore ?? 0);
      },
      onGameOver: (score, level) => {
        onGameOver?.(score, level);
      },
    });

    // Resize handler — fit canvas to viewport while maintaining aspect ratio
    function resize() {
      const ratio = CANVAS_WIDTH / CANVAS_HEIGHT;
      const isTouchDevice = 'ontouchstart' in window;
      const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      // On touch devices, reserve 96px at bottom for control buttons + safe area.
      const controlSpace = isTouchDevice ? 96 : 0;
      const effectiveVh = vh - controlSpace;
      const winRatio = vw / effectiveVh;
      let cw: number, ch: number;
      if (winRatio > ratio) { ch = effectiveVh; cw = ch * ratio; }
      else { cw = vw; ch = cw / ratio; }
      canvas.style.width = Math.floor(cw) + 'px';
      canvas.style.height = Math.floor(ch) + 'px';
    }
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', resize);
      engineRef.current?.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start/stop engine based on `playing` prop
  useEffect(() => {
    if (playing) {
      engineRef.current?.start();
    } else {
      engineRef.current?.stop();
    }
  }, [playing]);

  // Keyboard input
  useEffect(() => {
    const onKD = (e: KeyboardEvent) => {
      engineRef.current?.keyDown(e);
    };
    const onKU = (e: KeyboardEvent) => {
      engineRef.current?.keyUp(e);
    };
    window.addEventListener('keydown', onKD);
    window.addEventListener('keyup', onKU);
    return () => {
      window.removeEventListener('keydown', onKD);
      window.removeEventListener('keyup', onKU);
    };
  }, []);

  // Prevent page scrolling while playing
  useEffect(() => {
    if (!playing) return;
    const preventScroll = (e: Event) => e.preventDefault();
    window.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('wheel', preventScroll, { passive: false });
    return () => {
      window.removeEventListener('touchmove', preventScroll);
      window.removeEventListener('wheel', preventScroll);
    };
  }, [playing]);

  // Touch control binding helpers
  const bindTouch = useCallback((id: string, onDown: () => void, onUp: () => void) => {
    const el = document.getElementById(id);
    if (!el) return () => {};
    const press = (e: Event) => { e.preventDefault(); onDown(); };
    const release = (e: Event) => { e.preventDefault(); onUp(); };
    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('touchend', release);
    el.addEventListener('touchcancel', release);
    el.addEventListener('mousedown', press);
    el.addEventListener('mouseup', release);
    el.addEventListener('mouseleave', release);
    return () => {
      el.removeEventListener('touchstart', press);
      el.removeEventListener('touchend', release);
      el.removeEventListener('touchcancel', release);
      el.removeEventListener('mousedown', press);
      el.removeEventListener('mouseup', release);
      el.removeEventListener('mouseleave', release);
    };
  }, []);

  // Bind touch controls
  useEffect(() => {
    if (!playing) return;
    const unbindU = bindTouch('btnUp', () => engineRef.current?.touchUp(), () => {});
    const unbindD = bindTouch('btnDown', () => engineRef.current?.touchDown(), () => {});
    const unbindL = bindTouch('btnLeft', () => engineRef.current?.touchLeft(), () => {});
    const unbindR = bindTouch('btnRight', () => engineRef.current?.touchRight(), () => {});
    return () => { unbindU(); unbindD(); unbindL(); unbindR(); };
  }, [playing, bindTouch]);

  return (
    <>
      <canvas ref={canvasRef} id="game" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />

      {/* Touch controls for mobile — D-pad style */}
      <div className="touch-ctrl left" id="touchControls">
        <div className="tbtn" id="btnUp">▲</div>
        <div className="touch-row">
          <div className="tbtn" id="btnLeft">◀</div>
          <div className="tbtn" id="btnDown">▼</div>
          <div className="tbtn" id="btnRight">▶</div>
        </div>
      </div>
    </>
  );
}
