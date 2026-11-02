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
        <h2>WHEEL ON STANDBY</h2>
        <button onClick={onResume}>RESUME</button>
        <button className="alt" onClick={onQuit}>MAIN MENU</button>
      </div>
    </div>
  );
}
