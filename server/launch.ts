import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import {
  PONS_CHAIN_ID,
  PONS_FACTORY,
  PONS_ROUTER,
  PONS_DEPLOYER,
  PONS_CODE_HASHES,
  NATIVE_QUOTE,
  ponsFactoryAbi,
  ponsRouterAbi,
  ponsReadAbi,
  isContractAddress,
  decimalUint,
  validateLaunchRequest,
  initialBuyUnits,
  quoteInitialBuy,
  tokenParams,
  encodeLaunchCall,
  decodeLaunchCall,
  launchFingerprint,
  type LaunchPolicy,
  type PrepareInput,
  type PreparedLaunch,
  type VerifiedLaunch,
  type DecodedLaunch,
  type TokenParams,
  type OopadLaunches,
} from "../src/domain/pons.js";
import { limitedJson, object } from "./source.js";
import { RPC_URL } from "./pair.js";

const MEME_HOOK = "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044";
const SALT_PREFIX = "4f4f5044";
const ZERO_TAG = "0".repeat(40);
const PREPARE_TTL = 90_000;
const uintHex = (value: unknown): Hex => {
  if (typeof value !== "string" || !/^0x[\da-f]+$/i.test(value))
    throw new LaunchError("The public RPC returned malformed data.");
  return value as Hex;
};
const sameAddress = (a: unknown, b: string) =>
  isContractAddress(a) && a.toLowerCase() === b.toLowerCase();
const amount = (value: unknown): bigint => {
  const result = BigInt(uintHex(value));
  if (!decimalUint(result.toString()))
    throw new LaunchError("The public RPC returned an invalid amount.");
  return result;
};
let operations: number[] = [];
let rpcCalls: number[] = [];
let scanCalls: number[] = [];

