/**
 * HUD overlay showing SCORE, LEVEL, LIVES, and BEST.
 * Shown during gameplay, hidden otherwise.
 */
export default function HUD({
  score = 0,
  level = 1,
  lives = 3,
  highScore = 0,
  visible = true,
}: {
  score?: number;
  level?: number;
  lives?: number;
  highScore?: number;
  visible?: boolean;
}) {
  if (!visible) return null;
  const hearts = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
  return (
    <div className="hud">
      <div className="hud-block">
        <span className="label">SCORE</span>
        <span className="val">{score}</span>
      </div>
      <div className="hud-block" style={{ textAlign: 'center' }}>
        <span className="label">LEVEL</span>
        <span className="val">{level}</span>
      </div>
      <div className="hud-block" style={{ textAlign: 'center' }}>
        <span className="label">LIVES</span>
        <span className="val hearts">{hearts}</span>
      </div>
      <div className="hud-block" style={{ textAlign: 'center' }}>
        <span className="label">BEST</span>
        <span className="val" style={{ color: 'var(--base-cyan)' }}>{highScore}</span>
      </div>
    </div>
  );
}
