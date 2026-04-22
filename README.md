# KABOOM! — On-Chain Mines on Initia MiniEVM

Provably fair 4×4 Mines with session-signed tile clicks via InterwovenKit.
Built for the INITIATE hackathon, Season 1.

**Live demo:** https://kaboom-initia.vercel.app
**Rollup RPC:** `https://kaboom-rollup-production.up.railway.app` — chain id `932743922545997`, cosmos chain-id `kaboom-1`, OPinit bridge id `1874` on `initiation-2`
**Contract:** `0x9c1aF3D3741542019f3A3C6C33eD3638db07A18b`

---

## Initia Hackathon Submission

### Project Name
**KABOOM!** — on-chain provably-fair Mines on Initia MiniEVM.

### Project Overview
Mines is one of the most-played CEX casino games of the past two years, yet every existing on-chain port is either custodial or RNG-opaque. KABOOM! is a self-sovereign Mines — every bet, reveal and payout lands on its own Initia MiniEVM rollup, and a commitment lock makes the house's secret mine layout publicly auditable after each round. Target users are crypto-native casino players who want provable fairness without giving up the fast-feeling UX of a centralised app. The twist that makes it worth building on Initia rather than on any L1/L2: InterwovenKit's auto-signing turns per-tile wallet popups into a single one-click grant, so playing feels like a web2 game with a web3 receipt.

### Implementation Detail
`contracts/Kaboom.sol` implements a full server-assisted commit-reveal: the server seeds a uint16 mine-layout bitmask + 32-byte salt, commits `keccak256(abi.encodePacked(uint16 mineLayout, uint8 mineCount, bytes32 salt))` on-chain at `startGame`, drives `revealTile(player, index, isMine)` per click, and finally `settleGame` re-derives the commitment and compares every revealed tile against the final layout — any cheating by the server causes settlement to revert. On-chain multiplier math uses a hypergeometric product `Π (16 − i) / (16 − mineCount − i)` in bps with a 2 % house edge, plus vault safety rails (`maxBet = 2 % of vault`, `maxPayout = 10 % of vault`, 5-minute `refundExpired` if the server stalls). Byte-for-byte commitment parity between viem's `encodePacked` and Solidity's `abi.encodePacked` is asserted in `test/CommitmentParity.test.ts`. 7/7 hardhat tests pass.

### The Native Feature
**Auto-signing** (`authz` + `feegrant`) via `@initia/interwovenkit-react@2.8.0`'s `kit.autoSign.enable()`. One tap on **Enable Session** asks the wallet to sign a single MsgGrant + MsgGrantAllowance for the `/cosmos.evm.vm.v1.MsgCall` and `/cosmos.evm.vm.v1.MsgCreate` message types, scoped to a session key for a chosen duration (10 min default). Every subsequent tile reveal and cash-out runs under that grant — no wallet round trip, no modal, no per-click gas from the user's hot wallet. This is the biggest UX gap Web3 gaming has, and Initia closes it natively rather than via app-level custody or off-chain signing services. Wiring: `frontend/src/hooks/useGame.tsx#enableAutoSign` → the **Enable Session** button in the top bar.

### How to Run Locally
```bash
# 1. Deploy the contract (or connect to the live rollup).
git clone https://github.com/penguinpecker/kaboom-initia && cd kaboom-initia
cp .env.example .env                    # fill PRIVATE_KEY, INITIA_RPC_URL
npm install && npx hardhat test         # 7/7 green
npx hardhat run scripts/deploy.ts --network initia   # writes deployments/initia.json

# 2. Run the frontend.
cd frontend
cp .env.local.example .env.local        # paste contract addr + HOUSE_AUTHORITY_KEY
npm install && npm run dev              # → http://localhost:3000

# 3. Connect wallet — InterwovenKit auto-adds kaboom-1 to MetaMask
#    (chain id 932743922545997, RPC https://kaboom-rollup-production.up.railway.app).
# 4. Click "Enable Session" → sign once → tiles click silently.
```

Full runbook incl. `minitiad launch --with-config scripts/launch-config.json` for spinning up your own rollup: `docs/deploy.md` + `.initia/ROLLUP.md`.

---

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
