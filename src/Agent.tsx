import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  Sparkles,
  Star,
  Copy,
  Download,
  Square,
  RotateCcw,
  Plus,
  Check,
  Code2,
} from "lucide-react";
import { api, useResource, num } from "./data";
export default function Agent() {
  const [q] = useSearchParams();
  const selectedRepo = q.get("repo");
  const initialSearch =
    selectedRepo && /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(selectedRepo)
      ? `repo:${selectedRepo}`
      : q.get("search")?.trim().slice(0, 100) || "AI agent";
  const [prompt, setPrompt] = useState(q.get("q") || "");
  const [query, setQuery] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const repos = useResource("github?q=" + encodeURIComponent(search), 0);
  const status = useResource("status", 0);
  const configured = status.data?.agentConfigured;
  useEffect(() => {
    alive.current = true;
    try {
      const saved = localStorage.getItem("oopad.agent-brief");
      if (saved) setResult(JSON.parse(saved));
    } catch {}
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  async function run() {
    if (busy) return;
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    try {
      const d = await api(
        "agent",
        { prompt, githubQuery: search, wallets: [] },
        controller.current.signal,
      );
      if (alive.current) {
        setResult(d);
        try {
          localStorage.setItem("oopad.agent-brief", JSON.stringify(d));
        } catch {}
      }
    } catch (e) {
      if (alive.current)
        setError(
          (e as Error).name === "AbortError"
            ? "Request cancelled"
            : (e as Error).message,
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function exportBrief() {
    const blob = new Blob([result.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "oopad-launch-brief.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main className="tool-page agent-page">
      <div className="page-heading">
        <div>
          <span className="overline">Oopad agent</span>
          <h1>Find your next narrative</h1>
          <p>
            Explore public code and shape a community token around your own idea
          </p>
        </div>
        <span className="source-status">
          {status.loading
            ? "Checking agent"
            : configured
              ? "AI connected"
              : "Source research available"}
        </span>
      </div>
      <div className="agent-workspace">
        <aside className="repository-shelf">
          <div className="tool-heading">
            <h2>Explore GitHub</h2>
            <Code2 size={17} />
          </div>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query.trim() || "AI agent");
            }}
          >
            <Search size={16} />
            <input
              aria-label="Search GitHub repositories"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
            />
            <button className="icon" aria-label="Search repositories">
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="repository-list">
            {repos.loading && (
              <p className="source-empty">Looking for repositories...</p>
            )}
            {repos.error && (
              <p className="error">
                {repos.error}
                <button onClick={repos.retry} className="text-link">
                  Retry
                </button>
              </p>
            )}
            {repos.data?.items?.map((r: any) => (
              <article className="repository" key={r.url}>
                <a href={r.url} target="_blank" rel="noreferrer">
                  <img
                    className="repository-avatar"
                    src={r.image}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <b>{r.name}</b>
                  <ArrowUpRight size={15} />
                </a>
                <p>{r.description || "No repository description provided"}</p>
                <div>
                  <span>
                    <Star size={12} />
                    {num(r.stars, 0)}
                  </span>
                  <span>{r.language || "--"}</span>
                  <span>{r.license || "License unknown"}</span>
                </div>
                <button
                  className="text-link"
                  onClick={() =>
                    setPrompt(
                      `Explore a token launch narrative inspired by ${r.name}. Explain the actual repository, possible use cases, risks and any licensing limits. Do not imply affiliation.`,
                    )
                  }
                >
                  <Plus size={13} />
                  Use as a source
                </button>
                <Link
                  className="text-link repo-draft-link"
                  to={"/launch?repo=" + encodeURIComponent(r.name)}
                >
                  Start community draft <ArrowUpRight size={14} />
                </Link>
              </article>
            ))}
          </div>
          <p className="small">
            Public repositories are independent projects. Inclusion does not
            imply affiliation or permission to reuse their code.
          </p>
        </aside>
        <section className="agent-desk">
          <div className="agent-greeting">
            <img src="/oopad.png" alt="" />
            <h2>
              Let's give that
              <br />
              <em>idea some shape</em>
            </h2>
          </div>
          <div className="idea-suggestions">
            {[
              "Find an open-source agent with a specific use case",
              "Compare AI compute ideas and stock-token pairings",
              "Suggest a clear launch narrative and its limitations",
            ].map((t) => (
              <button key={t} onClick={() => setPrompt(t)}>
                {t}
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label htmlFor="agent-request">Your idea</label>
            <textarea
              id="agent-request"
              rows={5}
              maxLength={1200}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What are you thinking about building?"
            />
            <div className="agent-submit">
              <small>{prompt.length}/1200</small>
              {busy ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => controller.current?.abort()}
                >
                  <Square size={15} />
                  Stop
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={prompt.trim().length < 3 || !configured}
                >
                  <Sparkles size={16} />
                  {configured ? "Build a brief" : "AI connection pending"}
                  <ArrowUpRight size={17} />
                </button>
              )}
            </div>
          </form>
          {!configured && !status.loading && (
            <p className="notice">
              AI generation is not connected yet. You can search repositories
              and prepare your own launch draft.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {result && (
            <section className="brief-output">
              <div className="tool-heading">
                <h2>Your launch brief</h2>
                <div>
                  <button
                    className="icon"
                    title="Copy brief"
                    aria-label="Copy brief"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(result.text);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      } catch {
                        setError("Clipboard unavailable");
                      }
                    }}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                  <button
                    className="icon"
                    title="Download brief"
                    aria-label="Download brief"
                    onClick={exportBrief}
                  >
                    <Download size={16} />
                  </button>
                  <button
                    className="icon"
                    title="Clear saved brief"
                    aria-label="Clear saved brief"
                    onClick={() => {
                      setResult(null);
                      localStorage.removeItem("oopad.agent-brief");
                    }}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              </div>
              <p className="brief-text">{result.text}</p>
              <small>
                Generated {new Date(result.checkedAt).toLocaleString()}
              </small>
              <Link to="/launch" className="button secondary">
                Open launchpad <ArrowUpRight size={16} />
              </Link>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
