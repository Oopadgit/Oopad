import assert from "node:assert/strict";
import test from "node:test";
import {
  displayBalance,
  inspectAccount,
  requestAccount,
  ROBINHOOD_CHAIN,
  switchToRobinhood,
  walletError,
  type WalletOption,
  type WalletProviderApi,
} from "../src/wallet/core";
import { WalletSession } from "../src/wallet/session";
import { safeIcon, walletOptions } from "../src/wallet/discovery";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
type Request = { method: string; params?: readonly unknown[] | object };

class MockWallet implements WalletProviderApi {
  calls: Request[] = [];
  accounts = [A];
  chain = "0x1237";
  balance = "0xde0b6b3a7640000";
  handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  override: ((args: Request) => Promise<unknown> | undefined) | null = null;

  async request(args: Request): Promise<unknown> {
    this.calls.push(args);
    const overridden = this.override?.(args);
    if (overridden) return overridden;
    if (args.method === "eth_requestAccounts" || args.method === "eth_accounts")
      return this.accounts;
    if (args.method === "eth_chainId") return this.chain;
    if (args.method === "eth_getBalance") return this.balance;
    if (args.method === "wallet_switchEthereumChain") {
      this.chain = (args.params as { chainId: string }[])[0].chainId;
      return null;
    }
    if (args.method === "wallet_addEthereumChain") return null;
    throw new Error(`Unexpected wallet method ${args.method}`);
  }
  on(event: string, handler: (...args: unknown[]) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)?.add(handler);
  }
  removeListener(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.get(event)?.delete(handler);
  }
  emit(event: string, value?: unknown) {
    this.handlers.get(event)?.forEach((handler) => handler(value));
  }
  detail(id = "test"): WalletOption {
    return { id, name: "Test wallet", icon: null, provider: this };
  }
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
test("legacy wallet discovery names brands and finds Phantom without replacing MetaMask", () => {
  const metamask = Object.assign(new MockWallet(), { isMetaMask: true });
  const phantom = Object.assign(new MockWallet(), {
    isMetaMask: true,
    isPhantom: true,
  });
  const choices = walletOptions([], metamask, phantom);
  assert.deepEqual(
    choices.map((w) => w.name),
    ["Phantom", "MetaMask"],
  );
  assert.equal(choices[0].provider, phantom);
  assert.equal(choices[1].provider, metamask);
  assert.equal(walletOptions([], phantom, phantom).length, 1);
  assert.equal(
    walletOptions(
      [{ info: { uuid: "p", name: "Phantom", icon: "" }, provider: phantom }],
      metamask,
      phantom,
    ).length,
    2,
  );
  assert.equal(walletOptions([], null, { isPhantom: true }).length, 0);
});
test("image signing requests only a scoped personal message and rejects account races", async () => {
  const wallet = new MockWallet(),
    session = new WalletSession();
  await session.connect(wallet.detail());
  const message = `Oopad image upload\nWallet: ${A}\nNo transaction or token allowance.`;
  wallet.override = (args) =>
    args.method === "personal_sign"
      ? Promise.resolve(`0x${"f".repeat(130)}`)
      : undefined;
  assert.equal(
    await session.signUploadMessage(message),
    `0x${"f".repeat(130)}`,
  );
  assert.equal(
    wallet.calls.filter((call) => call.method === "personal_sign").length,
    1,
  );
  assert.equal(
    wallet.calls.filter((call) => call.method === "eth_sendTransaction").length,
    0,
  );
  await assert.rejects(
    session.signUploadMessage("Unrelated signing request"),
    /Invalid upload message/,
  );
  wallet.accounts = [B];
  await assert.rejects(session.signUploadMessage(message), /account changed/);
  assert.equal(
    wallet.calls.filter((call) => call.method === "personal_sign").length,
    1,
  );
  session.dispose();
});
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("wallet metadata uses the documented mainnet and exposes no token identity", () => {
  assert.equal(ROBINHOOD_CHAIN.id, 4663);
  assert.equal(ROBINHOOD_CHAIN.nativeCurrency.symbol, "ETH");
  assert.equal(
    ROBINHOOD_CHAIN.rpcUrls.default.http[0],
    "https://rpc.mainnet.chain.robinhood.com",
  );
  assert.equal(
    ROBINHOOD_CHAIN.blockExplorers.default.url,
    "https://robinhoodchain.blockscout.com",
  );
  assert.equal(displayBalance(null), "Unavailable");
  assert.equal(displayBalance("0"), "0 ETH");
  assert.equal(displayBalance("0.000000000000000001"), "< 0.000001 ETH");
  assert.equal(displayBalance("1.25"), "1.25 ETH");
});

