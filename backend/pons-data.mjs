import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  encodeAbiParameters,
  keccak256,
  parseAbi,
  toEventSelector,
  formatUnits,
} from "viem";
import {
  PONS_FACTORY,
  PONS_CODE_HASHES,
  ponsFactoryAbi,
  ponsReadAbi,
} from "../src/domain/pons.js";
import { limitedJson } from "../server/source.js";

export { PONS_FACTORY, PONS_CODE_HASHES };
export const launchTopic = toEventSelector(
  "TokenLaunched(address,address,address,address,uint256,uint256)",
);
export const phaseAbi = parseAbi([
  "event LaunchSwept(address indexed token, uint256 quoteOut, uint256 tokenOut)",
  "event PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount)",
]);
export const phaseTopics = [
  toEventSelector("LaunchSwept(address,uint256,uint256)"),
  toEventSelector("PoolGraduated(address,uint256,uint256,uint256)"),
];
export const curveAbi = parseAbi([
  "function getReserves() view returns (uint256 quoteReserve,uint256 tokenReserve)",
  "function realQuoteReserve() view returns (uint256)",
  "function feeBps() view returns (uint256)",
]);
const ercAbi = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
const zero = "0x" + "0".repeat(40);
const addressPattern = /^0x[0-9a-f]{40}$/i;
const hashPattern = /^0x[0-9a-f]{64}$/i;
export const addressOK = (value) =>
  typeof value === "string" && addressPattern.test(value);
