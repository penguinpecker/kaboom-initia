#!/bin/sh
set -eux
HOME_DIR="${HOME:-/data}"
STATE_DIR="${HOME_DIR}/.minitia"
# Always re-overlay the config (app.toml, config.toml, client.toml, node_key.json, priv_validator_key.json,
# artifacts-rollup/) from the baked-in seed so deploys converge on a known good config.
# Chain state (data/ after boot) lives on the volume and is preserved.
FIRST_BOOT=""
if [ ! -f "${STATE_DIR}/config/genesis.json" ]; then
  FIRST_BOOT=1
  echo ">> First boot — seeding state into ${STATE_DIR}"
  mkdir -p "${STATE_DIR}/config" "${STATE_DIR}/data"
  echo '{"height":"0","round":0,"step":0}' > "${STATE_DIR}/data/priv_validator_state.json"
fi
# Even on non-first boot, refresh config files (not data/).
echo ">> Refreshing config from seed"
tar -xzf /seed/minitia-state.tar.gz -C "${STATE_DIR}" --overwrite \
  config/genesis.json config/app.toml config/config.toml config/client.toml \
  config/node_key.json config/priv_validator_key.json artifacts-rollup

APP_TOML="${STATE_DIR}/config/app.toml"
CFG_TOML="${STATE_DIR}/config/config.toml"
sed -i 's|address = "127.0.0.1:8545"|address = "0.0.0.0:8545"|' "${APP_TOML}"
sed -i 's|address = "127.0.0.1:8546"|address = "0.0.0.0:8546"|' "${APP_TOML}"
sed -i 's|laddr = "tcp://127.0.0.1:26657"|laddr = "tcp://0.0.0.0:26657"|' "${CFG_TOML}"
# Keep indexer enabled (it uses goleveldb fallback — the rocksdb warning is harmless)
# JSON-RPC must stay enabled.

# Railway service domain points at 8545, keep JSON-RPC HTTP there.
echo "=== [json-rpc] section (bind 0.0.0.0:8545) ==="
awk '/^\[json-rpc\]/,/^\[/' "${APP_TOML}" | head -18
echo "=== /section ==="

echo ">> app.toml [json-rpc] + [versiondb] + indexer:"
grep -n "enable\|indexer-disable\|^address" "${APP_TOML}" | head -20 || true

# Run minitiad with stderr redirected to stdout, log on exit
minitiad start --home "${STATE_DIR}" 2>&1
EC=$?
echo ">> minitiad exited with code $EC" >&2
exit $EC
