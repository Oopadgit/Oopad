import { keccak256 } from "viem";
import {
  createRpc,
  createEnricher,
  parseLaunch,
  recoverPhase,
  launchTopic,
  phaseTopics,
  hex,
  hexNumber,
  PONS_FACTORY,
  PONS_CODE_HASHES,
} from "../backend/pons-data.mjs";
const rpc = createRpc();
const enrich = createEnricher(rpc);
let cache: any = null;
let pending: Promise<any> | null = null;
let cursor = 0;
let floor = 0;
let checkpoint: string | null = null;
let rows = new Map<string, any>();

// Serverless capture, bounded to one scan window. Never claim a durable full-chain index.
export async function live() {
  if (cache && Date.now() - cache.checkedAt < 12000) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      const [chain, headHex, code] = await rpc([
        ["eth_chainId", []],
        ["eth_blockNumber", []],
        ["eth_getCode", [PONS_FACTORY, "latest"]],
      ]);
      if (
        hexNumber(chain) !== 4663 ||
        keccak256(code) !== PONS_CODE_HASHES.factory
      )
        throw Error("Protocol verification unavailable");
      const head = hexNumber(headHex) - 2;
      if (checkpoint) {
        const [old] = await rpc([
          ["eth_getBlockByNumber", [hex(cursor), false]],
        ]);
        if (old?.hash !== checkpoint) {
          rows.clear();
          cursor = 0;
          floor = 0;
        }
      }
      const from = Math.max(0, cursor ? cursor + 1 : head - 4999);
      if (!floor) floor = from;
      if (from <= head) {
        const end = Math.min(head, from + 4999);
        const [logs, block] = await rpc([
          [
            "eth_getLogs",
            [
              {
                address: PONS_FACTORY,
                fromBlock: hex(from),
                toBlock: hex(end),
                topics: [[launchTopic, ...phaseTopics]],
              },
            ],
          ],
          ["eth_getBlockByNumber", [hex(end), false]],
        ]);
        for (const log of logs.slice(-40)) {
          try {
            const row =
              log.topics[0] === launchTopic
                ? parseLaunch(log, null)
                : await recoverPhase(log, null, rpc, end);
            rows.set(row.address, { ...rows.get(row.address), ...row });
          } catch {
            /* Malformed or unmatched source rows stay excluded. */
          }
        }
        cursor = end;
        checkpoint = block.hash;
      }
      const candidates = [...rows.values()]
        .sort((a, b) => b.block - a.block)
        .slice(0, 72);
      for (const row of candidates
        .filter(
          (r) => !r.symbol || !r.stateAt || Date.now() - r.stateAt > 30000,
        )
        .slice(0, 18)) {
        try {
          rows.set(row.address, await enrich(row, cursor, Date.now()));
        } catch {
          /* Retain pending metadata, never invent it. */
        }
      }
      const tokens = [...rows.values()]
        .sort((a, b) => b.block - a.block)
        .slice(0, 180);
      rows = new Map(tokens.map((t) => [t.address, t]));
      cache = {
        tokens,
        status: "live",
        checkedAt: Date.now(),
        coverage: { fromBlock: floor, toBlock: cursor, head, retention: 180 },
        error: null,
      };
      return cache;
    } catch {
      return cache
        ? {
            ...cache,
            status: "cached",
            error:
              "Live capture unavailable. Showing the last successful window.",
          }
        : {
            tokens: [],
            status: "unavailable",
            checkedAt: null,
            coverage: null,
            error: "The Robinhood launch source is temporarily unavailable",
          };
    }
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
