import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { keccak256, type Address, type Hex, type PublicClient } from 'viem';
import recordJson from '../src/config/record.json';
import {
  ADMIN_SLOT,
  IMPLEMENTATION_SLOT,
  VerificationError,
  verifyDeployment,
  type CoreConfiguration,
  type CoreState,
} from '../src/lib/verify';

const blockNumber = 12_000_000n;
const runtimeCode: Hex = '0x01020304';

type ReadCall = { address: Address; functionName: string };
type MockOptions = {
  chainId?: number;
  readOverride?: (call: ReadCall, fallback: () => unknown) => unknown;
};

function makeRecord() {
  const record = structuredClone(recordJson);
  record.contracts.SqueekCore.implementationRuntimeHash = keccak256(runtimeCode);
  record.contracts.SqueekMining.implementationRuntimeHash = keccak256(runtimeCode);
  return record;
}

function makeConfiguration(record: ReturnType<typeof makeRecord>): CoreConfiguration {
  return {
    ...record.coreConfiguration,
    genesisTimestamp: BigInt(record.coreConfiguration.genesisTimestamp),
    roundDuration: BigInt(record.coreConfiguration.roundDuration),
    maxWorkPerRound: BigInt(record.coreConfiguration.maxWorkPerRound),
    targetBlocksPerActiveRound: BigInt(record.coreConfiguration.targetBlocksPerActiveRound),
    difficultySmoothingRounds: BigInt(record.coreConfiguration.difficultySmoothingRounds),
    blockUnitsPerBlock: BigInt(record.coreConfiguration.blockUnitsPerBlock),
    guardian: record.coreConfiguration.guardian as Address,
    reporter: record.coreConfiguration.reporter as Address,
    streamId: record.coreConfiguration.streamId as Hex,
  };
}

function makeState(): CoreState {
  return {
    settledThroughRound: 100n,
    cumulativeWork: 123_456n,
    cumulativeBlockUnits: 42_500_000_123n,
    blockHeight: 42n,
    blockProgress: 500_000_123n,
    workPerThousandBlocks: 10_875,
    authorizationNonce: 9n,
    paused: false,
  };
}

function makeClient(record: ReturnType<typeof makeRecord>, options: MockOptions = {}): PublicClient {
  const core = record.contracts.SqueekCore.address as Address;
  const mining = record.contracts.SqueekMining.address as Address;
  const token = record.contracts.SqueekToken.address as Address;
  const nft = record.contracts.SqueekNFT.address as Address;
  const state = makeState();
  const configuration = makeConfiguration(record);

  const fallbackRead = ({ address, functionName }: ReadCall): unknown => {
    const isCore = address.toLowerCase() === core.toLowerCase();
    const isMining = address.toLowerCase() === mining.toLowerCase();
    if (functionName === 'implementationCodeAddress') {
      if (isCore) return record.contracts.SqueekCore.implementation;
      if (isMining) return record.contracts.SqueekMining.implementation;
    }
    if (functionName === 'implementationCodeVersion') {
      if (isCore) return BigInt(record.contracts.SqueekCore.implementationVersion);
      if (isMining) return BigInt(record.contracts.SqueekMining.implementationVersion);
    }
    if (functionName === 'implementationStorageLayoutDigest') {
      if (isCore) return record.contracts.SqueekCore.storageLayoutDigest;
      if (isMining) return record.contracts.SqueekMining.storageLayoutDigest;
    }
    if (functionName === 'proxyAdmin') {
      if (isCore) return record.contracts.SqueekCore.proxyAdmin;
      if (isMining) return record.contracts.SqueekMining.proxyAdmin;
    }
    if (functionName === 'owner') return record.operational.governanceTimelock.address;
    if (functionName === 'core') return core;
    if (functionName === 'mining') return mining;
    if (functionName === 'collectionPolicy') return { nft };
    if (functionName === 'configuration') return configuration;
    if (functionName === 'state') return state;
    if (functionName === 'roundPage') {
      return {
        certifiedThroughRound: state.settledThroughRound,
        start: state,
        end: state,
        rounds: [],
      };
    }
    throw new Error(`Unexpected read ${functionName} at ${address}`);
  };

  return {
    getChainId: async () => options.chainId ?? record.chainId,
    getCode: async () => runtimeCode,
    getStorageAt: async ({ address, slot }: { address: Address; slot: Hex }) => {
      const isCore = address.toLowerCase() === core.toLowerCase();
      const contract = isCore ? record.contracts.SqueekCore : record.contracts.SqueekMining;
      const value = slot === IMPLEMENTATION_SLOT ? contract.implementation : slot === ADMIN_SLOT ? contract.proxyAdmin : undefined;
      if (!value) throw new Error('Unexpected storage slot');
      return `0x${value.slice(2).padStart(64, '0')}` as Hex;
    },
    readContract: async (call: ReadCall) => options.readOverride?.(call, () => fallbackRead(call)) ?? fallbackRead(call),
  } as unknown as PublicClient;
}

