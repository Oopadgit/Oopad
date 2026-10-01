import {
  decodeFunctionData,
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

export const PONS_CHAIN_ID = 4663 as const;
export const PONS_FACTORY =
  "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" as const;
export const PONS_ROUTER =
  "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948" as const;
export const PONS_DEPLOYER =
  "0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42" as const;
export const NATIVE_QUOTE =
  "0x0000000000000000000000000000000000000000" as const;
export const PONS_CODE_HASHES = {
  factory: "0x89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84",
  router: "0xed9065184519eaa24a22c2556403d5d8bbb230ff94dbc5c414cf5028e20e52e7",
  deployer:
    "0xeade22566c766377f6adfb99534f2772251efad9568642c0704a7051418e624c",
} as const;

const structs = [
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }",
  "struct FeePolicy { address protocolFeeRecipient; uint16 protocolFeeShareBps; uint16 buybackBurnBps; uint16 hookFeeBps; uint16 maxInternalPriceImpactBps; }",
  "struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }",
] as const;
export const ponsFactoryAbi = parseAbi([
  ...structs,
  "function launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)",
  "function launchFee() view returns (uint256)",
  "function maxCreatorTaxBps() view returns (uint256)",
  "function launchConfigCount() view returns (uint256)",
  "function getLaunchConfig(uint256 id) view returns (LaunchConfig)",
  "function canLaunch(address launcher) view returns (bool)",
  "function launchForwarder() view returns (address)",
  "function launchDeployer() view returns (address)",
  "function memeHook() view returns (address)",
  "function previewLaunchEconomics(uint256 id, address pairToken) view returns (bytes32)",
  "function approvedPairTokens(address pairToken) view returns (bool)",
  "function pairTokenEconomics(address pairToken) view returns (uint256 phantomQuote, uint256 graduationThreshold, uint8 decimals)",
  "function getLaunchedToken(address token) view returns (LaunchedToken)",
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
]);
export const ponsRouterAbi = parseAbi([
  ...structs,
  "function factory() view returns (address)",
  "function launchAndBuy(TokenParams params, uint256 launchConfigId, address pairToken, uint256 quoteIn, uint256 minTokensOut, address recipient, address[] snipeTaxExemptions) payable returns (address token, address curve, uint256 tokensOut)",
]);
export const ponsReadAbi = parseAbi([
  ...structs,
  "function currentFeePolicy() view returns (FeePolicy)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function launchFactory() view returns (address)",
  "function curve() view returns (address)",
  "function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, Socials tokenSocials)",
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
  "event CurveBuyRefunded(address indexed buyer, uint256 refund)",
]);

export type LaunchSocials = {
  twitter: string;
  telegram: string;
  discord: string;
  website: string;
  farcaster: string;
};
export type LaunchRequest = {
  name: string;
  symbol: string;
  logo: string;
  description: string;
  socials: LaunchSocials;
  creatorFeeRecipient: Address;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  pairToken: Address;
  initialBuy: string;
  slippageBps: number;
  configId: number;
};
export type PrepareInput = { account: Address; launch: LaunchRequest };
export type TokenParams = Pick<
  LaunchRequest,
  | "name"
  | "symbol"
  | "logo"
  | "description"
  | "socials"
  | "creatorFeeRecipient"
  | "creatorTaxBps"
  | "buybackEnabled"
