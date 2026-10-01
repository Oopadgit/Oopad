import { createContext, useContext, useEffect, useState } from "react";
import issuers from "./domain/issuer-logos.json";
export const short = (v = "") =>
  v ? v.slice(0, 6) + "..." + v.slice(-4) : "--";
export const num = (v: any, d = 2) =>
  v == null || !Number.isFinite(Number(v))
    ? "--"
    : Number(v).toLocaleString("en-US", { maximumFractionDigits: d });
export const money = (v: any) =>
  v == null || !Number.isFinite(Number(v))
    ? "--"
    : "$" +
      Number(v).toLocaleString("en-US", {
        notation: "compact",
        maximumFractionDigits: 2,
      });
export const price = (v: any) =>
  v == null
    ? "--"
    : Number(v) < 0.00001
      ? Number(v).toExponential(3)
      : num(v, 7);
export async function api(path: string, body?: any, signal?: AbortSignal) {
  const r = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(50000)])
      : AbortSignal.timeout(50000),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d?.error || "Request unavailable");
  return d;
}
export function useResource(path: string | null, ms = 60000) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(Boolean(path)),
    [rev, setRev] = useState(0);
  useEffect(() => {
    let alive = true,
      busy = false;
    const control = new AbortController();
    setData(null);
    setError("");
    setLoading(Boolean(path));
    async function load() {
      if (!path || busy || document.hidden) return;
      busy = true;
      try {
        const d = await api(path, undefined, control.signal);
        if (alive) {
          setData(d);
          setError(d.error || "");
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        busy = false;
        if (alive) setLoading(false);
      }
    }
    void load();
    const resume = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", resume);
    const t = ms ? setInterval(load, ms) : null;
    return () => {
      alive = false;
      control.abort();
      if (t) clearInterval(t);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [path, ms, rev]);
  return { data, error, loading, retry: () => setRev((v) => v + 1) };
}
const Context = createContext<any>(null);
export function DataProvider({ children }: any) {
  const assets = useResource("assets", 300000),
    markets = useResource("markets", 60000),
    live = useResource("live", 15000);
  return (
    <Context.Provider value={{ assets, markets, live }}>
      {children}
    </Context.Provider>
  );
}
export const useData = () => useContext(Context);
export function Coin({ token, size = 36 }: any) {
  const [failed, setFailed] = useState(false);
  const issuer = issuers.find(
    (i) => i.address.toLowerCase() === token?.address?.toLowerCase(),
  );
  const src = issuer?.path || token?.image || token?.logo;
  useEffect(() => setFailed(false), [src]);
  return (
    <span className="coin" style={{ width: size, height: size }}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        token?.symbol?.slice(0, 2) || "?"
      )}
    </span>
  );
}
