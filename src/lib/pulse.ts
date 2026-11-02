import type { SqueekSnapshot } from './squeek';
import type { LedgerPosition } from './verify';

export const PACE_WINDOW_ROUNDS = 144n;
export const PACE_CEILING_BLOCKS_PER_ROUND = 10n;
export const MAX_SURGE_GAP_MS = 60_000;
export const SURGE_WINDOW_MS = 30_000;
export const MAX_CHARGE = 5;

export type PaceSignal = {
  pacePermille: number;
  deltaBlocks: bigint;
  rounds: bigint;
};

export type SurgeSignal = {
  deltaBlocks: bigint;
  surgePermille: number;
  chargeAward: number;
  eventId: string;
  baselineOnly: boolean;
};

export function completedBlocks(position: LedgerPosition, q: bigint): bigint {
  return position.cumulativeBlockUnits / q;
}

export function calculatePace(snapshot: SqueekSnapshot, short = false): PaceSignal | null {
  const start = short ? snapshot.shortPaceStart : snapshot.paceStart;
  const rounds = snapshot.state.settledThroughRound - (short
    ? snapshot.state.settledThroughRound > 24n ? snapshot.state.settledThroughRound - 24n : 0n
    : snapshot.state.settledThroughRound > PACE_WINDOW_ROUNDS ? snapshot.state.settledThroughRound - PACE_WINDOW_ROUNDS : 0n);
  if (rounds === 0n) return null;
  const q = snapshot.configuration.blockUnitsPerBlock;
  const deltaBlocks = completedBlocks(snapshot.frontier, q) - completedBlocks(start, q);
  if (deltaBlocks < 0n) return null;
  const permille = deltaBlocks * 1000n / rounds / PACE_CEILING_BLOCKS_PER_ROUND;
  return { pacePermille: Number(permille > 1000n ? 1000n : permille), deltaBlocks, rounds };
}

export function calculateSurge(
  previous: { snapshot: SqueekSnapshot; observedAt: number } | null,
  snapshot: SqueekSnapshot,
  observedAt: number,
): SurgeSignal {
  const eventId = snapshot.blockNumber.toString();
  if (!previous || observedAt - previous.observedAt > MAX_SURGE_GAP_MS) {
    return { deltaBlocks: 0n, surgePermille: 0, chargeAward: 0, eventId, baselineOnly: true };
  }
  if (snapshot.lagRounds > 3n || snapshot.state.paused) {
    return { deltaBlocks: 0n, surgePermille: 0, chargeAward: 0, eventId, baselineOnly: true };
  }
  const q = snapshot.configuration.blockUnitsPerBlock;
  const deltaBlocks = completedBlocks(snapshot.frontier, q) - completedBlocks(previous.snapshot.frontier, q);
  if (deltaBlocks <= 0n || snapshot.state.settledThroughRound < previous.snapshot.state.settledThroughRound) {
    return { deltaBlocks: 0n, surgePermille: 0, chargeAward: 0, eventId, baselineOnly: deltaBlocks < 0n };
  }
  const target = snapshot.configuration.targetBlocksPerActiveRound;
  const permille = deltaBlocks * 1000n / target;
  const chargeAward = deltaBlocks >= target ? 3 : deltaBlocks >= 20n ? 2 : 1;
  return {
    deltaBlocks,
    surgePermille: Number(permille > 1000n ? 1000n : permille),
    chargeAward,
    eventId,
    baselineOnly: false,
  };
}

export function nextSurgeUntil(previousUntil: number, surge: SurgeSignal, observedAt: number): number {
  return surge.deltaBlocks > 0n ? observedAt + SURGE_WINDOW_MS : previousUntil;
}

export function isTailwindActive(snapshot: SqueekSnapshot): boolean {
  return snapshot.frontier.cumulativeBlockUnits > snapshot.tailwindStart.cumulativeBlockUnits;
}

export function hasWarmWheel(pacePermille: number | null): boolean {
  return pacePermille !== null && pacePermille >= 300;
}

export function settledBlocksSince(start: SqueekSnapshot, current: SqueekSnapshot): bigint {
  const q = current.configuration.blockUnitsPerBlock;
  const delta = completedBlocks(current.frontier, q) - completedBlocks(start.frontier, q);
  return delta > 0n ? delta : 0n;
}

export function effectiveMultiplier(pacePermille: number | null, surgeActive: boolean): number {
  const pace = pacePermille === null ? 300 : pacePermille / 1000;
  return Math.min(3, (1 + pace) * (surgeActive ? 2 : 1));
}

export function calculateFinalScore({
  rawScore,
  pacePermille,
  surgeActive,
  tailwind,
  settledBlocks,
}: {
  rawScore: number;
  pacePermille: number | null;
  surgeActive: boolean;
  tailwind: boolean;
  settledBlocks: bigint;
}): { finalScore: number; bonus: number; multiplier: number } {
  const multiplier = effectiveMultiplier(pacePermille, surgeActive);
  const base = rawScore * multiplier;
  const blockBonus = Number(settledBlocks > 40n ? 40n : settledBlocks) * 10;
  const bonus = Math.min(blockBonus, base * 0.25);
  return {
    finalScore: Math.floor((base + bonus) * (tailwind ? 1.25 : 1)),
    bonus: Math.floor(bonus),
    multiplier,
  };
}
