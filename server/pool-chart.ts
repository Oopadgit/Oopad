import { limitedJson } from "./source.js";

const addressOK = (v: unknown): v is string =>
  typeof v === "string" && /^0x[\da-f]{40}$/i.test(v);
export function parsePoolCandles(body: any, address: string, quote: string) {
  const base = body?.meta?.base?.address?.toLowerCase();
  const other = body?.meta?.quote?.address?.toLowerCase();
  const pair = [address.toLowerCase(), quote.toLowerCase()];
  if (
    !addressOK(base) ||
    !addressOK(other) ||
    base === other ||
    !pair.includes(base) ||
    !pair.includes(other)
  )
    throw Error("Pool identity mismatch");
  const rows = body?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows) || rows.length > 200)
    throw Error("Invalid candle response");
  const seen = new Set<number>();
  return rows
    .map((r: unknown) => {
      if (
        !Array.isArray(r) ||
        r.length !== 6 ||
        !r.every((v) => typeof v === "number" && Number.isFinite(v))
      )
        throw Error("Invalid candle");
      const [time, open, high, low, close, volume] = r;
      if (
        !Number.isSafeInteger(time) ||
        time <= 0 ||
        seen.has(time) ||
        low <= 0 ||
        high < low ||
        open < low ||
        open > high ||
        close < low ||
        close > high ||
        volume < 0
      )
        throw Error("Invalid OHLCV values");
      seen.add(time);
      return { time, open, high, low, close, volume };
    })
    .sort((a, b) => a.time - b.time);
}

const cache = new Map<string, { at: number; value: any }>();
const pending = new Map<string, Promise<any>>();
let requests: number[] = [];
export async function getPoolChart(token: any) {
  if (
    token?.phase !== 2 ||
    !addressOK(token.address) ||
    !addressOK(token.quoteAddress) ||
    !/^0x[\da-f]{64}$/i.test(token.poolId || "")
  )
    throw Error("Graduated pool unavailable");
  const address = token.address.toLowerCase(),
    pool = token.poolId.toLowerCase();
  const key = address + ":" + pool;
  const previous = cache.get(key);
  if (previous && Date.now() - previous.at < 60000) return previous.value;
  if (pending.has(key)) return pending.get(key);
  requests = requests.filter((at) => Date.now() - at < 60000);
  if (requests.length >= 8) {
    if (previous) return { ...previous.value, status: "delayed" };
    throw Error("Pool chart source busy");
  }
  requests.push(Date.now());
  const task = (async () => {
    try {
      const response = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/robinhood/pools/${pool}/ohlcv/minute?aggregate=1&limit=200&currency=usd&token=${address}`,
        {
          headers: { Accept: "application/json;version=20230302" },
          signal: AbortSignal.timeout(12000),
          redirect: "error",
        },
      );
      if (!response.ok) throw Error("Pool chart source unavailable");
      const candles = parsePoolCandles(
        await limitedJson(response, 250000),
        address,
        token.quoteAddress,
      );
      const value = {
        status: "ready",
        interval: "1m",
        currency: "USD",
        source: "GeckoTerminal pool trades",
        sourceUrl: `https://www.geckoterminal.com/robinhood/pools/${pool}`,
        poolId: pool,
        address,
        candles,
        observedAt: Date.now(),
      };
      if (cache.size >= 64 && !cache.has(key))
        cache.delete(cache.keys().next().value);
      cache.set(key, { at: Date.now(), value });
      return value;
    } catch (e) {
      if (previous) return { ...previous.value, status: "delayed" };
      throw e;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, task);
  return task;
}
