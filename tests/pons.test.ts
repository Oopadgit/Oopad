import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeFunctionData,
  encodeFunctionData,
  encodeFunctionResult,
  keccak256,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import {
  NATIVE_QUOTE,
  PONS_FACTORY,
  PONS_ROUTER,
  validateLaunchRequest,
  initialBuyUnits,
  quoteInitialBuy,
  tokenParams,
  encodeLaunchCall,
  decodeLaunchCall,
  launchFingerprint,
  PONS_CODE_HASHES,
  PONS_DEPLOYER,
  ponsFactoryAbi,
  ponsRouterAbi,
  ponsReadAbi,
  parsePreparedLaunch,
  type PrepareInput,
} from "../src/domain/pons.js";
import {
  getLaunchPolicy,
  issueIntentSalt,
  verifyIntentSalt,
  prepareLaunch,
} from "../server/launch.js";

const account = "0x1111111111111111111111111111111111111111" as Address;
const other = "0x2222222222222222222222222222222222222222" as Address;
const pin = `0x${"a".repeat(64)}` as Hex;
const blankSalt = `0x${"0".repeat(64)}` as Hex;
const input = (): PrepareInput => ({
  account,
  launch: {
    name: "Oopad test",
    symbol: "TEST",
    logo: "ipfs://bafytestimage",
    description: "Protocol integration fixture.",
    socials: {
      twitter: "",
      telegram: "",
      discord: "",
      website: "https://example.com",
      farcaster: "",
    },
    creatorFeeRecipient: account,
    creatorTaxBps: 125,
    buybackEnabled: false,
    pairToken: NATIVE_QUOTE,
    initialBuy: "0",
    slippageBps: 100,
    configId: 0,
  },
});
const quote = (amount: bigint, slippage = 100, decimals = 18) =>
  quoteInitialBuy(
    amount,
    1_000_000n * 10n ** 18n,
    168n * 10n ** 16n,
    42n * 10n ** 17n,
    100n,
    125n,
    slippage,
    decimals,
  );
