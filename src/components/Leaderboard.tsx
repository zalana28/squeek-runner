import { useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { FROGGER_LEADERBOARD_ADDRESS } from '../config/wagmi.js';
import { base } from '../config/chain.js';
import FROGGER_ABI from '../abi/FroggerLeaderboard.json';
import { loadLocalLB, escapeHtml } from '../lib/onchain.js';

/** Shape of an onchain ScoreEntry from FroggerLeaderboard.sol */
type ScoreEntry = {
  player: string;
  name: string;
  score: bigint;
  level: number;
  timestamp: bigint;
};

/**
 * Leaderboard overlay — shows onchain top scores with fallback to local scores.
 * Shows wallet address for verification.
 */
export default function Leaderboard({
  onClose,
}: {
  onClose: () => void;
}) {
  // Onchain leaderboard read
  const { data: topScores, error } = useReadContract({
    address: FROGGER_LEADERBOARD_ADDRESS,
    abi: FROGGER_ABI,
    functionName: 'getTopScores',
    chainId: base.id,
    query: {
      staleTime: 60_000, // 1 min cache
    },
  }) as { data: ScoreEntry[] | undefined; error: Error | null };

  // Local leaderboard
  const localLB = useMemo(() => loadLocalLB(), []);

  // Combine: prefer onchain, fallback to local
  const entries = useMemo(() => {
    if (topScores && Array.isArray(topScores)) {
      const valid = topScores.filter(
        (e) => e.player !== '0x0000000000000000000000000000000000000000' && e.score > 0n,
      );
      return valid
        .map((e) => ({
          player: e.player,
          name: e.name || e.player.slice(2, 6) + '..' + e.player.slice(-4),
          score: Number(e.score),
          level: e.level,
        }))
        .sort((a, b) => b.score - a.score);
    }
    return localLB;
  }, [topScores, localLB]);

  const source = topScores ? 'Onchain' : 'Local scores';

  return (
    <div className="overlay" data-overlay>
      <div className="panel" role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <button className="back-btn" onClick={onClose} aria-label="Back">←</button>
          <h1>LEADERBOARD</h1>
        </div>
        <h2>🐸 TOP FROGGERS 🐸</h2>
        {error && <p className="small error">⚠ Failed to load onchain scores</p>}
        <ol className="leaderboard" id="lbList">
          {entries.length === 0 ? (
            <li className="small">No scores yet — be the first!</li>
          ) : (
            entries.slice(0, 10).map((row, i) => (
              <li key={i}>
                <span>
                  <span className="rank">#{i + 1}</span>{' '}
                  <span className="lb-name">{escapeHtml(row.name)}</span>
                  {row.player && (
                    <span className="lb-addr" title={row.player}>
                      {' '}{row.player.slice(2, 6)}..{row.player.slice(-4)}
                    </span>
                  )}
                  {row.level != null && <span className="level"> L{row.level}</span>}
                </span>
                <span className="score">{row.score}</span>
              </li>
            ))
          )}
        </ol>
        <p className="small" id="lbSource">{source}</p>
        <button onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}
