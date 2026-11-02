import { decodeFunctionResult, encodeFunctionData, type Address, type Hex } from 'viem';
import coreAbi from '../src/abi/SqueekCore.json';
import { calculatePace, isTailwindActive } from '../src/lib/pulse';
import { CONFIRMATIONS, createSqueekClient, SqueekReader } from '../src/lib/squeek';
import { deploymentRecord, type CoreState, type LedgerPosition } from '../src/lib/verify';

const client = createSqueekClient(process.env.RPC_URL ?? process.env.VITE_RPC_URL);
const latest = await client.getBlockNumber();
const blockNumber = process.env.ETHEREUM_BLOCK ? BigInt(process.env.ETHEREUM_BLOCK) : latest - CONFIRMATIONS;
const snapshot = await new SqueekReader(client).readSnapshotAt(blockNumber, true);
const core = deploymentRecord.contracts.SqueekCore.address as Address;

async function ethCall<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
  const data = encodeFunctionData({ abi: coreAbi, functionName, args });
  const result = await client.call({ to: core, data, blockNumber });
  if (!result.data) throw new Error(`${functionName}: empty eth_call result`);
  return decodeFunctionResult({ abi: coreAbi, functionName, data: result.data }) as T;
}

const [state, frontier, paceStart, tailwindStart] = await Promise.all([
  ethCall<CoreState>('state'),
  ethCall<{ end: LedgerPosition }>('roundPage', [snapshot.state.settledThroughRound, snapshot.state.settledThroughRound, 0n]).then((page) => page.end),
  ethCall<{ end: LedgerPosition }>('roundPage', [
    snapshot.state.settledThroughRound > 144n ? snapshot.state.settledThroughRound - 144n : 0n,
    snapshot.state.settledThroughRound > 144n ? snapshot.state.settledThroughRound - 144n : 0n,
    0n,
  ]).then((page) => page.end),
  ethCall<{ end: LedgerPosition }>('roundPage', [
    snapshot.state.settledThroughRound > 3n ? snapshot.state.settledThroughRound - 3n : 0n,
    snapshot.state.settledThroughRound > 3n ? snapshot.state.settledThroughRound - 3n : 0n,
    0n,
  ]).then((page) => page.end),
]);
const manualSnapshot = { ...snapshot, state, frontier, paceStart, tailwindStart };
const hudPace = calculatePace(snapshot);
const manualPace = calculatePace(manualSnapshot);
const matches = state.cumulativeBlockUnits === snapshot.state.cumulativeBlockUnits
  && state.blockHeight === snapshot.state.blockHeight
  && frontier.cumulativeBlockUnits === snapshot.frontier.cumulativeBlockUnits
  && hudPace?.pacePermille === manualPace?.pacePermille
  && isTailwindActive(snapshot) === isTailwindActive(manualSnapshot);

console.log(JSON.stringify({
  matches,
  source: 'docs-record',
  blockNumber: blockNumber.toString(),
  blockHash: snapshot.blockHash as Hex,
  hud: {
    pacePermille: hudPace?.pacePermille ?? null,
    deltaBlocks: hudPace?.deltaBlocks.toString() ?? null,
    blockHeight: snapshot.state.blockHeight.toString(),
    tailwind: isTailwindActive(snapshot),
  },
  manualEthCall: {
    pacePermille: manualPace?.pacePermille ?? null,
    deltaBlocks: manualPace?.deltaBlocks.toString() ?? null,
    blockHeight: state.blockHeight.toString(),
    tailwind: isTailwindActive(manualSnapshot),
  },
}, null, 2));
if (!matches) process.exitCode = 1;
