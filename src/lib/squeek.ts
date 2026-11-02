import { createPublicClient, http, type Hex, type PublicClient } from 'viem';
import { sepolia } from 'viem/chains';
import coreAbi from '../abi/SqueekCore.json';
import {
  deploymentRecord,
  verifyDeployment,
  type CoreConfiguration,
  type CoreState,
  type DeploymentRecord,
  type LedgerPosition,
} from './verify';

export const DEFAULT_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
export const CONFIRMATIONS = 12n;
export const VERIFY_INTERVAL_MS = 30 * 60 * 1000;

export type SqueekSnapshot = {
  blockNumber: bigint;
  blockHash: Hex;
  timestamp: bigint;
  configuration: CoreConfiguration;
  state: CoreState;
  currentRound: bigint;
  lagRounds: bigint;
  settledAt: bigint;
  frontier: LedgerPosition;
  tailwindStart: LedgerPosition;
  shortPaceStart: LedgerPosition;
  paceStart: LedgerPosition;
  verifiedAt: number;
};

export class SnapshotReorgError extends Error {
  constructor(blockNumber: bigint) {
    super(`Snapshot block ${blockNumber} changed hash during the read`);
    this.name = 'SnapshotReorgError';
  }
}

export function createSqueekClient(rpcUrl = DEFAULT_RPC_URL): PublicClient {
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { timeout: 12_000, retryCount: 1 }),
  });
}

export class SqueekReader {
  private readonly roundCache = new Map<string, LedgerPosition>();
  private configuration?: CoreConfiguration;
  private lastVerifiedAt = 0;

  constructor(
    private readonly client: PublicClient,
    private readonly record: DeploymentRecord = deploymentRecord,
  ) {}

  clearCache() {
    this.roundCache.clear();
    this.configuration = undefined;
    this.lastVerifiedAt = 0;
  }

  async readLatestSnapshot(forceVerify = false): Promise<SqueekSnapshot> {
    const latest = await this.client.getBlockNumber();
    return this.readSnapshotAt(latest - CONFIRMATIONS, forceVerify);
  }

  async readSnapshotAt(blockNumber: bigint, forceVerify = false): Promise<SqueekSnapshot> {
    const block = await this.client.getBlock({ blockNumber });
    if (!block.hash) throw new Error(`Snapshot block ${blockNumber} has no hash`);

    const shouldVerify = forceVerify || !this.configuration || Date.now() - this.lastVerifiedAt >= VERIFY_INTERVAL_MS;
    let state: CoreState;
    if (shouldVerify) {
      const verified = await verifyDeployment(this.client, this.record, blockNumber);
      this.configuration = verified.configuration;
      state = verified.state;
      this.lastVerifiedAt = Date.now();
    } else {
      state = await this.client.readContract({
        address: this.record.contracts.SqueekCore.address as Hex,
        abi: coreAbi,
        functionName: 'state',
        blockNumber,
      }) as CoreState;
    }
    const configuration = this.configuration;
    if (!configuration) throw new Error('Missing verified Core configuration');

    const f = state.settledThroughRound;
    const tailwindRound = f > 3n ? f - 3n : 0n;
    const shortPaceRound = f > 24n ? f - 24n : 0n;
    const paceRound = f > 144n ? f - 144n : 0n;
    const [frontier, tailwindStart, shortPaceStart, paceStart] = await Promise.all([
      this.readPosition(f, blockNumber),
      this.readPosition(tailwindRound, blockNumber),
      this.readPosition(shortPaceRound, blockNumber),
      this.readPosition(paceRound, blockNumber),
    ]);

    const confirmed = await this.client.getBlock({ blockNumber });
    if (confirmed.hash !== block.hash) {
      this.clearCache();
      throw new SnapshotReorgError(blockNumber);
    }

    const currentRound = block.timestamp < configuration.genesisTimestamp
      ? 0n
      : (block.timestamp - configuration.genesisTimestamp) / configuration.roundDuration + 1n;
    const lagRounds = currentRound > 0n && currentRound > f + 1n ? currentRound - 1n - f : 0n;
    return {
      blockNumber,
      blockHash: block.hash,
      timestamp: block.timestamp,
      configuration,
      state,
      currentRound,
      lagRounds,
      settledAt: configuration.genesisTimestamp + f * configuration.roundDuration,
      frontier,
      tailwindStart,
      shortPaceStart,
      paceStart,
      verifiedAt: this.lastVerifiedAt,
    };
  }

  private async readPosition(round: bigint, blockNumber: bigint): Promise<LedgerPosition> {
    const key = round.toString();
    const cached = this.roundCache.get(key);
    if (cached) return cached;
    const page = await this.client.readContract({
      address: this.record.contracts.SqueekCore.address as Hex,
      abi: coreAbi,
      functionName: 'roundPage',
      args: [round, round, 0n],
      blockNumber,
    }) as { end: LedgerPosition };
    this.roundCache.set(key, page.end);
    return page.end;
  }
}
