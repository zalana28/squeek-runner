import { useMemo } from 'react';
import { loadLocalLB } from '../lib/storage.js';

export default function Leaderboard({ onClose }: { onClose: () => void }) {
  const entries = useMemo(() => loadLocalLB(), []);

  return (
    <div className="overlay" data-overlay>
      <div className="panel" role="dialog" aria-modal="true">
        <div className="info-heading">
          <button type="button" className="back-btn" onClick={onClose} aria-label="Back">←</button>
          <h1>LEADERBOARD</h1>
        </div>
        <h2>TOP RAW SKILL SCORES</h2>
        <ol className="leaderboard" id="lbList">
          {entries.length === 0 ? (
            <li className="small">No scores yet — be the first!</li>
          ) : (
            entries.slice(0, 10).map((row, index) => (
              <li key={`${row.ts}-${index}`}>
                <span>
                  <span className="rank">#{index + 1}</span>
                  <span className="level"> L{row.level}</span>
                  <span className="lb-addr">PACE {row.pacePermille === null ? '?' : (row.pacePermille / 1000).toFixed(2)}</span>
                </span>
                <span className="lb-score">
                  <span className="score">{row.rawScore}</span>
                  <span className="lb-final">FINAL {row.finalScore}</span>
                </span>
              </li>
            ))
          )}
        </ol>
        <p className="small" id="lbSource">Local only · sorted by raw score before contract multipliers and bonuses</p>
        <button type="button" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}