describe('verifyDeployment', () => {
  it('accepts a graph that matches the approved record', async () => {
    const record = makeRecord();
    const result = await verifyDeployment(makeClient(record), record, blockNumber);
    expect(result.blockNumber).toBe(blockNumber);
    expect(result.state.blockHeight).toBe(42n);
  });

  it('rejects a chain mismatch', async () => {
    const record = makeRecord();
    await expect(verifyDeployment(makeClient(record, { chainId: 1 }), record, blockNumber))
      .rejects.toThrowError(VerificationError);
  });

  it('rejects one deliberately wrong implementation field', async () => {
    const record = makeRecord();
    const client = makeClient(record, {
      readOverride: ({ address, functionName }, fallback) => {
        if (functionName === 'implementationCodeAddress' && address.toLowerCase() === record.contracts.SqueekCore.address.toLowerCase()) {
          return record.contracts.SqueekMining.implementation;
        }
        return fallback();
      },
    });
    await expect(verifyDeployment(client, record, blockNumber)).rejects.toThrow('reported implementation mismatch');
  });

  it('rejects a broken graph link', async () => {
    const record = makeRecord();
    const client = makeClient(record, {
      readOverride: ({ functionName }, fallback) => functionName === 'core' ? record.contracts.SqueekMining.address : fallback(),
    });
    await expect(verifyDeployment(client, record, blockNumber)).rejects.toThrow('Mining Core link mismatch');
  });

  it('rejects a configuration mismatch', async () => {
    const record = makeRecord();
    const client = makeClient(record, {
      readOverride: ({ functionName }, fallback) => {
        if (functionName !== 'configuration') return fallback();
        return { ...makeConfiguration(record), genesisTimestamp: 1n };
      },
    });
    await expect(verifyDeployment(client, record, blockNumber)).rejects.toThrow('Core genesis mismatch');
  });

  it('rejects inconsistent ledger state', async () => {
    const record = makeRecord();
    const client = makeClient(record, {
      readOverride: ({ functionName }, fallback) => {
        if (functionName !== 'state') return fallback();
        return { ...makeState(), blockHeight: 41n };
      },
    });
    await expect(verifyDeployment(client, record, blockNumber)).rejects.toThrow('block height is inconsistent');
  });
});

describe('pinned official ABIs', () => {
  const expected = {
    SqueekCore: '95d9ea6a90e68b7e3e124a111c9784d04fbe6a0d2b4e615757506d9fc6a04e91',
    SqueekMining: '9f71878e72bfce2dc769d18ecc32213fdcd45f1e4c4f48eb173f07596ec9af9b',
    SqueekToken: '483f80b4a16d1a7910f352dd9f0ae0775506bd6a6cf71f0bd4f14c4c499a813d',
    SqueekNFT: 'b5dbfde07e77f4bad947b97f813683e573b7944c11812e66db02752ddcced746',
  };

  for (const [name, hash] of Object.entries(expected)) {
    it(`${name}.json matches the published artifact`, async () => {
      const bytes = await readFile(new URL(`../src/abi/${name}.json`, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
    });
  }
});
