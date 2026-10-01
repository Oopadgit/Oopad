import {
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import type { PairCheck } from "../src/domain/types.js";
import { address, ETH, limitedJson, object } from "./source.js";

export const RPC_URL =
  process.env.OOPAD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
export const FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" as const;
const FACTORY_HASH =
  "0x89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84";
const abi = parseAbi([
  "function approvedPairTokens(address pairToken) view returns (bool)",
  "function pairTokenEconomics(address pairToken) view returns (uint256 phantomQuote, uint256 graduationThreshold, uint8 decimals)",
  "struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }",
  "function launchConfigCount() view returns (uint256)",
  "function getLaunchConfig(uint256 id) view returns (LaunchConfig)",
  "function decimals() view returns (uint8)",
]);
const checks = new Map<string, { result: PairCheck; expires: number }>();
const pending = new Map<string, Promise<PairCheck>>();
let calls: number[] = [];
async function rpc(
  method: string,
  params: unknown[],
  signal: AbortSignal,
): Promise<unknown> {
  calls = calls.filter((time) => time > Date.now() - 60_000);
  if (calls.length >= 48)
    throw new Error("Pair checks are cooling down. Try again in one minute.");
  calls.push(Date.now());
  const response = await fetch(RPC_URL, {
    method: "POST",
    redirect: "error",
    signal,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok)
    throw new Error(
      "The public RPC is unavailable. Pair approval is still unknown.",
    );
  const body = object(await limitedJson(response, 300_000));
  if (
    body.jsonrpc !== "2.0" ||
    body.id !== 1 ||
    body.error ||
    !("result" in body)
  )
    throw new Error("The public RPC could not complete this pair check.");
  return body.result;
}
function hex(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x[\da-f]+$/i.test(value))
    throw new Error("The public RPC returned an invalid result.");
  return value as Hex;
}
async function read(
  functionName:
    | "approvedPairTokens"
    | "pairTokenEconomics"
    | "launchConfigCount"
    | "getLaunchConfig"
    | "decimals",
  args: readonly unknown[],
  block: Hex,
  signal: AbortSignal,
  to: Address = FACTORY,
): Promise<unknown> {
  const data = encodeFunctionData({ abi, functionName, args } as Parameters<
    typeof encodeFunctionData
  >[0]);
  const result = await rpc("eth_call", [{ to, data }, block], signal);
  return decodeFunctionResult({ abi, functionName, data: hex(result) });
}
export function unknownPair(contract: string, error: string): PairCheck {
  return {
    address: contract,
    approval: "unknown",
    status: "unavailable",
    checkedAt: null,
    blockNumber: null,
    economics: null,
    error,
  };
}
export async function checkPair(input: string): Promise<PairCheck> {
  const contract = address(input, true);
  if (!contract)
    return unknownPair(
      input.slice(0, 100),
      "Enter a valid 20-byte quote asset contract.",
    );
  const cached = checks.get(contract);
  if (cached && cached.expires > Date.now())
    return cached.result.status === "live"
      ? { ...cached.result, status: "cached" }
      : cached.result;
  if (pending.has(contract)) return pending.get(contract)!;
  const task = (async (): Promise<PairCheck> => {
    let result: PairCheck;
    try {
      const signal = AbortSignal.timeout(10_000);
      const [chain, blockResult, codeResult] = await Promise.all([
        rpc("eth_chainId", [], signal),
        rpc("eth_blockNumber", [], signal),
        rpc("eth_getCode", [FACTORY, "latest"], signal),
      ]);
      if (BigInt(hex(chain)) !== 4663n)
        throw new Error("The public RPC returned a different network.");
      if (keccak256(hex(codeResult)) !== FACTORY_HASH)
        throw new Error(
          "The factory code has changed. Pair verification needs a new protocol review.",
        );
      const block = hex(blockResult);
      let approved = true;
      let economics: PairCheck["economics"];
      if (contract === ETH.address) {
        const count = (await read(
          "launchConfigCount",
          [],
          block,
          signal,
        )) as bigint;
        if (count < 1n || count > 32n)
          throw new Error(
            "The launch configuration list needs a new protocol review.",
          );
        const config = (await read("getLaunchConfig", [0n], block, signal)) as {
          phantomQuote: bigint;
          graduationThreshold: bigint;
          enabled: boolean;
        };
        approved = config.enabled;
        economics = {
          phantomQuote: config.phantomQuote.toString(),
          graduationThreshold: config.graduationThreshold.toString(),
          decimals: 18,
        };
      } else {
        approved =
          (await read("approvedPairTokens", [contract], block, signal)) ===
          true;
        economics = null;
        if (approved) {
          const [terms, tokenDecimals] = await Promise.all([
            read("pairTokenEconomics", [contract], block, signal),
            read("decimals", [], block, signal, contract as Address),
          ]);
          const [phantomQuote, graduationThreshold, pairDecimals] =
            terms as readonly [bigint, bigint, number];
          if (tokenDecimals !== pairDecimals)
            throw new Error(
              "The quote asset decimals no longer match its launch terms.",
            );
          economics = {
            phantomQuote: phantomQuote.toString(),
            graduationThreshold: graduationThreshold.toString(),
            decimals: pairDecimals,
          };
        }
      }
      if (
        approved &&
        (!economics ||
          BigInt(economics.phantomQuote) <= 0n ||
          BigInt(economics.graduationThreshold) <= 0n ||
          economics.decimals < 0 ||
          economics.decimals > 36)
      )
        throw new Error("The quote asset has unusable launch economics.");
      result = {
        address: contract,
        approval: approved ? "approved" : "rejected",
        status: "live",
        checkedAt: new Date().toISOString(),
        blockNumber: BigInt(block).toString(),
        economics: approved ? economics : null,
        error: approved
          ? null
          : "This quote asset is not currently enabled for the checked launch configuration.",
      };
    } catch (error) {
      const message =
        error instanceof Error && /^(The |Pair checks )/.test(error.message)
          ? error.message
          : "The public RPC is unavailable. Pair approval is still unknown.";
      result = unknownPair(contract, message);
    }
    if (checks.size >= 64) checks.delete(checks.keys().next().value!);
    checks.set(contract, {
      result,
      expires: Date.now() + (result.status === "live" ? 30_000 : 60_000),
    });
    return result;
  })();
  pending.set(contract, task);
  try {
    return await task;
  } finally {
    pending.delete(contract);
  }
}
