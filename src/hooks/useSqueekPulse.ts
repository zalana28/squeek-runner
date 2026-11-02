import { useEffect, useRef, useState } from 'react';
import {
  calculatePace,
  calculateSurge,
  nextSurgeUntil,
  type PaceSignal,
  type SurgeSignal,
} from '../lib/pulse';
import {
  createSqueekClient,
  SnapshotReorgError,
  SqueekReader,
  type SqueekSnapshot,
} from '../lib/squeek';
import { VerificationError } from '../lib/verify';

const POLL_INTERVAL_MS = 15_000;
const STALE_LIMIT_MS = 5 * 60 * 1000;

export type PulseStatus = 'loading' | 'verified' | 'unverified' | 'stale' | 'unknown';
export type PulseState = {
  status: PulseStatus;
  snapshot: SqueekSnapshot | null;
  pace: PaceSignal | null;
  shortPace: PaceSignal | null;
  surge: SurgeSignal | null;
  surgeUntil: number;
  observedAt: number;
  error: string | null;
};

const initialState: PulseState = {
  status: 'loading',
  snapshot: null,
  pace: null,
  shortPace: null,
  surge: null,
  surgeUntil: 0,
  observedAt: 0,
  error: null,
};

export function useSqueekPulse(): PulseState {
  const [state, setState] = useState<PulseState>(initialState);
  const readerRef = useRef<SqueekReader | null>(null);
  const previousRef = useRef<{ snapshot: SqueekSnapshot; observedAt: number } | null>(null);
  const surgeUntilRef = useRef(0);
  const lastSuccessAtRef = useRef(0);
  const lastGoodRef = useRef<PulseState | null>(null);
  if (!readerRef.current) {
    readerRef.current = new SqueekReader(createSqueekClient(import.meta.env.VITE_RPC_URL || undefined));
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const resetBaseline = () => {
      previousRef.current = null;
      surgeUntilRef.current = 0;
    };

    const poll = async () => {
      if (cancelled || document.hidden) return;
      try {
        const snapshot = await readerRef.current!.readLatestSnapshot();
        if (cancelled) return;
        const observedAt = Date.now();
        const surge = calculateSurge(previousRef.current, snapshot, observedAt);
        previousRef.current = { snapshot, observedAt };
        surgeUntilRef.current = nextSurgeUntil(surgeUntilRef.current, surge, observedAt);
        const next: PulseState = {
          status: 'verified',
          snapshot,
          pace: calculatePace(snapshot),
          shortPace: calculatePace(snapshot, true),
          surge,
          surgeUntil: surgeUntilRef.current,
          observedAt,
          error: null,
        };
        lastSuccessAtRef.current = observedAt;
        lastGoodRef.current = next;
        setState(next);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof SnapshotReorgError) resetBaseline();
        if (error instanceof VerificationError) {
          resetBaseline();
          lastSuccessAtRef.current = 0;
          lastGoodRef.current = null;
          setState({ ...initialState, status: 'unverified', error: message });
        } else {
          const lastGood = lastGoodRef.current;
          const age = Date.now() - lastSuccessAtRef.current;
          if (lastGood && age <= STALE_LIMIT_MS) {
            setState({ ...lastGood, status: 'stale', error: message });
          } else {
            setState((current) => ({
              ...current,
              status: 'unknown',
              pace: null,
              shortPace: null,
              surge: null,
              surgeUntil: 0,
              error: message,
            }));
          }
        }
      } finally {
        if (!cancelled && !document.hidden) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    const onVisibilityChange = () => {
      if (timer) clearTimeout(timer);
      if (document.hidden) {
        resetBaseline();
        setState((current) => ({ ...current, surge: null, surgeUntil: 0 }));
      } else {
        void poll();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resetBaseline();
    };
  }, []);

  return state;
}
