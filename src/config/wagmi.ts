import { http, createConfig, createStorage } from 'wagmi';
import { Attribution } from 'ox/erc8021';
import { base } from './chain.js';
import { baseAccount, injected } from 'wagmi/connectors';

// Deployed on Base Mainnet via Remix IDE / Foundry
export const FROGGER_LEADERBOARD_ADDRESS =
  '0x72B8425C4bdd01e745accEA7A07B5DF789672cd5' as const;

// Base Builder Code (ERC-8021) — data suffix consumed by the Base Account SDK
// to attribute onchain activity to this app.
// https://docs.base.org/apps/builder-codes/builder-codes
export const DATA_SUFFIX = Attribution.toDataSuffix({ codes: ['bc_71rtn7uh'] });

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    // Base Account SDK (Coinbase Smart Wallet)
    baseAccount({
      appName: 'Base Frogger DX',
      appLogoUrl: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : undefined,
    }),
    // Browser extension wallets (MetaMask, etc.)
    injected(),
  ],
  transports: {
    [base.id]: http(),
  },
  ssr: false,
  storage: createStorage({ storage: localStorage }),
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
