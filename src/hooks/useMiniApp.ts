import { useState, useEffect, useRef, useCallback } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import type { MiniAppSDK } from '@farcaster/miniapp-sdk';

/**
 * Hook that initializes the Farcaster Mini App SDK.
 * Returns { sdk, context, isReady }.
 *
 * When running inside Base App / Warpcast, the SDK connects natively.
 * When running standalone (localhost), gracefully degrades.
 */
export function useMiniApp() {
  const [context, setContext] = useState< Parameters<MiniAppSDK['context']['then']>[0] | null>(null);
  const [isReady, setIsReady] = useState(false);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        const ctx = await sdk.context;

        // Tell host we're ready (hides splash screen in Base App)
        try { await sdk.actions.ready(); } catch { /* optional */ }

        setContext(ctx);
        setIsReady(true);
      } catch (e) {
        console.warn('Mini App SDK not available (running standalone?):', e);
        setIsReady(true); // still "ready" — just without SDK
      }
    })();
  }, []);

  /** Compose a cast via the SDK (or fallback to Web Share API) */
  const composeCast = useCallback(async (text: string, embeds?: string[]) => {
    try {
      if (sdk.actions.composeCast) {
        // @ts-expect-error close type inference is strict
        return await sdk.actions.composeCast({ text, embeds });
      }
    } catch { /* ignore */ }
    // Fallback: Web Share API
    if (navigator.share) {
      try {
        await navigator.share({ text, url: embeds?.[0] || window.location.href });
        return;
      } catch { /* user cancelled */ }
    }
    // Fallback: clipboard
    await navigator.clipboard.writeText(text + ' ' + (embeds?.[0] || window.location.href));
    throw new Error('Copied to clipboard');
  }, []);

  return { sdk, context, isReady, composeCast };
}