function fixtureCall(value = input()) {
  const q = quote(
    initialBuyUnits(value.launch.initialBuy, 18),
    value.launch.slippageBps,
  );
  const params = tokenParams(value.launch, pin, blankSalt);
  const encoded = encodeLaunchCall(value.account, value.launch, params, q);
  return decodeLaunchCall(encoded.to, encoded.data, value.account);
}
function withSecret(task: () => void) {
  const previous = process.env.OOPAD_INTENT_SECRET;
  process.env.OOPAD_INTENT_SECRET = "ab".repeat(32);
  try {
    task();
  } finally {
    if (previous === undefined) delete process.env.OOPAD_INTENT_SECRET;
    else process.env.OOPAD_INTENT_SECRET = previous;
  }
}
let fixtureClock = Date.now();
type RpcRequest = { method: string; params: any[] };
async function withProtocol(
  task: (calls: string[], requests: RpcRequest[]) => Promise<void>,
  options: {
    allowance?: bigint;
    rejectSimulation?: boolean;
    permit?: boolean;
    approvalResult?: Hex;
    rejectApproval?: boolean;
    rejectApprovalEstimate?: boolean;
    approvalCode?: Hex;
    gasEstimate?: bigint;
    nativeBalance?: bigint;
  } = {},
) {
  const originalFetch = globalThis.fetch,
    previous = process.env.OOPAD_INTENT_SECRET;
  const originalNow = Date.now;
  // Give each isolated fixture a fresh rate-limit window without weakening production limits.
  fixtureClock += 61_000;
  Date.now = () => fixtureClock;
  const hashes = { ...PONS_CODE_HASHES },
    mutableHashes = PONS_CODE_HASHES as Record<string, string>;
  const code = "0x6001" as Hex,
    calls: string[] = [],
    requests: RpcRequest[] = [];
  for (const key of Object.keys(hashes)) mutableHashes[key] = keccak256(code);
  process.env.OOPAD_INTENT_SECRET = "ab".repeat(32);
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body.method);
    requests.push(body);
    const rejected = () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { code: 3, message: "execution reverted" },
        }),
        { headers: { "content-type": "application/json" } },
      );
    let result: unknown;
    if (body.method === "eth_chainId") result = "0x1237";
    else if (body.method === "eth_blockNumber") result = "0x100";
    else if (body.method === "eth_getCode")
      result = body.params[0] === other ? (options.approvalCode ?? code) : code;
    else if (body.method === "eth_getBalance")
      result = "0x" + (options.nativeBalance ?? 100n * 10n ** 18n).toString(16);
    else if (body.method === "eth_estimateGas") {
      const approval = body.params[0].data.startsWith("0x095ea7b3");
      if (approval && options.rejectApprovalEstimate) return rejected();
      result =
        "0x" +
        (options.gasEstimate ?? (approval ? 50_000n : 1_048_576n)).toString(16);
    } else if (body.method === "eth_gasPrice") result = "0x1";
    else if (body.method === "eth_call") {
      let decoded:
          { functionName: string; args?: readonly unknown[] } | undefined,
        abi: Abi | undefined;
      for (const candidate of [ponsFactoryAbi, ponsRouterAbi, ponsReadAbi]) {
        try {
          decoded = decodeFunctionData({
            abi: candidate,
            data: body.params[0].data,
          });
          abi = candidate;
          break;
        } catch {
          /* Try the next verified interface. */
        }
      }
      if (!decoded || !abi) throw new Error("Unexpected contract call");
      const name = decoded.functionName;
      let value: unknown;
      if (name === "launchDeployer") value = PONS_DEPLOYER;
      else if (name === "launchForwarder") value = PONS_ROUTER;
      else if (name === "factory") value = PONS_FACTORY;
      else if (name === "memeHook")
        value = "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044";
      else if (name === "launchConfigCount") value = 1n;
      else if (name === "getLaunchConfig")
        value = {
          supply: 10n ** 24n,
          curveFeeBps: 100n,
          phantomQuote: 168n * 10n ** 16n,
          graduationThreshold: 42n * 10n ** 17n,
          poolFee: 0,
          tickSpacing: 60,
          enabled: true,
        };
      else if (name === "currentFeePolicy")
        value = {
          protocolFeeRecipient: other,
          protocolFeeShareBps: 5000,
          buybackBurnBps: 2000,
          hookFeeBps: 100,
          maxInternalPriceImpactBps: 100,
        };
      else if (name === "launchFee") value = 10n ** 15n;
      else if (name === "maxCreatorTaxBps") value = 1000n;
      else if (name === "canLaunch") value = options.permit ?? true;
      else if (name === "approvedPairTokens") value = true;
      else if (name === "pairTokenEconomics")
        value = [168n * 10n ** 16n, 42n * 10n ** 17n, 18];
      else if (name === "previewLaunchEconomics") value = pin;
      else if (name === "balanceOf") value = 100n * 10n ** 18n;
      else if (name === "allowance") value = options.allowance ?? 0n;
      else if (name === "decimals") value = 18;
      else if (name === "approve") {
        if (options.rejectApproval) return rejected();
        if (options.approvalResult !== undefined)
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: options.approvalResult,
            }),
            { headers: { "content-type": "application/json" } },
          );
        value = true;
      } else if (name === "launchToken" || name === "launchAndBuy") {
        if (options.rejectSimulation)
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              error: { code: 3, message: "execution reverted" },
            }),
            { headers: { "content-type": "application/json" } },
          );
        value =
          name === "launchToken"
            ? [other, account]
            : [
                other,
                account,
                BigInt(quote(decoded.args![3] as bigint).tokensOut),
              ];
      } else throw new Error("Unhandled read " + name);
      result = encodeFunctionResult({ abi, functionName: name, result: value });
    } else throw new Error("Unexpected RPC method " + body.method);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await task(calls, requests);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    Object.assign(mutableHashes, hashes);
    if (previous === undefined) delete process.env.OOPAD_INTENT_SECRET;
    else process.env.OOPAD_INTENT_SECRET = previous;
  }
}

