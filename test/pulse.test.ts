import { describe, expect, it } from 'vitest';
import type { Address, Hex } from 'viem';
import record from '../src/config/record.json';
import {
  calculateFinalScore,
  calculatePace,
  calculateSurge,
  completedBlocks,
  effectiveMultiplier,
  hasWarmWheel,
  isTailwindActive,
  settledBlocksSince,
} from '../src/lib/pulse';
import type { SqueekSnapshot } from '../src/lib/squeek';
import type { CoreConfiguration, LedgerPosition } from '../src/lib/verify';

const Q = 1_000_000_000n;
const configuration: CoreConfiguration = {
  ...record.coreConfiguration,
  streamId: record.coreConfiguration.streamId as Hex,
  guardian: record.coreConfiguration.guardian as Address,
  reporter: record.coreConfiguration.reporter as Address,
  genesisTimestamp: BigInt(record.coreConfiguration.genesisTimestamp),
  roundDuration: BigInt(record.coreConfiguration.roundDuration),
  maxWorkPerRound: BigInt(record.coreConfiguration.maxWorkPerRound),
  targetBlocksPerActiveRound: BigInt(record.coreConfiguration.targetBlocksPerActiveRound),
  difficultySmoothingRounds: BigInt(record.coreConfiguration.difficultySmoothingRounds),
  blockUnitsPerBlock: Q,
};

function position(cumulativeBlockUnits: bigint): LedgerPosition {
  return { cumulativeWork: 0n, cumulativeBlockUnits, workPerThousandBlocks: 10_875 };
}

function snapshot({
  frontier = 200n,
  frontierUnits = 1_000n * Q,
  paceStartUnits = 262n * Q,
  shortStartUnits = 900n * Q,
  tailwindStartUnits = 999n * Q,
  lagRounds = 0n,
  paused = false,
  blockNumber = 100n,
}: {
  frontier?: bigint;
  frontierUnits?: bigint;
  paceStartUnits?: bigint;
  shortStartUnits?: bigint;
  tailwindStartUnits?: bigint;
  lagRounds?: bigint;
  paused?: boolean;
  blockNumber?: bigint;
} = {}): SqueekSnapshot {
  const paceRound = frontier > 144n ? frontier - 144n : 0n;
  return {
    blockNumber,
    blockHash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
    timestamp: configuration.genesisTimestamp + frontier * 600n + 600n,
    configuration,
    state: {
      settledThroughRound: frontier,
      cumulativeWork: 0n,
      cumulativeBlockUnits: frontierUnits,
      blockHeight: frontierUnits / Q,
      blockProgress: frontierUnits % Q,
      workPerThousandBlocks: 10_875,
      authorizationNonce: 0n,
      paused,
    },
    currentRound: frontier + lagRounds + 1n,
    lagRounds,
    settledAt: configuration.genesisTimestamp + frontier * 600n,
    frontier: position(frontierUnits),
    tailwindStart: position(tailwindStartUnits),
    shortPaceStart: position(shortStartUnits),
    paceStart: position(paceRound === 0n ? frontierUnits : paceStartUnits),
    verifiedAt: 0,
  };
}

describe('Pace', () => {
  it('uses floor(U/Q) over 144 rounds and returns permille', () => {
    const value = calculatePace(snapshot({ frontierUnits: 1_000n * Q, paceStartUnits: 262n * Q }));
    expect(value).toEqual({ pacePermille: 512, deltaBlocks: 738n, rounds: 144n });
  });

  it('is unknown when f-a is zero', () => {
    expect(calculatePace(snapshot({ frontier: 0n, frontierUnits: 0n }))).toBeNull();
  });

  it('clamps pace at 1000 permille', () => {
    const value = calculatePace(snapshot({ frontierUnits: 3_000n * Q, paceStartUnits: 0n }));
    expect(value?.pacePermille).toBe(1000);
  });
});

