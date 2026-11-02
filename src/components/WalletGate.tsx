import { useEffect, useState } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useReadContract,
} from 'wagmi';
import { formatEther } from 'viem';
import { FROGGER_LEADERBOARD_ADDRESS } from '../config/wagmi.js';
import { base } from '../config/chain.js';
import FROGGER_ABI from '../abi/FroggerLeaderboard.json';
import { useBuilderCodeTransaction } from '../hooks/useBuilderCodeTransaction.js';

// Emoji map for known wallet connectors (fallback to generic 🔗)
const CONNECTOR_ICONS: Record<string, string> = {
  baseAccount: '🔵',
  coinbaseWallet: '🔵',
  metaMask: '🦊',
  injected: '🌐',
  walletConnect: '🔷',
  rabby: '🐰',
  okxWallet: '🟢',
  phantom: '👻',
  braveWallet: '🦁',
  tronLink: '🔴',
};

function getConnectorIcon(name: string, id: string): string {
  const lowerId = id.toLowerCase();
  if (CONNECTOR_ICONS[id]) return CONNECTOR_ICONS[id];
  if (lowerId.includes('coinbase') || lowerId.includes('baseaccount')) return '🔵';
  if (lowerId.includes('metamask') || lowerId.includes('metaMask')) return '🦊';
  if (lowerId.includes('rabby')) return '🐰';
  if (lowerId.includes('okx')) return '🟢';
  if (lowerId.includes('phantom')) return '👻';
  if (lowerId.includes('brave')) return '🦁';
  if (lowerId.includes('tron')) return '🔴';
  if (lowerId.includes('injected')) return '🌐';
  if (lowerId.includes('walletconnect')) return '🔷';
  return '🔗';
}

/**
 * WalletGate — full-screen arcade-style overlay shown BEFORE the player
 * can start the game.
 *
 * Flow:
 * 1. Show hero title + "Connect Wallet" button (opens connector modal)
 * 2. After connect: ensure Base chain
 * 3. Player clicks "Enter Game & Play" → sends recordPlay() tx with the
 *    ERC-8021 builder code suffix appended to calldata (payable with playFee)
 * 4. Wait for tx confirmation → callback onReady()
 */
