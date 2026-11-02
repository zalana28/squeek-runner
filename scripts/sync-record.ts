import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const RECORD_URL = 'https://docs.squeekchain.com/assets/deployments/sepolia.json';
const ABI_URL = 'https://docs.squeekchain.com/assets/abi';
const ABI_NAMES = ['SqueekCore', 'SqueekMining', 'SqueekToken', 'SqueekNFT'];
const root = fileURLToPath(new URL('../', import.meta.url));
const checkOnly = process.argv.includes('--check');

async function downloadJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function syncFile(url: string, relativePath: string) {
  const value = await downloadJson(url);
  const expected = `${JSON.stringify(value, null, 2)}\n`;
  const path = new URL(relativePath, `file://${root}`).pathname;
  if (checkOnly) {
    const actual = JSON.parse(await readFile(path, 'utf8')) as unknown;
    if (JSON.stringify(actual) !== JSON.stringify(value)) throw new Error(`${relativePath} differs from the published source`);
    return;
  }
  await writeFile(path, expected);
}

await syncFile(RECORD_URL, 'src/config/record.json');
await Promise.all(ABI_NAMES.map((name) => syncFile(`${ABI_URL}/${name}.json`, `src/abi/${name}.json`)));
console.log(checkOnly ? 'Deployment record and ABIs match the published sources.' : 'Deployment record and ABIs synchronized.');
