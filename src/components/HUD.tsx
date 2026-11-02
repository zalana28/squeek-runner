import type { EngineHud } from '../lib/engine.js';
import type { PulseState } from '../hooks/useSqueekPulse.js';

function paceLabel(value: number | null | undefined) {
  return value === null || value === undefined ? 'UNKNOWN' : (value / 1000).toFixed(2);
}

function settledTime(pulse: PulseState) {
  if (!pulse.snapshot) return '—';
  return `${new Date(Number(pulse.snapshot.settledAt) * 1000).toISOString().slice(11, 16)} UTC`;
}

export default function HUD({
  hud,
  pulse,
  visible,
  onInfo,
}: {
  hud: EngineHud;
  pulse: PulseState;
  visible: boolean;
  onInfo: () => void;
}) {
  if (!visible) return null;
  const hearts = '♥'.repeat(Math.max(0, hud.lives)) + '♡'.repeat(Math.max(0, 3 - hud.lives));
  const pace = pulse.pace?.pacePermille ?? null;
  const filled = pace === null ? 0 : Math.round(pace / 200);
  const statusLabel = pulse.status === 'unverified' ? 'ARCADE (UNVERIFIED)' : pulse.status.toUpperCase();
  const settlementLag = pulse.snapshot !== null && pulse.snapshot.lagRounds > 3n;

  return (
    <section className={`hud hud-${pulse.status}`} aria-label="Squeekchain status">
      <div className="hud-header">
        <div className="hud-score">
          <span className="label">SCORE</span>
          <span className="score-value">{hud.score}</span>
          <span className="hud-detail">RAW {hud.rawScore} · BEST {hud.highScore}</span>
        </div>
        <button type="button" className="hud-info" onClick={onInfo} aria-label="What these values mean">?</button>
      </div>

      <div className="hud-run-strip">
        <span>LVL {hud.level}</span>
        <span className="hud-hearts">{hearts}</span>
      </div>

      <div className="pulse-grid">
        <div className="pulse-item">
          <span className="label">24H PACE</span>
          <span className="pulse-value">
            <span className="pace-meter" aria-hidden="true">{'▮'.repeat(filled)}{'▯'.repeat(5 - filled)}</span>
            {' '}{paceLabel(pace)}
          </span>
          <span className="hud-detail">24 / 144: {paceLabel(pulse.shortPace?.pacePermille)} / {paceLabel(pace)}</span>
        </div>
        <div className="pulse-item">
          <span className="label">CHARGES</span>
          <span className="pulse-value charge-value">{hud.charges}/5</span>
          <span className="hud-detail">{hud.dashActive ? 'DASH ACTIVE' : 'SPACE / DASH'}</span>
        </div>
        <div className="pulse-item">
          <span className="label">SETTLED</span>
          <span className="pulse-value">+{pulse.surge?.deltaBlocks.toString() ?? '0'}</span>
          <span className="hud-detail">THROUGH {settledTime(pulse)}</span>
        </div>
        <div className="pulse-item">
          <span className="label">LAG</span>
          <span className="pulse-value">{pulse.snapshot?.lagRounds.toString() ?? '—'}</span>
          <span className="hud-detail">ROUNDS</span>
        </div>
      </div>

      <div className="source-stack">
        <span className={`source-status status-${pulse.status}`}>{statusLabel}</span>
        {settlementLag && <span className="chain-warning">SETTLEMENT LAG</span>}
        {pulse.snapshot?.state.paused && <span className="chain-warning">CORE PAUSED</span>}
        {hud.tailwind && <span className="tailwind-badge">TAILWIND ×1.25</span>}
        <span className="source-value">docs-record · blk {pulse.snapshot?.blockNumber.toString() ?? '—'}</span>
      </div>
      {hud.surgeActive && <div className="surge-flash">SETTLEMENT SURGE · SCORE ×2</div>}
      {pulse.error && <div className="pulse-error">{pulse.error}</div>}
    </section>
  );
}
