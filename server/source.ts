import type { Asset, Pool, SourceEnvelope } from "../src/domain/types.js";
import recordedIssuers from "../src/domain/issuer-logos.json" with { type: "json" };

export const REGISTRY_URL = "https://api.robinhood.com/rhj/assets";
export const MARKET_ROOT =
  "https://api.geckoterminal.com/api/v2/networks/robinhood";
export const ETH: Asset = {
  address: "0x0000000000000000000000000000000000000000",
  symbol: "ETH",
  name: "Ether",
  decimals: 18,
  logo: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png",
  kind: "crypto",
};
export const RECORDED_AT = "2026-09-13T07:55:10.086Z";

// Exact entries observed through the official public registry on this date.
// This identity capture is not a current pons allowlist or a price source.
export const RECORDED_STOCKS: Asset[] = [
  ["0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", "NVDA", "NVIDIA"],
  ["0x322f0929c4625ed5bad873c95208d54e1c003b2d", "TSLA", "Tesla"],
  ["0xd95B44124e475743a7589e68F3D74008A5536D44", "CRM", "Salesforce"],
  ["0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd", "DELL", "Dell"],
  [
    "0xc01aA1fECeC0605b13bc84874ff7256C0f5F562a",
    "SMCI",
    "Super Micro Computer",
  ],
  ["0xb8DBf92F9741c9ac1c32115E78581f23509916FD", "APLD", "Applied Digital"],
].map(([address, symbol, name]) => ({
  address: address.toLowerCase(),
  symbol,
  name: `${name} - Robinhood Token`,
  decimals: 18,
  logo: `https://cdn.robinhood.com/ncw_assets/logos/${address.toLowerCase()}.png`,
  kind: "stock",
}));

type Obj = Record<string, unknown>;
type Capture = { body: unknown; at: string; stale: boolean };
export const object = (value: unknown): Obj =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : {};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const text = (value: unknown, max = 160): string =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max)
    : "";
export const address = (value: unknown, native = false): string | null =>
  typeof value === "string" &&
  /^0x[a-fA-F0-9]{40}$/.test(value) &&
  (native || !/^0x0{40}$/i.test(value))
    ? value.toLowerCase()
    : null;
export const poolId = (value: unknown): string | null =>
  typeof value === "string" &&
  /^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(value) &&
  !/^0x0+$/.test(value)
    ? value.toLowerCase()
    : null;
