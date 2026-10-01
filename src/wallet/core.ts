import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatEther,
  isAddress,
  toHex,
  type EIP1193Provider,
  type Hex,
} from "viem";

export const ROBINHOOD_CHAIN = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

export type WalletProviderApi = {
  request(args: {
    method: string;
    params?: readonly unknown[] | object;
  }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener?(
    event: string,
    listener: (...args: unknown[]) => void,
  ): unknown;
};

export type WalletChoice = { id: string; name: string; icon: string | null };
export type WalletOption = WalletChoice & { provider: WalletProviderApi };
export type WalletTransaction = {
  account: string;
  chainId: number;
  to: string;
  data: string;
  value: string;
  gas?: string;
};

export async function sendCheckedTransaction(
  provider: WalletProviderApi,
  tx: WalletTransaction,
  stillCurrent = () => true,
): Promise<Hex> {
  if (
    tx.chainId !== ROBINHOOD_CHAIN.id ||
    !validAddress(tx.account) ||
    !validAddress(tx.to) ||
    !/^0x(?:[\da-f]{2}){4,32768}$/i.test(tx.data) ||
    !/^(0|[1-9]\d{0,77})$/.test(tx.value) ||
    (tx.gas !== undefined && !/^[1-9]\d{0,9}$/.test(tx.gas))
  )
    throw new Error("Invalid transaction request.");
  const uintMax = (1n << 256n) - 1n;
  if (BigInt(tx.value) > uintMax)
    throw new Error("Invalid transaction amount.");
  const accounts = await provider.request({ method: "eth_accounts" });
  if (
    !stillCurrent() ||
    !Array.isArray(accounts) ||
    typeof accounts[0] !== "string" ||
    accounts[0].toLowerCase() !== tx.account.toLowerCase()
  )
    throw new Error("Wallet account changed. Review the transaction again.");
  const chain = await provider.request({ method: "eth_chainId" });
  if (
    !stillCurrent() ||
    typeof chain !== "string" ||
    !/^0x[\da-f]+$/i.test(chain) ||
    BigInt(chain) !== BigInt(ROBINHOOD_CHAIN.id)
  )
    throw new Error("Switch to Robinhood Chain and review again.");
  let result: unknown;
  try {
    result = await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: tx.account,
          to: tx.to,
          data: tx.data,
          value: toHex(BigInt(tx.value)),
          chainId: toHex(ROBINHOOD_CHAIN.id),
          ...(tx.gas ? { gas: toHex(BigInt(tx.gas)) } : {}),
        },
      ],
    });
  } catch (error) {
    throw new Error(walletError(error));
  }
  // Retain a returned hash even if the account changes while wallet confirmation is open.
  if (typeof result !== "string" || !/^0x[\da-f]{64}$/i.test(result))
    throw new Error(
      "Wallet did not return a transaction hash. Check its activity before retrying.",
    );
  return result as Hex;
}
export type AccountSnapshot = {
  account: `0x${string}` | null;
  chainId: number | null;
  balance: string | null;
  balanceError: string | null;
};

export function validAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && isAddress(value, { strict: false });
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function errorCode(error: unknown): number | null {
  let current = error;
  for (let index = 0; current && index < 8; index++) {
    if (typeof current !== "object") return null;
    const item = current as { code?: unknown; cause?: unknown };
    if (typeof item.code === "number") return item.code;
    current = item.cause;
  }
  return null;
}

