import { getAddress, keccak256, parseAbi, type Address, type Hex, type PublicClient } from 'viem';
import coreAbi from '../abi/SqueekCore.json';
import miningAbi from '../abi/SqueekMining.json';
import tokenAbi from '../abi/SqueekToken.json';
import recordJson from '../config/record.json';

export const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
export const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';

const ownerAbi = parseAbi(['function owner() view returns (address)']);

export type DeploymentRecord = typeof recordJson;
export type CoreConfiguration = {
  streamId: Hex;
  genesisTimestamp: bigint;
  roundDuration: bigint;
  maxWorkPerRound: bigint;
  maxRoundsPerBatch: number;
  guardian: Address;
  reporter: Address;
  initialWorkPerThousandBlocks: number;
  targetBlocksPerActiveRound: bigint;
  difficultySmoothingRounds: bigint;
  blockUnitsPerBlock: bigint;
};
export type CoreState = {
  settledThroughRound: bigint;
  cumulativeWork: bigint;
  cumulativeBlockUnits: bigint;
  blockHeight: bigint;
  blockProgress: bigint;
  workPerThousandBlocks: number;
  authorizationNonce: bigint;
  paused: boolean;
};
export type LedgerPosition = {
  cumulativeWork: bigint;
  cumulativeBlockUnits: bigint;
  workPerThousandBlocks: number;
};
type RoundPage = {
  certifiedThroughRound: bigint;
  start: LedgerPosition;
  end: LedgerPosition;
  rounds: unknown[];
};
type CollectionPolicy = { nft: Address };
export type VerifiedDeployment = {
  core: Address;
  mining: Address;
  token: Address;
  nft: Address;
  configuration: CoreConfiguration;
  state: CoreState;
  blockNumber: bigint;
};

export class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerificationError';
  }
}

