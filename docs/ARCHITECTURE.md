# Architecture

## Application Boundary

React routes render the public interface. Express owns upstream requests, intent authentication and optional AI calls. `server/dev.ts` combines the API with Vite for local development; `api/index.ts` exposes the same API to the serverless deployment

No provider secret is embedded in the browser bundle. API responses must distinguish unknown data from zero values

## Repository To Draft

1. A user searches public repositories through the server's GitHub adapter
2. Repository URLs and descriptions remain evidence, not executable instructions
3. The user edits an independent community-token draft
4. Optional AI generation can suggest an angle but cannot authorize a wallet transaction

Referencing a repository does not tokenize its source, confer ownership or establish a partnership

## Launch Flow

1. Read current Pons policy and quote-asset approval
2. Validate the draft, initial buy, slippage and economic terms on the server
3. Prepare an authenticated intent tied to the request
4. Recheck execution conditions on the client
5. Request explicit approval in the user's wallet
6. Verify the resulting transaction receipt against the expected launch

Review `src/domain/pons.ts`, `src/Launch.tsx`, `server/launch.ts` and `src/wallet/core.ts`. The repository does not include Pons contract implementations and does not claim a contract audit

## Data And Limits

Source adapters provide quote assets, bounded factory observations, indexed pools and candles. These are not a complete market census. A graduated phase is source-derived rather than inferred only from display progress. Market cap and FDV are separate fields

Watchlists and editable drafts are browser-local. Request counters and event caches are per process. Serverless replicas do not share a durable global budget or complete launch history

## Visual Runtime

The main Three.js scene preserves the original logo and releases its geometry/materials on teardown. Reduced motion disables continuous ambient movement, and a bitmap remains available when WebGL fails

Authored Star Portal effects decorate native controls in opaque sandboxed frames. They do not receive wallet authority or implement application actions. Original source archives and their hashes are kept for provenance regression tests

## API Overview

| Route | Role |
| --- | --- |
| `GET /api/status` | Configuration flags |
| `GET /api/github?q=...` | Public repository search |
| `GET /api/assets` | Quote-asset registry |
| `GET /api/markets` | Indexed markets |
| `GET /api/live` | Bounded launch observations |
| `GET /api/narratives` | Labels derived from observed launches |
| `GET /api/pair?address=...` | Pair checks |
| `GET /api/candles?pool=...&interval=5` | Supported pool candles |
| `GET /api/launch/policy` | Current launch terms |
| `POST /api/launch/prepare` | Validated intent preparation |
| `GET /api/launch/receipt` | Receipt verification |
| `POST /api/agent` | Optional provider-backed brief |

Write requests enforce the application's origin check. Exact schemas and errors are defined in source; this table is not a promise of an externally versioned API
