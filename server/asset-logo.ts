import { createHash } from "node:crypto";
import type { Asset, SourceEnvelope } from "../src/domain/types.js";
import { address, getAssets, imageUrl } from "./source.js";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
const CACHE_TTL = 60 * 60_000;
const STALE_TTL = 24 * CACHE_TTL;
type RasterType = "image/png" | "image/jpeg" | "image/webp";
export type AssetLogoResult =
  | {
      status: 200;
      body: Buffer;
      contentType: RasterType;
      etag: string;
      cacheControl: string;
    }
  | {
      status: 400 | 404 | 429 | 502;
      error: string;
      cacheControl: "no-store";
      retryAfter?: number;
    };
type Dependencies = {
  getAssets: () => Promise<SourceEnvelope<Asset>>;
  fetch: typeof fetch;
  now?: () => number;
};
type CachedLogo = {
  result: Extract<AssetLogoResult, { status: 200 }>;
  expires: number;
  staleUntil: number;
};

export function rasterContentType(bytes: Uint8Array): RasterType | null {
  if (bytes.length < 12) return null;
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) {
    if (
      bytes.length < 33 ||
      Buffer.from(bytes.subarray(12, 16)).toString("ascii") !== "IHDR"
    )
      return null;
    const header = Buffer.from(bytes.subarray(16, 24));
    const width = header.readUInt32BE(0),
      height = header.readUInt32BE(4);
    return width > 0 &&
      height > 0 &&
      width <= 8192 &&
      height <= 8192 &&
      width * height <= 16_777_216
      ? "image/png"
      : null;
  }
  if (
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  )
    return "image/jpeg";
  const header = Buffer.from(bytes.subarray(0, 12));
  if (
    header.toString("ascii", 0, 4) === "RIFF" &&
    header.toString("ascii", 8, 12) === "WEBP" &&
    header.readUInt32LE(4) + 8 === bytes.length
  )
    return "image/webp";
  return null;
}

async function readImage(response: Response): Promise<Buffer> {
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_IMAGE_BYTES || !response.body) {
    await response.body?.cancel();
    throw new Error("Unsupported source image.");
  }
  const reader = response.body.getReader();
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("The source image is too large.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}

export function createAssetLogoService(dependencies: Dependencies) {
  const now = dependencies.now || Date.now;
  const cache = new Map<string, CachedLogo>();
  const pending = new Map<string, Promise<AssetLogoResult>>();
  const failures = new Map<string, number>();
  let cacheBytes = 0;
  let requests: number[] = [];
  const fail = (
    status: 400 | 404 | 429 | 502,
    error: string,
    retryAfter?: number,
  ): AssetLogoResult => ({
    status,
    error,
    cacheControl: "no-store",
    ...(retryAfter ? { retryAfter } : {}),
  });

  return async function getAssetLogo(input: unknown): Promise<AssetLogoResult> {
    const contract = address(input, true);
    if (!contract) return fail(400, "Provide one valid quote asset address.");
    let asset: Asset | undefined;
    try {
      asset = (await dependencies.getAssets()).items.find(
        (item) => item.address.toLowerCase() === contract,
      );
    } catch {
      return fail(502, "The asset registry is unavailable.");
    }
    const url = imageUrl(asset?.logo);
    if (!asset || !url)
      return fail(404, "No source artwork is available for this quote asset.");
    const key = `${contract}|${url}`;
    const previous = cache.get(key);
    if (previous && previous.expires > now()) return previous.result;
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    if ((failures.get(key) || 0) > now())
      return fail(502, "The source artwork is temporarily unavailable.");
    requests = requests.filter((at) => at > now() - 60_000);
    if (requests.length >= 60 || pending.size >= 12)
      return fail(
        429,
        "The artwork source is cooling down. Try again shortly.",
        60,
      );
    requests.push(now());

    const task = (async (): Promise<AssetLogoResult> => {
      try {
        // URLs come only from exact registry identities; redirects cannot widen the host allowlist.
        const response = await dependencies.fetch(url, {
          redirect: "error",
          signal: AbortSignal.timeout(8000),
          headers: { accept: "image/png,image/jpeg,image/webp" },
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error("The source artwork is unavailable.");
        }
        const body = await readImage(response);
        const contentType = rasterContentType(body);
        const declaredType = response.headers
          .get("content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase();
        if (!contentType || declaredType !== contentType)
          throw new Error("The source did not return supported image bytes.");
        const result: Extract<AssetLogoResult, { status: 200 }> = {
          status: 200,
          body,
          contentType,
          etag: `"${createHash("sha256").update(body).digest("hex")}"`,
          cacheControl:
            "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
        };
        if (previous) {
          cacheBytes -= previous.result.body.length;
          cache.delete(key);
        }
        cache.set(key, {
          result,
          expires: now() + CACHE_TTL,
          staleUntil: now() + STALE_TTL,
        });
        cacheBytes += body.length;
        while (cache.size > 128 || cacheBytes > MAX_CACHE_BYTES) {
          const oldest = cache.keys().next().value;
          if (oldest === undefined) break;
          cacheBytes -= cache.get(oldest)!.result.body.length;
          cache.delete(oldest);
        }
        failures.delete(key);
        return result;
      } catch {
        if (previous && previous.staleUntil > now()) {
          const result = {
            ...previous.result,
            cacheControl: "public, max-age=60, s-maxage=60",
          };
          cache.set(key, {
            ...previous,
            result,
            expires: Math.min(now() + 60_000, previous.staleUntil),
          });
          return result;
        }
        failures.set(key, now() + 60_000);
        while (failures.size > 256)
          failures.delete(failures.keys().next().value!);
        return fail(502, "The source artwork is temporarily unavailable.");
      }
    })();
    pending.set(key, task);
    try {
      return await task;
    } finally {
      pending.delete(key);
    }
  };
}

export const getAssetLogo = createAssetLogoService({
  getAssets,
  fetch: (url, options) => fetch(url, options),
});
