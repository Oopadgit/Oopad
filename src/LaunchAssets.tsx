import { useState } from "react";
import { Check, Search, X, RefreshCw } from "lucide-react";
import { Coin, short } from "./data";
import { NATIVE_QUOTE } from "./domain/pons";

export const nativeAsset = {
  address: NATIVE_QUOTE,
  symbol: "ETH",
  name: "Ether",
  kind: "native",
  logo: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png",
};

export default function LaunchAssets({
  items,
  selected,
  onSelect,
  disabled,
  loading,
  error,
  reload,
}: {
  items: any[];
  selected: string;
  onSelect: (address: string) => void;
  disabled: boolean;
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const all = [nativeAsset, ...items.filter((a) => a.kind === "stock")];
  const results = all.filter(
    (a) =>
      (category !== "Stocks" || a.kind === "stock") &&
      `${a.symbol} ${a.name} ${a.address}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <aside className="launch-assets" aria-label="Pairing assets">
      <div className="launch-panel-heading">
        <h2>Pairing assets</h2>
        <span>{all.length}</span>
      </div>
      <div className="launch-asset-search">
        <Search size={15} />
        <input
          aria-label="Search pairing assets"
          placeholder="Symbol, company or address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            className="icon"
            aria-label="Clear asset search"
            title="Clear search"
            onClick={() => setSearch("")}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="launch-asset-tabs" aria-label="Asset categories">
        {["All", "Stocks"].map((c) => (
          <button
            type="button"
            key={c}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
        <span>{results.length} assets</span>
      </div>
      <div className="launch-asset-list">
        {results.map((a) => (
          <button
            type="button"
            key={a.address}
            className="launch-asset"
            disabled={disabled}
            aria-pressed={selected.toLowerCase() === a.address.toLowerCase()}
            aria-label={`Pair with ${a.symbol}`}
            onClick={() => onSelect(a.address)}
          >
            <Coin token={a} size={34} />
            <span>
              <strong>{a.symbol}</strong>
              <small>{a.name.replace(/\s*[•·]\s*Robinhood Token/i, "")}</small>
            </span>
            {selected.toLowerCase() === a.address.toLowerCase() ? (
              <Check size={15} />
            ) : (
              <em>{a.kind === "stock" ? "Stock" : "Native"}</em>
            )}
          </button>
        ))}
        {!results.length && <p className="asset-empty">No matching assets</p>}
        {loading && (
          <p className="asset-empty" role="status">
            Loading stock registry...
          </p>
        )}
        {error && (
          <div className="asset-empty" role="alert">
            Showing recorded stock identities. Live registry unavailable.
            <button type="button" className="text-link" onClick={reload}>
              <RefreshCw size={13} />
              Retry
            </button>
          </div>
        )}
      </div>
      <div className="launch-asset-foot">
        <span>Selected contract</span>
        <code>
          {selected === NATIVE_QUOTE ? "ETH / native asset" : short(selected)}
        </code>
        <p>
          Registry listing is not pair approval
          <br />
          Approval is checked on selection
        </p>
      </div>
    </aside>
  );
}