function requireMatch(condition: boolean, message: string): void {
  if (!condition) throw new VerificationError(message);
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function slotAddress(word: Hex | undefined): Address {
  return getAddress(`0x${(word ?? '0x').slice(-40)}`);
}

async function verifyProxy(
  client: PublicClient,
  name: 'Core' | 'Mining',
  expected: DeploymentRecord['contracts']['SqueekCore'],
  timelock: Address,
  blockNumber: bigint,
) {
  const proxy = getAddress(expected.address);
  const implementation = getAddress(expected.implementation);
  const admin = getAddress(expected.proxyAdmin);
  const [implementationWord, adminWord, code] = await Promise.all([
    client.getStorageAt({ address: proxy, slot: IMPLEMENTATION_SLOT, blockNumber }),
    client.getStorageAt({ address: proxy, slot: ADMIN_SLOT, blockNumber }),
    client.getCode({ address: implementation, blockNumber }),
  ]);
  const implementationSlot = slotAddress(implementationWord);
  const adminSlot = slotAddress(adminWord);
  requireMatch(same(implementationSlot, implementation), `${name} implementation slot mismatch`);
  requireMatch(same(adminSlot, admin), `${name} admin slot mismatch`);
  requireMatch(!!code && same(keccak256(code), expected.implementationRuntimeHash), `${name} runtime hash mismatch`);

  const read = { address: proxy, abi: coreAbi, blockNumber } as const;
  const [reportedImplementation, codeVersion, layout, reportedAdmin, adminOwner] = await Promise.all([
    client.readContract({ ...read, functionName: 'implementationCodeAddress' }) as Promise<Address>,
    client.readContract({ ...read, functionName: 'implementationCodeVersion' }) as Promise<bigint>,
    client.readContract({ ...read, functionName: 'implementationStorageLayoutDigest' }) as Promise<Hex>,
    client.readContract({ ...read, functionName: 'proxyAdmin' }) as Promise<Address>,
    client.readContract({ address: admin, abi: ownerAbi, functionName: 'owner', blockNumber }) as Promise<Address>,
  ]);
  requireMatch(same(reportedImplementation, implementation), `${name} reported implementation mismatch`);
  requireMatch(codeVersion === BigInt(expected.implementationVersion), `${name} implementation version mismatch`);
  requireMatch(same(layout, expected.storageLayoutDigest), `${name} storage layout mismatch`);
  requireMatch(same(reportedAdmin, admin), `${name} reported admin mismatch`);
  requireMatch(same(adminOwner, timelock), `${name} admin owner mismatch`);
  return proxy;
}

export async function verifyDeployment(
  client: PublicClient,
  record: DeploymentRecord,
  blockNumber: bigint,
): Promise<VerifiedDeployment> {
  requireMatch((await client.getChainId()) === record.chainId, 'Chain ID mismatch');
  const timelock = getAddress(record.operational.governanceTimelock.address);
  const [core, mining] = await Promise.all([
    verifyProxy(client, 'Core', record.contracts.SqueekCore, timelock, blockNumber),
    verifyProxy(client, 'Mining', record.contracts.SqueekMining, timelock, blockNumber),
  ]);
  const token = getAddress(record.contracts.SqueekToken.address);
  const nft = getAddress(record.contracts.SqueekNFT.address);

  const [miningCore, tokenMining, policy, configuration, state] = await Promise.all([
    client.readContract({ address: mining, abi: miningAbi, functionName: 'core', blockNumber }) as Promise<Address>,
    client.readContract({ address: token, abi: tokenAbi, functionName: 'mining', blockNumber }) as Promise<Address>,
    client.readContract({ address: mining, abi: miningAbi, functionName: 'collectionPolicy', args: [0], blockNumber }) as Promise<CollectionPolicy>,
    client.readContract({ address: core, abi: coreAbi, functionName: 'configuration', blockNumber }) as Promise<CoreConfiguration>,
    client.readContract({ address: core, abi: coreAbi, functionName: 'state', blockNumber }) as Promise<CoreState>,
  ]);
  requireMatch(same(miningCore, core), 'Mining Core link mismatch');
  requireMatch(same(tokenMining, mining), 'Token Mining link mismatch');
  requireMatch(same(policy.nft, nft), 'Mining NFT link mismatch');

  const expected = record.coreConfiguration;
  requireMatch(same(configuration.streamId, expected.streamId), 'Core streamId mismatch');
  requireMatch(configuration.genesisTimestamp === BigInt(expected.genesisTimestamp), 'Core genesis mismatch');
  requireMatch(configuration.roundDuration === BigInt(expected.roundDuration), 'Core round duration mismatch');
  requireMatch(configuration.maxWorkPerRound === BigInt(expected.maxWorkPerRound), 'Core work cap mismatch');
  requireMatch(configuration.maxRoundsPerBatch === expected.maxRoundsPerBatch, 'Core batch limit mismatch');
  requireMatch(same(configuration.guardian, expected.guardian), 'Core guardian mismatch');
  requireMatch(same(configuration.reporter, expected.reporter), 'Core reporter mismatch');
  requireMatch(configuration.initialWorkPerThousandBlocks === expected.initialWorkPerThousandBlocks, 'Core initial difficulty mismatch');
  requireMatch(configuration.targetBlocksPerActiveRound === BigInt(expected.targetBlocksPerActiveRound), 'Core target mismatch');
  requireMatch(configuration.difficultySmoothingRounds === BigInt(expected.difficultySmoothingRounds), 'Core smoothing mismatch');
  requireMatch(configuration.blockUnitsPerBlock === BigInt(expected.blockUnitsPerBlock), 'Core block units mismatch');

  const q = configuration.blockUnitsPerBlock;
  requireMatch(state.blockHeight === state.cumulativeBlockUnits / q, 'Core block height is inconsistent');
  requireMatch(state.blockProgress === state.cumulativeBlockUnits % q, 'Core block progress is inconsistent');
  const page = await client.readContract({
    address: core,
    abi: coreAbi,
    functionName: 'roundPage',
    args: [state.settledThroughRound, state.settledThroughRound, 0n],
    blockNumber,
  }) as RoundPage;
  requireMatch(page.certifiedThroughRound === state.settledThroughRound, 'Core frontier page mismatch');
  requireMatch(page.end.cumulativeWork === state.cumulativeWork, 'Core work position mismatch');
  requireMatch(page.end.cumulativeBlockUnits === state.cumulativeBlockUnits, 'Core block-unit position mismatch');
  requireMatch(page.end.workPerThousandBlocks === state.workPerThousandBlocks, 'Core difficulty position mismatch');

  return { core, mining, token, nft, configuration, state, blockNumber };
}

export const deploymentRecord = recordJson;