test("provider discovery is permissionless, deduplicated and includes injected fallback", () => {
  const provider = new MockWallet();
  const second = new MockWallet();
  const announcement = {
    info: {
      uuid: "one",
      name: "Example",
      icon: "https://example.com/icon.png",
    },
    provider,
  };
  const options = walletOptions([announcement, announcement], provider);
  assert.equal(options.length, 1);
  assert.equal(options[0].id, "eip6963:one");
  assert.equal(options[0].icon, null);
  assert.equal(walletOptions([announcement], second).length, 2);
  assert.equal(walletOptions([], provider)[0].id, "injected");
  assert.equal(walletOptions([], { request: "invalid" }).length, 0);
  assert.equal(provider.calls.length, 0);
  assert.equal(second.calls.length, 0);
  assert.equal(
    safeIcon("data:image/png;base64,abc"),
    "data:image/png;base64,abc",
  );
  assert.equal(safeIcon("javascript:alert(1)"), null);
  assert.equal(safeIcon(`data:image/png;base64,${"a".repeat(100_000)}`), null);
});

test("account permission is an explicit request and never a signature", async () => {
  const provider = new MockWallet();
  const session = new WalletSession();
  assert.equal(session.getSnapshot().account, null);
  assert.equal(provider.calls.length, 0);
  assert.equal(await requestAccount(provider), A);
  assert.deepEqual(
    provider.calls.map((call) => call.method),
    ["eth_requestAccounts"],
  );
  provider.accounts = [];
  await assert.rejects(() => requestAccount(provider));
  session.dispose();
});

test("balance read uses only the shared account and verifies chain and account again", async () => {
  const provider = new MockWallet();
  assert.deepEqual(await inspectAccount(provider), {
    account: A,
    chainId: 4663,
    balance: "1",
    balanceError: null,
  });
  assert.deepEqual(
    provider.calls.map((call) => call.method),
    [
      "eth_accounts",
      "eth_chainId",
      "eth_getBalance",
      "eth_chainId",
      "eth_accounts",
    ],
  );
  assert.deepEqual(provider.calls[2].params, [A, "latest"]);
});

test("a different chain does not read ETH or request a switch", async () => {
  const provider = new MockWallet();
  provider.chain = "0x1";
  assert.deepEqual(await inspectAccount(provider), {
    account: A,
    chainId: 1,
    balance: null,
    balanceError: null,
  });
  assert.deepEqual(
    provider.calls.map((call) => call.method),
    ["eth_accounts", "eth_chainId"],
  );
});

test("network or account changes during a balance request discard its old value", async () => {
  for (const change of ["network", "account"]) {
    const provider = new MockWallet();
    provider.override = (args) => {
      if (args.method !== "eth_getBalance") return;
      if (change === "network") provider.chain = "0x1";
      else provider.accounts = [B];
      return Promise.resolve(provider.balance);
    };
    const snapshot = await inspectAccount(provider);
    assert.equal(snapshot.balance, null);
    assert.equal(snapshot.account, change === "account" ? B : A);
    assert.equal(snapshot.chainId, change === "network" ? 1 : 4663);
  }
});

