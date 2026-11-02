import type { PulseState } from '../hooks/useSqueekPulse.js';
import record from '../config/record.json';

export default function InfoPanel({ pulse, onClose }: { pulse: PulseState; onClose: () => void }) {
  return (
    <div className="overlay info-overlay" data-overlay>
      <div className="panel info-panel" role="dialog" aria-modal="true" aria-labelledby="info-title">
        <div className="info-heading">
          <button type="button" className="back-btn" onClick={onClose} aria-label="Back">←</button>
          <h1 id="info-title">WHAT THIS MEANS</h1>
        </div>

        <section className="info-section">
          <h2>SETTLED, NOT LIVE WHEEL DATA</h2>
          <p>24H PACE is the average settled Squeek blocks across the last 144 certified rounds. It sets lane speed when a level starts. It does not mean the hamster is running right now.</p>
          <p>SETTLED +n is the block change between two valid snapshots. New rounds after SETTLED THROUGH are unknown, never treated as zero.</p>
        </section>

        <section className="info-section">
          <h2>SKILL + SETTLEMENT</h2>
          <p>Earn 1 Charge every 8 rows crossed. Verified settlements can add up to 3 more. Spend 1 Charge on Dash: 3 seconds invulnerable and double engine score. Surge only boosts score; it never changes lane speed.</p>
        </section>

        <section className="info-section">
          <h2>SEPOLIA TESTNET ONLY</h2>
          <p>No wallet or transaction is needed. SQK and Squeek testnet assets have no monetary value, and this game does not distribute them.</p>
        </section>

        <section className="info-section">
          <h2>VERIFY THE SOURCE</h2>
          <p>SOURCE docs-record · block {pulse.snapshot?.blockNumber.toString() ?? 'unavailable'}</p>
          <p className="info-address">Core {record.contracts.SqueekCore.address}</p>
          <p>The build checks chain ID, proxy implementation and runtime hash, contract links, configuration, and certified frontier. One mismatch switches the game to ARCADE (UNVERIFIED), without a fallback graph.</p>
          <p>Developers can reproduce the checks with <code>npm run verify</code> and <code>npm run compare-hud</code>.</p>
          <a href="https://docs.squeekchain.com/" target="_blank" rel="noreferrer">Squeekchain documentation</a>
        </section>

        <button type="button" className="primary" onClick={onClose}>BACK TO GAME</button>
      </div>
    </div>
  );
}
