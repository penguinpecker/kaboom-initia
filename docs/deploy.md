# Deployment Runbook

Zero → deployed → demoable in ~20 minutes.

## Prerequisites

- Node 20+
- An Initia MiniEVM endpoint (you'll swap to your own `kaboom-1` Minitia post-provisioning)
- Two EOA private keys:
  - **Deployer** — owns the vault, can withdraw
  - **House authority** — signs `revealTile` / `settleGame` / `closeGame`

Generate them easily:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Fund both with INIT from the faucet / your bridge.

---

## 1. Deploy the contract

```bash
cd kaboom-initia
cp .env.example .env
```

Edit `.env`:

```
PRIVATE_KEY=<deployer 0x-prefixed key>
HOUSE_AUTHORITY=<house authority 0x address>
INITIA_RPC_URL=https://jsonrpc-<your-chain>.anvil.asia-southeast.initia.xyz
INITIA_EVM_CHAIN_ID=<your chain id from initia-registry>
SEED_VAULT=0.5
```

Then:

```bash
npm install
npx hardhat compile
npx hardhat test       # should be green
npx hardhat run scripts/deploy.ts --network initia
```

Output:

```
✓ Kaboom deployed at: 0xabc…
Seeded vault with 0.5 INIT
Wrote deployments/initia.json
```

Copy the address.

### Verify on InitiaScan (optional)

```bash
npx hardhat verify --network initia 0xabc… \
  "<houseAuthority>" 200 200 1000
```

(InitiaScan is Etherscan-format; `hardhat-verify` just works.)

---

## 2. Configure the frontend

```bash
cd frontend
cp .env.local.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_KABOOM_ADDRESS=0xabc…              # from step 1
HOUSE_AUTHORITY_KEY=0x<house private key>      # 0x-prefixed
NEXT_PUBLIC_INITIA_RPC_URL=<same as above>
NEXT_PUBLIC_INITIA_EVM_CHAIN_ID=<same>
NEXT_PUBLIC_INITIA_COSMOS_CHAIN_ID=<cosmos chain id, e.g. kaboom-1>
NEXT_PUBLIC_INITIA_CHAIN_NAME=Kaboom Minitia
NEXT_PUBLIC_INITIA_EXPLORER=https://scan.initia.xyz
INITIA_RPC_URL=<same as NEXT_PUBLIC_INITIA_RPC_URL>
INITIA_EVM_CHAIN_ID=<same as NEXT_PUBLIC_INITIA_EVM_CHAIN_ID>
```

```bash
npm install
npm run dev
```

Open http://localhost:3000 and smoke-test:

1. Click "Connect" in the navbar → InterwovenKit onboarding
2. Click "Enable Session" → grant authz
3. Bet 0.01 INIT, reveal tiles, cash out
4. Check `/vault` — balance should reflect the game
5. Check `/logs` — the round should appear with a tx link to InitiaScan

### If anything misbehaves, check `/api/health`

```bash
curl http://localhost:3000/api/health
```

Should return `{ ok: true, houseAddress, houseBalance, blockNumber }`. If
`houseBalance` is 0, fund the house wallet so it can sign `revealTile`.

---

## 3. Deploy to Vercel

```bash
cd frontend
npx vercel --prod
```

Then in the Vercel dashboard, paste every variable from `.env.local` into
the project's environment variables. `NEXT_PUBLIC_*` ones auto-exposed to
the client; the others (`HOUSE_AUTHORITY_KEY`, `INITIA_RPC_URL`,
`INITIA_EVM_CHAIN_ID`) stay server-only.

**Never commit `.env.local`.** The house key has vault write access.

---

## 4. Swap to your own mainnet Minitia

Once Initia provisions `kaboom-1` via the Anvil Credits program:

1. They give you a json-rpc URL like
   `https://jsonrpc-kaboom-1.anvil.asia-southeast.initia.xyz` + an `evm_chain_id`.
2. Update both `.env` (contracts) and Vercel env vars (frontend).
3. Re-run `npx hardhat run scripts/deploy.ts --network initia` against the
   new RPC. This deploys a fresh contract on your Minitia.
4. Update `NEXT_PUBLIC_KABOOM_ADDRESS` in Vercel.
5. Seed the mainnet vault from the deployer with as much INIT as you want to
   be bettable (`fundVault()` is public — anyone can contribute).

Zero code changes required.

---

## Common issues

| Symptom                                         | Fix                                                                 |
|-------------------------------------------------|---------------------------------------------------------------------|
| `mcopy opcode unsupported`                      | You're on Cancun-style EVM. `hardhat.config.ts` pins Shanghai.      |
| `VaultInsufficient()` on `startGame`            | Vault balance × `maxPayoutBps` < worst-case payout. Fund the vault. |
| Tile clicks popup a wallet each time            | Session expired or not enabled. Re-tap "Enable Session".            |
| `revealTile` reverts with `NotHouse()`          | `HOUSE_AUTHORITY_KEY` doesn't match the on-chain `houseAuthority`.  |
| `CommitmentMismatch()` on settle                | Session token tampered or wrong network. Clear localStorage.        |
| Stuck game ("Active game exists")               | `/api/cleanup` settles & closes — hit it with POST `{player}`.      |
