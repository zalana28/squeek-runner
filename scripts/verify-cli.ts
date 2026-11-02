import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { deploymentRecord, verifyDeployment } from '../src/lib/verify';

const rpcUrl = process.env.RPC_URL ?? process.env.VITE_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { timeout: 15_000 }) });

try {
  const latest = await client.getBlockNumber();
  const blockNumber = process.env.ETHEREUM_BLOCK ? BigInt(process.env.ETHEREUM_BLOCK) : latest - 12n;
  const block = await client.getBlock({ blockNumber });
  if (!block.hash) throw new Error('Snapshot block has no hash');
  const verified = await verifyDeployment(client, deploymentRecord, blockNumber);
  const confirmed = await client.getBlock({ blockNumber });
  if (confirmed.hash !== block.hash) throw new Error('Snapshot block reorged during verification');
  console.log(JSON.stringify({
    status: 'VERIFIED',
    release: deploymentRecord.release,
    blockNumber: blockNumber.toString(),
    blockHash: block.hash,
    settledThroughRound: verified.state.settledThroughRound.toString(),
    blockHeight: verified.state.blockHeight.toString(),
  }, null, 2));
} catch (error) {
  console.error(`UNVERIFIED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