export class LaunchError extends Error {
  constructor(
    message: string,
    public status = 503,
    public code = "LAUNCH_UNAVAILABLE",
  ) {
    super(message);
  }
}
function budget() {
  operations = operations.filter((time) => time > Date.now() - 60_000);
  if (operations.length >= 12)
    throw new LaunchError(
      "Launch checks are cooling down. Try again in one minute.",
      429,
      "RATE_LIMITED",
    );
  operations.push(Date.now());
}
function intentSecret(): string {
  const value = process.env.OOPAD_INTENT_SECRET;
  if (!value || !/^(?:[a-f\d]{64}|[a-f\d]{128})$/i.test(value))
    throw new LaunchError(
      "Verified launch registration is not configured yet.",
      503,
      "INTENT_NOT_CONFIGURED",
    );
  return value;
}
function intentReady(): boolean {
  try {
    intentSecret();
    return true;
  } catch {
    return false;
  }
}
class Reader {
  readonly signal = AbortSignal.timeout(35_000);
  constructor(private readonly scan = false) {}
  async rpc(method: string, params: unknown[]): Promise<unknown> {
    if (this.scan) {
      scanCalls = scanCalls.filter((time) => time > Date.now() - 60_000);
      if (scanCalls.length >= 80)
        throw new LaunchError(
          "Recent launch discovery is cooling down. Try again shortly.",
          429,
          "RATE_LIMITED",
        );
      scanCalls.push(Date.now());
    } else {
      rpcCalls = rpcCalls.filter((time) => time > Date.now() - 60_000);
      if (rpcCalls.length >= 320)
        throw new LaunchError(
          "The public RPC request budget is exhausted. Try again shortly.",
          429,
          "RATE_LIMITED",
        );
      rpcCalls.push(Date.now());
    }
    let response: Response;
    try {
      response = await fetch(RPC_URL, {
        method: "POST",
        redirect: "error",
        signal: this.signal,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    } catch {
      throw new LaunchError(
        "The public RPC is unavailable. No launch has been submitted.",
      );
    }
    if (!response.ok)
      throw new LaunchError(
        "The public RPC is unavailable. Try the launch check again.",
      );
    const body = object(await limitedJson(response, 2_000_000));
    if (
      body.jsonrpc !== "2.0" ||
      body.id !== 1 ||
      body.error ||
      !("result" in body)
    ) {
      if (method === "eth_call" || method === "eth_estimateGas")
        throw new LaunchError(
          "The contract rejected this check. Verify funds, allowance, launch access and current protocol terms.",
          422,
          "SIMULATION_REJECTED",
        );
      throw new LaunchError(
        "The public RPC could not complete this launch check.",
      );
    }
    return body.result;
  }
  async read<T>(
    to: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
    block: Hex,
  ): Promise<T> {
    const data = encodeFunctionData({ abi, functionName, args });
    const value = await this.rpc("eth_call", [{ to, data }, block]);
    return decodeFunctionResult({
      abi,
      functionName,
      data: uintHex(value),
    }) as T;
  }
  async verifiedBlock(): Promise<Hex> {
    if (amount(await this.rpc("eth_chainId", [])) !== BigInt(PONS_CHAIN_ID))
      throw new LaunchError("The RPC returned the wrong chain.");
    const block = uintHex(await this.rpc("eth_blockNumber", []));
    for (const [key, address] of [
      ["factory", PONS_FACTORY],
      ["router", PONS_ROUTER],
      ["deployer", PONS_DEPLOYER],
    ] as const) {
      const code = uintHex(await this.rpc("eth_getCode", [address, block]));
      if (keccak256(code) !== PONS_CODE_HASHES[key])
        throw new LaunchError(
          `The ${key} contract code requires a new protocol review.`,
          503,
          "PROTOCOL_CHANGED",
        );
    }
    return block;
  }
}
type Config = {
  supply: bigint;
  curveFeeBps: bigint;
  phantomQuote: bigint;
  graduationThreshold: bigint;
  poolFee: number;
  tickSpacing: number;
  enabled: boolean;
};
type FeePolicy = {
  protocolFeeRecipient: Address;
  protocolFeeShareBps: number;
  buybackBurnBps: number;
  hookFeeBps: number;
  maxInternalPriceImpactBps: number;
};
type PolicyInput = {
  account?: string | null;
  pairToken: string;
  configId?: number;
};
async function policy(
  reader: Reader,
  input: PolicyInput,
): Promise<LaunchPolicy> {
  const { account = null, pairToken, configId = 0 } = input;
  if (
    !isContractAddress(pairToken) ||
    (account !== null &&
      (!isContractAddress(account) || sameAddress(account, NATIVE_QUOTE))) ||
    !Number.isInteger(configId) ||
    configId < 0 ||
    configId > 31
  )
    throw new LaunchError(
      "Provide a valid account, pair and configuration.",
      400,
      "INVALID_INPUT",
    );
  const pair = pairToken.toLowerCase() as Address;
  const caller = account?.toLowerCase() as Address | undefined;
  const block = await reader.verifiedBlock();
  const read = <T>(name: string, args: readonly unknown[] = []) =>
    reader.read<T>(PONS_FACTORY, ponsFactoryAbi, name, args, block);
  const deployer = await read<Address>("launchDeployer");
  const forwarder = await read<Address>("launchForwarder");
  const routerFactory = await reader.read<Address>(
    PONS_ROUTER,
    ponsRouterAbi,
    "factory",
    [],
    block,
  );
  const hook = await read<Address>("memeHook");
  if (
    !sameAddress(deployer, PONS_DEPLOYER) ||
    !sameAddress(routerFactory, PONS_FACTORY) ||
    !sameAddress(hook, MEME_HOOK)
  )
    throw new LaunchError(
      "The protocol wiring requires a new review.",
      503,
      "PROTOCOL_CHANGED",
    );
  const count = await read<bigint>("launchConfigCount");
  if (count < 1n || count > 32n || BigInt(configId) >= count)
    throw new LaunchError(
      "The selected launch configuration is unavailable.",
      422,
      "CONFIG_UNAVAILABLE",
    );
  const config = await read<Config>("getLaunchConfig", [BigInt(configId)]);
  const fees = await reader.read<FeePolicy>(
    hook,
    ponsReadAbi,
    "currentFeePolicy",
    [],
    block,
  );
  const launchFee = await read<bigint>("launchFee");
  const maxTax = await read<bigint>("maxCreatorTaxBps");
  const canLaunch = caller ? await read<boolean>("canLaunch", [caller]) : null;
  if (
    config.supply <= 0n ||
    config.curveFeeBps > 1000n ||
    config.poolFee !== 0 ||
    config.tickSpacing <= 0 ||
    maxTax > 1000n ||
    fees.hookFeeBps > 1000 ||
    !isContractAddress(fees.protocolFeeRecipient) ||
    sameAddress(fees.protocolFeeRecipient, NATIVE_QUOTE) ||
    fees.protocolFeeShareBps > 10000 ||
    fees.buybackBurnBps > 10000 ||
    fees.maxInternalPriceImpactBps === 0 ||
    fees.maxInternalPriceImpactBps >= 10000
  )
    throw new LaunchError(
      "The current fee policy requires a new protocol review.",
    );
  let approved = config.enabled,
    phantom = config.phantomQuote,
    threshold = config.graduationThreshold,
    decimals = 18;
  if (pair !== NATIVE_QUOTE) {
    approved =
      config.enabled && (await read<boolean>("approvedPairTokens", [pair]));
    const terms = await read<readonly [bigint, bigint, number]>(
      "pairTokenEconomics",
      [pair],
    );
    [phantom, threshold, decimals] = terms;
    if (approved) {
      const current = await reader.read<number>(
        pair,
        ponsReadAbi,
        "decimals",
        [],
        block,
      );
      if (current !== decimals)
        throw new LaunchError(
          "The quote token decimals changed. Launching is unavailable.",
          422,
          "PAIR_CHANGED",
        );
    }
  }
  if (
    decimals < 0 ||
    decimals > 36 ||
    (approved && (phantom <= 0n || threshold <= 0n))
  )
    throw new LaunchError(
      "The quote asset has unusable economics.",
      422,
      "PAIR_UNAVAILABLE",
    );
  const economics = await read<Hex>("previewLaunchEconomics", [
    BigInt(configId),
    pair,
  ]);
  if (!/^0x[\da-f]{64}$/i.test(economics) || /^0x0{64}$/.test(economics))
    throw new LaunchError("The protocol returned an invalid economics pin.");
  const nativeBalance = caller
    ? amount(await reader.rpc("eth_getBalance", [caller, block])).toString()
    : null;
  const quoteBalance = !caller
    ? null
    : pair === NATIVE_QUOTE
      ? nativeBalance
      : (
          await reader.read<bigint>(
            pair,
            ponsReadAbi,
            "balanceOf",
            [caller],
            block,
          )
        ).toString();
  const allowance =
    caller && pair !== NATIVE_QUOTE
      ? (
          await reader.read<bigint>(
            pair,
            ponsReadAbi,
            "allowance",
            [caller, PONS_ROUTER],
            block,
          )
        ).toString()
      : null;
  return {
    status: "live",
    chainId: PONS_CHAIN_ID,
    account: caller ?? null,
    pairToken: pair,
    configId,
    checkedAt: new Date().toISOString(),
    blockNumber: BigInt(block).toString(),
    canLaunch,
    enabled: config.enabled,
    approved,
    decimals,
    launchFee: launchFee.toString(),
    maxCreatorTaxBps: Number(maxTax),
    curveFeeBps: Number(config.curveFeeBps),
    hookFeeBps: fees.hookFeeBps,
    supply: config.supply.toString(),
    phantomQuote: phantom.toString(),
    graduationThreshold: threshold.toString(),
    expectedEconomics: economics,
    nativeBalance,
    quoteBalance,
    allowance,
    forwarderReady: sameAddress(forwarder, PONS_ROUTER),
    intentReady: intentReady(),
  };
}
export async function getLaunchPolicy(
  input: PolicyInput,
): Promise<LaunchPolicy> {
  budget();
  return policy(new Reader(), input);
}

function encodeDecoded(call: DecodedLaunch, params: TokenParams): Hex {
  return sameAddress(call.to, PONS_FACTORY)
    ? encodeFunctionData({
        abi: ponsFactoryAbi,
        functionName: "launchToken",
        args: [params, call.configId, call.pairToken],
      })
    : encodeFunctionData({
        abi: ponsRouterAbi,
        functionName: "launchAndBuy",
        args: [
          params,
          call.configId,
          call.pairToken,
          call.quoteIn,
          call.minTokensOut,
          call.recipient,
          [],
        ],
      });
}
function intentTag(account: Address, call: DecodedLaunch, seed: Hex): Buffer {
  return createHmac("sha256", Buffer.from(intentSecret(), "hex"))
    .update(
      `Oopad launch v1\n${PONS_CHAIN_ID}\n${account.toLowerCase()}\n${call.to.toLowerCase()}\n`,
    )
    .update(encodeDecoded(call, { ...call.params, salt: seed }))
    .digest()
    .subarray(0, 20);
}
export function issueIntentSalt(account: Address, call: DecodedLaunch): Hex {
  const nonce = SALT_PREFIX + randomBytes(8).toString("hex");
  const tag = intentTag(account, call, `0x${nonce}${ZERO_TAG}`);
  return `0x${nonce}${tag.toString("hex")}`;
}
export function verifyIntentSalt(
  account: Address,
  call: DecodedLaunch,
): boolean {
  const salt = call.params.salt;
  if (!new RegExp(`^0x${SALT_PREFIX}[a-f\\d]{56}$`, "i").test(salt))
    return false;
  const seed = `${salt.slice(0, 26)}${ZERO_TAG}` as Hex;
  const actual = Buffer.from(salt.slice(26), "hex");
  const expected = intentTag(account, call, seed);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function checkExactApproval(
  reader: Reader,
  account: Address,
  pair: Address,
  quoteIn: bigint,
  terms: LaunchPolicy,
): Promise<void> {
  const request = {
    from: account,
    to: pair,
    data: encodeFunctionData({
      abi: ponsReadAbi,
      functionName: "approve",
      args: [PONS_ROUTER, quoteIn],
    }),
    value: "0x0",
  };
  const block = toHex(BigInt(terms.blockNumber));
  const rejected = () =>
    new LaunchError(
      "The quote token rejected the exact router allowance. Tokens requiring an allowance reset are not supported by this flow.",
      422,
      "APPROVAL_REJECTED",
    );
  let result: unknown, estimated: bigint;
  try {
    result = await reader.rpc("eth_call", [request, block]);
    // Legacy ERC20 tokens may return no data, but an address without code must never pass.
    if (result === "0x") {
      const code = await reader.rpc("eth_getCode", [pair, block]);
      if (typeof code !== "string" || !/^0x(?:[\da-f]{2})+$/i.test(code))
        throw rejected();
    } else if (
      typeof result !== "string" ||
      !/^0x0{63}1$/i.test(result) ||
      decodeFunctionResult({
        abi: ponsReadAbi,
        functionName: "approve",
        data: result as Hex,
      }) !== true
    )
      throw rejected();
    estimated = amount(await reader.rpc("eth_estimateGas", [request, block]));
  } catch (error) {
    if (error instanceof LaunchError && error.code === "SIMULATION_REJECTED")
      throw rejected();
    throw error;
  }
  const gas = (estimated * 120n + 99n) / 100n;
  if (estimated === 0n || gas > 1_000_000n)
    throw new LaunchError(
      "The gas estimate is outside the supported approval range.",
      422,
      "GAS_UNAVAILABLE",
    );
  const gasPrice = amount(await reader.rpc("eth_gasPrice", []));
  if (
    BigInt(terms.nativeBalance ?? "0") <
    BigInt(terms.launchFee) + gas * gasPrice
  )
    throw new LaunchError(
      "The account needs more ETH for the approval network fee while reserving the launch fee.",
      422,
      "INSUFFICIENT_GAS",
    );
}
export async function prepareLaunch(
  raw: PrepareInput,
): Promise<PreparedLaunch> {
  budget();
  let input: PrepareInput;
  try {
    input = validateLaunchRequest(raw);
  } catch (error) {
    throw new LaunchError(
      error instanceof Error ? error.message : "Invalid launch parameters.",
      400,
      "INVALID_INPUT",
    );
  }
  intentSecret();
  const { account, launch } = input;
  const reader = new Reader();
  const terms = await policy(reader, {
    account,
    pairToken: launch.pairToken,
    configId: launch.configId,
  });
  if (!terms.canLaunch)
    throw new LaunchError(
      "The pons factory does not currently permit this account to launch.",
      403,
      "LAUNCH_NOT_ALLOWED",
    );
  if (!terms.enabled || !terms.approved)
    throw new LaunchError(
      "The selected quote or configuration is not enabled for launches.",
      422,
      "PAIR_UNAVAILABLE",
    );
  if (
    launch.creatorTaxBps > terms.maxCreatorTaxBps ||
    terms.curveFeeBps + launch.creatorTaxBps > 2000 ||
    terms.hookFeeBps + launch.creatorTaxBps > 2000
  )
    throw new LaunchError(
      "Creator tax exceeds the current protocol limit.",
      422,
      "TAX_TOO_HIGH",
    );
  let quoteIn: bigint;
  try {
    quoteIn = initialBuyUnits(launch.initialBuy, terms.decimals);
  } catch (error) {
    throw new LaunchError((error as Error).message, 400, "INVALID_AMOUNT");
  }
  if (quoteIn > 0n && !terms.forwarderReady)
    throw new LaunchError(
      "The atomic launch router is not enabled by this factory.",
      503,
      "ROUTER_UNAVAILABLE",
    );
  const quote = quoteInitialBuy(
    quoteIn,
    BigInt(terms.supply),
    BigInt(terms.phantomQuote),
    BigInt(terms.graduationThreshold),
    BigInt(terms.curveFeeBps),
    BigInt(launch.creatorTaxBps),
    launch.slippageBps,
    terms.decimals,
  );
  if (quoteIn > 0n && BigInt(quote.tokensOut) === 0n)
    throw new LaunchError(
      "The initial buy is too small to receive tokens.",
      422,
      "BUY_TOO_SMALL",
    );
  const value =
    BigInt(terms.launchFee) +
    (launch.pairToken === NATIVE_QUOTE ? quoteIn : 0n);
  if (BigInt(terms.nativeBalance ?? "0") < value)
    throw new LaunchError(
      "The account needs more native ETH for the launch fee and initial buy.",
      422,
      "INSUFFICIENT_ETH",
    );
  if (
    launch.pairToken !== NATIVE_QUOTE &&
    BigInt(terms.quoteBalance ?? "0") < quoteIn
  )
    throw new LaunchError(
      "The account does not hold enough of the selected quote token.",
      422,
      "INSUFFICIENT_QUOTE",
    );
  const fingerprint = launchFingerprint(input),
    expiresAt = new Date(Date.now() + PREPARE_TTL).toISOString();
  if (
    launch.pairToken !== NATIVE_QUOTE &&
    quoteIn > BigInt(terms.allowance ?? "0")
  ) {
    await checkExactApproval(reader, account, launch.pairToken, quoteIn, terms);
    return {
      fingerprint,
      expiresAt,
      policy: terms,
      quote,
      simulation: "approval-required",
      transaction: null,
      approval: {
        token: launch.pairToken,
        spender: PONS_ROUTER,
        amount: quoteIn.toString(),
        allowance: terms.allowance ?? "0",
      },
    };
  }
  const params = tokenParams(
    launch,
    terms.expectedEconomics,
    `0x${"0".repeat(64)}`,
  );
  let call = encodeLaunchCall(account, launch, params, quote);
  const decoded = decodeLaunchCall(call.to, call.data, account);
  params.salt = issueIntentSalt(account, decoded);
  call = encodeLaunchCall(account, launch, params, quote);
  const request = {
    from: account,
    to: call.to,
    data: call.data,
    value: toHex(value),
  };
  const block = toHex(BigInt(terms.blockNumber));
  const simulated = uintHex(await reader.rpc("eth_call", [request, block]));
  const returned = decodeFunctionResult({
    abi: quoteIn === 0n ? ponsFactoryAbi : ponsRouterAbi,
    functionName: quoteIn === 0n ? "launchToken" : "launchAndBuy",
    data: simulated,
  }) as readonly unknown[];
  if (
    !isContractAddress(returned[0]) ||
    !isContractAddress(returned[1]) ||
    sameAddress(returned[0], NATIVE_QUOTE) ||
    sameAddress(returned[1], NATIVE_QUOTE) ||
    (quoteIn > 0n && returned[2] !== BigInt(quote.tokensOut))
  )
    throw new LaunchError(
      "Simulation did not match the prepared launch and quote.",
      422,
      "QUOTE_MISMATCH",
    );
  const estimated = amount(
    await reader.rpc("eth_estimateGas", [request, block]),
  );
  const gas = (estimated * 120n + 99n) / 100n;
  if (estimated === 0n || gas > 30_000_000n)
    throw new LaunchError(
      "The gas estimate is outside the supported launch range.",
      422,
      "GAS_UNAVAILABLE",
    );
  const gasPrice = amount(await reader.rpc("eth_gasPrice", []));
  if (BigInt(terms.nativeBalance ?? "0") < value + gas * gasPrice)
    throw new LaunchError(
      "The account needs more ETH to cover the estimated network fee.",
      422,
      "INSUFFICIENT_GAS",
    );
  return {
    fingerprint,
    expiresAt,
    policy: terms,
    quote,
    simulation: "passed",
    approval: null,
    transaction: {
      chainId: PONS_CHAIN_ID,
      account,
      ...call,
      value: value.toString(),
      gas: gas.toString(),
    },
  };
}

type LaunchRecord = {
  token: Address;
  curve: Address;
  deployer: Address;
  creatorFeeRecipient: Address;
  pairToken: Address;
  graduationThreshold: bigint;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  exists: boolean;
};
export async function verifyLaunchReceipt(input: {
  hash: string;
}): Promise<VerifiedLaunch> {
  budget();
  return verifyReceipt(input.hash, new Reader());
}
async function verifyReceipt(
  inputHash: string,
  reader: Reader,
  knownCurrent?: Hex,
): Promise<VerifiedLaunch> {
  if (typeof inputHash !== "string" || !/^0x[\da-f]{64}$/i.test(inputHash))
    throw new LaunchError(
      "Provide a valid transaction hash.",
      400,
      "INVALID_HASH",
    );
  intentSecret();
  const current = knownCurrent ?? (await reader.verifiedBlock());
  const hash = inputHash.toLowerCase() as Hex;
  const transaction = object(
    await reader.rpc("eth_getTransactionByHash", [hash]),
  );
  const receipt = object(await reader.rpc("eth_getTransactionReceipt", [hash]));
  if (!receipt.blockNumber)
    throw new LaunchError(
      "The launch transaction is still pending or unavailable.",
      409,
      "PENDING",
    );
  if (receipt.status !== "0x1")
    throw new LaunchError(
      "The launch transaction reverted. It cannot be registered.",
      422,
      "REVERTED",
    );
  if (
    transaction.hash !== hash ||
    receipt.transactionHash !== hash ||
    !isContractAddress(transaction.from) ||
    !isContractAddress(transaction.to) ||
    receipt.from !== transaction.from ||
    receipt.to !== transaction.to ||
    transaction.blockHash !== receipt.blockHash ||
    transaction.blockNumber !== receipt.blockNumber ||
    typeof receipt.blockHash !== "string" ||
    !/^0x[\da-f]{64}$/i.test(receipt.blockHash) ||
    !Array.isArray(receipt.logs) ||
    (transaction.chainId !== undefined &&
      amount(transaction.chainId) !== BigInt(PONS_CHAIN_ID))
  )
    throw new LaunchError(
      "The transaction and receipt do not agree.",
      422,
      "INVALID_RECEIPT",
    );
  if (
    receipt.logs.some((raw) => {
      const log = object(raw);
      return (
        log.removed === true ||
        log.transactionHash !== hash ||
        log.blockHash !== receipt.blockHash ||
        log.blockNumber !== receipt.blockNumber
      );
    })
  )
    throw new LaunchError(
      "The receipt contains mismatched or removed logs.",
      422,
      "INVALID_RECEIPT",
    );
  const account = transaction.from,
    data = uintHex(transaction.input);
  let call: DecodedLaunch;
  try {
    call = decodeLaunchCall(transaction.to, data, account);
  } catch {
    throw new LaunchError(
      "Only direct Oopad factory or router transactions can be verified.",
      422,
      "UNSUPPORTED_TRANSACTION",
    );
  }
  if (
    encodeDecoded(call, call.params).toLowerCase() !== data.toLowerCase() ||
    !verifyIntentSalt(account, call)
  )
    throw new LaunchError(
      "This transaction does not contain a valid Oopad launch registration intent.",
      422,
      "PROVENANCE_NOT_VERIFIED",
    );
  const blockNumber = amount(receipt.blockNumber);
  if (BigInt(current) < blockNumber + 1n)
    throw new LaunchError(
      "Waiting for an additional block before registration.",
      409,
      "CONFIRMING",
    );
  const block = object(
    await reader.rpc("eth_getBlockByNumber", [receipt.blockNumber, false]),
  );
  if (block.hash !== receipt.blockHash)
    throw new LaunchError(
      "The receipt block is no longer canonical. Wait and retry.",
      409,
      "REORG",
    );
  const events = receipt.logs
    .filter((raw) => sameAddress(object(raw).address, PONS_FACTORY))
    .flatMap((raw) => {
      const log = object(raw);
      try {
        const decoded: any = decodeEventLog({
          abi: ponsFactoryAbi,
          data: uintHex(log.data),
          topics: log.topics as [Hex, ...Hex[]],
          strict: true,
        });
        return decoded.eventName === "TokenLaunched" ? [decoded.args] : [];
      } catch {
        return [];
      }
    });
  if (events.length !== 1)
    throw new LaunchError(
      "The receipt must contain exactly one verified factory launch.",
      422,
      "INVALID_RECEIPT",
    );
  const event = events[0];
  if (
    !sameAddress(event.deployer, account) ||
    !sameAddress(event.pairToken, call.pairToken) ||
    event.launchConfigId !== call.configId
  )
    throw new LaunchError(
      "The factory event does not match the signed launch.",
      422,
      "INVALID_RECEIPT",
    );
  const launch = await reader.read<LaunchRecord>(
    PONS_FACTORY,
    ponsFactoryAbi,
    "getLaunchedToken",
    [event.token],
    receipt.blockNumber as Hex,
  );
  if (
    !launch.exists ||
    !sameAddress(launch.token, event.token) ||
    !sameAddress(launch.curve, event.curve) ||
    !sameAddress(launch.deployer, account) ||
    !sameAddress(launch.creatorFeeRecipient, call.params.creatorFeeRecipient) ||
    !sameAddress(launch.pairToken, call.pairToken) ||
    launch.graduationThreshold !== event.graduationThreshold ||
    launch.creatorTaxBps !== call.params.creatorTaxBps ||
    launch.buybackEnabled !== call.params.buybackEnabled
  )
    throw new LaunchError(
      "The factory record does not match the launch intent.",
      422,
      "INVALID_RECEIPT",
    );
  const info = await reader.read<
    readonly [Address, string, string, Record<string, string>]
  >(event.token, ponsReadAbi, "getTokenInfo", [], receipt.blockNumber as Hex);
  const name = await reader.read<string>(
    event.token,
    ponsReadAbi,
    "name",
    [],
    receipt.blockNumber as Hex,
  );
  const symbol = await reader.read<string>(
    event.token,
    ponsReadAbi,
    "symbol",
    [],
    receipt.blockNumber as Hex,
  );
  if (
    !sameAddress(info[0], account) ||
    info[1] !== call.params.logo ||
    info[2] !== call.params.description ||
    name !== call.params.name ||
    symbol !== call.params.symbol ||
    Object.keys(call.params.socials).some(
      (key) =>
        info[3][key] !==
        call.params.socials[key as keyof typeof call.params.socials],
    )
  )
    throw new LaunchError(
      "Token metadata does not match the registered launch.",
      422,
      "INVALID_RECEIPT",
    );
  let spent = 0n,
    tokensReceived = 0n;
  const buys = receipt.logs
    .filter((raw) => sameAddress(object(raw).address, event.curve))
    .flatMap((raw) => {
      const log = object(raw);
      try {
        const decoded: any = decodeEventLog({
          abi: ponsReadAbi,
          data: uintHex(log.data),
          topics: log.topics as [Hex, ...Hex[]],
          strict: true,
        });
        return decoded.eventName === "CurveBuy" ? [decoded.args] : [];
      } catch {
        return [];
      }
    });
  if (call.quoteIn > 0n) {
    if (
      buys.length !== 1 ||
      !sameAddress(buys[0].buyer, PONS_ROUTER) ||
      !sameAddress(buys[0].recipient, account) ||
      buys[0].quoteIn > call.quoteIn ||
      buys[0].tokensOut === 0n ||
      buys[0].quoteIn * call.minTokensOut > call.quoteIn * buys[0].tokensOut
    )
      throw new LaunchError(
        "The opening buy is not verified by the curve receipt.",
        422,
        "INVALID_RECEIPT",
      );
    spent = buys[0].quoteIn;
    tokensReceived = buys[0].tokensOut;
  } else if (buys.length)
    throw new LaunchError(
      "Unexpected initial buy in the launch receipt.",
      422,
      "INVALID_RECEIPT",
    );
  const blockSeconds = amount(block.timestamp);
  if (blockSeconds > BigInt(Math.floor(Date.now() / 1000) + 300))
    throw new LaunchError("The block timestamp is invalid.");
  return {
    chainId: PONS_CHAIN_ID,
    hash,
    token: event.token,
    curve: event.curve,
    account,
    creator: call.params.creatorFeeRecipient,
    name,
    symbol,
    logo: info[1],
    description: info[2],
    pair: call.pairToken,
    creatorTaxBps: call.params.creatorTaxBps,
    buybackEnabled: call.params.buybackEnabled,
    configId: Number(call.configId),
    blockNumber: blockNumber.toString(),
    blockHash: receipt.blockHash as Hex,
    blockTime: new Date(Number(blockSeconds) * 1000).toISOString(),
    checkedAt: new Date().toISOString(),
    confirmations: (BigInt(current) - blockNumber + 1n).toString(),
    provenanceVerified: true,
    quoteSpent: spent.toString(),
    tokensReceived: tokensReceived.toString(),
  };
}

const recent = new Map<string, { result: OopadLaunches; expires: number }>();
const scans = new Map<string, Promise<OopadLaunches>>();
export async function getOopadLaunches(
  input: { before?: string } = {},
): Promise<OopadLaunches> {
  const before = input.before ?? "";
  if (
    typeof before !== "string" ||
    before.length > 45 ||
    (before && !/^\d{1,20}:\d{1,10}$/.test(before))
  )
    throw new LaunchError(
      "Provide a valid launch-page cursor.",
      400,
      "INVALID_CURSOR",
    );
  const cached = recent.get(before);
  if (cached && cached.expires > Date.now())
    return {
      ...cached.result,
      status: cached.result.status === "unavailable" ? "unavailable" : "cached",
    };
  if (scans.has(before)) return scans.get(before)!;
  if (scans.size >= 2)
    throw new LaunchError(
      "Recent launch discovery is busy. Try again shortly.",
      429,
      "RATE_LIMITED",
    );
  const task = (async (): Promise<OopadLaunches> => {
    let result: OopadLaunches;
    const empty = {
      fromBlock: null,
      toBlock: null,
      nextBefore: null,
      partial: true,
      scannedTransactions: 0,
    };
    try {
      intentSecret();
      const reader = new Reader(true);
      const current = await reader.verifiedBlock();
      const cursor = before ? before.split(":").map(BigInt) : null;
      const latest = BigInt(current) > 0n ? BigInt(current) - 1n : 0n;
      const to = cursor && cursor[0] < latest ? cursor[0] : latest;
      const floorValue = process.env.OOPAD_LAUNCH_START_BLOCK;
      const floor =
        floorValue && /^\d{1,20}$/.test(floorValue) ? BigInt(floorValue) : 0n;
      if (floor > latest)
        throw new LaunchError(
          "The launch index start block is ahead of the chain.",
        );
      const from = to > floor + 4999n ? to - 4999n : floor;
      if (to < from)
        return {
          items: [],
          status: "live",
          capturedAt: new Date().toISOString(),
          error: null,
          coverage: {
            fromBlock: floor.toString(),
            toBlock: to.toString(),
            nextBefore: null,
            partial: false,
            scannedTransactions: 0,
          },
        };
      const topic = keccak256(
        new TextEncoder().encode(
          "TokenLaunched(address,address,address,address,uint256,uint256)",
        ),
      );
      const raw = await reader.rpc("eth_getLogs", [
        {
          address: PONS_FACTORY,
          topics: [topic],
          fromBlock: toHex(from),
          toBlock: toHex(to),
        },
      ]);
      if (!Array.isArray(raw))
        throw new LaunchError(
          "The launch event source returned malformed data.",
        );
      const logs = raw
        .map((value) => {
          const row = object(value);
          if (
            !sameAddress(row.address, PONS_FACTORY) ||
            typeof row.transactionHash !== "string" ||
            !/^0x[\da-f]{64}$/i.test(row.transactionHash) ||
            row.removed === true
          )
            throw new LaunchError(
              "The launch event source returned an invalid identity.",
            );
          const block = amount(row.blockNumber),
            index = amount(row.logIndex);
          if (block < from || block > to)
            throw new LaunchError(
              "The launch event source returned a block outside the requested range.",
            );
          return { hash: row.transactionHash, block, index };
        })
        .filter(
          (row) =>
            !cursor ||
            row.block < cursor[0] ||
            (row.block === cursor[0] && row.index < cursor[1]),
        )
        .sort((a, b) =>
          a.block === b.block
            ? a.index === b.index
              ? 0
              : a.index > b.index
                ? -1
                : 1
            : a.block > b.block
              ? -1
              : 1,
        );
      const items: VerifiedLaunch[] = [];
      let inspected = 0,
        partial = false,
        error: string | null = null;
      let nextBefore: string | null = before || `${to}:4294967295`;
      const seen = new Set<string>();
      for (const log of logs) {
        if (inspected >= 24 || items.length >= 2 || reader.signal.aborted) {
          partial = true;
          break;
        }
        if (seen.has(log.hash)) continue;
        seen.add(log.hash);
        try {
          const transaction = object(
            await reader.rpc("eth_getTransactionByHash", [log.hash]),
          );
          inspected++;
          if (
            !isContractAddress(transaction.from) ||
            !isContractAddress(transaction.to) ||
            amount(transaction.blockNumber) !== log.block
          )
            throw new LaunchError(
              "A launch transaction is not yet available for this event.",
            );
          let call: DecodedLaunch | null = null;
          try {
            call = decodeLaunchCall(
              transaction.to,
              uintHex(transaction.input),
              transaction.from,
            );
          } catch {
            /* Other launch frontends and wrappers are outside this index. */
          }
          if (
            call &&
            call.params.salt.toLowerCase().startsWith(`0x${SALT_PREFIX}`) &&
            verifyIntentSalt(transaction.from, call)
          )
            items.push(await verifyReceipt(log.hash, reader, current));
          nextBefore = `${log.block}:${log.index}`;
        } catch {
          partial = true;
          error =
            "Some transactions could not be verified in this capture. Continue or refresh the scan.";
          break;
        }
      }
      if (!partial) nextBefore = from > floor ? `${from}:0` : null;
      result = {
        items,
        status: "live",
        capturedAt: new Date().toISOString(),
        error:
          error ??
          (partial
            ? "This bounded capture has more transactions to inspect."
            : null),
        coverage: {
          fromBlock: from.toString(),
          toBlock: to.toString(),
          nextBefore,
          partial,
          scannedTransactions: inspected,
        },
      };
    } catch (error) {
      const message =
        error instanceof LaunchError
          ? error.message
          : "The public launch source is unavailable.";
      result =
        cached &&
        cached.result.capturedAt &&
        Date.now() - Date.parse(cached.result.capturedAt) < 300_000
          ? {
              ...cached.result,
              status: "cached",
              error: message,
              coverage: { ...cached.result.coverage, partial: true },
            }
          : {
              items: [],
              capturedAt: null,
              status: "unavailable",
              error: message,
              coverage: empty,
            };
    }
    if (recent.size >= 8) recent.delete(recent.keys().next().value!);
    recent.set(before, { result, expires: Date.now() + 30_000 });
    return result;
  })();
  scans.set(before, task);
  try {
    return await task;
  } finally {
    scans.delete(before);
  }
}