describe('Surge', () => {
  it('uses the first snapshot only as a baseline', () => {
    const result = calculateSurge(null, snapshot(), 1_000);
    expect(result.baselineOnly).toBe(true);
    expect(result.chargeAward).toBe(0);
  });

  it('awards one charge for one newly completed block', () => {
    const previous = snapshot({ frontierUnits: 10n * Q });
    const current = snapshot({ frontierUnits: 11n * Q, blockNumber: 101n });
    const result = calculateSurge({ snapshot: previous, observedAt: 1_000 }, current, 15_000);
    expect(result.deltaBlocks).toBe(1n);
    expect(result.surgePermille).toBe(25);
    expect(result.chargeAward).toBe(1);
  });

  it('awards two charges at 20 blocks', () => {
    const previous = snapshot({ frontierUnits: 10n * Q });
    const current = snapshot({ frontierUnits: 30n * Q, blockNumber: 101n });
    expect(calculateSurge({ snapshot: previous, observedAt: 0 }, current, 15_000).chargeAward).toBe(2);
  });

  it('awards three charges and full surge for 56 blocks settled at once', () => {
    const previous = snapshot({ frontierUnits: 10n * Q });
    const current = snapshot({ frontierUnits: 66n * Q, blockNumber: 101n });
    const result = calculateSurge({ snapshot: previous, observedAt: 0 }, current, 15_000);
    expect(result.chargeAward).toBe(3);
    expect(result.surgePermille).toBe(1000);
  });

  it('crosses the exact 1e9 block-unit boundary with floor division', () => {
    const previous = snapshot({ frontierUnits: Q - 1n });
    const current = snapshot({ frontierUnits: Q, blockNumber: 101n });
    expect(completedBlocks(previous.frontier, Q)).toBe(0n);
    expect(completedBlocks(current.frontier, Q)).toBe(1n);
    expect(calculateSurge({ snapshot: previous, observedAt: 0 }, current, 15_000).deltaBlocks).toBe(1n);
  });

  it('resets the baseline after a gap over 60 seconds', () => {
    const previous = snapshot({ frontierUnits: 10n * Q });
    const current = snapshot({ frontierUnits: 66n * Q, blockNumber: 101n });
    const result = calculateSurge({ snapshot: previous, observedAt: 0 }, current, 60_001);
    expect(result.baselineOnly).toBe(true);
    expect(result.deltaBlocks).toBe(0n);
  });

  it('suppresses settlement charge during lag and pause', () => {
    const previous = snapshot({ frontierUnits: 10n * Q });
    for (const current of [
      snapshot({ frontierUnits: 66n * Q, lagRounds: 4n, blockNumber: 101n }),
      snapshot({ frontierUnits: 66n * Q, paused: true, blockNumber: 101n }),
    ]) {
      expect(calculateSurge({ snapshot: previous, observedAt: 0 }, current, 15_000).chargeAward).toBe(0);
    }
  });
});

describe('Run signals and score', () => {
  it('derives Tailwind from certified block units', () => {
    expect(isTailwindActive(snapshot({ frontierUnits: 11n * Q, tailwindStartUnits: 10n * Q }))).toBe(true);
    expect(isTailwindActive(snapshot({ frontierUnits: 10n * Q, tailwindStartUnits: 10n * Q }))).toBe(false);
  });

  it('enables Warm Wheel at pace 0.3', () => {
    expect(hasWarmWheel(300)).toBe(true);
    expect(hasWarmWheel(299)).toBe(false);
    expect(hasWarmWheel(null)).toBe(false);
  });

  it('counts settled blocks during a session from floor positions', () => {
    const start = snapshot({ frontierUnits: Q - 1n });
    const current = snapshot({ frontierUnits: 3n * Q + 1n, blockNumber: 101n });
    expect(settledBlocksSince(start, current)).toBe(3n);
  });

  it('caps the block bonus at 25 percent of base', () => {
    const result = calculateFinalScore({
      rawScore: 100,
      pacePermille: 0,
      surgeActive: false,
      tailwind: false,
      settledBlocks: 40n,
    });
    expect(result.bonus).toBe(25);
    expect(result.finalScore).toBe(125);
  });

  it('caps the combined multiplier at 3 and applies Tailwind last', () => {
    expect(effectiveMultiplier(1000, true)).toBe(3);
    const result = calculateFinalScore({
      rawScore: 100,
      pacePermille: 1000,
      surgeActive: true,
      tailwind: true,
      settledBlocks: 0n,
    });
    expect(result.multiplier).toBe(3);
    expect(result.finalScore).toBe(375);
  });
});
