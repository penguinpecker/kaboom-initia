// Drop-in shim so the pages carried over from the Solana version keep working.
// On EVM these are native wagmi/viem helpers — no more Lamports.

import { formatEther as viemFormatEther } from "viem";
export { useAccount, useBalance } from "wagmi";

export function formatEther(value: bigint | number | undefined): string {
  if (value === undefined || value === null) return "0";
  if (typeof value === "number") return (value / 1e18).toString();
  return viemFormatEther(value);
}
