import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Upload,
  ArrowUpRight,
  RefreshCw,
  Check,
  Save,
  ImagePlus,
  ShieldCheck,
  Copy,
  Layers3,
  SlidersHorizontal,
  Circle,
  Wallet,
} from "lucide-react";
import LaunchAssets, { nativeAsset } from "./LaunchAssets";
import "./launch.css";
import "./launch-oopad.css";
import { formatEther, formatUnits, type Address } from "viem";
import { useWallet } from "./wallet/WalletContext";
import { useData, useResource, Coin, short, num } from "./data";
import { WalletControl, CopyButton } from "./UI";
import {
  validateLaunchRequest,
  NATIVE_QUOTE,
  type PreparedLaunch,
  type LaunchPolicy,
} from "./domain/pons";
import {
  checkedPreparation,
  launchApi,
  approvalTransaction,
  ApiError,
} from "./lib/launch-client";
import {
  readPendingLaunch,
  recordLaunchHash,
  pendingEvent,
} from "./lib/pending-launch";
import { artworkMessage, MAX_ARTWORK_BYTES } from "./domain/artwork";
import {
  repositoryReference,
  withRepositoryDraft,
} from "./lib/repository-draft";

const empty = {
  name: "",
  symbol: "",
  description: "",
  logo: "",
  website: "",
  twitter: "",
  telegram: "",
  recipient: "",
  pair: NATIVE_QUOTE as string,
  initialBuy: "0",
  tax: 0,
  slippage: 100,
  buyback: false,
};
export default function Launch() {
  const service = useResource("status", 60000);
  const wallet = useWallet(),
    { assets } = useData(),
    [q] = useSearchParams();
  const [draft, setDraft] = useState(() => {
    try {
      return {
        ...empty,
        ...JSON.parse(localStorage.getItem("oopad.launch-draft") || "{}"),
      };
    } catch {
      return empty;
    }
  });
  const [policy, setPolicy] = useState<LaunchPolicy | null>(null),
    [prepared, setPrepared] = useState<PreparedLaunch | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [hash, setHash] = useState(readPendingLaunch),
    [verified, setVerified] = useState<any>(null),
    [rev, setRev] = useState(0);
  const lock = useRef(false),
    alive = useRef(true),
    receiptBusy = useRef(false);
  const context = JSON.stringify([draft, wallet.account, wallet.chainId]),
    current = useRef(context);
  current.current = context;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const pair = q.get("pair");
    if (pair && /^0x[\da-f]{40}$/i.test(pair))
      setDraft((d) => ({ ...d, pair }));
    const idea = q.get("idea");
    if (idea) setDraft((d) => ({ ...d, description: idea.slice(0, 2000) }));
  }, [q]);
  useEffect(() => {
    if (repositoryReference(q.get("repo")))
      setDraft((d: any) => withRepositoryDraft(d, q.get("repo")));
  }, [q]);
  useEffect(() => {
    setPrepared(null);
    setError("");
  }, [context]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const sync = () => setHash(readPendingLaunch());
    window.addEventListener(pendingEvent, sync);
    return () => window.removeEventListener(pendingEvent, sync);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPolicy(null);
    launchApi<LaunchPolicy>(
      `launch/policy?pairToken=${draft.pair}${wallet.account ? "&account=" + wallet.account : ""}`,
      undefined,
      controller.signal,
    )
      .then((p) => {
        if (
          p.chainId !== 4663 ||
          p.pairToken.toLowerCase() !== draft.pair.toLowerCase() ||
          p.account?.toLowerCase() !== wallet.account?.toLowerCase()
        )
          throw Error("Policy does not match the selected wallet/pair");
        if (!controller.signal.aborted) setPolicy(p);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [draft.pair, wallet.account, wallet.chainId, rev]);
  const update = (k: string, v: any) => {
    if (k === "logo") setFile(null);
    setDraft((d) => ({ ...d, [k]: v }));
    setNotice("");
  };
  const disabled = Boolean(busy) || wallet.busy;
  const asset = assets.data?.items?.find(
      (a: any) => a.address.toLowerCase() === draft.pair.toLowerCase(),
    ),
    symbol = draft.pair === NATIVE_QUOTE ? "ETH" : asset?.symbol || "Quote";
  function input() {
    if (
      wallet.status !== "connected" ||
      !wallet.account ||
      wallet.chainId !== 4663
    )
      throw Error("Connect your wallet on Robinhood Chain");
    if (file)
      throw Error("Upload the selected logo before reviewing the launch");
    if (!draft.logo) throw Error("Upload a logo or enter its HTTPS image URL");
    return validateLaunchRequest({
      account: wallet.account,
      launch: {
        name: draft.name.trim(),
        symbol: draft.symbol.trim(),
        description: draft.description,
        logo: draft.logo,
        socials: {
          website: draft.website,
          twitter: draft.twitter,
          telegram: draft.telegram,
          discord: "",
          farcaster: "",
        },
        creatorFeeRecipient: draft.recipient || wallet.account,
        creatorTaxBps: draft.tax,
        buybackEnabled: draft.buyback,
        pairToken: draft.pair,
        initialBuy: draft.initialBuy || "0",
        slippageBps: draft.slippage,
        configId: 0,
      },
    });
  }
  async function upload() {
    if (!file || lock.current) return;
    const account = wallet.account,
      version = current.current;
    if (!account || wallet.status !== "connected") {
      setError("Connect your wallet before uploading");
      return;
    }
    lock.current = true;
    setBusy("upload");
    setError("");
    try {
      if (file.size > MAX_ARTWORK_BYTES)
        throw Error("Logo must be 2 MB or less");
      const bytes = await file.arrayBuffer(),
        digest = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
      const ticket: any = await launchApi("artwork/challenge", {
        account,
        digest,
      });
      if (
        ticket.payload.account !== account.toLowerCase() ||
        ticket.payload.digest !== digest ||
        ticket.message !== artworkMessage(ticket.payload) ||
        ticket.payload.expires <= Date.now() ||
        ticket.payload.expires > Date.now() + 360000
      )
        throw Error("Upload authorization mismatch");
      if (current.current !== version) throw Error("Wallet or form changed");
      const signature = await wallet.signUploadMessage(ticket.message);
      if (current.current !== version) throw Error("Wallet or form changed");
      const image = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = () => reject(Error("Unable to read image"));
        r.readAsDataURL(file);
      });
      const result: any = await launchApi("artwork/upload", {
        ticket: ticket.ticket,
        signature,
        image,
      });
      const stored = new URL(result.url, location.origin);
      if (
        stored.origin !== location.origin ||
        !/^\/artwork\/[a-f\d]{64}\.webp$/.test(stored.pathname) ||
        stored.search || stored.hash
      )
        throw Error("Invalid storage response");
      if (alive.current && current.current === version) {
        update("logo", result.url);
        setFile(null);
        setNotice("Logo uploaded and publicly available");
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy("");
    }
  }
  async function prepare() {
    if (lock.current || readPendingLaunch()) return;
    lock.current = true;
    setBusy("review");
    setError("");
    const version = context;
    try {
      const value = input();
      const p = checkedPreparation(
        await launchApi("launch/prepare", value),
        value,
      );
      if (alive.current && current.current === version) {
        setPrepared(p);
        setPolicy(p.policy);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy("");
    }
  }
  async function submit() {
    if (!prepared || lock.current || readPendingLaunch()) return;
    lock.current = true;
    setBusy("wallet");
    setError("");
    try {
      const p = checkedPreparation(prepared, input());
      const approval = p.simulation === "approval-required";
      const tx = approval ? approvalTransaction(p) : p.transaction;
      if (!tx) throw Error("Simulation required");
      const result = await wallet.sendTransaction(tx);
      if (!approval) recordLaunchHash(result, "submitted");
      if (alive.current) {
        setPrepared(null);
        setNotice(
          approval
            ? "Exact quote allowance submitted. Wait for wallet confirmation, then review again."
            : "Transaction submitted. Waiting for verified receipt.",
        );
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy("");
    }
  }
  async function receipt() {
    if (!hash || receiptBusy.current) return;
    receiptBusy.current = true;
    try {
      const value: any = await launchApi("launch/receipt?hash=" + hash);
      if (
        value.hash.toLowerCase() !== hash.toLowerCase() ||
        value.chainId !== 4663 ||
        !value.provenanceVerified
      )
        throw Error("Receipt verification failed");
      recordLaunchHash(hash, "confirmed");
      if (alive.current) {
        setVerified(value);
        setNotice("Launch confirmed onchain");
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "REVERTED")
        recordLaunchHash(hash, "reverted");
      if (alive.current) setNotice((e as Error).message);
    } finally {
      receiptBusy.current = false;
    }
  }
  useEffect(() => {
    if (!hash) return;
    let n = 0;
    const id = setInterval(() => {
      if (!document.hidden && n++ < 12) void receipt();
    }, 7000);
    return () => clearInterval(id);
  }, [hash]);
  const field = (
    key: string,
    label: string,
    placeholder = "",
    type = "text",
  ) => (
    <label>
      {label}
      <input
        type={type}
        value={draft[key]}
        onChange={(e) => update(key, e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </label>
  );
  return (
    <main className="pad-page launch-workspace">
      <div className="page-heading">
        <div>
          <h1>
            Launchpad <span>Pons V2</span>
          </h1>
          <p>Robinhood Chain</p>
        </div>
        <Link to="/docs#launch" className="text-link">
          Launch guide
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="pad-layout">
        <LaunchAssets
          items={assets.data?.items || []}
          selected={draft.pair}
          onSelect={(address) => update("pair", address)}
          disabled={disabled}
          loading={assets.loading}
          error={assets.error}
          reload={assets.retry}
        />
        <form className="pad-form" onSubmit={(e) => e.preventDefault()}>
          {repositoryReference(q.get("repo")) && (
            <div className="repo-launch-source">
              <b>Repository reference</b>
              <a
                href={repositoryReference(q.get("repo"))!}
                target="_blank"
                rel="noreferrer"
              >
                {q.get("repo")} <ArrowUpRight size={14} />
              </a>
              <p>
                Use your own name and artwork. A repository link does not
                establish ownership, endorsement or rights to its code.
              </p>
            </div>
          )}
          <section>
            <h2>
              <ImagePlus size={17} />
              Token identity <span>Metadata</span>
            </h2>
            <div className="form-grid">
              {field("name", "Name", "e.g. Your agent")}
              {field("symbol", "Symbol", "e.g. AGENT")}
            </div>
            <label>
              Description
              <textarea
                value={draft.description}
                maxLength={2048}
                onChange={(e) => update("description", e.target.value)}
                rows={2}
                disabled={disabled}
              />
            </label>
            <div className="upload-row">
              <label className="file-picker">
                <Upload size={22} />
                <span>
                  {file ? file.name : "Choose token logo"}
                  <small>PNG, JPG or WebP · Up to 2 MB</small>
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={disabled}
                  onChange={(e) => {
                    setPrepared(null);
                    const selected = e.target.files?.[0] || null;
                    if (
                      selected &&
                      (selected.size > MAX_ARTWORK_BYTES ||
                        !["image/png", "image/jpeg", "image/webp"].includes(
                          selected.type,
                        ))
                    ) {
                      setError("Choose a PNG, JPG or WebP of 2 MB or less");
                      e.target.value = "";
                      return;
                    }
                    setFile(selected);
                  }}
                />
              </label>
              <button
                className="button secondary"
                onClick={upload}
                disabled={!file || disabled || !service.data?.artworkConfigured}
                title={
                  service.data?.artworkConfigured
                    ? "Upload token artwork"
                    : "Artwork storage is not connected yet"
                }
              >
                {busy === "upload"
                  ? "Uploading..."
                  : service.data?.artworkConfigured
                    ? "Upload logo"
                    : "Upload unavailable"}
                <Upload size={16} />
              </button>
            </div>
            {field("logo", "Or use an HTTPS image URL", "https://...")}
            <p className="small">
              Local files are previews until permanent artwork storage is
              connected. Use a public image URL to include artwork in a launch.
            </p>
          </section>
          <section>
            <h2>
              <Layers3 size={17} />
              Pair & initial buy <span>Quote asset</span>
            </h2>
            <div className="launch-selected-pair" data-pair={draft.pair}>
              <Coin
                token={
                  asset ||
                  (draft.pair === NATIVE_QUOTE ? nativeAsset : { symbol: "?" })
                }
                size={40}
              />
              <div>
                <strong>{symbol}</strong>
                <small>
                  {asset?.name ||
                    (draft.pair === NATIVE_QUOTE
                      ? "Ether / native asset"
                      : short(draft.pair))}
                </small>
              </div>
              <span className={policy?.approved ? "positive" : ""}>
                {policy
                  ? policy.approved
                    ? "Approved pair"
                    : "Not approved"
                  : error
                    ? "Unavailable"
                    : "Checking..."}
              </span>
            </div>
            <p className="small">
              {policy
                ? policy.approved
                  ? "Pair approved at block " + policy.blockNumber
                  : "This pair is not approved by Pons"
                : error
                  ? "Pair check unavailable. Use Refresh terms to retry."
                  : "Checking current pair approval"}
            </p>
            <div className="form-grid">
              {field("initialBuy", `Initial buy (${symbol})`, "0")}
              <label>
                Slippage
                <span className="slippage-options">
                  {[50, 100, 200, 500].map((v) => (
                    <button
                      type="button"
                      key={v}
                      aria-label={`Slippage ${v / 100}%`}
                      aria-pressed={draft.slippage === v}
                      disabled={disabled}
                      onClick={() => update("slippage", v)}
                    >
                      {v / 100}%
                    </button>
                  ))}
                </span>
              </label>
            </div>
            <p className="small">
              Optional initial buy uses the same pairing asset · Stock buys
              require exact token allowance
            </p>
          </section>
          <section>
            <h2>
              <SlidersHorizontal size={17} />
              Creator settings <span>Fees & links</span>
            </h2>
            <div className="form-grid">
              <label>
                Creator tax (%)
                <input
                  type="number"
                  min="0"
                  max={(policy?.maxCreatorTaxBps ?? 1000) / 100}
                  step="0.01"
                  value={draft.tax / 100}
                  onChange={(e) =>
                    update("tax", Math.round(Number(e.target.value) * 100))
                  }
                  disabled={disabled}
                />
              </label>
              {field(
                "recipient",
                "Fee recipient",
                "Defaults to connected wallet",
              )}
            </div>
            <label className="check-field">
              <input
                type="checkbox"
                checked={draft.buyback}
                onChange={(e) => update("buyback", e.target.checked)}
                disabled={disabled}
              />{" "}
              Enable protocol buyback
            </label>
            <p className="small">
              Buyback tokens follow Pons vesting terms, not an immediate payout
            </p>
            <details>
              <summary>Website & social links</summary>
              {field("website", "Website", "https://")}
              {field("twitter", "X", "https://x.com/")}
              {field("telegram", "Telegram", "https://t.me/")}
            </details>
          </section>
          <button
            className="text-link"
            onClick={() => {
              try {
                localStorage.setItem(
                  "oopad.launch-draft",
                  JSON.stringify(draft),
                );
                setNotice("Draft saved in this browser");
              } catch {
                setError("Browser storage unavailable");
              }
            }}
          >
            <Save size={16} />
            Save local draft
          </button>
        </form>
        <aside className="pad-review">
          <div className="launch-panel-heading">
            <h2>Launch preview</h2>
            <span>Draft</span>
          </div>
          <div className="launch-token-preview">
            <div className="token-art">
              {preview || draft.logo ? (
                <img
                  src={preview || draft.logo}
                  alt="Token logo preview"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                  onLoad={(e) => {
                    e.currentTarget.style.display = "block";
                  }}
                />
              ) : (
                <ImagePlus size={30} />
              )}
            </div>
            <div>
              <h3>{draft.name || "Your token"}</h3>
              <strong>
                {draft.symbol || "TICKER"}
                <span> / {symbol}</span>
              </strong>
            </div>
          </div>
          {draft.description && (
            <p className="launch-preview-description">{draft.description}</p>
          )}
          <div className="launch-readiness">
            {[
              [
                "Token identity",
                Boolean(draft.name.trim() && draft.symbol.trim()),
              ],
              ["Logo linked", Boolean(draft.logo && !file)],
              ["Pair approved", Boolean(policy?.approved)],
              ["Wallet connected", wallet.status === "connected"],
            ].map(([label, ready]) => (
              <div key={String(label)}>
                {ready ? (
                  <Check size={14} className="positive" />
                ) : (
                  <Circle size={12} />
                )}
                <span>{label}</span>
              </div>
            ))}
          </div>
          <h2 className="launch-review-title">Transaction review</h2>
          <dl>
            <div>
              <dt>Total token supply</dt>
              <dd>
                {policy ? num(formatUnits(BigInt(policy.supply), 18), 0) : "--"}
              </dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>Robinhood Chain</dd>
            </div>
            <div>
              <dt>Protocol</dt>
              <dd>Pons V2</dd>
            </div>
            <div>
              <dt>Launch fee</dt>
              <dd>
                {policy
                  ? num(formatEther(BigInt(policy.launchFee)), 6) + " ETH"
                  : "--"}
              </dd>
            </div>
            <div>
              <dt>Curve fee</dt>
              <dd>{policy ? num(policy.curveFeeBps / 100) + "%" : "--"}</dd>
            </div>
            <div>
              <dt>Creator tax</dt>
              <dd>{num(draft.tax / 100)}%</dd>
            </div>
            <div>
              <dt>Initial buy</dt>
              <dd>
                {draft.initialBuy || "0"} {symbol}
              </dd>
            </div>
            <div>
              <dt>Graduation target</dt>
              <dd>
                {policy
                  ? num(
                      formatUnits(
                        BigInt(policy.graduationThreshold),
                        policy.decimals,
                      ),
                      4,
                    ) +
                    " " +
                    symbol
                  : "--"}
              </dd>
            </div>
          </dl>
          <div className="launch-balances">
            <Wallet size={15} />
            <span>Available balances</span>
            <strong>
              {policy?.nativeBalance != null
                ? num(formatEther(BigInt(policy.nativeBalance)), 6) + " ETH"
                : "Connect wallet"}
            </strong>
            {draft.pair !== NATIVE_QUOTE && (
              <small>
                {policy?.quoteBalance != null
                  ? num(
                      formatUnits(BigInt(policy.quoteBalance), policy.decimals),
                      6,
                    ) +
                    " " +
                    symbol
                  : "Quote balance unavailable"}
              </small>
            )}
          </div>
          <button
            className="text-link"
            onClick={() => setRev((v) => v + 1)}
            disabled={disabled}
          >
            <RefreshCw size={14} />
            Refresh terms
          </button>
          {prepared && (
            <div className="simulation">
              <ShieldCheck size={20} />
              <strong>
                {prepared.simulation === "passed"
                  ? "Simulation passed"
                  : "Quote approval required"}
              </strong>
              <p>
                {prepared.simulation === "passed"
                  ? "Review the exact wallet request before confirming"
                  : "Only the initial buy amount will be approved"}
              </p>
              <span>
                Minimum tokens{" "}
                {num(formatUnits(BigInt(prepared.quote.minTokensOut), 18), 4)}
              </span>
              <small>
                Prepared until{" "}
                {new Date(prepared.expiresAt).toLocaleTimeString()}
              </small>
            </div>
          )}
          {wallet.status !== "connected" ? (
            <WalletControl />
          ) : prepared ? (
            <button
              className="button primary"
              onClick={submit}
              disabled={disabled}
            >
              {busy
                ? "Confirm in wallet..."
                : prepared.simulation === "approval-required"
                  ? "Approve exact amount"
                  : "Confirm launch"}
              <ArrowUpRight size={17} />
            </button>
          ) : (
            <button
              className="button primary"
              onClick={prepare}
              disabled={
                disabled ||
                Boolean(hash) ||
                !policy?.approved ||
                !policy?.intentReady
              }
            >
              {busy ? "Checking..." : "Review launch"}
              <ArrowUpRight size={17} />
            </button>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          {hash && (
            <div className="receipt">
              <a
                href={"https://robin.etherscan.io/tx/" + hash}
                target="_blank"
                rel="noreferrer"
              >
                {short(hash)}
                <ArrowUpRight size={14} />
              </a>
              <button className="text-link" onClick={receipt}>
                Check receipt
                <RefreshCw size={14} />
              </button>
            </div>
          )}
          {verified && (
            <Link className="button secondary" to={"/token/" + verified.token}>
              Open launched token
              <ArrowUpRight size={16} />
            </Link>
          )}
          <p className="small">
            Gas is additional · Launches are irreversible
            <br />
            Oopad never signs or holds funds for you
          </p>
          <p className="small">
            Stock pairs are denominated in the selected stock token, not USD.
            They do not represent equity in your project.
          </p>
        </aside>
      </div>
    </main>
  );
}