test("metadata applies verified byte caps rather than JavaScript character counts", () => {
  const value = input();
  value.launch.name = "\u00e9".repeat(32);
  assert.doesNotThrow(() => validateLaunchRequest(value));
  value.launch.name += "\u00e9";
  assert.throws(() => validateLaunchRequest(value), /metadata limit/);
  value.launch.name = "Valid";
  value.launch.logo = "https://example.com/" + "a".repeat(500);
  assert.throws(() => validateLaunchRequest(value), /logo/);
  value.launch.logo = "ipfs://bafytest";
  value.launch.socials.website = "https://example.com/" + "a".repeat(250);
  assert.throws(() => validateLaunchRequest(value), /website/);
});
test("description and symbol support exact protocol limits", () => {
  const value = input();
  value.launch.symbol = "A".repeat(16);
  value.launch.description = "a".repeat(2048);
  assert.doesNotThrow(() => validateLaunchRequest(value));
  value.launch.description += "a";
  assert.throws(() => validateLaunchRequest(value), /description/);
  value.launch.description = "";
  value.launch.symbol += "B";
  assert.throws(() => validateLaunchRequest(value), /symbol/);
});
test("metadata rejects active URLs and credentials while allowing persistent IPFS images", () => {
  for (const logo of [
    "javascript:alert(1)",
    "data:image/png;base64,AA==",
    "blob:https://example.com/id",
    "https://user:password@example.com/image",
  ]) {
    const value = input();
    value.launch.logo = logo;
    assert.throws(() => validateLaunchRequest(value), /image URL/);
  }
  assert.doesNotThrow(() => validateLaunchRequest(input()));
});
test("creator and initiating accounts must be explicit nonzero contracts", () => {
  const value = input();
  value.launch.creatorFeeRecipient = NATIVE_QUOTE;
  assert.throws(() => validateLaunchRequest(value), /nonzero creator/);
  value.launch.creatorFeeRecipient = account;
  value.account = NATIVE_QUOTE;
  assert.throws(() => validateLaunchRequest(value), /initiating account/);
});
test("tax and slippage are bounded integer basis points", () => {
  for (const tax of [-1, 1001, 0.5, NaN]) {
    const value = input();
    value.launch.creatorTaxBps = tax;
    assert.throws(() => validateLaunchRequest(value), /Creator tax/);
  }
  for (const slippage of [-1, 501, 1.5]) {
    const value = input();
    value.launch.slippageBps = slippage;
    assert.throws(() => validateLaunchRequest(value), /Slippage/);
  }
});
test("initial buys preserve quote precision and never silently round", () => {
  assert.equal(initialBuyUnits("1.234567", 6), 1234567n);
  assert.throws(() => initialBuyUnits("1.2345678", 6), /6 decimal places/);
  for (const value of ["1e2", "-1", ".5", "01", "1."])
    assert.throws(() => initialBuyUnits(value, 18));
});
test("zero initial buy quotes no spend, tax or minimum output", () => {
  const result = quote(0n);
  assert.deepEqual(
    [
      result.spent,
      result.refund,
      result.tokensOut,
      result.minTokensOut,
      result.fee,
      result.creatorTax,
    ],
    ["0", "0", "0", "0", "0", "0"],
  );
});
test("opening buy subtracts separately floored standard and creator fees", () => {
  const result = quote(10n ** 17n);
  const net = 10n ** 17n - 10n ** 15n - 125n * 10n ** 13n;
  const expected =
    (net * (1_000_000n * 10n ** 18n)) / (168n * 10n ** 16n + net);
  assert.equal(BigInt(result.tokensOut), expected);
  assert.equal(BigInt(result.minTokensOut), (expected * 9900n) / 10000n);
  assert.equal(result.refund, "0");
});
test("clamped opening buy refunds input and scales minimum as a rate", () => {
  const result = quote(100n * 10n ** 18n);
  const supply = 1_000_000n * 10n ** 18n;
  const reserved =
    (supply * (168n * 10n ** 16n)) / (168n * 10n ** 16n + 42n * 10n ** 17n);
  assert.equal(BigInt(result.tokensOut), supply - reserved);
  assert.ok(BigInt(result.refund) > 0n);
  assert.equal(
    BigInt(result.spent) + BigInt(result.refund),
    BigInt(result.quoteIn),
  );
  assert.ok(BigInt(result.minTokensOut) > BigInt(result.tokensOut));
  assert.ok(
    BigInt(result.spent) * BigInt(result.minTokensOut) <=
      BigInt(result.quoteIn) * BigInt(result.tokensOut),
  );
});
test("six decimal quote asset uses the same integer curve semantics", () => {
  const result = quoteInitialBuy(
    1_000_000n,
    10n ** 24n,
    10_000_000n,
    25_000_000n,
    100n,
    100n,
    0,
    6,
  );
  assert.equal(result.fee, "10000");
  assert.equal(result.creatorTax, "10000");
  assert.equal(result.decimals, 6);
  assert.equal(result.tokensOut, result.minTokensOut);
});
test("unusable curve economics fail closed", () => {
  assert.throws(
    () => quoteInitialBuy(1n, 1n, 1n, 2n, 100n, 0n, 100, 18),
    /reserved allocation/,
  );
  assert.throws(
    () => quoteInitialBuy(1n, 100n, 1n, 2n, 1000n, 1001n, 100, 18),
    /Invalid quote/,
  );
});
test("zero buy selects factory and nonzero buy selects atomic router", () => {
  assert.equal(fixtureCall().to, PONS_FACTORY);
  const value = input();
  value.launch.initialBuy = "0.1";
  value.launch.pairToken = other;
  const call = fixtureCall(value);
  assert.equal(call.to, PONS_ROUTER);
  assert.equal(call.quoteIn, 10n ** 17n);
  assert.equal(call.recipient.toLowerCase(), account);
  assert.equal(call.pairToken.toLowerCase(), other);
});
test("decoder refuses unrelated destinations and approve calldata", () => {
  const value = input();
  const encoded = encodeLaunchCall(
    account,
    value.launch,
    tokenParams(value.launch, pin, blankSalt),
    quote(0n),
  );
  assert.throws(
    () => decodeLaunchCall(other, encoded.data, account),
    /unverified/,
  );
  const approval = encodeFunctionData({
    abi: parseAbi([
      "function approve(address spender,uint256 value) returns (bool)",
    ]),
    functionName: "approve",
    args: [PONS_ROUTER, 1n],
  });
  assert.throws(() => decodeLaunchCall(PONS_ROUTER, approval, account));
});
test("fingerprints include every form field and ignore social-object insertion order", () => {
  const a = input(),
    b = input();
  b.launch.socials = {
    website: "https://example.com",
    farcaster: "",
    discord: "",
    telegram: "",
    twitter: "",
  };
  assert.equal(launchFingerprint(a), launchFingerprint(b));
  b.launch.creatorTaxBps++;
  assert.notEqual(launchFingerprint(a), launchFingerprint(b));
  b.launch.creatorTaxBps--;
  b.account = other;
  assert.notEqual(launchFingerprint(a), launchFingerprint(b));
});
test("server-issued salt is random and authenticates the exact caller and launch", () =>
  withSecret(() => {
    const call = fixtureCall();
    const salt = issueIntentSalt(account, call);
    assert.match(salt, /^0x4f4f5044[\da-f]{56}$/);
    assert.notEqual(salt, issueIntentSalt(account, call));
    call.params.salt = salt;
    assert.equal(verifyIntentSalt(account, call), true);
    assert.equal(verifyIntentSalt(other, call), false);
    assert.equal(
      verifyIntentSalt(account, {
        ...call,
        params: { ...call.params, creatorTaxBps: 999 },
      }),
      false,
    );
    assert.equal(
      verifyIntentSalt(account, {
        ...call,
        params: { ...call.params, logo: "https://example.com/changed.png" },
      }),
      false,
    );
    assert.equal(
      verifyIntentSalt(account, { ...call, pairToken: other }),
      false,
    );
    assert.equal(verifyIntentSalt(account, { ...call, configId: 1n }), false);
  }));