export const hexNumber = (value) => {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value))
    throw Error("Invalid number");
  const n = Number(BigInt(value));
  if (!Number.isSafeInteger(n) || n < 0) throw Error("Invalid number");
  return n;
};
export const hex = (n) => "0x" + BigInt(n).toString(16);
export function safeLink(value) {
  if (typeof value !== "string" || value.length > 1600) return null;
  if (/^ipfs:\/\/[a-zA-Z0-9/._-]+$/.test(value))
    value = "https://ipfs.io/ipfs/" + value.slice(7).replace(/^ipfs\//, "");
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      !u.hostname.includes(".") ||
      u.hostname === "localhost" ||
      u.hostname.endsWith(".local") ||
      /^[\d.]+$/.test(u.hostname) ||
      u.hostname.includes(":") ||
      u.hostname.startsWith("[")
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
function label(v, max) {
  return typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "")
        .slice(0, max)
    : "";
}
export function parseLaunch(log, time) {
  if (
    !log ||
    log.removed ||
    log.address?.toLowerCase() !== PONS_FACTORY.toLowerCase() ||
    !hashPattern.test(log.transactionHash) ||
    !hashPattern.test(log.blockHash)
  )
    throw Error("Invalid launch");
  const { args, eventName } = decodeEventLog({
    abi: ponsFactoryAbi,
    data: log.data,
    topics: log.topics,
    strict: true,
  });
  if (
    eventName !== "TokenLaunched" ||
    ![args.token, args.curve, args.deployer, args.pairToken].every(addressOK)
  )
    throw Error("Invalid launch");
  return {
    address: args.token.toLowerCase(),
    curve: args.curve.toLowerCase(),
    creator: args.deployer.toLowerCase(),
    quoteAddress: args.pairToken.toLowerCase(),
    thresholdRaw: String(args.graduationThreshold),
    configId: String(args.launchConfigId),
    block: hexNumber(log.blockNumber),
    blockHash: log.blockHash,
    tx: log.transactionHash,
    logIndex: hexNumber(log.logIndex),
    createdAt: time,
    observedAt: Date.now(),
    name: null,
    symbol: null,
    image: null,
    description: null,
    socials: {},
    phase: null,
    progress: null,
    stateAt: null,
    priceQuote: null,
    raisedQuote: null,
    thresholdQuote: null,
    creatorTaxBps: null,
    feeBps: null,
    poolId: null,
    quoteSymbol: args.pairToken.toLowerCase() === zero ? "ETH" : null,
    metadataStatus: "pending",
  };
}
export function createRpc(fetcher = fetch) {
  const buckets = { scan: [], enrich: [], chart: [], history: [] };
  let sequence = 1;
  let gate = Promise.resolve();
  let recent = [];
  async function pace(count) {
    const turn = gate.then(async () => {
      while (true) {
        const now = Date.now();
        recent = recent.filter((at) => now - at < 1100);
        if (recent.length + count <= 24) {
          recent.push(...Array(count).fill(now));
          return;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(1, 1100 - (now - recent[0]))),
        );
      }
    });
    gate = turn.catch(() => {});
    return turn;
  }
  return async function rpc(calls, bucket = "scan") {
    if (!calls.length) return [];
    if (calls.length > 20) {
      const values = [];
      for (let i = 0; i < calls.length; i += 20)
        values.push(...(await rpc(calls.slice(i, i + 20), bucket)));
      return values;
    }
    const now = Date.now();
    buckets[bucket] = buckets[bucket].filter((t) => now - t < 60000);
    if (
      buckets[bucket].length + calls.length >
      (bucket === "enrich" ? 600 : bucket === "history" ? 600 : 240)
    )
      throw Error("RPC budget cooldown");
    buckets[bucket].push(...calls.map(() => now));
    const url = process.env.OOPAD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
    if (!url?.startsWith("https://")) throw Error("RPC unavailable");
    const body = calls.map(([method, params]) => ({
      jsonrpc: "2.0",
      id: sequence++,
      method,
      params,
    }));
    // All indexer work shares the provider's per-second allowance.
    await pace(calls.length);
    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error("RPC unavailable");
    const raw = await limitedJson(response);
    if (!Array.isArray(raw) || raw.length !== body.length)
      throw Error("RPC response unavailable");
    return body.map(({ id }) => {
      const matches = raw.filter((r) => r?.id === id);
      if (matches.length !== 1 || matches[0].error || !("result" in matches[0]))
        throw Error("RPC response unavailable");
      return matches[0].result;
    });
  };
}
function call(address, abi, name, args = [], block = "latest") {
  return [
    "eth_call",
    [
      {
        to: address,
        data: encodeFunctionData({ abi, functionName: name, args }),
      },
      block,
    ],
  ];
}
function decode(abi, name, result) {
  return decodeFunctionResult({ abi, functionName: name, data: result });
}
export function createEnricher(rpc) {
  const quotes = new Map([[zero, { symbol: "ETH", decimals: 18 }]]);
  return async (row, block, stateAt) => {
    const fresh = !row.symbol,
      tag = hex(block);
    const calls = [
      call(
        PONS_FACTORY,
        ponsFactoryAbi,
        "getLaunchedToken",
        [row.address],
        tag,
      ),
      call(row.curve, curveAbi, "getReserves", [], tag),
      call(row.curve, curveAbi, "realQuoteReserve", [], tag),
    ];
    if (fresh)
      calls.push(
        call(row.address, ponsReadAbi, "name", [], tag),
        call(row.address, ponsReadAbi, "symbol", [], tag),
        call(row.address, ponsReadAbi, "getTokenInfo", [], tag),
        call(row.address, ercAbi, "decimals", [], tag),
        call(row.address, ercAbi, "totalSupply", [], tag),
        call(row.curve, curveAbi, "feeBps", [], tag),
      );
    const data = await rpc(calls, "enrich");
    const state = decode(ponsFactoryAbi, "getLaunchedToken", data[0]);
    if (
      !state.exists ||
      state.curve.toLowerCase() !== row.curve ||
      state.token.toLowerCase() !== row.address ||
      state.deployer.toLowerCase() !== row.creator ||
      state.pairToken.toLowerCase() !== row.quoteAddress
    )
      throw Error("Launch identity mismatch");
    let meta = {};
    if (fresh) {
      const info = decode(ponsReadAbi, "getTokenInfo", data[5]);
      if (info[0].toLowerCase() !== row.creator)
        throw Error("Metadata identity mismatch");
      meta = {
        name: label(decode(ponsReadAbi, "name", data[3]), 80),
        symbol: label(decode(ponsReadAbi, "symbol", data[4]), 32),
        image: safeLink(info[1]),
        description: label(info[2], 1500),
        socials: Object.fromEntries(
          ["twitter", "telegram", "website", "discord", "farcaster"].map(
            (key) => [key, safeLink(info[3][key])],
          ),
        ),
        decimals: Number(decode(ercAbi, "decimals", data[6])),
        supplyRaw: String(decode(ercAbi, "totalSupply", data[7])),
        feeBps: Number(decode(curveAbi, "feeBps", data[8])),
      };
    }
    let quote = quotes.get(row.quoteAddress);
    if (!quote) {
      const raw = await rpc(
        [
          call(row.quoteAddress, ercAbi, "symbol", [], tag),
          call(row.quoteAddress, ercAbi, "decimals", [], tag),
        ],
        "enrich",
      );
      quote = {
        symbol: label(decode(ercAbi, "symbol", raw[0]), 24),
        decimals: Number(decode(ercAbi, "decimals", raw[1])),
      };
      if (quotes.size < 100) quotes.set(row.quoteAddress, quote);
    }
    const decimals = meta.decimals ?? row.decimals;
    if (decimals > 36 || quote.decimals > 36)
      throw Error("Unsupported decimals");
    const [q, t] = decode(curveAbi, "getReserves", data[1]);
    const raised =
      state.phase === 0
        ? decode(curveAbi, "realQuoteReserve", data[2])
        : state.phase === 1
          ? state.sweptQuote
          : null;
    const threshold = state.graduationThreshold,
      progress =
        raised != null && threshold > 0n
          ? Math.min(
              100,
              Math.max(0, Number((raised * 10000n) / threshold) / 100),
            )
          : null;
    const [currency0, currency1] = [row.address, row.quoteAddress].sort();
    const poolId =
      state.phase === 2
        ? keccak256(
            encodeAbiParameters(
              [
                { type: "address" },
                { type: "address" },
                { type: "uint24" },
                { type: "int24" },
                { type: "address" },
              ],
              [
                currency0,
                currency1,
                state.poolFee,
                state.tickSpacing,
                "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044",
              ],
            ),
          )
        : null;
    const price =
      state.phase === 0 && t > 0n
        ? Number(formatUnits(q, quote.decimals)) /
          Number(formatUnits(t, decimals))
        : null;
    return {
      ...row,
      ...meta,
      quoteSymbol: quote.symbol,
      quoteDecimals: quote.decimals,
      phase: state.phase,
      progress: state.phase === 1 || state.phase === 2 ? 100 : progress,
      creatorTaxBps: state.creatorTaxBps,
      buybackEnabled: state.buybackEnabled,
      priceQuote: price != null && Number.isFinite(price) ? price : null,
      raisedQuote: raised == null ? null : formatUnits(raised, quote.decimals),
      thresholdQuote: formatUnits(threshold, quote.decimals),
      poolId,
      stateAt,
      stateBlock: block,
      metadataStatus: "ready",
    };
  };
}