export function numeric(value: unknown, signed = false): number | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" ||
      !/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) && (signed || n >= 0) ? n : null;
}
function decimals(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 36
    ? value
    : null;
}
export function imageUrl(value: unknown): string | null {
  try {
    if (typeof value !== "string" || value.length > 2048) return null;
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      [
        "cdn.robinhood.com",
        "coin-images.coingecko.com",
        "assets.coingecko.com",
        "assets.geckoterminal.com",
      ].includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function iso(value: unknown): string | null {
  return typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}
export function parseRegistry(body: unknown): Asset[] {
  if (!Array.isArray(object(body).assets))
    throw new Error("The stock registry returned an unsupported response.");
  const assets = new Map<string, Asset>();
  let recognized = 0;
  for (const value of array(object(body).assets).slice(0, 4000)) {
    const row = object(value);
    if (
      [
        "ASSET_STATUS_ACTIVE",
        "ASSET_STATUS_INACTIVE",
        "ASSET_STATUS_UNSPECIFIED",
      ].includes(String(row.status))
    )
      recognized++;
    if (row.status !== "ASSET_STATUS_ACTIVE") continue;
    const symbol = text(row.tokenSymbol, 24),
      name = text(row.tokenName);
    if (!symbol || !name || !Array.isArray(row.deployments))
      throw new Error(
        "The stock registry returned an unsupported active identity.",
      );
    for (const deployment of array(row.deployments)) {
      const dep = object(deployment),
        contract = address(dep.contractAddress);
      if (dep.chainId !== 4663 || !contract) continue;
      const asset: Asset = {
        address: contract,
        symbol,
        name,
        decimals: decimals(row.tokenDecimals),
        logo: imageUrl(row.logoUrl),
        kind: "stock",
      };
      const previous = assets.get(contract);
      if (previous && (previous.symbol !== symbol || previous.name !== name))
        throw new Error("The stock registry returned conflicting identities.");
      assets.set(contract, asset);
    }
  }
  if (array(object(body).assets).length && !recognized)
    throw new Error("The stock registry returned an unsupported response.");
  return [...assets.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
function relation(row: Obj, key: string): string | null {
  const id = object(object(object(row.relationships)[key]).data).id;
  return typeof id === "string" && id.startsWith("robinhood_")
    ? address(id.slice(10), true)
    : null;
}
export function parsePools(body: unknown, stocks: Asset[] = []): Pool[] {
  const root = object(body);
  if (!Array.isArray(root.data))
    throw new Error("The pool source returned an unsupported response.");
  const tokens = new Map(
    array(root.included)
      .map(object)
      .filter((row) => row.type === "token")
      .map((row) => [row.id, object(row.attributes)]),
  );
  const stockMap = new Map(
    stocks
      .filter((row) => row.kind === "stock")
      .map((row) => [row.address, row]),
  );
  const token = (contract: string): Asset | null => {
    if (contract === ETH.address) return ETH;
    const known = stockMap.get(contract);
    if (known) return known;
    const row = tokens.get(`robinhood_${contract}`);
    if (
      !row ||
      address(row.address) !== contract ||
      !text(row.symbol, 24) ||
      !text(row.name)
    )
      return null;
    return {
      address: contract,
      symbol: text(row.symbol, 24),
      name: text(row.name),
      decimals: decimals(row.decimals),
      logo: imageUrl(row.image_url),
      kind: "crypto",
    };
  };
  return array(root.data)
    .slice(0, 40)
    .flatMap((value): Pool[] => {
      const row = object(value),
        attr = object(row.attributes),
        id = poolId(attr.address);
      const baseAddress = relation(row, "base_token"),
        quoteAddress = relation(row, "quote_token");
      const venue = object(object(object(row.relationships).dex).data).id;
      if (
        row.type !== "pool" ||
        !id ||
        row.id !== `robinhood_${id}` ||
        !baseAddress ||
        !quoteAddress ||
        baseAddress === quoteAddress ||
        !["pons-v2", "pons-v2-dex"].includes(String(venue))
      )
        return [];
      const base = token(baseAddress),
        quote = token(quoteAddress);
      if (!base || !quote) return [];
      return [
        {
          id,
          address: id,
          name: text(attr.name) || `${base.symbol} / ${quote.symbol}`,
          base,
          quote,
          priceUsd: numeric(attr.base_token_price_usd),
          marketCap: numeric(attr.market_cap_usd),
          fdv: numeric(attr.fdv_usd),
          change24h: numeric(object(attr.price_change_percentage).h24, true),
          volume24h: numeric(object(attr.volume_usd).h24),
          liquidity: numeric(attr.reserve_in_usd),
          createdAt: iso(attr.pool_created_at),
          url: `https://www.geckoterminal.com/robinhood/pools/${id}`,
        },
      ];
    });
}

const captures = new Map<
  string,
  { capture: Capture; expires: number; staleUntil: number }
>();
const pending = new Map<string, Promise<Capture>>();
let sourceRequests: number[] = [];
const allowedUrls = new Set([
  REGISTRY_URL,
  ...["pons-v2", "pons-v2-dex"].map(
    (venue) =>
      `${MARKET_ROOT}/dexes/${venue}/pools?include=base_token,quote_token,dex`,
  ),
]);

export async function limitedJson(
  response: Response,
  max = 4_000_000,
): Promise<unknown> {
  if (
    !response.headers.get("content-type")?.includes("json") ||
    Number(response.headers.get("content-length") || 0) > max
  )
    throw new Error("The source returned an unsupported response.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The source response was empty.");
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new Error("The source response exceeded its size limit.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.startsWith("The ")
    ? error.message
    : "The public source is unavailable. Try again later.";
}
async function source(url: string, ttl: number): Promise<Capture> {
  if (!allowedUrls.has(url))
    throw new Error("The source URL is not supported.");
  const previous = captures.get(url);
  if (previous && previous.expires > Date.now()) return previous.capture;
  if (pending.has(url)) return pending.get(url)!;
  const task = (async () => {
    try {
      sourceRequests = sourceRequests.filter((at) => at > Date.now() - 60_000);
      if (sourceRequests.length >= 10)
        throw new Error("The public-source request budget is cooling down.");
      sourceRequests.push(Date.now());
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        redirect: "error",
        headers: { accept: "application/json;version=20230203" },
      });
      if (!response.ok)
        throw new Error(`The public source returned HTTP ${response.status}.`);
      const body = await limitedJson(response);
      // Validate before replacing a successful capture with an unusable body.
      if (url === REGISTRY_URL) {
        const identities = parseRegistry(body);
        const claimsCurrentIdentity = array(object(body).assets).some(
          (value) => {
            const row = object(value);
            return (
              row.status === "ASSET_STATUS_ACTIVE" &&
              array(row.deployments).some(
                (deployment) => object(deployment).chainId === 4663,
              )
            );
          },
        );
        if (!identities.length && claimsCurrentIdentity)
          throw new Error(
            "The stock registry returned no valid current-chain identities.",
          );
      } else if (!parsePools(body).length && array(object(body).data).length)
        throw new Error("The pool source returned no valid pool identities.");
      const capture = { body, at: new Date().toISOString(), stale: false };
      captures.set(url, {
        capture,
        expires: Date.now() + ttl,
        staleUntil: Date.now() + 1_800_000,
      });
      return capture;
    } catch (error) {
      if (previous && previous.staleUntil > Date.now()) {
        const capture = { ...previous.capture, stale: true };
        captures.set(url, {
          ...previous,
          capture,
          expires: Date.now() + 60_000,
        });
        return capture;
      }
      throw new Error(errorMessage(error));
    }
  })();
  pending.set(url, task);
  try {
    return await task;
  } finally {
    pending.delete(url);
  }
}

let assetsCache: { result: SourceEnvelope<Asset>; expires: number } | null =
  null;
let assetsPending: Promise<SourceEnvelope<Asset>> | null = null;
export async function getAssets(): Promise<SourceEnvelope<Asset>> {
  if (assetsCache && assetsCache.expires > Date.now())
    return assetsCache.result;
  if (assetsPending) return assetsPending;
  assetsPending = (async () => {
    let result: SourceEnvelope<Asset>;
    try {
      const capture = await source(REGISTRY_URL, 300_000);
      result = {
        items: [ETH, ...parseRegistry(capture.body)],
        capturedAt: capture.at,
        status: capture.stale ? "cached" : "live",
        error: capture.stale
          ? "The live registry is unavailable. Showing its last successful capture."
          : null,
      };
    } catch {
      const previous = assetsCache?.result;
      const recordedIsRecent =
        Date.now() - Date.parse(RECORDED_AT) < 7 * 86_400_000;
      const previousIsRecent =
        previous?.capturedAt &&
        Date.now() - Date.parse(previous.capturedAt) < 7 * 86_400_000;
      result =
        previous && previousIsRecent && previous.items.length > 1
          ? {
              ...previous,
              status: "cached",
              error:
                "The live registry is unavailable. Showing the last successful identity capture.",
            }
          : recordedIsRecent
            ? {
                items: [ETH, ...RECORDED_STOCKS],
                capturedAt: RECORDED_AT,
                status: "cached",
                error:
                  "The live registry is unavailable. Showing six recorded stock identities from September 13. Pair approval has not been checked.",
              }
            : {
                items: [ETH, ...recordedIssuers.map((item): Asset => ({
                  address: item.address,
                  symbol: item.symbol,
                  name: item.name,
                  decimals: null,
                  logo: item.path,
                  kind: "stock",
                }))],
                capturedAt: null,
                status: "cached",
                error:
                  "Live registry unavailable. Showing recorded stock identities; pair approval and decimals must be checked onchain.",
              };
    }
    assetsCache = {
      result,
      expires: Date.now() + (result.status === "live" ? 300_000 : 60_000),
    };
    return result;
  })();
  try {
    return await assetsPending;
  } finally {
    assetsPending = null;
  }
}

export async function getMarkets(): Promise<SourceEnvelope<Pool>> {
  const results = await Promise.allSettled([
    source(
      `${MARKET_ROOT}/dexes/pons-v2/pools?include=base_token,quote_token,dex`,
      180_000,
    ),
    source(
      `${MARKET_ROOT}/dexes/pons-v2-dex/pools?include=base_token,quote_token,dex`,
      180_000,
    ),
    getAssets(),
  ]);
  const stockResult = results[2];
  const stocks =
    stockResult.status === "fulfilled"
      ? (stockResult.value as SourceEnvelope<Asset>).items
      : [];
  const items = new Map<string, Pool>(),
    times: string[] = [];
  let stale = false,
    successful = 0;
  const failures: string[] = [];
  for (const result of results.slice(0, 2)) {
    if (result.status === "rejected") {
      failures.push("One or more pons pool lists are unavailable.");
      continue;
    }
    const capture = result.value as Capture;
    try {
      for (const pool of parsePools(capture.body, stocks))
        items.set(pool.id, pool);
      times.push(capture.at);
      stale ||= capture.stale;
      successful++;
    } catch {
      failures.push("One pool list returned an unsupported response.");
    }
  }
  return {
    items: [...items.values()].sort(
      (a, b) => (b.volume24h ?? -1) - (a.volume24h ?? -1),
    ),
    capturedAt: times.sort()[0] ?? null,
    status: !successful ? "unavailable" : stale ? "cached" : "live",
    error: failures.length
      ? [...new Set(failures)].join(" ")
      : stale
        ? "The live pool source is unavailable. Showing its last successful capture."
        : null,
  };
}
