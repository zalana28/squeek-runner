/**
 * Pause overlay — shown when player presses ESC or P during gameplay.
 * Buttons: Resume, Quit (back to wallet gate).
 */
export default function PauseOverlay({
  onResume,
  onQuit,
}: {
  onResume: () => void;
  onQuit: () => void;
}) {
  return (
    <div className="overlay" data-overlay>
      <div className="panel" role="dialog" aria-modal="true">
        <h1>PAUSED</h1>
        <h2>🐸 GAME PAUSED 🐸</h2>
        <button onClick={onResume}>▶ RESUME</button>
        <button className="alt" onClick={onQuit}>🏠 QUIT</button>
      </div>
    </div>
  );
}
