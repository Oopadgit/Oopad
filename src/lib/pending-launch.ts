import type { Hex } from "viem";
const key = "oopad.pending-launch.v1";
const historyKey = "oopad.launch-transactions.v1";
export const pendingEvent = "oopad:pending-launch";
let memory: Hex | null = null;
export function readPendingLaunch(): Hex | null {
  try {
    const hash = localStorage.getItem(key);
    if (hash && /^0x[\da-f]{64}$/i.test(hash)) return hash as Hex;
  } catch {
    /* In-memory status survives route changes when storage is blocked. */
  }
  return memory;
}
export function recordLaunchHash(
  hash: Hex,
  status: "submitted" | "confirmed" | "reverted",
) {
  if (!/^0x[\da-f]{64}$/i.test(hash)) throw new Error("Invalid launch hash.");
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(historyKey) || "[]",
    );
    const items = Array.isArray(stored)
      ? stored.filter(
          (item) =>
            item &&
            /^0x[\da-f]{64}$/i.test(item.hash) &&
            item.hash.toLowerCase() !== hash.toLowerCase(),
        )
      : [];
    localStorage.setItem(
      historyKey,
      JSON.stringify(
        [{ hash, status, updatedAt: new Date().toISOString() }, ...items].slice(
          0,
          50,
        ),
      ),
    );
  } catch {
    /* Wallet activity is the authoritative transaction history. */
  }
  if (status === "submitted") {
    memory = hash;
    try {
      localStorage.setItem(key, hash);
    } catch {
      /* Keep the memory copy. */
    }
  } else if (readPendingLaunch()?.toLowerCase() === hash.toLowerCase()) {
    memory = null;
    try {
      localStorage.removeItem(key);
    } catch {
      /* The visible receipt still reports the result. */
    }
  }
  window.dispatchEvent(new Event(pendingEvent));
}