test("intent authenticates opening buy amount, minimum and economics pin", () =>
  withSecret(() => {
    const value = input();
    value.launch.initialBuy = "0.1";
    const call = fixtureCall(value);
    call.params.salt = issueIntentSalt(account, call);
    assert.equal(verifyIntentSalt(account, call), true);
    assert.equal(
      verifyIntentSalt(account, { ...call, quoteIn: call.quoteIn + 1n }),
      false,
    );
    assert.equal(
      verifyIntentSalt(account, { ...call, minTokensOut: 0n }),
      false,
    );
    assert.equal(
      verifyIntentSalt(account, {
        ...call,
        params: { ...call.params, expectedEconomics: blankSalt },
      }),
      false,
    );
  }));
test("unconfigured registration cannot create a transaction", async () => {
  const previous = process.env.OOPAD_INTENT_SECRET;
  delete process.env.OOPAD_INTENT_SECRET;
  try {
    await assert.rejects(
      prepareLaunch(input()),
      /registration is not configured/,
    );
  } finally {
    if (previous !== undefined) process.env.OOPAD_INTENT_SECRET = previous;
  }
});
test("wrong RPC chain prevents all contract reads", async () => {
  const original = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    methods.push(body.method);
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    await assert.rejects(
      getLaunchPolicy({ account, pairToken: NATIVE_QUOTE }),
      /wrong chain/,
    );
    assert.deepEqual(methods, ["eth_chainId"]);
  } finally {
    globalThis.fetch = original;
  }
});
test("replaced factory code prevents launch policy and simulation", async () => {
  const original = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    methods.push(body.method);
    const result =
      body.method === "eth_chainId"
        ? "0x1237"
        : body.method === "eth_blockNumber"
          ? "0x100"
          : "0x6000";
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await assert.rejects(
      getLaunchPolicy({ account, pairToken: NATIVE_QUOTE }),
      /contract code requires/,
    );
    assert.equal(methods.includes("eth_call"), false);
  } finally {
    globalThis.fetch = original;
  }
});
test("native zero-buy preparation exposes only a successfully simulated factory transaction", async () =>
  withProtocol(async (calls) => {
    const value = input(),
      prepared = await prepareLaunch(value);
    assert.equal(prepared.simulation, "passed");
    assert.equal(prepared.transaction?.to, PONS_FACTORY);
    assert.equal(prepared.transaction?.value, (10n ** 15n).toString());
    assert.equal(calls.includes("eth_estimateGas"), true);
    assert.equal(parsePreparedLaunch(prepared, value), prepared);
    assert.throws(() =>
      parsePreparedLaunch(
        {
          ...prepared,
          transaction: {
            ...prepared.transaction,
            value: "999999999999999999999",
          },
        },
        value,
      ),
    );
    assert.throws(() =>
      parsePreparedLaunch(
        { ...prepared, expiresAt: new Date(0).toISOString() },
        value,
      ),
    );
    const changed = input();
    changed.launch.creatorTaxBps++;
    assert.throws(() => parsePreparedLaunch(prepared, changed));
  }));
