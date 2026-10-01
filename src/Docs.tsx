import { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { PONS_FACTORY, PONS_ROUTER, PONS_DEPLOYER } from "./domain/pons";
import { CopyButton } from "./UI";
import { identity } from "./domain/identity";
const sections = [
  ["overview", "Overview"],
  ["launch", "Launching a token"],
  ["pairing", "Pairing assets"],
  ["agent", "AI agent"],
  ["markets", "Market data"],
  ["wallet", "Wallet and safety"],
  ["contracts", "Contracts"],
  ["changelog", "Changelog"],
];
export default function Docs() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  return (
    <main className="tool-page docs-page">
      <aside>
        <BookOpen size={24} />
        <h2>Documentation</h2>
        <nav>
          {sections.map(([id, title]) => (
            <a key={id} href={"#" + id}>
              {title}
            </a>
          ))}
        </nav>
      </aside>
      <article>
        <section id="overview">
          <span className="overline">Oopad documentation</span>
          <h1>
            From research
            <br />
            to a reviewed launch
          </h1>
          <p>
            Oopad brings source research and token creation into one
            workspace on Robinhood Chain. Token deployment uses Pons V2. You
            choose the identity, pairing asset and terms, then authorize the
            transaction in your own wallet.
          </p>
          <p>
            Explore public repositories, develop your own community identity and
            open a Pons launch draft. Repository references do not grant equity,
            intellectual property, revenue rights or endorsement by maintainers.
          </p>
          <p>
            The network explorer lists ten ecosystems and five independent
            platforms. Only Robinhood Chain via Pons has native launch execution
            in Oopad. Other entries open external websites; selecting one
            does not connect or switch your wallet.
          </p>
          <p>
            Oopad is an independent interface. It is not operated by
            Robinhood or Pons. The ticker is ${identity.ticker}. No holder policy
            or social account has been supplied.
          </p>
          <div className="token-contract docs-token-contract">
            <span>CA</span>
            <code>{identity.contract}</code>
            <CopyButton value={identity.contract} label="Copy OOPAD contract address" />
          </div>
        </section>
        <section id="launch">
          <h2>Launching a token</h2>
          <ol>
            <li>
              Create the token name, symbol, description and optional social
              links
            </li>
            <li>
              Add a public HTTPS or IPFS logo URL. Local files can be previewed;
              permanent upload storage is not connected yet.
            </li>
            <li>
              Select ETH or a stock token. Oopad checks Pons approval and
              reads the current fee and economics.
            </li>
            <li>
              Choose an optional first buy, creator tax, recipient, slippage and
              buyback preference.
            </li>
            <li>
              Connect your wallet. The server checks the pinned contract code,
              prepares the request and simulates it.
            </li>
            <li>
              Review the exact transaction. The client independently re-encodes
              it before opening your wallet. Stock first buys may need an
              exact-amount approval.
            </li>
            <li>
              After signing, the receipt, factory event, metadata and Oopad
              provenance are verified before confirmation.
            </li>
          </ol>
          <p>
            Launches are irreversible. A saved browser draft is not a deployed
            token. A submitted transaction is not confirmed until the receipt
            checks pass. Keep sufficient native ETH for gas in addition to the
            launch fee.
          </p>
          <Link className="button primary" to="/launch">
            Open launchpad
            <ArrowUpRight size={16} />
          </Link>
        </section>
        <section id="pairing">
          <h2>Pairing assets</h2>
          <p>
            A pair determines the asset used to buy and sell your token. ETH is
            the native option. Stock-token identities come from the public asset
            registry; approval and decimals are checked onchain, not inferred
            from the registry.
          </p>
          <p>
            A tokenized-stock pair does not make your token an equity claim in
            the issuer. The quote asset has its own market and liquidity risks.
            The pair is fixed after launch.
          </p>
        </section>
        <section id="agent">
          <h2>AI agent</h2>
          <p>
            Repository search returns public GitHub projects with descriptions,
            links, stars and license metadata. They are evidence sources, not
            endorsements or partners. Check licenses before reusing code.
          </p>
          <p>
            With a separately configured provider, the agent can produce a
            source-linked brief and possible pairing angle. It cannot sign,
            trade or deploy an autonomous AI service. Generated claims need
            review. No broad social-trend or verified smart-money feed is
            connected.
          </p>
          <p>
            When the provider is not configured, generation stays unavailable.
            Search and local draft creation remain usable. Briefs are stored
            only in your browser; clear them from the output toolbar.
          </p>
        </section>
        <section id="markets">
          <h2>Market data</h2>
          <p>
            The launch capture reads factory creation and phase events and
            checks each token's state. A capture is bounded and held per server
            instance. It is not a persistent full-chain index, and older
            almost-bonded tokens may be outside the observed window. Unknown
            values are displayed as unavailable.
          </p>
          <p>
            The board refreshes while visible. Pause freezes your current view.
            Pool pricing, liquidity, volume and minute candles come from public
            pool sources. Missing market data is not replaced with simulated
            trades.
          </p>
        </section>
        <section id="wallet">
          <h2>Wallet and safety</h2>
          <p>
            Connection uses an injected EVM wallet, including MetaMask or
            Phantom when installed. Connecting reads the account and native
            balance. Switching to Robinhood Chain requires wallet approval.
            Connection itself grants no token allowance.
          </p>
          <p>
            Oopad never receives your private key or seed phrase. Signing is
            always explicit. Contract code checks and simulation reduce
            integration errors; they are not a token audit, investment
            recommendation or guarantee.
          </p>
        </section>
        <section id="contracts">
          <h2>Contracts and sources</h2>
          {[
            ["Pons factory", PONS_FACTORY],
            ["Launch router", PONS_ROUTER],
            ["Launch deployer", PONS_DEPLOYER],
          ].map(([label, address]) => (
            <div className="contract-row" key={label}>
              <strong>{label}</strong>
              <code>{address}</code>
              <CopyButton value={address} />
            </div>
          ))}
          <a
            href="https://docs.ponsfamily.com/v2"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Pons V2 documentation
            <ArrowUpRight size={15} />
          </a>
          <a
            href="https://robinhoodchain.blockscout.com"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Robinhood Chain explorer
            <ArrowUpRight size={15} />
          </a>
        </section>
        <section id="changelog">
          <h2>October 1, 2026</h2>
          <p>
            First Oopad build: source-first discovery, token launch
            review, stock pair selection, injected wallet balance, observed
            market table, token pages and repository-to-draft workspace.
          </p>
          <p>
            Pending external setup: permanent artwork storage and the dedicated
            AI-provider configuration. No funded token deployment was executed
            during development.
          </p>
        </section>
      </article>
    </main>
  );
}