> & { expectedEconomics: Hex; salt: Hex };
export type LaunchPolicy = {
  status: "live";
  chainId: 4663;
  account: Address | null;
  pairToken: Address;
  configId: number;
  checkedAt: string;
  blockNumber: string;
  canLaunch: boolean | null;
  enabled: boolean;
  approved: boolean;
  decimals: number;
  launchFee: string;
  maxCreatorTaxBps: number;
  curveFeeBps: number;
  hookFeeBps: number;
  supply: string;
  phantomQuote: string;
  graduationThreshold: string;
  expectedEconomics: Hex;
  nativeBalance: string | null;
  quoteBalance: string | null;
  allowance: string | null;
  forwarderReady: boolean;
  intentReady: boolean;
};
export type InitialBuyQuote = {
  quoteIn: string;
  spent: string;
  refund: string;
  tokensOut: string;
  minTokensOut: string;
  fee: string;
  creatorTax: string;
  decimals: number;
};
export type LaunchTransaction = {
  chainId: 4663;
  account: Address;
  to: Address;
  data: Hex;
  value: string;
  gas: string;
};
export type PreparedLaunch = {
  fingerprint: Hex;
  expiresAt: string;
  policy: LaunchPolicy;
  quote: InitialBuyQuote;
  simulation: "passed" | "approval-required";
  transaction: LaunchTransaction | null;
  approval: {
    token: Address;
    spender: typeof PONS_ROUTER;
    amount: string;
    allowance: string;
  } | null;
};
export type VerifiedLaunch = {
  chainId: 4663;
  hash: Hex;
  token: Address;
  curve: Address;
  account: Address;
  creator: Address;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  pair: Address;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  configId: number;
  blockNumber: string;
  blockHash: Hex;
  blockTime: string;
  checkedAt: string;
  confirmations: string;
  provenanceVerified: true;
  quoteSpent: string;
  tokensReceived: string;
};
export type OopadLaunches = {
  items: VerifiedLaunch[];
  capturedAt: string | null;
  status: "live" | "cached" | "unavailable";
  error: string | null;
  coverage: {
    fromBlock: string | null;
    toBlock: string | null;
    nextBefore: string | null;
    partial: boolean;
    scannedTransactions: number;
  };
};

export const isContractAddress = (value: unknown): value is Address =>
  typeof value === "string" && /^0x[\da-f]{40}$/i.test(value);
const bytes = (value: string) => new TextEncoder().encode(value).length;
const uint256Max = (1n << 256n) - 1n;
export function decimalUint(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(0|[1-9]\d{0,77})$/.test(value) &&
    BigInt(value) <= uint256Max
  );
}
export function safeMetadataUrl(value: string, image = false): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    if (url.username || url.password || /[\u0000-\u0020\u007f]/.test(value))
      return false;
    return (
      (url.protocol === "https:" && Boolean(url.hostname)) ||
      (image && url.protocol === "ipfs:" && Boolean(url.hostname))
    );
  } catch {
    return false;
  }
}
export function validateLaunchRequest(input: unknown): PrepareInput {
  if (!input || typeof input !== "object")
    throw new Error("Enter valid launch parameters.");
  const { account, launch } = input as PrepareInput;
  if (!isContractAddress(account) || account.toLowerCase() === NATIVE_QUOTE)
    throw new Error("Connect a valid initiating account.");
  if (!launch || typeof launch !== "object")
    throw new Error("Enter valid launch parameters.");
  for (const [key, limit] of [
    ["name", 64],
    ["symbol", 16],
    ["logo", 512],
    ["description", 2048],
  ] as const) {
    const value = launch[key];
    if (
      typeof value !== "string" ||
      bytes(value) > limit ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    )
      throw new Error(
        `${key} exceeds the protocol metadata limit or contains invalid characters.`,
      );
  }
  if (!launch.name.trim() || !launch.symbol.trim())
    throw new Error("Token name and symbol are required.");
  if (!launch.logo || !safeMetadataUrl(launch.logo, true))
    throw new Error("Use a persistent HTTPS or IPFS image URL.");
  if (!launch.socials || typeof launch.socials !== "object")
    throw new Error("Enter valid social links.");
  for (const key of [
    "twitter",
    "telegram",
    "discord",
    "website",
    "farcaster",
  ] as const) {
    const value = launch.socials[key];
    if (
      typeof value !== "string" ||
      bytes(value) > 256 ||
      !safeMetadataUrl(value)
    )
      throw new Error(`${key} must be an HTTPS URL of at most 256 bytes.`);
  }
  if (
    !isContractAddress(launch.creatorFeeRecipient) ||
    launch.creatorFeeRecipient.toLowerCase() === NATIVE_QUOTE
  )
    throw new Error("Enter a nonzero creator fee recipient.");
  if (!isContractAddress(launch.pairToken))
    throw new Error("Select a valid quote asset contract.");
  if (
    !Number.isInteger(launch.creatorTaxBps) ||
    launch.creatorTaxBps < 0 ||
    launch.creatorTaxBps > 1000
  )
    throw new Error("Creator tax must be between 0 and 1,000 basis points.");
  if (typeof launch.buybackEnabled !== "boolean")
    throw new Error("Choose whether creator buybacks are enabled.");
  if (
    !Number.isInteger(launch.slippageBps) ||
    launch.slippageBps < 0 ||
    launch.slippageBps > 500
  )
    throw new Error("Slippage must be between 0 and 500 basis points.");
  if (
    !Number.isInteger(launch.configId) ||
    launch.configId < 0 ||
    launch.configId > 31
  )
    throw new Error("Select a supported launch configuration.");
  if (
    typeof launch.initialBuy !== "string" ||
    !/^(0|[1-9]\d{0,59})(\.\d{1,36})?$/.test(launch.initialBuy)
  )
    throw new Error("Enter the initial buy as a nonnegative decimal amount.");
  return {
    account: account.toLowerCase() as Address,
    launch: {
      ...launch,
      pairToken: launch.pairToken.toLowerCase() as Address,
      creatorFeeRecipient: launch.creatorFeeRecipient.toLowerCase() as Address,
    },
  };
}
export function canonicalRequest(input: PrepareInput): string {
  const { account, launch: p } = validateLaunchRequest(input);
  return JSON.stringify([
    PONS_CHAIN_ID,
    account,
    p.name,
    p.symbol,
    p.logo,
    p.description,
    ...Object.values(socialTuple(p.socials)),
    p.creatorFeeRecipient,
    p.creatorTaxBps,
    p.buybackEnabled,
    p.pairToken,
    p.initialBuy,
    p.slippageBps,
    p.configId,
  ]);
}
function socialTuple(socials: LaunchSocials): LaunchSocials {
  return {
    twitter: socials.twitter,
    telegram: socials.telegram,
    discord: socials.discord,
    website: socials.website,
    farcaster: socials.farcaster,
  };
}
export const launchFingerprint = (input: PrepareInput): Hex =>
  keccak256(stringToHex(canonicalRequest(input)));
