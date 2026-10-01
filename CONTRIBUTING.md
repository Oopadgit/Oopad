# Contributing

Use issues for reproducible non-sensitive bugs and scoped proposals. Do not include private keys, API credentials, personal wallet exports, environment files or exploit details

Before submitting a pull request:

1. Explain the behavior being changed and the affected routes
2. Keep edits within that behavior; avoid unrelated formatting or identity changes
3. Run `pnpm typecheck`, `pnpm test` and `pnpm build`
4. For UI changes, include desktop/mobile screenshots and test keyboard interaction, reduced motion and overflow
5. For wallet or launch changes, add regression tests and describe what was mocked

Never submit funded transactions merely to demonstrate a fix. Do not replace unavailable market data with fabricated prices or claim a supported chain without implementing its execution path

The effect archive under `src/effects/star-portal/sources` is immutable. Review upstream changes separately, retain notices and update hashes deliberately. Do not edit an archived shader to make a test pass

A project-wide license has not yet been selected. Discuss substantial code contributions with the maintainer before submitting them; no contributor-license agreement is implied
