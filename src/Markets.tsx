import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Search,
  Star,
  Pause,
  Play,
  RefreshCw,
  Plus,
} from "lucide-react";
import { Coin, useData, money, num, short } from "./data";
import { CopyButton } from "./UI";

export default function Markets() {
  const { live, markets } = useData();
  const [view, setView] = useState("Launches");
  const [phase, setPhase] = useState("All");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<any[]>([]);
  const [watchOnly, setWatchOnly] = useState(false);
  const [threshold, setThreshold] = useState(80);
  const [sort, setSort] = useState("newest");
  const [watch, setWatch] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("oopad.watch") || "[]");
    } catch {
      return [];
    }
  });
  const [newIds, setNewIds] = useState<string[]>([]);
  const previous = useRef<Set<string> | null>(null);
  const launches = paused ? frozen : live.data?.tokens || [];
  useEffect(() => {
    if (paused) return;
    const ids = new Set<string>(
      (live.data?.tokens || []).map((t: any) => t.address),
    );
    if (previous.current)
      setNewIds([...ids].filter((id) => !previous.current!.has(id)));
    if (ids.size) previous.current = ids;
    const timer = setTimeout(() => setNewIds([]), 1400);
    return () => clearTimeout(timer);
  }, [live.data, paused]);
  function toggle(address: string) {
    setWatch((values) => {
      const next = values.includes(address)
        ? values.filter((v) => v !== address)
        : [...values, address];
      try {
        localStorage.setItem("oopad.watch", JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  const phaseName = (t: any) =>
    t.phase === 2
      ? "Graduated"
      : t.phase === 1 || (t.phase === 0 && Number(t.progress) >= threshold)
        ? "Almost bonded"
        : t.phase === 0
          ? "New"
          : "Other";
  const counts = ["New", "Almost bonded", "Graduated"].map((label) => ({
    label,
    count: launches.filter((t: any) => phaseName(t) === label).length,
  }));
  const rows = (
    view === "Pools"
      ? (markets.data?.items || []).map((p: any) => ({
          ...p.base,
          id: p.id,
          marketCap: p.marketCap,
          fdv: p.fdv,
          volume24h: p.volume24h,
          liquidity: p.liquidity,
          change: p.change24h,
          pairLabel: p.quote?.symbol || "--",
          pool: true,
        }))
      : launches.map((t: any) => {
          const pool = markets.data?.items?.find((p: any) =>
            p.base.address.toLowerCase() === t.address.toLowerCase());
          return { ...t, marketCap: pool?.marketCap, fdv: pool?.fdv };
        })
  )
    .filter(
      (t: any) =>
        `${t.name} ${t.symbol} ${t.address}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (!watchOnly || watch.includes(t.address)) &&
        (view === "Pools" || phase === "All" || phaseName(t) === phase),
    )
    .sort((a: any, b: any) =>
      sort === "marketcap"
        ? (Number(b.marketCap ?? b.fdv) || 0) -
          (Number(a.marketCap ?? a.fdv) || 0)
        : sort === "bonding"
          ? (b.progress || 0) - (a.progress || 0)
          : 0,
    );
  return (
    <main className="tool-page oo-markets">
      <div className="oo-market-heading">
        <div>
          <span className="section-kicker">Robinhood Chain</span>
          <h1>Market explorer</h1>
          <p>Follow the curve, then the market</p>
        </div>
        <Link to="/launch" className="button primary">
          Create a token <Plus size={17} />
        </Link>
      </div>
      <div className="market-switch">
        <div className="segmented">
          {["Launches", "Pools"].map((v) => (
            <button
              aria-pressed={view === v}
              key={v}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <span>
          {view === "Pools"
            ? "Indexed pools"
            : live.loading
              ? "Reading factory"
              : live.data?.status === "live"
                ? "Observed launches"
                : "Bounded capture"}
        </span>
      </div>
      {view === "Launches" && (
        <div className="phase-tabs" role="group" aria-label="Launch phase">
          <button
            aria-pressed={phase === "All"}
            onClick={() => setPhase("All")}
          >
            All launches <b>{launches.length}</b>
          </button>
          {counts.map((c) => (
            <button
              key={c.label}
              aria-pressed={phase === c.label}
              onClick={() => setPhase(c.label)}
            >
              {c.label}
              <b>{c.count}</b>
            </button>
          ))}
        </div>
      )}
      <div className="oo-market-controls">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="Search tokens"
            placeholder="Name, symbol or contract"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Sort markets"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Source order</option>
          <option value="marketcap">Market cap</option>
          {view === "Launches" && (
            <option value="bonding">Bonding progress</option>
          )}
        </select>
        <button
          className="icon"
          aria-label="Watchlist only"
          title="Watchlist only"
          aria-pressed={watchOnly}
          onClick={() => setWatchOnly(!watchOnly)}
        >
          <Star size={18} />
        </button>
        {view === "Launches" && (
          <button
            className="icon"
            aria-label={paused ? "Resume feed" : "Pause feed"}
            title={paused ? "Resume feed" : "Pause feed"}
            onClick={() => {
              if (!paused) setFrozen(live.data?.tokens || []);
              setPaused(!paused);
            }}
          >
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
        )}
        <button
          className="icon"
          title="Refresh markets"
          aria-label="Refresh markets"
          onClick={() => {
            live.retry();
            markets.retry();
          }}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {view === "Launches" && (
        <div className="market-coverage">
          <label>
            Almost bonded from{" "}
            <input
              aria-label="Almost bonded threshold"
              type="number"
              min={1}
              max={100}
              value={threshold}
              onChange={(e) =>
                setThreshold(
                  Math.max(1, Math.min(100, Number(e.target.value) || 80)),
                )
              }
            />
            %
          </label>
          <span>
            {paused ? "Feed paused" : "15s refresh"} · Older launches may be
            outside this capture
          </span>
        </div>
      )}
      <div className="market-table-wrap">
        <table className="oo-market-table">
          <thead>
            <tr>
              <th aria-label="Watchlist" />
              <th>Token</th>
              <th>Market cap / FDV</th>
              <th>{view === "Pools" ? "24h volume" : "Pair"}</th>
              <th>{view === "Pools" ? "Liquidity" : "Bonding"}</th>
              <th>{view === "Pools" ? "24h" : "Phase"}</th>
              <th aria-label="Open token" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t: any) => (
              <tr
                key={t.id || t.address}
                className={newIds.includes(t.address) ? "row-arrival" : ""}
              >
                <td>
                  <button
                    className="icon"
                    aria-label={"Watch " + t.symbol}
                    title={"Watch " + t.symbol}
                    aria-pressed={watch.includes(t.address)}
                    onClick={() => toggle(t.address)}
                  >
                    <Star
                      size={16}
                      fill={watch.includes(t.address) ? "currentColor" : "none"}
                    />
                  </button>
                </td>
                <td>
                  <div className="table-token">
                    <Link to={"/token/" + t.address}>
                      <Coin token={t} size={40} />
                      <span>
                        <b>{t.symbol || "--"}</b>
                        <small>{t.name || "Metadata pending"}</small>
                      </span>
                    </Link>
                    <div>
                      <code>{short(t.address)}</code>
                      <CopyButton value={t.address} />
                    </div>
                  </div>
                </td>
                <td>{money(t.marketCap ?? t.fdv)}{t.marketCap == null && t.fdv != null && <small className="valuation-kind">FDV</small>}</td>
                <td>
                  {t.pool
                    ? money(t.volume24h)
                      : t.quoteSymbol || "--"}
                </td>
                <td>
                  {t.pool ? (
                    money(t.liquidity)
                  ) : (
                    <div className="table-progress">
                      <span>
                        {t.progress == null ? "--" : num(t.progress) + "%"}
                      </span>
                      <progress max={100} value={t.progress || 0} />
                    </div>
                  )}
                </td>
                <td>
                  {t.pool ? (
                    <span className={t.change >= 0 ? "positive" : "negative"}>
                      {t.change == null ? "--" : num(t.change) + "%"}
                    </span>
                  ) : (
                    <span
                      className={
                        "phase-label " +
                        phaseName(t).toLowerCase().replaceAll(" ", "-")
                      }
                    >
                      {phaseName(t)}
                    </span>
                  )}
                </td>
                <td>
                  <Link
                    className="icon"
                    aria-label={"Open " + t.symbol}
                    title="Open token chart"
                    to={"/token/" + t.address}
                  >
                    <ArrowUpRight size={18} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="market-empty">
          <Search size={26} />
          <h2>
            {live.loading || markets.loading
              ? "Reading the market"
              : "No matching tokens"}
          </h2>
          <p>
            {view === "Pools"
              ? markets.error || "Try another search or refresh the pool source"
              : live.error || "Try another filter or a wider bonding threshold"}
          </p>
          <button
            className="button secondary"
            onClick={() => {
              setQuery("");
              setWatchOnly(false);
              setPhase("All");
              live.retry();
              markets.retry();
            }}
          >
            Reset filters <RefreshCw size={16} />
          </button>
        </div>
      )}
      <div className="market-foot">
        <span>{rows.length} matching records</span>
        <span>
          {view === "Launches" && live.data?.block
            ? "Indexed block " + live.data.block
            : "Source-dependent market data"}
        </span>
      </div>
    </main>
  );
}