export function quoteInitialBuy(
  quoteIn: bigint,
  supply: bigint,
  phantom: bigint,
  threshold: bigint,
  feeBps: bigint,
  taxBps: bigint,
  slippageBps: number,
  decimals: number,
): InitialBuyQuote {
  if (
    [quoteIn, supply, phantom, threshold].some(
      (value) => value < 0n || value > uint256Max,
    ) ||
    supply === 0n ||
    phantom === 0n ||
    threshold === 0n ||
    feeBps < 0n ||
    taxBps < 0n ||
    feeBps + taxBps > 2000n ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 500 ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36
  )
    throw new Error("Invalid quote economics.");
  const reserved = (supply * phantom) / (phantom + threshold);
  if (reserved === 0n || reserved >= supply)
    throw new Error("Unusable reserved allocation.");
  const sellable = supply - reserved;
  let spent = quoteIn;
  let fee = (spent * feeBps) / 10000n,
    tax = (spent * taxBps) / 10000n;
  const net = spent - fee - tax;
  let tokensOut = (net * supply) / (phantom + net);
  if (tokensOut > sellable) {
    tokensOut = sellable;
    const requiredNet = (sellable * phantom) / (supply - sellable) + 1n;
    const denominator = 10000n - feeBps - taxBps;
    const gross = (requiredNet * 10000n + denominator - 1n) / denominator;
    spent = gross < quoteIn ? gross : quoteIn;
    fee = (spent * feeBps) / 10000n;
    tax = (spent * taxBps) / 10000n;
  }
  // The contract compares rates when it clamps a fill, so scale the bound to requested input.
  const minimum =
    spent === 0n
      ? 0n
      : (tokensOut * quoteIn * BigInt(10000 - slippageBps)) / (spent * 10000n);
  if (minimum > uint256Max) throw new Error("Initial buy is too large.");
  return {
    quoteIn: quoteIn.toString(),
    spent: spent.toString(),
    refund: (quoteIn - spent).toString(),
    tokensOut: tokensOut.toString(),
    minTokensOut: minimum.toString(),
    fee: fee.toString(),
    creatorTax: tax.toString(),
    decimals,
  };
}
export function initialBuyUnits(input: string, decimals: number): bigint {
  if (
    !/^(0|[1-9]\d{0,59})(\.\d{1,36})?$/.test(input) ||
    (input.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(`Initial buy supports at most ${decimals} decimal places.`);
  const value = parseUnits(input, decimals);
  if (value > uint256Max) throw new Error("Initial buy is too large.");
  return value;
}
export function tokenParams(
  launch: LaunchRequest,
  expectedEconomics: Hex,
  salt: Hex,
): TokenParams {
  return {
    name: launch.name,
    symbol: launch.symbol,
    logo: launch.logo,
    description: launch.description,
    socials: socialTuple(launch.socials),
    creatorFeeRecipient: launch.creatorFeeRecipient,
    creatorTaxBps: launch.creatorTaxBps,
    buybackEnabled: launch.buybackEnabled,
    expectedEconomics,
    salt,
  };
}
export function encodeLaunchCall(
  account: Address,
  launch: LaunchRequest,
  params: TokenParams,
  quote: InitialBuyQuote,
): { to: Address; data: Hex } {
  return BigInt(quote.quoteIn) === 0n
    ? {
        to: PONS_FACTORY,
        data: encodeFunctionData({
          abi: ponsFactoryAbi,
          functionName: "launchToken",
          args: [params, BigInt(launch.configId), launch.pairToken],
        }),
      }
    : {
        to: PONS_ROUTER,
        data: encodeFunctionData({
          abi: ponsRouterAbi,
          functionName: "launchAndBuy",
          args: [
            params,
            BigInt(launch.configId),
            launch.pairToken,
            BigInt(quote.quoteIn),
            BigInt(quote.minTokensOut),
            account,
            [],
          ],
        }),
      };
}
export type DecodedLaunch = {
  params: TokenParams;
  configId: bigint;
  pairToken: Address;
  quoteIn: bigint;
  minTokensOut: bigint;
  recipient: Address;
  to: Address;
};
export function decodeLaunchCall(
  to: Address,
  data: Hex,
  account: Address,
): DecodedLaunch {
  if (to.toLowerCase() === PONS_FACTORY.toLowerCase()) {
    const result = decodeFunctionData({ abi: ponsFactoryAbi, data });
    if (result.functionName !== "launchToken")
      throw new Error("Not a launch transaction.");
    const [params, configId, pairToken] = result.args;
    return {
      params,
      configId,
      pairToken,
      quoteIn: 0n,
      minTokensOut: 0n,
      recipient: account,
      to: PONS_FACTORY,
    };
  }
  if (to.toLowerCase() === PONS_ROUTER.toLowerCase()) {
    const result = decodeFunctionData({ abi: ponsRouterAbi, data });
    if (result.functionName !== "launchAndBuy")
      throw new Error("Not a launch transaction.");
    const [
      params,
      configId,
      pairToken,
      quoteIn,
      minTokensOut,
      recipient,
      exemptions,
    ] = result.args;
    if (recipient.toLowerCase() !== account.toLowerCase() || exemptions.length)
      throw new Error("Unsupported launch recipient or exemptions.");
    return {
      params,
      configId,
      pairToken,
      quoteIn,
      minTokensOut,
      recipient,
      to: PONS_ROUTER,
    };
  }
  throw new Error("Transaction targets an unverified launch contract.");
}

export function parsePreparedLaunch(
  value: unknown,
  input: PrepareInput,
  now = Date.now(),
): PreparedLaunch {
  const fail = (): never => {
    throw new Error(
      "The launch service returned an invalid or outdated preparation.",
    );
  };
  const normalized = validateLaunchRequest(input);
  if (!value || typeof value !== "object") return fail();
  const row = value as PreparedLaunch;
  const p = row.policy,
    q = row.quote;
  if (
    row.fingerprint !== launchFingerprint(normalized) ||
    typeof row.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(row.expiresAt)) ||
    Date.parse(row.expiresAt) <= now ||
    Date.parse(row.expiresAt) > now + 180_000 ||
    !p ||
    !q
  )
    return fail();
  if (
    p.status !== "live" ||
    p.chainId !== PONS_CHAIN_ID ||
    p.account?.toLowerCase() !== normalized.account ||
    p.pairToken?.toLowerCase() !== normalized.launch.pairToken ||
    p.configId !== normalized.launch.configId ||
    p.canLaunch !== true ||
    p.enabled !== true ||
    p.approved !== true ||
    p.intentReady !== true ||
    !decimalUint(p.blockNumber) ||
    typeof p.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(p.checkedAt))
  )
    return fail();
  if (
    !Number.isInteger(p.decimals) ||
    p.decimals < 0 ||
    p.decimals > 36 ||
    !Number.isInteger(p.maxCreatorTaxBps) ||
    p.maxCreatorTaxBps < normalized.launch.creatorTaxBps ||
    p.maxCreatorTaxBps > 1000 ||
    !Number.isInteger(p.curveFeeBps) ||
    p.curveFeeBps < 0 ||
    p.curveFeeBps > 1000 ||
    !Number.isInteger(p.hookFeeBps) ||
    p.hookFeeBps < 0 ||
    p.hookFeeBps > 1000 ||
    !/^0x[\da-f]{64}$/i.test(p.expectedEconomics) ||
    /^0x0{64}$/.test(p.expectedEconomics)
  )
    return fail();
  for (const key of [
    "supply",
    "phantomQuote",
    "graduationThreshold",
    "launchFee",
    "nativeBalance",
    "quoteBalance",
  ] as const)
    if (!decimalUint(p[key])) return fail();
  const quoteIn = initialBuyUnits(normalized.launch.initialBuy, p.decimals);
  const expectedQuote = quoteInitialBuy(
    quoteIn,
    BigInt(p.supply),
    BigInt(p.phantomQuote),
    BigInt(p.graduationThreshold),
    BigInt(p.curveFeeBps),
    BigInt(normalized.launch.creatorTaxBps),
    normalized.launch.slippageBps,
    p.decimals,
  );
  if (
    Object.keys(expectedQuote).some(
      (key) =>
        q[key as keyof InitialBuyQuote] !==
        expectedQuote[key as keyof InitialBuyQuote],
    ) ||
    (quoteIn > 0n && (p.forwarderReady !== true || BigInt(q.tokensOut) === 0n))
  )
    return fail();
  const valueRequired =
    BigInt(p.launchFee) +
    (normalized.launch.pairToken === NATIVE_QUOTE ? quoteIn : 0n);
  if (
    BigInt(p.nativeBalance!) < valueRequired ||
    BigInt(p.quoteBalance!) < quoteIn
  )
    return fail();
  if (row.simulation === "approval-required") {
    const a = row.approval;
    if (
      row.transaction !== null ||
      !a ||
      normalized.launch.pairToken === NATIVE_QUOTE ||
      a.token?.toLowerCase() !== normalized.launch.pairToken ||
      a.spender?.toLowerCase() !== PONS_ROUTER.toLowerCase() ||
      a.amount !== quoteIn.toString() ||
      !decimalUint(a.allowance) ||
      p.allowance !== a.allowance ||
      BigInt(a.allowance) >= quoteIn
    )
      return fail();
  } else if (row.simulation === "passed") {
    const tx = row.transaction;
    if (
      row.approval !== null ||
      !tx ||
      tx.chainId !== PONS_CHAIN_ID ||
      tx.account?.toLowerCase() !== normalized.account ||
      !isContractAddress(tx.to) ||
      typeof tx.data !== "string" ||
      !/^0x[\da-f]+$/i.test(tx.data) ||
      tx.value !== valueRequired.toString() ||
      !decimalUint(tx.gas) ||
      BigInt(tx.gas) === 0n ||
      BigInt(tx.gas) > 30_000_000n
    )
      return fail();
    const call = decodeLaunchCall(tx.to, tx.data, normalized.account);
    if (!/^0x4f4f5044[\da-f]{56}$/i.test(call.params.salt)) return fail();
    const expected = encodeLaunchCall(
      normalized.account,
      normalized.launch,
      tokenParams(normalized.launch, p.expectedEconomics, call.params.salt),
      expectedQuote,
    );
    if (
      expected.to.toLowerCase() !== tx.to.toLowerCase() ||
      expected.data.toLowerCase() !== tx.data.toLowerCase()
    )
      return fail();
    if (
      quoteIn > 0n &&
      normalized.launch.pairToken !== NATIVE_QUOTE &&
      (!decimalUint(p.allowance) || BigInt(p.allowance) < quoteIn)
    )
      return fail();
  } else return fail();
  return row;
}
