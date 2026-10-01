# Configuration

All variables below are server-side. Never add a `VITE_` prefix to a secret

| Variable | Purpose | Default or behavior |
| --- | --- | --- |
| `OOPAD_INTENT_SECRET` | Signs prepared launch intents | Required for preparation; 64 or 128 hexadecimal characters |
| `OOPAD_RPC_URL` | Robinhood Chain JSON-RPC endpoint | Public endpoint in `.env.example` |
| `OOPAD_AI_KEY` | DeepInfra API credential | Empty disables AI generation |
| `OOPAD_AI_MODEL` | Provider model identifier | `meta-llama/Llama-3.3-70B-Instruct`; check availability with your provider |
| `OOPAD_AI_DAILY_LIMIT` | Per-instance request budget over a rolling day | 40; not an account-wide billing cap |
| `OOPAD_LAUNCH_START_BLOCK` | Optional lower bound for launch-event reads | Omit to use the source's bounded capture behavior |

No wallet private key or seed phrase belongs in this configuration. Wallet signing happens in the client after explicit user confirmation

The GitHub search adapter uses the public API. There is no configured private-repository integration or user GitHub credential requirement

See `server/research.ts`, `server/launch.ts` and `backend/pons-data.mjs` for the exact current behavior. Project identity lives in `src/domain/identity.ts`; the identity contract is not a quote asset or launch factory address
