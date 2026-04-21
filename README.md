# KABOOM! — On-Chain Mines on Initia MiniEVM

Provably fair 4×4 Mines with session-signed tile clicks via InterwovenKit.
Built for the INITIATE hackathon, Season 1.

```
                                    16 tiles
                                    ┌──────┐
   bet INIT ──▶ startGame ──▶ reveal × N ──▶ cashOut ──▶ settle
                    │               │             │          │
                    ▼               ▼             ▼          ▼
               commitment      isMine?       multiplier   keccak256
               locked          from secret   × bet        verified
               on-chain        layout
```

## Architecture

| Layer     | Tech                                                         |
|-----------|--------------------------------------------------------------|
| Contract  | Solidity 0.8.24 + Hardhat, Shanghai EVM (no `mcopy`)         |
| Chain     | Initia MiniEVM (dedicated `kaboom-1` Minitia, mainnet)       |
| Frontend  | Next.js 15 + React 19 + Tailwind                             |
| Wallet    | `@initia/interwovenkit-react@2.8.0` (auto-sign sessions)     |
| RPC       | viem + wagmi                                                 |
| Fairness  | server-assisted commit-reveal, keccak256                     |

## Project layout

```
kaboom-initia/
├── contracts/Kaboom.sol     # Solidity contract
├── hardhat.config.ts
├── scripts/deploy.ts
├── test/Kaboom.test.ts
├── deployments/             # written by deploy script
└── frontend/                # Next.js 15 app
    ├── src/app/             # pages + /api routes
    ├── src/components/      # Navbar, Grid, Tile, modals, …
    ├── src/hooks/           # useGame, useContracts, useModal, …
    ├── src/lib/             # chain.ts (ABI), wagmi.ts, server/
    └── src/providers/Web3Provider.tsx
```

## Initia-native feature: Auto-Sign sessions

Mines is pay-per-click. Every "please sign this tile reveal" popup kills the
experience. The port uses InterwovenKit's `autoSign.enable()` to let the user
tap "Enable Session" once, grant `authz + feegrant` to a scoped ghost wallet,
and then every subsequent `revealTile` runs with no wallet round trip. Session
is revocable at any time. This is the single biggest UX gap Web3 gaming has,
Initia closes it natively, and Kaboom demonstrates it.

## Provably fair: server-assisted commit-reveal

1. Server generates `mineLayout` (uint16 bitmask) + 32-byte `salt`.
2. Server computes `commitment = keccak256(abi.encodePacked(uint16, uint8, bytes32))`.
3. Player calls `startGame(mineCount, commitment)` with value = bet. The
   commitment is locked on-chain, the layout is still secret.
4. Server calls `revealTile(player, index, isMine)` per click.
5. At `cashOut` or mine-hit, server calls `settleGame(player, layout, salt)`.
   Contract recomputes the keccak256, rejects if the commitment doesn't match
   or any revealed tile is inconsistent with the layout.
6. `verifyGame(player)` re-checks any finished round.

## Vault safety rails (enforced by the contract)

- `maxBet = 2%` of vault balance
- `maxPayout = 10%` of vault balance (checked against worst-case multiplier)
- 5-minute `refundExpired` if the server stalls
- `pause` switch + owner-only `withdrawVault` / `updateVault`

## Quick start

```
# 1. Deploy the contract
cp .env.example .env             # fill PRIVATE_KEY, INITIA_RPC_URL, …
npm install
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.ts --network initia
# → writes deployments/initia.json with the address

# 2. Run the frontend
cd frontend
cp .env.local.example .env.local # paste the contract address + house key
npm install
npm run dev
```

See `docs/deploy.md` for the full runbook.

## Hackathon compliance

- [x] Deployed as its own Initia appchain/rollup (`kaboom-1`, pending Anvil Credits)
- [x] Uses `@initia/interwovenkit-react` for wallet connection
- [x] Implements at least one Initia-native feature (Auto-Sign sessions)
- [x] Required `.init` file present at repo root

## License

MIT
