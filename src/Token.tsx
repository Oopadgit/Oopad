import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createChart, CandlestickSeries, ColorType } from "lightweight-charts";
import { ArrowLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { Coin, useData, useResource, money, num, short } from "./data";
import { CopyButton } from "./UI";
function Chart({ rows }: any) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current || !rows?.length) return;
    const chart = createChart(host.current, {
      autoSize: true,
      height: 370,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#66758d",
      },
      grid: {
        vertLines: { color: "#edf0f5" },
        horzLines: { color: "#edf0f5" },
      },
      timeScale: { timeVisible: true },
      rightPriceScale: { borderColor: "#d9e0eb" },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#277b52",
      downColor: "#c44455",
      borderVisible: false,
      wickUpColor: "#277b52",
      wickDownColor: "#c44455",
      priceFormat: { type: "price", precision: 9, minMove: 0.000000001 },
    });
    candles.setData(rows);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [rows]);
  return <div className="candle-chart" ref={host} />;
}
export default function Token() {
  const { address = "" } = useParams();
  const { live, markets } = useData();
  const [interval, setInterval] = useState("5");
  const valid = /^0x[\da-f]{40}$/i.test(address);
  const token = live.data?.tokens?.find(
    (t: any) => t.address.toLowerCase() === address.toLowerCase(),
  );
  const pool = markets.data?.items?.find(
    (p: any) => p.base.address.toLowerCase() === address.toLowerCase(),
  );
  const candles = useResource(
    pool ? "candles?pool=" + pool.address + "&interval=" + interval : null,
    60000,
  );
  const identity = token ||
    pool?.base || { address, symbol: short(address), name: "Token details" };
  if (!valid)
    return (
      <main className="tool-page">
        <h1>Invalid token address</h1>
        <Link to="/markets">Return to markets</Link>
      </main>
    );
  return (
    <main className="tool-page token-page">
      <Link className="text-link" to="/markets">
        <ArrowLeft size={16} />
        Back to launches
      </Link>
      <div className="page-heading">
        <div className="token-title">
          <Coin token={identity} size={55} />
          <div>
            <h1>{identity.symbol}</h1>
            <p>{identity.name}</p>
          </div>
        </div>
        <a
          href={"https://www.ponsfamily.com/launchpad/" + address}
          className="button primary"
          target="_blank"
          rel="noreferrer"
        >
          Open on Pons <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="token-address">
        <code>{address}</code>
        <CopyButton value={address} />
        <a
          aria-label="View token on explorer"
          href={"https://robinhoodchain.blockscout.com/address/" + address}
          target="_blank"
          rel="noreferrer"
        >
          <ArrowUpRight size={15} />
        </a>
      </div>
      <div className="token-stats">
        {[
          [
            "Price",
            pool?.priceUsd == null ? "--" : "$" + num(pool.priceUsd, 9),
          ],
          ["24h volume", money(pool?.volume24h)],
          ["Liquidity", money(pool?.liquidity)],
          [
            "Bonding",
            token?.progress == null ? "--" : num(token.progress) + "%",
          ],
        ].map(([name, value]) => (
          <div key={name}>
            <small>{name}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="token-content">
        <section className="chart-section">
          <div className="tool-heading">
            <h2>Candlestick chart</h2>
            <div className="segmented">
              {["1", "5", "15"].map((t) => (
                <button
                  key={t}
                  aria-pressed={interval === t}
                  onClick={() => setInterval(t)}
                >
                  {t}m
                </button>
              ))}
              <button
                className="icon"
                aria-label="Refresh chart"
                title="Refresh chart"
                onClick={candles.retry}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          {candles.data?.candles?.length ? (
            <Chart rows={candles.data.candles} />
          ) : (
            <div className="chart-empty">
              <img src="/oopad.png" alt="" />
              <h3>
                {candles.loading
                  ? "Reading candles"
                  : "No candle history available"}
              </h3>
              <p>
                {!pool
                  ? "An indexed pool is required for this chart"
                  : "The pool source has not returned candle data"}
              </p>
            </div>
          )}
          {candles.error && <p className="error">{candles.error}</p>}
          <p className="small">
            Pool OHLCV in USD. Intervals reflect available source data.
          </p>
        </section>
        <aside className="token-details">
          <h2>Token details</h2>
          <p>{token?.description || "No description in the current capture"}</p>
          <dl>
            {[
              ["Pair", token?.quoteSymbol || pool?.quote?.symbol || "--"],
              [
                "Phase",
                token?.phase === 2
                  ? "Graduated"
                  : token?.phase === 1
                    ? "Awaiting pool"
                    : token?.phase === 0
                      ? "Bonding curve"
                      : "--",
              ],
              [
                "Creator tax",
                token?.creatorTaxBps == null
                  ? "--"
                  : num(token.creatorTaxBps / 100) + "%",
              ],
              [
                "Curve fee",
                token?.feeBps == null ? "--" : num(token.feeBps / 100) + "%",
              ],
              [
                "Target",
                token?.thresholdQuote
                  ? num(token.thresholdQuote) + " " + token.quoteSymbol
                  : "--",
              ],
              [
                "State block",
                token?.stateBlock ? num(token.stateBlock, 0) : "--",
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {token?.socials &&
            Object.entries(token.socials)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <a
                  key={k}
                  className="text-link"
                  href={String(v)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {k}
                  <ArrowUpRight size={15} />
                </a>
              ))}
        </aside>
      </div>
    </main>
  );
}
