import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  Github,
  Star,
  Plus,
  Check,
  Code2,
  Wallet,
  Layers,
  RefreshCw,
} from "lucide-react";
import { useData, useResource, Coin, money, num, price } from "./data";
import { networks, launchpads } from "./ecosystem-catalog";
import Scene from "./Scene";
import { identity } from "./domain/identity";
import { CopyButton } from "./UI";

const chapters = [
  {
    title: "Start with something real",
    body: "A repository gives an idea context. Read what it actually does, check its license and find a use case worth bringing people together around.",
    action: "Explore repositories",
    to: "/agent",
    icon: Code2,
  },
  {
    title: "Give the community its own identity",
    body: "Carry the source into a draft, then choose your own name, artwork and description. A reference is a starting point, not a claim to someone else's work.",
    action: "Open a launch draft",
    to: "/launch",
    icon: Plus,
  },
  {
    title: "Make the terms understandable",
    body: "Choose the asset your token trades against. Review the live launch terms and optional initial buy before your own wallet authorizes anything.",
    action: "Review the process",
    to: "/docs#launch",
    icon: Wallet,
  },
];
const faqs = [
  [
    "What is Oopad?",
    "A source-first workspace for discovering public AI repositories, developing an independent community idea and preparing a Pons token launch on Robinhood Chain. Market pages provide observed launch records and indexed pool data.",
  ],
  [
    "Does a repository become a token?",
    "No. Your token is a separate community project. Linking a repository does not grant ownership, equity, revenue rights or endorsement from its maintainers. Check its license before reusing any code.",
  ],
  [
    "Which assets can I pair with?",
    "ETH or a stock token currently approved by Pons. The workspace checks the factory's approval and economics. A tokenized-stock pairing does not give your community token shares in the underlying company.",
  ],
  [
    "What can the AI agent do?",
    "Public repository search works without an AI provider. Optional brief generation needs its own configured provider and cannot sign a transaction or deploy an autonomous agent for you.",
  ],
  [
    "Can I upload token artwork?",
    "You can select a local PNG, JPG or WebP to preview it. Permanent upload storage is not configured yet. A public HTTPS or IPFS image URL can be used as launch metadata.",
  ],
  [
    "Is there an official Oopad token?",
    `The ticker is $${identity.ticker}. The contract address is ${identity.contract}. Match the full address rather than identifying a token by its name, ticker or logo alone.`,
  ],
];
export default function Home() {
  const { assets, markets } = useData();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("AI agents");
  const [chapter, setChapter] = useState(0);
  const [network, setNetwork] = useState("robinhood");
  const navigate = useNavigate();
  const { hash } = useLocation();
  const repositories = useResource(
    "github?q=" +
      encodeURIComponent(
        topic === "AI agents"
          ? "AI agent"
          : topic === "Developer tools"
            ? "developer tools"
            : "blockchain sdk",
      ),
    0,
  );
  const selected = networks.find((n) => n.id === network)!;
  const current = chapters[chapter];
  const pools = markets.data?.items || [];
  const stocks = (assets.data?.items || [])
    .filter((a: any) =>
      ["NVDA", "AAPL", "TSLA", "AMD", "MSFT", "GOOGL"].includes(a.symbol),
    )
    .slice(0, 6);
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  return (
    <main className="oopad-home">
      <section className="opening">
        <div className="opening-copy">
          <span className="chain-caption">
            <img src="/ecosystem/robinhood.png" alt="" />A launch workspace on
            Robinhood Chain
          </span>
          <h1>Oopad</h1>
          <p>
            Open ideas become
            <br />
            <strong>your next community</strong>
          </p>
          <div className="opening-token" aria-label="Oopad token identity">
            <b>${identity.ticker}</b>
            <div className="token-contract">
              <span>CA</span>
              <code>{identity.contract}</code>
              <CopyButton value={identity.contract} label="Copy OOPAD contract address" />
            </div>
          </div>
        </div>
        <Scene />
        <div className="opening-controls">
          <form
            className="idea-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(
                "/agent?q=" +
                  encodeURIComponent(query) +
                  "&search=" +
                  encodeURIComponent(query || "AI agent"),
              );
            }}
          >
            <Search size={20} />
            <input
              aria-label="Find an idea"
              placeholder="What do you want to build?"
              maxLength={100}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button aria-label="Explore this idea" title="Explore this idea">
              <ArrowRight size={20} />
            </button>
          </form>
          <div className="opening-links">
            <Link to="/launch">
              Create a token <Plus size={17} />
            </Link>
            <Link to="/markets">
              Explore markets <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
        <div className="live-ribbon" aria-label="Robinhood market snapshot">
          <span className="ribbon-title">
            On the market <ArrowRight size={14} />
          </span>
          <div className="ribbon-items">
            {pools.length ? (
              pools.slice(0, 9).map((p: any) => (
                <Link to={"/token/" + p.base.address} key={p.id}>
                  <Coin token={p.base} size={29} />
                  <b>{p.base.symbol}</b>
                  <span>
                    {price(p.priceUsd) === "--"
                      ? "--"
                      : "$" + price(p.priceUsd)}
                  </span>
                </Link>
              ))
            ) : (
              <span className="feed-message">
                {markets.loading
                  ? "Reading market data"
                  : "Market source unavailable"}
                <button
                  className="icon"
                  title="Refresh markets"
                  aria-label="Refresh markets"
                  onClick={markets.retry}
                >
                  <RefreshCw size={15} />
                </button>
              </span>
            )}
          </div>
        </div>
      </section>
      <section className="story-section" id="story">
        <div className="center-heading">
          <p className="section-kicker">
            From a saved link to a considered launch
          </p>
          <h2>
            There is an idea
            <br />
            on the other side
          </h2>
          <p>
            Open source is full of useful work. Oopad gives you somewhere to
            explore it, develop your own direction and bring a community into
            the conversation.
          </p>
        </div>
        <div className="story-tabs" role="group" aria-label="Launch journey">
          {["Find the source", "Shape the idea", "Choose the terms"].map(
            (name, i) => (
              <button
                key={name}
                aria-pressed={chapter === i}
                onClick={() => setChapter(i)}
              >
                {name}
              </button>
            ),
          )}
        </div>
        <div className="story-detail" key={chapter}>
          <current.icon size={36} />
          <h3>{current.title}</h3>
          <p>{current.body}</p>
          <Link to={current.to}>
            {current.action}
            <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
      <section className="source-section" id="repositories">
        <div className="center-heading">
          <span className="section-kicker">The source comes first</span>
          <h2>
            Good ideas have
            <br />
            something behind them
          </h2>
          <p>
            Explore public repositories before writing the pitch. See the
            language, license and original project instead of starting from a
            name alone.
          </p>
        </div>
        <div className="source-toolbar">
          <div className="segmented">
            {["AI agents", "Developer tools", "Onchain builders"].map((t) => (
              <button
                key={t}
                aria-pressed={topic === t}
                onClick={() => setTopic(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <Link className="text-link" to="/agent">
            Search GitHub <Search size={16} />
          </Link>
        </div>
        <div className="source-list">
          {repositories.loading ? (
            <p className="source-empty">Finding public repositories</p>
          ) : repositories.error ? (
            <p className="source-empty">
              {repositories.error}
              <button className="text-link" onClick={repositories.retry}>
                Try again <RefreshCw size={14} />
              </button>
            </p>
          ) : !repositories.data?.items?.length ? (
            <p className="source-empty">No repositories found for this topic</p>
          ) : (
            repositories.data.items.slice(0, 4).map((r: any) => (
              <article key={r.url}>
                <img src={r.image} alt="" loading="lazy" />
                <div>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    <h3>{r.name}</h3>
                    <ArrowUpRight size={16} />
                  </a>
                  <p>
                    {r.description ||
                      "No description supplied by this repository"}
                  </p>
                  <span>
                    <Star size={13} /> {num(r.stars, 0)}
                    <i>{r.language || "Language unknown"}</i>
                    <i>{r.license || "Check license"}</i>
                  </span>
                </div>
                <Link
                  className="source-use"
                  to={"/agent?repo=" + encodeURIComponent(r.name)}
                  aria-label={"Explore " + r.name}
                >
                  Explore <ArrowRight size={18} />
                </Link>
              </article>
            ))
          )}
        </div>
        <p className="source-note">
          Independent repositories are references, not affiliated projects or
          token endorsements
        </p>
      </section>
      <section className="pair-section" id="pairs">
        <div className="center-heading">
          <span className="section-kicker">A market starts with a pair</span>
          <h2>
            Your idea
            <br />
            meets its market
          </h2>
          <p>
            Choose ETH or an approved tokenized stock. The pairing asset is what
            people spend to enter the curve and receive when they sell.
          </p>
        </div>
        <div className="pair-shelf">
          <Link to="/launch">
            <Coin
              token={{ symbol: "ETH", image: "/ecosystem/ethereum.png" }}
              size={44}
            />
            <b>ETH</b>
            <span>Native asset</span>
          </Link>
          {stocks.map((a: any) => (
            <Link to={"/launch?pair=" + a.address} key={a.address}>
              <Coin token={a} size={44} />
              <b>{a.symbol}</b>
              <span>Check pair terms</span>
            </Link>
          ))}
        </div>
        <div className="pair-explanation">
          <p>
            <b>One choice that follows the launch</b>The pair determines the
            curve denomination and graduation market. Oopad checks current Pons
            approval before preparing a transaction.
          </p>
          <p>
            <b>Understand what you are choosing</b>A stock token brings its own
            issuer and market risks. Pairing against one does not give your
            community token ownership of that company.
          </p>
        </div>
        <Link className="button primary" to="/launch">
          Choose your pairing asset <ArrowUpRight size={18} />
        </Link>
      </section>
      <section className="home-markets" id="markets">
        <div className="center-heading">
          <span className="section-kicker">After the first transaction</span>
          <h2>The story keeps moving</h2>
          <p>
            Follow the market beyond launch day. Inspect pools and real candle
            history, then keep the tokens you care about on a local watchlist.
          </p>
        </div>
        <div className="market-preview">
          <div className="preview-head">
            <b>Robinhood pools</b>
            <Link to="/markets">
              View markets <ArrowUpRight size={15} />
            </Link>
          </div>
          {pools.slice(0, 5).map((p: any) => (
            <Link
              to={"/token/" + p.base.address}
              className="preview-row"
              key={p.id}
            >
              <Coin token={p.base} size={38} />
              <div>
                <b>{p.base.symbol}</b>
                <small>{p.base.name}</small>
              </div>
              <span>
                <small>{p.marketCap == null ? "FDV" : "Market cap"}</small>
                {money(p.marketCap ?? p.fdv)}
              </span>
              <span>
                <small>24h volume</small>
                {money(p.volume24h)}
              </span>
              <span className={p.change24h >= 0 ? "positive" : "negative"}>
                {num(p.change24h)}%
              </span>
              <ArrowUpRight size={17} />
            </Link>
          ))}
          {!pools.length && (
            <p className="source-empty">
              {markets.loading
                ? "Loading current pools"
                : "Pool data is temporarily unavailable"}
            </p>
          )}
        </div>
        <p className="source-note">
          Market data is source-dependent and may be delayed · Launch capture is
          a bounded observation window
        </p>
      </section>
      <section className="network-section" id="networks">
        <div className="center-heading">
          <span className="section-kicker">Context beyond one chain</span>
          <h2>
            Explore widely
            <br />
            Launch with intention
          </h2>
          <p>
            Native launch execution stays on Robinhood through Pons. The
            directory helps you discover other ecosystems without pretending
            they are the same integration.
          </p>
        </div>
        <div
          className="network-selector"
          role="group"
          aria-label="Explore networks"
        >
          {networks.map((n) => (
            <button
              key={n.id}
              aria-pressed={network === n.id}
              aria-label={"Explore " + n.name}
              onClick={() => setNetwork(n.id)}
            >
              <img src={"/ecosystem/" + n.logo} alt="" />
              <span>{n.name}</span>
            </button>
          ))}
        </div>
        <div className="network-summary">
          <div>
            <h3>{selected.name}</h3>
            <p>{selected.description}</p>
          </div>
          {network === "robinhood" ? (
            <Link className="button primary" to="/launch">
              Launch on Robinhood <ArrowUpRight size={17} />
            </Link>
          ) : (
            <a
              className="button secondary"
              href={selected.url}
              target="_blank"
              rel="noreferrer"
            >
              Visit ecosystem <ArrowUpRight size={17} />
            </a>
          )}
        </div>
        <div className="provider-list">
          {launchpads.map((p) => (
            <a href={p.native ? "/launch" : p.href} key={p.name} target={p.native ? undefined : "_blank"} rel="noreferrer">
              <img src={"/ecosystem/" + p.logo} alt="" />
              <b>{p.name}</b>
              <span>{p.caption}</span>
              <ArrowUpRight size={14} />
            </a>
          ))}
        </div>
      </section>
      <section className="review-section">
        <div className="center-heading">
          <span className="section-kicker">The last step is yours</span>
          <h2>
            A draft is a draft
            <br />
            until your wallet signs
          </h2>
          <p>
            Oopad prepares the request and checks it against current protocol
            terms. Your wallet remains the place where a launch becomes a
            transaction.
          </p>
        </div>
        <div className="review-flow">
          {[
            [
              Code2,
              "Prepared from your inputs",
              "Name, artwork, pair and launch terms are assembled into the request",
            ],
            [
              Check,
              "Checked before signing",
              "The client rechecks calldata and the server simulates the request",
            ],
            [
              Wallet,
              "Authorized by you",
              "You review the wallet request and decide whether to submit",
            ],
            [
              Layers,
              "Confirmed from the receipt",
              "The recorded transaction is checked before a launch is marked confirmed",
            ],
          ].map(([Icon, title, body]: any) => (
            <article key={title}>
              <Icon size={23} />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <Link to="/docs#launch" className="text-link">
          Read the transaction flow <ArrowRight size={16} />
        </Link>
      </section>
      <section className="questions-section">
        <div className="center-heading">
          <h2>Before you begin</h2>
          <p>The important details, without the fine print</p>
        </div>
        <div className="questions">
          {faqs.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <Plus size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="closing-section">
        <span className="brand-symbol">
          <img src="/oopad.png" alt="Oopad" />
        </span>
        <h2>
          What will you
          <br />
          bring together?
        </h2>
        <p>Start with a source or go straight to your own launch draft</p>
        <div className="closing-actions">
          <Link to="/agent" className="button secondary">
            Find your starting point <Search size={18} />
          </Link>
          <Link to="/launch" className="button primary">
            Create a token <Plus size={18} />
          </Link>
        </div>
        <small className="closing-token">${identity.ticker} · {identity.contract}</small>
      </section>
    </main>
  );
}
