# kaboom-1 rollup provenance

This project runs its **own rollup** on top of Initia's `initiation-2` testnet.

| Field | Value |
|---|---|
| Cosmos chain-id | `kaboom-1` |
| EVM chain id | `932743922545997` (`0x350535e2b754d`) |
| VM | MiniEVM (`minitiad` v1.2.15) |
| L1 | `initiation-2` (Initia testnet) |
| L1 RPC | `https://rpc.initiation-2.initia.xyz:443` |
| OPinit **bridge ID** | **1874** |
| Bridge registration tx | L1 block `22281826`, 2026-04-22 |
| Bridge executor (L1) | `init1f8gfdchqhhcwve9rppgl5py9hezexkkwzy75et` |
| Admin / Validator (L2) | auto-generated during `minitiad launch`, see `artifacts-rollup/config.json` |
| Deployer / House authority (L2) | `init1tnjnx8q7vfj94wgrcdf6a27mgf9ta55x4wdwvs` = EVM `0x5Ce5331c1e62645ab903c353AeABDb424AbED286` |
| Kaboom contract | `0x9c1aF3D3741542019f3A3C6C33eD3638db07A18b` |

## Reproduce

```bash
# 1. Install CLIs (macOS)
brew install initia-labs/tap/weave
git clone https://github.com/initia-labs/initia   && cd initia   && make install && cd -
git clone https://github.com/initia-labs/minievm && cd minievm  && git checkout v1.2.15 && make install && cd -

# 2. Fund the bridge executor on L1 initiation-2 (needs ~2 INIT)
#    (Fund via https://app.testnet.initia.xyz/faucet then `initiad tx bank send`.)

# 3. Launch
minitiad launch --with-config scripts/launch-config.json --artifacts-dir artifacts-rollup/

# 4. Fix denom + start (launchtools writes umin, code expects GAS)
#    See `scripts/launch-config.json` — it sets l2_config.denom = "GAS"
#    and genesis_accounts use "GAS" too, so no post-launch sed is needed on fresh runs.

# 5. Start node
minitiad start
```

## Why the local launch has GAS as the gas token

MiniEVM's `NewDefaultGenesisState` special-cases the default OPinit denom
`umin` and rewrites it to `GAS`. Using `GAS` explicitly (in both
`l2_config.denom` and `genesis_accounts.coins`) keeps balances and gas
prices consistent post-launch.

## Why submission_address doesn't change between local-standalone and weave-launched runs

Both runs:
- Use the same deployer (0x5Ce5…D286) at nonce 0
- Compile Kaboom.sol the same way

so the CREATE address is deterministic: `0x9c1aF3D3741542019f3A3C6C33eD3638db07A18b`.
