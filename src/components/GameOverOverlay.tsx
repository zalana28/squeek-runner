import { useEffect, useRef, useState } from 'react';
import type { RunResult } from '../lib/engine.js';
import { saveLocalScore } from '../lib/storage.js';

export default function GameOverOverlay({
  result,
  onPlayAgain,
  onQuit,
}: {
  result: RunResult;
  onPlayAgain: () => void;
  onQuit: () => void;
}) {
  const [status, setStatus] = useState('');
  const saved = useRef(false);

  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    saveLocalScore(result);
  }, [result]);

  async function handleShare() {
    const text = `I scored ${result.finalScore} in Squeek Runner (raw ${result.rawScore}) on level ${result.level}. Can you beat me?`;
    try {
      if (navigator.share) await navigator.share({ title: 'Squeek Runner', text, url: window.location.href });
      else {
        await navigator.clipboard.writeText(`${text} ${window.location.href}`);
        setStatus('Copied to clipboard.');
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setStatus('Unable to share right now.');
    }
  }

  return (
    <div className="overlay" data-overlay>
      <div className="panel" role="dialog" aria-modal="true">
        <h1>GAME OVER</h1>
        <h2>FINAL {result.finalScore} · RAW {result.rawScore} · LVL {result.level}</h2>
        <div className="run-metadata">
          <span>24H PACE {result.pacePermille === null ? 'UNKNOWN' : (result.pacePermille / 1000).toFixed(2)}</span>
          <span>SURGE BLOCKS {result.surgeBlocks}</span>
          <span>SNAPSHOT {result.snapshotBlock ?? 'UNAVAILABLE'}</span>
        </div>
        <p className="small">Saved locally. Rankings use raw skill score; final score includes verified contract bonuses.</p>
        <p className="small">{status}</p>
        <button type="button" className="alt" onClick={handleShare}>SHARE</button>
        <button type="button" className="primary" onClick={onPlayAgain}>PLAY AGAIN</button>
        <button type="button" className="alt" onClick={onQuit}>MAIN MENU</button>
      </div>
    </div>
  );
}
