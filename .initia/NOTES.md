# KABOOM! — INITIATE Hackathon Submission

**Project**: KABOOM! — On-chain provably fair Mines on Initia MiniEVM
**Author**: penguinpecker (`penguinpecker1@gmail.com`)
**Repo**: https://github.com/penguinpecker/kaboom-initia
**Demo**: https://kaboom-initia.vercel.app
**Contract**: `0x…` (set after deployment, see `contracts/deployments/<network>.json`)

## Rollup

| Field             | Value                                                                      |
|-------------------|----------------------------------------------------------------------------|
| Chain ID          | `kaboom-1` _(target, pending Anvil Credits provisioning)_                  |
| EVM Chain ID      | _(assigned by Initia at provisioning)_                                     |
| VM                | MiniEVM                                                                    |
| Bech32 prefix     | `init`                                                                     |
| Fee token         | INIT                                                                       |

Demo deployment runs on the Initia MiniEVM testnet with identical contract
bytecode and identical commitment semantics.

## Initia-native features used

1. **Auto-Sign / Session UX** (`@initia/interwovenkit-react`) — a user taps
   "Enable Session" once after connecting, and every subsequent tile click is
   session-signed via the granted authz + feegrant. No wallet popup per tile.
   This makes pay-per-click games feel like Web2, which is the entire UX
   argument for MiniEVM.
2. **InterwovenKit for wallet connection** — the only wallet layer used.
   Supports Initia Wallet, Keplr, MetaMask, social login.

## Tracks

- Gaming & Consumer
- AI & Tooling (auto-sign session UX is tooling-adjacent)

## Required evidence

- Contract source: `contracts/Kaboom.sol`
- Test suite:     `contracts/test/Kaboom.test.ts`
- Deployment tx:  see `contracts/deployments/<network>.json` (written by
                  `scripts/deploy.ts`)
- Demo video:     _(to be recorded)_

## How it works (judge quick-read)

1. Server generates a secret 16-bit mine layout + 32-byte salt.
2. Server computes `commitment = keccak256(abi.encodePacked(uint16 layout, uint8 count, bytes32 salt))`.
3. Player calls `startGame(mineCount, commitment)` with value = bet. The
   commitment is locked on-chain; the layout is still secret.
4. Per tile click: server (house authority) calls `revealTile(player, index, isMine)`.
5. Player either cashes out or hits a mine.
6. Server calls `settleGame(player, layout, salt)`. The contract recomputes
   the keccak256 and rejects the settlement if it doesn't match the original
   commitment or if any revealed tile is inconsistent with the layout.
7. Anyone can call `verifyGame(player)` afterwards to re-check.
