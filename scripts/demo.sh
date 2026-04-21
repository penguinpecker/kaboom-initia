#!/usr/bin/env bash
# KABOOM! end-to-end demo — exercises every API route + on-chain call.
#
# Prereqs (see docs/deploy.md for a longer guide):
#   1) minitiad start (running kaboom-1 rollup locally, EVM JSON-RPC :8545)
#   2) npm run dev in ./frontend (Next.js on :3000)
#   3) .env populated with PRIVATE_KEY (deployer == house authority)
#
# Usage:
#   bash scripts/demo.sh           # one win-path game
#   NUM_GAMES=3 bash scripts/demo.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a; . "$ROOT/.env"; set +a

RPC="${INITIA_RPC_URL:-http://localhost:8545}"
API="${KABOOM_API:-http://localhost:3000}"
ADDR="${KABOOM_ADDR:-$(jq -r .address deployments/initia.json)}"
NUM_GAMES="${NUM_GAMES:-1}"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
dim()  { printf "\033[2m%s\033[0m\n" "$*"; }

rpc() {
  curl -s -X POST -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"$1\",\"params\":$2,\"id\":1}" "$RPC" | jq -r .result
}

# ABI-decode helpers via direct eth_call (avoids viem chain-config)
selector() { node -e "const{keccak256,toBytes}=require('viem');console.log(keccak256(toBytes(process.argv[1])).slice(0,10))" "$1"; }
wei_to_init() { node -e "console.log((BigInt(process.argv[1])/10n**14n)/10000)" "$1"; }

show_state() {
  local label="$1"
  local tg_hex vb_hex tg_dec vb_init
  tg_hex=$(rpc eth_call "[{\"to\":\"$ADDR\",\"data\":\"0x2c4e591b\"},\"latest\"]") # totalGames()
  vb_hex=$(rpc eth_call "[{\"to\":\"$ADDR\",\"data\":\"0x0bf6cc08\"},\"latest\"]") # vaultBalance()
  tg_dec=$(printf "%d" "$tg_hex")
  vb_init=$(wei_to_init "$(printf "%d" "$vb_hex")")
  echo "$label: totalGames=$tg_dec, vaultBalance=$vb_init INIT"
}

bold "== Rollup info =="
CHAIN_HEX=$(rpc eth_chainId "[]")
CHAIN_DEC=$(printf "%d" "$CHAIN_HEX")
BLOCK_HEX=$(rpc eth_blockNumber "[]")
BLOCK_DEC=$(printf "%d" "$BLOCK_HEX")
echo "chain_id        : $CHAIN_DEC ($CHAIN_HEX)"
echo "block height    : $BLOCK_DEC"
echo "contract        : $ADDR"
echo

bold "== /api/health =="
curl -s "$API/api/health" | jq .
echo

PLAYER=$(node -e "
  const { privateKeyToAccount } = require('viem/accounts');
  console.log(privateKeyToAccount(process.env.PRIVATE_KEY).address);
")

for n in $(seq 1 "$NUM_GAMES"); do
  bold "== Game $n =="

  # 1. Pre-game state
  show_state before

  # 2. /api/commit
  COMMIT=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"player\":\"$PLAYER\",\"mineCount\":1,\"betWei\":\"10000000000000000\"}" \
    "$API/api/commit")
  CMT=$(echo "$COMMIT" | jq -r .commitment)
  TOKEN=$(echo "$COMMIT" | jq -r .gameToken)
  echo "/api/commit → commitment=$CMT"

  # 3. player signs startGame on-chain
  TX=$(PK="$PRIVATE_KEY" node --input-type=module -e "
    import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
    import { privateKeyToAccount } from 'viem/accounts';
    const rpc='$RPC', cid=$CHAIN_DEC;
    const chain = { id: cid, name: 'kaboom-1', nativeCurrency:{name:'Initia',symbol:'INIT',decimals:18}, rpcUrls:{default:{http:[rpc]}} };
    const account = privateKeyToAccount(process.env.PK);
    const pc = createPublicClient({ chain, transport: http(rpc) });
    const wc = createWalletClient({ account, chain, transport: http(rpc) });
    const abi = [{ type:'function',name:'startGame',stateMutability:'payable',inputs:[{type:'uint8'},{type:'bytes32'}],outputs:[] }];
    const h = await wc.writeContract({ address:'$ADDR', abi, functionName:'startGame', args:[1, '$CMT'], value: parseEther('0.01') });
    await pc.waitForTransactionReceipt({ hash: h });
    console.log(h);
  ")
  echo "startGame tx    : $TX"

  # 4. reveal up to 5 tiles (sequential)
  RESULT="unknown"
  for t in 0 1 2 3 4; do
    RESP=$(curl -s -X POST -H "Content-Type: application/json" \
      -d "{\"player\":\"$PLAYER\",\"tileIndex\":$t,\"gameToken\":\"$TOKEN\"}" \
      "$API/api/reveal")
    IS_MINE=$(echo "$RESP" | jq -r .isMine)
    REVEAL_TX=$(echo "$RESP" | jq -r .revealTx)
    NEW_TOKEN=$(echo "$RESP" | jq -r .gameToken)
    if [ "$NEW_TOKEN" != "null" ]; then TOKEN="$NEW_TOKEN"; fi
    printf "/api/reveal %-2d : isMine=%-5s tx=%s\n" "$t" "$IS_MINE" "${REVEAL_TX:0:18}…"
    if [ "$IS_MINE" = "true" ]; then RESULT="LOSS (auto-settled)"; break; fi
  done

  if [ "$RESULT" != "LOSS (auto-settled)" ]; then
    # 5. cashOut (player signs)
    CASH_TX=$(PK="$PRIVATE_KEY" node --input-type=module -e "
      import { createWalletClient, createPublicClient, http } from 'viem';
      import { privateKeyToAccount } from 'viem/accounts';
      const rpc='$RPC', cid=$CHAIN_DEC;
      const chain = { id: cid, name: 'kaboom-1', nativeCurrency:{name:'Initia',symbol:'INIT',decimals:18}, rpcUrls:{default:{http:[rpc]}} };
      const account = privateKeyToAccount(process.env.PK);
      const pc = createPublicClient({ chain, transport: http(rpc) });
      const wc = createWalletClient({ account, chain, transport: http(rpc) });
      const abi = [{ type:'function',name:'cashOut',stateMutability:'nonpayable',inputs:[],outputs:[] }];
      const h = await wc.writeContract({ address:'$ADDR', abi, functionName:'cashOut', args:[] });
      await pc.waitForTransactionReceipt({ hash: h });
      console.log(h);
    ")
    echo "cashOut tx      : $CASH_TX"
    # 6. /api/settle
    SETTLE=$(curl -s -X POST -H "Content-Type: application/json" \
      -d "{\"player\":\"$PLAYER\",\"gameToken\":\"$TOKEN\",\"phase\":\"settle\"}" \
      "$API/api/settle")
    echo "/api/settle     : $(echo "$SETTLE" | jq -c '{settleTx,closeTx,mineLayout,verified}')"
    RESULT="WIN (verified)"
  fi

  # 7. Post-game state
  show_state after

  bold "   → $RESULT"
  echo
done