export function walletError(error: unknown): string {
  const queue: unknown[] = [error],
    seen = new Set<unknown>();
  const codes: number[] = [],
    messages: string[] = [];
  for (let i = 0; i < queue.length && i < 16; i++) {
    const value = queue[i];
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    const row = value as Record<string, unknown>;
    if (typeof row.code === "number") codes.push(row.code);
    if (typeof row.message === "string")
      messages.push(row.message.slice(0, 1500));
    for (const key of ["cause", "data", "originalError", "error"])
      if (row[key]) queue.push(row[key]);
  }
  const code =
    codes.find((value) =>
      [4001, -32002, 4100, 4900, 4901, 4200].includes(value),
    ) ?? codes[0];
  if (code === 4001) return "Request cancelled in your wallet.";
  if (code === -32002) return "A request is already open in your wallet.";
  if (code === 4100)
    return "Account access is no longer shared. Connect again.";
  if (code === 4900 || code === 4901)
    return "The wallet cannot reach this network. Check its connection and retry.";
  if (code === 4200) return "This wallet does not support that request.";
  const details = messages.join(" ").toLowerCase();
  if (/insufficient funds|insufficient balance|exceeds.*balance/.test(details))
    return "The wallet reports insufficient ETH for the transaction and its network fee. Check the ETH balance on Robinhood Chain.";
  if (
    /nonce too low|already known|replacement transaction|replacement fee/.test(
      details,
    )
  )
    return "The wallet reports a pending or conflicting transaction. Check wallet activity before trying another launch.";
  if (/user rejected|user denied|user cancelled/.test(details))
    return "Request cancelled in your wallet.";
  if (/execution reverted|revert reason/.test(details))
    return "The wallet RPC rejected this contract call. Protocol conditions may have changed; run Launch token again for a fresh check.";
  if (code === -32602)
    return "The wallet rejected the transaction parameters (RPC -32602). Reconnect the wallet on Robinhood Chain and retry.";
  if (typeof code === "number")
    return `The wallet or its RPC rejected the request (code ${code}). Check wallet activity and the Robinhood Chain connection before retrying.`;
  return "The wallet request could not be completed. Check your wallet and retry.";
}

function walletClient(provider: WalletProviderApi) {
  return createWalletClient({
    transport: custom(provider as EIP1193Provider, { retryCount: 0 }),
  });
}

function requireChainId(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("Invalid wallet network");
  return value;
}

export async function requestAccount(
  provider: WalletProviderApi,
): Promise<`0x${string}`> {
  const addresses = await walletClient(provider).requestAddresses();
  if (!validAddress(addresses[0])) throw new Error("No account shared");
  return addresses[0];
}

export async function inspectAccount(
  provider: WalletProviderApi,
): Promise<AccountSnapshot> {
  const wallet = walletClient(provider);
  const addresses = await wallet.getAddresses();
  const account = validAddress(addresses[0]) ? addresses[0] : null;
  if (!account)
    return { account: null, chainId: null, balance: null, balanceError: null };
  const client = createPublicClient({
    transport: custom(provider as EIP1193Provider, { retryCount: 0 }),
  });
  const chainId = requireChainId(await client.getChainId());
  if (chainId !== ROBINHOOD_CHAIN.id)
    return { account, chainId, balance: null, balanceError: null };
  let balance: string | null = null;
  let balanceError: string | null = null;
  try {
    const value = await client.getBalance({ address: account });
    if (value < 0n) throw new Error("Invalid balance");
    balance = formatEther(value);
  } catch {
    balanceError = "ETH balance is unavailable from this wallet.";
  }
  // Discard values from a network or account that changed while the request was pending.
  const latestChainId = requireChainId(await client.getChainId());
  const latestAddresses = await wallet.getAddresses();
  const latestAccount = validAddress(latestAddresses[0])
    ? latestAddresses[0]
    : null;
  if (!latestAccount)
    return { account: null, chainId: null, balance: null, balanceError: null };
  if (
    latestChainId !== chainId ||
    latestAccount.toLowerCase() !== account.toLowerCase()
  ) {
    return {
      account: latestAccount,
      chainId: latestChainId,
      balance: null,
      balanceError: null,
    };
  }
  return { account, chainId, balance, balanceError };
}

export async function switchToRobinhood(
  provider: WalletProviderApi,
  stillCurrent = () => true,
): Promise<void> {
  const client = walletClient(provider);
  try {
    await client.switchChain({ id: ROBINHOOD_CHAIN.id });
  } catch (error) {
    if (!stillCurrent()) return;
    if (errorCode(error) !== 4902) throw error;
    await client.addChain({ chain: ROBINHOOD_CHAIN });
    if (!stillCurrent()) return;
    await client.switchChain({ id: ROBINHOOD_CHAIN.id });
  }
  if (!stillCurrent()) return;
  if ((await client.getChainId()) !== ROBINHOOD_CHAIN.id)
    throw new Error("The selected network did not change");
}

export function displayBalance(balance: string | null): string {
  if (balance === null) return "Unavailable";
  const amount = Number(balance);
  if (!Number.isFinite(amount) || amount < 0) return "Unavailable";
  if (amount > 0 && amount < 0.000001) return "< 0.000001 ETH";
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH`;
}
