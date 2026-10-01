export const networks = [
  {
    id: "robinhood",
    name: "Robinhood",
    asset: "ETH",
    logo: "robinhood.png",
    url: "https://robinhood.com/us/en/chain/",
    description:
      "Create your community token here with Pons. Choose ETH or an approved stock token as the pair.",
  },
  {
    id: "solana",
    name: "Solana",
    asset: "SOL",
    logo: "solana.png",
    url: "https://solana.com/",
    description:
      "Explore the Solana ecosystem and liquidity tools at Meteora. Launching there takes place outside Oopad.",
  },
  {
    id: "ethereum",
    name: "Ethereum",
    asset: "ETH",
    logo: "ethereum.png",
    url: "https://ethereum.org/",
    description:
      "Explore Ethereum applications and developer resources. Oopad does not submit Ethereum transactions.",
  },
  {
    id: "base",
    name: "Base",
    asset: "ETH",
    logo: "base.png",
    url: "https://www.base.org/",
    description:
      "Explore Base and token creation through Clanker. Continue on the provider website for its current launch terms.",
  },
  {
    id: "bnb",
    name: "BNB Chain",
    asset: "BNB",
    logo: "binance.png",
    url: "https://www.bnbchain.org/",
    description:
      "Explore BNB Chain and the Four.meme launchpad. Your wallet and launch are managed on the external service.",
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    asset: "ETH",
    logo: "arbitrum.png",
    url: "https://arbitrum.io/",
    description:
      "Explore Arbitrum and its application ecosystem. Check supported networks directly with each launch provider.",
  },
  {
    id: "optimism",
    name: "Optimism",
    asset: "ETH",
    logo: "optimism.png",
    url: "https://www.optimism.io/",
    description:
      "Explore Optimism and its developer ecosystem. Native Oopad launches remain on Robinhood Chain.",
  },
  {
    id: "polygon",
    name: "Polygon",
    asset: "POL",
    logo: "polygon.png",
    url: "https://polygon.technology/",
    description:
      "Explore Polygon applications and developer resources. This entry is a directory link, not a wallet connection.",
  },
  {
    id: "avalanche",
    name: "Avalanche",
    asset: "AVAX",
    logo: "avalanchec.png",
    url: "https://www.avax.network/",
    description:
      "Explore Avalanche and its builders. Review network and asset support with the provider before making a transaction.",
  },
  {
    id: "unichain",
    name: "Unichain",
    asset: "ETH",
    logo: "unichain.ico",
    url: "https://www.unichain.org/",
    description:
      "Explore Unichain and its DeFi ecosystem. External networks are available for discovery, not native deployment here.",
  },
] as const;
export const launchpads = [
  {
    name: "Pons",
    logo: "pons.png",
    caption: "Launch here on Robinhood",
    href: "/launch",
    native: true,
  },
  {
    name: "Meteora",
    logo: "meteora.svg",
    caption: "External / Solana",
    href: "https://www.meteora.ag/",
    native: false,
  },
  {
    name: "Clanker",
    logo: "clanker.png",
    caption: "External / token launchpad",
    href: "https://www.clanker.world/",
    native: false,
  },
  {
    name: "Four.meme",
    logo: "four.svg",
    caption: "External / BNB Chain",
    href: "https://four.meme/",
    native: false,
  },
  {
    name: "Mint Club",
    logo: "mintclub.png",
    caption: "External / bonding curves",
    href: "https://mint.club/",
    native: false,
  },
];
