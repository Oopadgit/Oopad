<p align="center"><img src="public/oopad.png" width="120" alt="Oopad logo" /></p>

# Oopad

A source-to-community launch workspace on Robinhood Chain

Find public AI repositories, turn a source into a community-token draft, review a stock-token or ETH pairing, and authorize a Pons launch from your own wallet

[Website](https://oopad.lat) | [Product docs](https://oopad.lat/docs) | [Getting started](docs/GETTING_STARTED.md) | [Architecture](docs/ARCHITECTURE.md)

## Explore The Code

| Area | What is included |
| --- | --- |
| Discover | Public GitHub repository search, source links and editable launch drafts |
| Launch | Pons V2 policy checks, quote-asset selection, signed preparation and wallet-confirmed execution |
| Markets | Observed launches, phase filters, watchlists and token pages with indexed pool candles |
| Wallet | EIP-1193 wallet discovery, explicit network switching and balance reads |
| Interface | Centered Three.js identity, reversible motion and visibility-aware authored button effects |
| Tests | Validation, launch calculations, wallet lifecycle, market valuation and vendor-source integrity |

Native launch execution is Robinhood Chain through Pons. Other network and platform entries are outbound discovery links, not additional native integrations or partnerships

## Run Locally

Use Node.js 22.14+ or 24 and pnpm 10.10.0

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:5572

Repository search and draft editing do not need an AI key. Live data still depends on reachable upstream services. Launch preparation requires your own server-side configuration. See [Getting started](docs/GETTING_STARTED.md) before connecting a funded wallet

```sh
pnpm typecheck
pnpm test
pnpm build
```

Optional browser checks: install Chromium with `pnpm exec playwright install chromium`, start the app in another terminal, then run `pnpm check`

## Current Boundaries

- AI brief generation is implemented but needs a separately configured DeepInfra key
- Permanent artwork upload is not connected; local files are previews and public HTTPS/IPFS URLs provide metadata
- The launch feed is bounded and per instance, not a complete historical index
- Market cap and FDV remain distinct; missing values are not invented
- Pool candles require a pool available from the index; secondary trading opens Pons
- AI limits and request throttles are per instance, not a durable account-wide spending control
- A repository reference grants no maintainer endorsement, equity or intellectual-property rights
- Stock-token pairing does not give the new community token shares in the underlying company

## Project Identity

Ticker: **$OOPAD**  
Network: **Robinhood Chain**  
Contract: `0x0484534ebfe5f2ed15bad7a84957f4ababe95fb3`

This address was supplied by the project owner. Publishing source code does not establish contract safety, liquidity, trading availability or an audit. The project token is distinct from tokens users create through the launchpad

## Repository Map

```text
src/        React views, wallet lifecycle, domain logic and visual effects
server/     Express API, source adapters, agent requests and launch preparation
backend/    Pons data reader
api/        Serverless entry point
public/     Brand and ecosystem assets with third-party notices
tests/      Unit and source-integrity checks
docs/       Setup, architecture and configuration
.github/    Test workflow and contribution templates
```

## Contributions And Rights

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change. Report sensitive issues privately as described in [SECURITY.md](SECURITY.md)

A project-wide open-source license has not been selected. This package is prepared for public source review, not represented as an MIT-licensed project. Third-party code retains its own notices and licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
