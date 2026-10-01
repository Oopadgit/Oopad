export type SourceStatus = "live" | "cached" | "unavailable";
export type Asset = {
  address: string;
  symbol: string;
  name: string;
  decimals: number | null;
  logo: string | null;
  kind: "stock" | "crypto";
};
export type SourceEnvelope<T> = {
  items: T[];
  capturedAt: string | null;
  status: SourceStatus;
  error: string | null;
  coverage?: {
    fromBlock: string | null;
    toBlock: string | null;
    nextBefore: string | null;
    partial: boolean;
    scannedTransactions: number;
  };
};
export type Pool = {
  id: string;
  address: string;
  name: string;
  base: Asset;
  quote: Asset;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidity: number | null;
  createdAt: string | null;
  url: string;
};
export type PairCheck = {
  address: string;
  approval: "approved" | "rejected" | "unknown";
  status: SourceStatus;
  checkedAt: string | null;
  blockNumber: string | null;
  economics: {
    phantomQuote: string;
    graduationThreshold: string;
    decimals: number;
  } | null;
  error: string | null;
};
export type LaunchDraft = {
  name: string;
  symbol: string;
  description: string;
  logoUrl: string;
  website: string;
  pairAddress: string;
  initialBuy: string;
  creatorAddress: string;
  creatorTaxBps?: string;
  buybackEnabled?: string;
  slippageBps?: string;
};