export default function WalletGate({
  onReady,
  onViewLeaderboard,
  onCancel,
}: {
  onReady: () => void;
  onViewLeaderboard?: () => void;
  /** When set, this gate is re-arming a game session (Play Again path). */
  onCancel?: () => void;
}) {
  const [showModal, setShowModal] = useState(false);

  const { address, isConnected, isConnecting, isReconnecting, connector } = useAccount();
  const { connect, connectors, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const { send, status, hash, error } = useBuilderCodeTransaction({
    address: FROGGER_LEADERBOARD_ADDRESS,
    abi: FROGGER_ABI,
    chainId: base.id,
  });

  const isPending = status === 'pending';
  const isConfirming = status === 'confirming';
  const isSuccess = status === 'success';
  const isError = status === 'error';

  // Read playFee from contract
  const { data: playFee } = useReadContract({
    address: FROGGER_LEADERBOARD_ADDRESS,
    abi: FROGGER_ABI,
    functionName: 'playFee',
    chainId: base.id,
    query: { enabled: isConnected },
  });

  // Once the call settles successfully, unlock the game.
  useEffect(() => {
    if (isSuccess) onReady();
  }, [isSuccess, onReady]);

  async function handleConnect(connectorId: string) {
    const c = connectors.find((c) => c.id === connectorId);
    if (!c) return;
    try {
      await connect({ connector: c });
      // After successful connection, ensure we're on Base
      try {
        await switchChain({ chainId: base.id });
      } catch {
        // may already be on Base
      }
      // Close modal after successful connect attempt
      setShowModal(false);
    } catch {
      // connection error handled by useConnect error state
    }
  }

  function handleEnterGame() {
    // recordPlay() — ERC-8021 builder code suffix attached via the hook
    send('recordPlay', [], {
      value: (playFee as bigint) ?? BigInt(0),
    });
  }

  // Shorten address for display (onchain name format: ABC1..2D3F, ≤12 chars)
  const shortAddress = address
    ? `${address.slice(2, 6)}..${address.slice(-4)}`
    : '';

  if (isReconnecting) {
    return (
      <div className="overlay">
        <div className="panel">
          <div className="hero-mascot">🐸</div>
          <div className="hero-title">BASE FROGGER</div>
          <div className="hero-subtitle">RECONNECTING...</div>
          <p>Restoring wallet session...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ---- Wallet Connector Modal ---- */}
      {showModal && (
        <div
          className="wallet-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Select wallet"
        >
          <div className="wallet-modal">
            <h3>🐸 CONNECT WALLET</h3>
            {connectors.length === 0 ? (
              <p className="small" style={{ color: 'var(--warning)' }}>No wallets detected. Install MetaMask or Coinbase Wallet.</p>
            ) : (
              connectors.map((c) => (
                <button
                  key={c.id}
                  className="connector-btn"
                  onClick={() => handleConnect(c.id)}
                  disabled={isConnectPending || isConnecting}
                >
                  <span className="connector-icon">
                    {getConnectorIcon(c.name, c.id)}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    {isConnectPending || isConnecting
                      ? '⏳ Connecting...'
                      : c.name}
                  </span>
                </button>
              ))
            )}
            <button
              className="close-btn"
              onClick={() => setShowModal(false)}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* ---- Main Overlay ---- */}
      <div className="overlay">
        <div className="panel">
          {/* Hero */}
          <div className="hero-mascot">🐸</div>
          <div className="hero-title">BASE FROGGER</div>
          <div className="hero-subtitle">ON BASE NETWORK</div>

          {!isConnected ? (
            <>
              <div className="blink" style={{ margin: '14px 0' }}>
                — TAP TO START —
              </div>

              <button
                className="primary"
                onClick={() => setShowModal(true)}
                disabled={isConnectPending || isConnecting}
              >
                {isConnectPending || isConnecting
                  ? '⏳ CONNECTING...'
                  : 'CONNECT WALLET'}
              </button>

              {onViewLeaderboard && (
                <button className="secondary" onClick={onViewLeaderboard}>
                  🏆 LEADERBOARD
                </button>
              )}
            </>
          ) : (
            <>
              <div className="wallet-status">
                <span className="dot connected" />
                <span>Connected</span>
              </div>
              <p className="address">{shortAddress}</p>
              <p className="small">
                via {connector?.name}
                {playFee !== undefined && (
                  <> · Fee: {formatEther(playFee)} ETH</>
                )}
              </p>

              {!hash && !isPending && !isConfirming && !isError && (
                <>
                  <p style={{ marginTop: 12 }}>
                    {onCancel
                      ? 'Start a new game session on Base to play again.'
                      : 'Ready to jump in? Pay the play fee to start.'}
                  </p>
                  <button className="warn" onClick={handleEnterGame}>
                    {onCancel ? '🐸 PLAY AGAIN' : '🐸 ENTER GAME & PLAY'}
                  </button>
                  {onCancel ? (
                    <button className="secondary" onClick={onCancel}>
                      CANCEL
                    </button>
                  ) : (
                    <button className="secondary" onClick={() => disconnect()}>
                      DISCONNECT
                    </button>
                  )}
                </>
              )}

              {isPending && (
                <div className="tx-status">
                  ⏳ Transaction pending... Confirm in your wallet.
                </div>
              )}

              {isConfirming && (
                <div className="tx-status">
                  ⏳ Waiting for confirmation...
                  {hash && (
                    <p className="small" style={{ marginTop: 6 }}>
                      TX:{''}
                      <a
                        href={`https://basescan.org/tx/${hash}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--base-bright)', marginLeft: 4 }}
                      >
                        {hash.slice(0, 10)}...
                      </a>
                    </p>
                  )}
                </div>
              )}

              {isSuccess && (
                <div
                  className="tx-status"
                  style={{ borderColor: 'var(--frog)' }}
                >
                  ✅ Game entry confirmed! Starting...
                </div>
              )}

              {isError && (
                <div
                  className="tx-status"
                  style={{ borderColor: 'var(--danger)' }}
                >
                  ⚠{' '}
                  {error?.shortMessage ||
                    error?.message ||
                    'Transaction failed. Try again.'}
                  <br />
                  <button
                    className="secondary"
                    onClick={handleEnterGame}
                    style={{ marginTop: 8, maxWidth: 200 }}
                  >
                    RETRY
                  </button>
                  {onCancel && (
                    <button
                      className="secondary"
                      onClick={onCancel}
                      style={{
                        marginTop: 8,
                        maxWidth: 200,
                        marginLeft: 8,
                      }}
                    >
                      CANCEL
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