// A phase event can belong to a token launched before our creation window.
// Keep its phase provenance without inventing a creation date or transaction.
export async function recoverPhase(
  log,
  time,
  rpc,
  block = hexNumber(log.blockNumber),
) {
  if (
    log.removed ||
    log.address?.toLowerCase() !== PONS_FACTORY.toLowerCase() ||
    !hashPattern.test(log.transactionHash) ||
    !hashPattern.test(log.blockHash)
  )
    throw Error("Invalid phase event");
  const { args, eventName } = decodeEventLog({
    abi: phaseAbi,
    data: log.data,
    topics: log.topics,
    strict: true,
  });
  const address = args.token.toLowerCase();
  const [raw] = await rpc(
    [
      call(
        PONS_FACTORY,
        ponsFactoryAbi,
        "getLaunchedToken",
        [address],
        hex(block),
      ),
    ],
    "history",
  );
  const state = decode(ponsFactoryAbi, "getLaunchedToken", raw);
  if (
    !state.exists ||
    state.token.toLowerCase() !== address ||
    !addressOK(state.curve) ||
    !addressOK(state.deployer) ||
    !addressOK(state.pairToken)
  )
    throw Error("Invalid phase identity");
  return {
    address,
    curve: state.curve.toLowerCase(),
    creator: state.deployer.toLowerCase(),
    quoteAddress: state.pairToken.toLowerCase(),
    thresholdRaw: String(state.graduationThreshold),
    block: hexNumber(log.blockNumber),
    blockHash: log.blockHash,
    tx: log.transactionHash,
    logIndex: hexNumber(log.logIndex),
    sourceEvent: eventName,
    stateBlock: block,
    phaseAt: time,
    createdAt: null,
    observedAt: Date.now(),
    name: null,
    symbol: null,
    image: null,
    description: null,
    socials: {},
    phase: state.phase,
    progress: state.phase === 1 || state.phase === 2 ? 100 : null,
    stateAt: null,
    priceQuote: null,
    raisedQuote: null,
    thresholdQuote: null,
    creatorTaxBps: state.creatorTaxBps,
    feeBps: null,
    poolId: null,
    quoteSymbol: state.pairToken.toLowerCase() === zero ? "ETH" : null,
    metadataStatus: "pending",
  };
}

export async function classifyRows(rows, block, rpc) {
  const out = [];
  for (let i = 0; i < rows.length; i += 15) {
    const part = rows.slice(i, i + 15);
    const states = await rpc(
      part.map((r) =>
        call(
          PONS_FACTORY,
          ponsFactoryAbi,
          "getLaunchedToken",
          [r.address],
          hex(block),
        ),
      ),
      "history",
    );
    const decoded = states.map((raw) =>
      decode(ponsFactoryAbi, "getLaunchedToken", raw),
    );
    const curves = part.filter((_, j) => decoded[j].phase === 0);
    const reserves = curves.length
      ? await rpc(
          curves.map((r) =>
            call(r.curve, curveAbi, "realQuoteReserve", [], hex(block)),
          ),
          "history",
        )
      : [];
    const amounts = new Map(
      curves.map((r, j) => [
        r.address,
        decode(curveAbi, "realQuoteReserve", reserves[j]),
      ]),
    );
    part.forEach((r, j) => {
      const s = decoded[j];
      if (
        !s.exists ||
        s.curve.toLowerCase() !== r.curve ||
        s.deployer.toLowerCase() !== r.creator ||
        s.pairToken.toLowerCase() !== r.quoteAddress
      )
        throw Error("History identity mismatch");
      const raised = amounts.get(r.address);
      const progress =
        s.phase === 1 || s.phase === 2
          ? 100
          : raised != null && s.graduationThreshold > 0n
            ? Math.min(
                100,
                Number((raised * 10000n) / s.graduationThreshold) / 100,
              )
            : null;
      out.push({ ...r, phase: s.phase, progress, stateBlock: block });
    });
  }
  return out;
}