test("native opening buy sends fee plus quote input to atomic router", async () =>
  withProtocol(async () => {
    const value = input();
    value.launch.initialBuy = "0.1";
    const prepared = await prepareLaunch(value);
    assert.equal(prepared.transaction?.to, PONS_ROUTER);
    assert.equal(
      prepared.transaction?.value,
      (10n ** 15n + 10n ** 17n).toString(),
    );
    assert.doesNotThrow(() => parsePreparedLaunch(prepared, value));
  }));
test("stock approval requirement simulates exact router allowance and never exposes a launch transaction or calls a write", async () =>
  withProtocol(async (calls, requests) => {
    const value = input();
    value.launch.initialBuy = "0.1";
    value.launch.pairToken = other;
    const prepared = await prepareLaunch(value);
    assert.equal(prepared.simulation, "approval-required");
    assert.equal(prepared.transaction, null);
    assert.deepEqual(prepared.approval, {
      token: other,
      spender: PONS_ROUTER,
      amount: (10n ** 17n).toString(),
      allowance: "0",
    });
    const approvalCalls = requests.filter(
      (request) =>
        request.method === "eth_call" &&
        request.params[0].data.startsWith("0x095ea7b3"),
    );
    assert.equal(approvalCalls.length, 1);
    const exact = {
      from: account,
      to: other,
      data: encodeFunctionData({
        abi: ponsReadAbi,
        functionName: "approve",
        args: [PONS_ROUTER, 10n ** 17n],
      }),
      value: "0x0",
    };
    assert.deepEqual(approvalCalls[0].params, [exact, "0x100"]);
    assert.deepEqual(
      requests.find((request) => request.method === "eth_estimateGas")?.params,
      [exact, "0x100"],
    );
    assert.equal(calls.includes("eth_gasPrice"), true);
    assert.equal(
      calls.some((method) => /send|sign/.test(method)),
      false,
    );
    assert.doesNotThrow(() => parsePreparedLaunch(prepared, value));
    assert.throws(() =>
      parsePreparedLaunch(
        { ...prepared, approval: { ...prepared.approval, spender: other } },
        value,
      ),
    );
  }));

