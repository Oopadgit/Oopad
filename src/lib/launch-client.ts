import { encodeFunctionData } from "viem";

import {
  decimalUint,
  PONS_CHAIN_ID,
  PONS_ROUTER,
  ponsReadAbi,
  type PreparedLaunch,
} from "../domain/pons";
export { parsePreparedLaunch as checkedPreparation } from "../domain/pons";

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function launchApi<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const deadline = AbortSignal.timeout(45000);
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  });
  const value = await response.json().catch(() => null);

  if (!response.ok)
    throw new ApiError(
      typeof value?.error === "string"
        ? value.error
        : "The request could not be completed.",
      typeof value?.code === "string" ? value.code : "UNAVAILABLE",
      response.status,
    );
  if (!value || typeof value !== "object")
    throw new Error("The server returned an invalid response.");
  return value as T;
}
export function approvalTransaction(prepared: PreparedLaunch) {
  const approval = prepared.approval;
  if (
    prepared.simulation !== "approval-required" ||
    !approval ||
    approval.spender.toLowerCase() !== PONS_ROUTER.toLowerCase() ||
    !decimalUint(approval.amount) ||
    BigInt(approval.amount) <= 0n
  )
    throw new Error("No exact stock allowance is requested.");
  const data = encodeFunctionData({
    abi: ponsReadAbi,
    functionName: "approve",
    args: [PONS_ROUTER, BigInt(approval.amount)],
  });
  return {
    chainId: PONS_CHAIN_ID,
    account: prepared.policy.account!,
    to: approval.token,
    data,
    value: "0",
  };
}