test("source failure preserves an unknown balance separately from wallet errors", async () => {
  const provider = new MockWallet();
  provider.override = (args) =>
    args.method === "eth_getBalance"
      ? Promise.reject(new Error("Source failed"))
      : undefined;
  const session = new WalletSession();
  await session.connect(provider.detail());
  assert.equal(session.getSnapshot().account, A);
  assert.equal(session.getSnapshot().balance, null);
  assert.match(session.getSnapshot().balanceError || "", /unavailable/);
  assert.equal(session.getSnapshot().error, null);
  session.dispose();
});

test("invalid network reads cannot claim a connected network", async () => {
  const provider = new MockWallet();
  provider.chain = "invalid";
  const session = new WalletSession();
  await session.connect(provider.detail());
  assert.equal(session.getSnapshot().chainId, null);
  assert.equal(session.getSnapshot().status, "unknown-chain");
  assert.equal(session.getSnapshot().balance, null);
  assert.ok(session.getSnapshot().error);
  provider.chain = "0x1237";
  await session.refresh();
  assert.equal(session.getSnapshot().status, "connected");
  session.dispose();
});

test("explicit network switch uses documented add parameters only for unknown chain", async () => {
  const provider = new MockWallet();
  let unknown = true;
  provider.override = (args) => {
    if (args.method === "wallet_switchEthereumChain" && unknown) {
      unknown = false;
      return Promise.reject({ code: 4902 });
    }
  };
  await switchToRobinhood(provider);
  assert.deepEqual(
    provider.calls.map((call) => call.method),
    [
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
      "eth_chainId",
    ],
  );
  const parameters = (provider.calls[1].params as Record<string, unknown>[])[0];
  assert.equal(parameters.chainId, "0x1237");
  assert.deepEqual(parameters.rpcUrls, [
    "https://rpc.mainnet.chain.robinhood.com",
  ]);
});

test("switch rejection does not add a network and false success is rejected", async () => {
  const provider = new MockWallet();
  provider.override = (args) =>
    args.method === "wallet_switchEthereumChain"
      ? Promise.reject({ code: 4001 })
      : undefined;
  await assert.rejects(() => switchToRobinhood(provider));
  assert.equal(provider.calls.length, 1);
  provider.chain = "0x1";
  provider.override = (args) =>
    args.method === "wallet_switchEthereumChain"
      ? Promise.resolve(null)
      : undefined;
  await assert.rejects(() => switchToRobinhood(provider), /did not change/);
});

test("session rejection is retryable and provider errors do not expose raw messages", async () => {
  const provider = new MockWallet();
  const session = new WalletSession();
  provider.override = (args) =>
    args.method === "eth_requestAccounts"
      ? Promise.reject({ code: 4001 })
      : undefined;
  await session.connect(provider.detail());
  assert.equal(session.getSnapshot().account, null);
  assert.equal(session.getSnapshot().busy, false);
  assert.match(session.getSnapshot().error || "", /cancelled/);
  assert.doesNotMatch(
    walletError({ message: "PRIVATE_DIAGNOSTIC" }),
    /PRIVATE_DIAGNOSTIC/,
  );
  assert.match(walletError({ cause: { code: -32002 } }), /already open/);
  provider.override = null;
  await session.connect(provider.detail());
  assert.equal(session.getSnapshot().status, "connected");
  session.dispose();
});

test("account change immediately clears old balance and observes the new account", async () => {
  const provider = new MockWallet();
  const session = new WalletSession();
  await session.connect(provider.detail());
  provider.accounts = [B];
  provider.balance = "0x1";
  provider.emit("accountsChanged", [B]);
  assert.equal(session.getSnapshot().account, null);
  assert.equal(session.getSnapshot().balance, null);
  await settle();
  assert.equal(session.getSnapshot().account, B);
  assert.equal(session.getSnapshot().balance, "0.000000000000000001");
  assert.equal(
    provider.calls.filter((call) => call.method === "eth_requestAccounts")
      .length,
    1,
  );
  session.dispose();
});

