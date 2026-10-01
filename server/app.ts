import express from "express";
import { getAssets, getMarkets, limitedJson } from "./source.js";
import {
  getLaunchPolicy,
  prepareLaunch,
  verifyLaunchReceipt,
} from "./launch.js";
import { checkPair } from "./pair.js";
import { githubSearch, agentBrief, summarizeNarratives } from "./research.js";
import { live } from "./live.js";
import { getAssetLogo } from "./asset-logo.js";
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "3mb" }));
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
const hits = new Map<string, { at: number; count: number }>();
app.use("/api", (req, res, next) => {
  const ip = String(
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
  ).split(",")[0];
  for (const [key, row] of hits)
    if (Date.now() - row.at > 60000) hits.delete(key);
  const row = hits.get(ip) || { at: Date.now(), count: 0 };
  row.count++;
  hits.set(ip, row);
  if (row.count > 100 || hits.size > 4000)
    return res.status(429).json({ error: "Please slow down and try again" });
  if (req.method === "POST") {
    const host = String(req.headers.host || "");
    const origin = /^(localhost|127\.0\.0\.1):\d+$/.test(host)
      ? `http://${host}`
      : `https://${host}`;
    if (req.headers.origin !== origin)
      return res
        .status(403)
        .json({ error: "Submit from the Oopad website" });
  }
  next();
});
app.get("/api/status", (_req, res) =>
  res.json({
    agentConfigured: Boolean(process.env.OOPAD_AI_KEY),
    launchConfigured: Boolean(process.env.OOPAD_INTENT_SECRET),
    artworkConfigured: false,
  }),
);
app.get("/api/assets", async (_req, res) => res.json(await getAssets()));
app.get("/api/markets", async (_req, res) => res.json(await getMarkets()));
app.get("/api/live", async (_req, res) => res.json(await live()));
app.get("/api/github", async (req, res) =>
  res.json(await githubSearch(req.query.q)),
);
app.get("/api/narratives", async (_req, res) => {
  const s = await live();
  res.json({ items: summarizeNarratives(s.tokens), checkedAt: s.checkedAt });
});
app.get("/api/pair", async (req, res) =>
  res.json(await checkPair(String(req.query.address || ""))),
);
app.get("/api/launch/policy", async (req, res) =>
  res.json(await getLaunchPolicy(req.query as any)),
);
app.post("/api/launch/prepare", async (req, res) =>
  res.json(await prepareLaunch(req.body)),
);
app.get("/api/launch/receipt", async (req, res) =>
  res.json(await verifyLaunchReceipt(req.query as any)),
);
app.post(["/api/artwork/challenge", "/api/artwork/upload"], (_req, res) =>
  res
    .status(503)
    .json({
      error:
        "Permanent artwork storage is not configured yet. Use a public HTTPS or IPFS logo URL.",
      code: "ARTWORK_NOT_CONFIGURED",
    }),
);
let agentActive = 0;
let agentCalls: number[] = [];
app.post("/api/agent", async (req, res) => {
  if (!process.env.OOPAD_AI_KEY)
    return res
      .status(503)
      .json({
        error:
          "AI generation is not connected yet. Repository search and draft editing are available.",
        code: "AI_NOT_CONFIGURED",
      });
  agentCalls = agentCalls.filter((t) => Date.now() - t < 86400000);
  if (
    agentActive >= 2 ||
    agentCalls.length >= Number(process.env.OOPAD_AI_DAILY_LIMIT || 40)
  )
    return res
      .status(429)
      .json({ error: "Agent capacity reached. Try later." });
  agentActive++;
  agentCalls.push(Date.now());
  try {
    res.json(await agentBrief(req.body, await live()));
  } finally {
    agentActive--;
  }
});
app.get("/api/asset-logo", async (req, res) => {
  const result = await getAssetLogo(req.query.address);
  if (result.status !== 200) return res.status(result.status).end();
  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Cache-Control", result.cacheControl);
  res.send(result.body);
});
app.get("/api/candles", async (req, res) => {
  const id = String(req.query.pool || "");
  if (!/^0x[\da-f]{40}([\da-f]{24})?$/i.test(id))
    return res.status(400).json({ error: "Invalid pool" });
  const interval = ["1", "5", "15"].includes(String(req.query.interval))
    ? String(req.query.interval)
    : "5";
  const r = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/robinhood/pools/${id}/ohlcv/minute?aggregate=${interval}&limit=100`,
    { signal: AbortSignal.timeout(12000) },
  );
  if (!r.ok) throw Error("Candle history is unavailable for this pool");
  const body: any = await limitedJson(r);
  const values = body?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(values)) throw Error("Candle history unavailable");
  const candles = values
    .filter(
      (a) =>
        Array.isArray(a) &&
        a.length === 6 &&
        a.every(Number.isFinite) &&
        a[2] >= Math.max(a[1], a[4]) &&
        a[3] <= Math.min(a[1], a[4]),
    )
    .map((a) => ({
      time: a[0],
      open: a[1],
      high: a[2],
      low: a[3],
      close: a[4],
      volume: a[5],
    }))
    .sort((a, b) => a.time - b.time);
  res.json({ candles, interval, checkedAt: Date.now() });
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Unknown API route" }),
);
app.use((error: any, _req: any, res: any, _next: any) =>
  res
    .status(Number.isInteger(error.status) ? error.status : 503)
    .json({
      error: error.message || "Source unavailable",
      code: error.code || "UNAVAILABLE",
    }),
);
export default app;