test("legacy empty approval result requires deployed quote-token code", async () => {
  const value = input();
  value.launch.initialBuy = "0.1";
  value.launch.pairToken = other;
  await withProtocol(
    async () =>
      assert.equal(
        (await prepareLaunch(value)).simulation,
        "approval-required",
      ),
    { approvalResult: "0x" },
  );
  await withProtocol(
    async (calls) => {
      await assert.rejects(prepareLaunch(value), { code: "APPROVAL_REJECTED" });
      assert.equal(calls.includes("eth_estimateGas"), false);
    },
    { approvalResult: "0x", approvalCode: "0x" },
  );
});

test("false or malformed approval responses cannot offer an approval transaction", async () => {
  for (const approvalResult of [
    `0x${"0".repeat(64)}`,
    `0x${"0".repeat(63)}2`,
    "0x01",
    `0x${"0".repeat(63)}1${"0".repeat(64)}`,
  ] as Hex[]) {
    await withProtocol(
      async (calls) => {
        const value = input();
        value.launch.initialBuy = "0.1";
        value.launch.pairToken = other;
        await assert.rejects(prepareLaunch(value), {
          code: "APPROVAL_REJECTED",
        });
        assert.equal(calls.includes("eth_estimateGas"), false);
        assert.equal(
          calls.some((method) => /send|sign/.test(method)),
          false,
        );
      },
      { approvalResult },
    );
  }
});

test("zero-reset approval and failed approval estimates stop without fallback writes", async () => {
  for (const options of [
    { rejectApproval: true },
    { rejectApprovalEstimate: true },
  ]) {
    await withProtocol(
      async (_calls, requests) => {
        const value = input();
        value.launch.initialBuy = "0.1";
        value.launch.pairToken = other;
        await assert.rejects(prepareLaunch(value), /allowance reset/);
        const approvals = requests.filter(
          (request) =>
            request.method === "eth_call" &&
            request.params[0].data.startsWith("0x095ea7b3"),
        );
        assert.equal(approvals.length, 1);
        assert.equal(
          decodeFunctionData({
            abi: ponsReadAbi,
            data: approvals[0].params[0].data,
          }).args?.[1],
          10n ** 17n,
        );
      },
      { allowance: 1n, ...options },
    );
  }
});

test("approval gas estimates are nonzero and bounded including the buffer", async () => {
  for (const gasEstimate of [0n, 833_334n]) {
    await withProtocol(
      async () => {
        const value = input();
        value.launch.initialBuy = "0.1";
        value.launch.pairToken = other;
        await assert.rejects(prepareLaunch(value), { code: "GAS_UNAVAILABLE" });
      },
      { gasEstimate },
    );
  }
});

test("approval requires enough ETH for buffered gas while retaining the launch fee", async () => {
  const value = input();
  value.launch.initialBuy = "0.1";
  value.launch.pairToken = other;
  await withProtocol(
    async () => {
      await assert.rejects(prepareLaunch(value), { code: "INSUFFICIENT_GAS" });
    },
    { nativeBalance: 10n ** 15n + 59_999n },
  );
  await withProtocol(
    async () =>
      assert.equal(
        (await prepareLaunch(value)).simulation,
        "approval-required",
      ),
    { nativeBalance: 10n ** 15n + 60_000n },
  );
});
test("stock preparation after exact allowance sends only the native launch fee", async () =>
  withProtocol(
    async () => {
      const value = input();
      value.launch.initialBuy = "0.1";
      value.launch.pairToken = other;
      const prepared = await prepareLaunch(value);
      assert.equal(prepared.simulation, "passed");
      assert.equal(prepared.transaction?.value, (10n ** 15n).toString());
      assert.equal(prepared.transaction?.to, PONS_ROUTER);
      assert.doesNotThrow(() => parsePreparedLaunch(prepared, value));
    },
    { allowance: 10n ** 17n },
  ));
test("rejected simulation cannot return a transaction", async () =>
  withProtocol(
    async (calls) => {
      await assert.rejects(prepareLaunch(input()), /contract rejected/);
      assert.equal(calls.includes("eth_estimateGas"), false);
    },
    { rejectSimulation: true },
  ));
test("closed launcher gate fails before transaction simulation", async () =>
  withProtocol(
    async (calls) => {
      await assert.rejects(prepareLaunch(input()), /does not currently permit/);
      assert.equal(calls.includes("eth_estimateGas"), false);
    },
    { permit: false },
  ));