test("chain changes require an explicit switch and then refresh actual state", async () => {
  const provider = new MockWallet();
  const session = new WalletSession();
  await session.connect(provider.detail());
  provider.calls = [];
  provider.chain = "0x1";
  provider.emit("chainChanged", "0x1");
  await settle();
  assert.equal(session.getSnapshot().status, "wrong-chain");
  assert.equal(session.getSnapshot().balance, null);
  assert.equal(
    provider.calls.some((call) => call.method.startsWith("wallet_")),
    false,
  );
  await session.switchChain();
  assert.equal(session.getSnapshot().status, "connected");
  session.dispose();
});

test("account removal and provider disconnect clear session and event subscriptions", async () => {
  const provider = new MockWallet();
  const session = new WalletSession();
  await session.connect(provider.detail());
  provider.accounts = [];
  provider.emit("accountsChanged", []);
  await settle();
  assert.equal(session.getSnapshot().status, "disconnected");
  provider.accounts = [A];
  await session.connect(provider.detail());
  const before = provider.calls.length;
  provider.emit("disconnect");
  assert.equal(session.getSnapshot().account, null);
  assert.equal(provider.calls.length, before);
  assert.equal(
    [...provider.handlers.values()].flatMap((set) => [...set]).length,
    0,
  );
  session.dispose();
});

test("double connect cannot issue duplicate permissions and late approval cannot revive disconnect", async () => {
  const provider = new MockWallet();
  const session = new WalletSession();
  const approval = deferred();
  provider.override = (args) =>
    args.method === "eth_requestAccounts" ? approval.promise : undefined;
  const pending = session.connect(provider.detail());
  await session.connect(provider.detail());
  assert.equal(provider.calls.length, 1);
  session.disconnect();
  approval.resolve([A]);
  await pending;
  assert.equal(session.getSnapshot().status, "disconnected");
  assert.equal(provider.calls.length, 1);
  session.dispose();
});

test("late balance results cannot revive a disconnected session or replace a newer wallet", async () => {
  const provider = new MockWallet();
  const session = new WalletSession();
  await session.connect(provider.detail());
  const balance = deferred();
  provider.override = (args) =>
    args.method === "eth_getBalance" ? balance.promise : undefined;
  const pending = session.refresh();
  await settle();
  session.disconnect();
  const next = new MockWallet();
  next.accounts = [B];
  await session.connect(next.detail("second"));
  balance.resolve("0x1");
  await pending;
  assert.equal(session.getSnapshot().account, B);
  assert.equal(session.getSnapshot().balance, "1");
  assert.equal(session.getSnapshot().busy, false);
  session.dispose();
});

test("disconnect during network switch prevents followup add-network requests", async () => {
  const provider = new MockWallet();
  const session = new WalletSession();
  provider.chain = "0x1";
  await session.connect(provider.detail());
  const switching = deferred();
  provider.override = (args) =>
    args.method === "wallet_switchEthereumChain"
      ? switching.promise
      : undefined;
  const pending = session.switchChain();
  session.disconnect();
  switching.reject({ code: 4902 });
  await pending;
  assert.equal(session.getSnapshot().status, "disconnected");
  assert.equal(
    provider.calls.some((call) => call.method === "wallet_addEthereumChain"),
    false,
  );
  session.dispose();
});

test("dispose during permission request removes subscriptions and invalidates work", async () => {
  const provider = new MockWallet();
  const session = new WalletSession();
  const approval = deferred();
  let updates = 0;
  session.subscribe(() => {
    updates++;
  });
  provider.override = (args) =>
    args.method === "eth_requestAccounts" ? approval.promise : undefined;
  const pending = session.connect(provider.detail());
  session.dispose();
  const before = updates;
  approval.resolve([A]);
  await pending;
  assert.equal(updates, before);
  assert.equal(session.getSnapshot().account, null);
  assert.equal(provider.calls.length, 1);
});
