# Getting Started

## Requirements

- Node.js 22.14+ or 24
- pnpm 10.10.0
- A browser with an EIP-1193-compatible wallet only when testing wallet interactions
- Internet access for public GitHub, market and RPC requests

Install pnpm if needed with `npm install --global pnpm@10.10.0`, then run `pnpm install --frozen-lockfile` from the repository root

## Environment

Copy `.env.example` to `.env.local`. On PowerShell use `Copy-Item .env.example .env.local`; on macOS/Linux use `cp .env.example .env.local`

Empty secrets are intentional. Read [CONFIGURATION.md](CONFIGURATION.md) before enabling optional services. Never reuse someone else's credentials or commit populated environment files

Generate an independent intent secret locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put that value only in `OOPAD_INTENT_SECRET` in your local/server environment. It authenticates prepared launch intents and is not a wallet private key. Keep it out of screenshots, issues and commits

## Development

```sh
pnpm dev
```

The Express/Vite development server uses port 5572 and HMR uses 5573. Both must be free. It currently binds to `0.0.0.0`; use a trusted local network or your firewall to restrict access

The server loads `OOPAD_` variables through Vite's development environment loader. Restart it after environment changes. `GET /api/status` reports configuration flags without exposing secrets

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm check
```

For `pnpm check`, keep the dev server running in another terminal. `CHECK_URL` can point to another instance. `BROWSER_EXECUTABLE` optionally selects a local Chromium binary; otherwise Playwright uses its installed browser

Unit tests mock external dependencies where appropriate. Browser checks do not sign or submit transactions. A green build is not proof that every upstream is reachable or that a funded launch succeeds

## Deployment

The repository includes `vercel.json` and `api/index.ts`. Create your own deployment project and configure secrets through its environment settings. This package contains no linked Vercel project, account-specific deploy script or production secrets

GitHub Pages can host static files but cannot execute this Express/serverless backend. Do not treat a Pages upload as a working launchpad deployment

After deploying, check `/api/status`, public data routes and disabled states before allowing launch requests. Add durable rate limiting and spending controls appropriate to your deployment before enabling a public paid AI endpoint

## Common Problems

- Missing Chromium: run the Playwright installation command above
- RPC TLS failure: check the endpoint, certificate chain and trusted network; never disable TLS verification
- Rate-limited public sources: let the source recover rather than replacing unavailable values with sample prices
- `AI_NOT_CONFIGURED`: provide your own authorized provider key, or continue using repository search and manual drafts
- `ARTWORK_NOT_CONFIGURED`: use an existing public HTTPS/IPFS image URL; local upload is only a preview
- Intent preparation disabled: configure a random 64- or 128-character hexadecimal `OOPAD_INTENT_SECRET`
