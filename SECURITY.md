# Security Reporting

Do not disclose vulnerabilities, credentials, private keys, seed phrases or private user information in a public issue

Use **Security > Report a vulnerability** when private vulnerability reporting is enabled for this repository. A separate reporting email has not been designated. If no private reporting option is available, request a private maintainer contact without publishing the technical details

Include affected source paths, a minimal reproduction using mocks or an unfunded environment, expected impact and any suggested mitigation. Do not test against other users' wallets, production funds or third-party systems without authorization

There is no promised response SLA, bug bounty, external audit or blanket authorization for penetration testing

## Before Operating A Deployment

- Keep secrets in server-side environment settings
- Use an independent intent secret for each deployment
- Configure provider-side spending limits and durable abuse controls before exposing paid AI requests
- Restrict access to development servers
- Recheck protocol addresses and upstream availability for your intended network
- Treat repository metadata and AI responses as untrusted input
- Review dependencies and preserve third-party notices

The published project-token address is not a contract-safety certification
