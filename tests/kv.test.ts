// Unit tests for src/lib/kv.ts: the KV read-through cache and its
// invalidation helpers. NOR-389 brought src/lib/kv.ts under the per-file
// coverage bar with this file; the KV namespace is a vi.fn() stand-in, so
// nothing here touches Cloudflare.

import { describe, expect, it, vi } from "vitest";
import {
  kvCacheGet,
  kvInvalidate,
  kvInvalidateCapabilityCache,
} from "../src/lib/kv";

function fakeKv(stored: unknown) {
  const kv = {
    get: vi.fn(async () => stored),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  // KVNamespace.get is overloaded per value type; this stand-in implements the
  // one overload kv.ts calls (`get(key, "json")`), which TypeScript cannot
  // relate to the overload set without going through unknown.
  return kv as unknown as KVNamespace;
}

describe("kvCacheGet", () => {
  it("returns the cached value without computing", async () => {
    const kv = fakeKv({ hit: true });
    const compute = vi.fn(async () => ({ hit: false }));
    await expect(kvCacheGet(kv, "k", 60, compute)).resolves.toEqual({
      hit: true,
    });
    expect(compute).not.toHaveBeenCalled();
    expect(kv.get).toHaveBeenCalledWith("k", "json");
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("computes, stores with the TTL and returns on a miss", async () => {
    const kv = fakeKv(null);
    const compute = vi.fn(async () => [1, 2]);
    await expect(kvCacheGet(kv, "k", 30, compute)).resolves.toEqual([1, 2]);
    expect(compute).toHaveBeenCalledOnce();
    expect(kv.put).toHaveBeenCalledWith("k", "[1,2]", { expirationTtl: 30 });
  });
});

describe("invalidation", () => {
  it("kvInvalidate deletes the one key", async () => {
    const kv = fakeKv(null);
    await kvInvalidate(kv, "feed:latest");
    expect(kv.delete).toHaveBeenCalledWith("feed:latest");
  });

  it("kvInvalidateCapabilityCache deletes match:<tag> for every tag", async () => {
    const kv = fakeKv(null);
    await kvInvalidateCapabilityCache(kv, ["code", "review"]);
    expect(kv.delete).toHaveBeenCalledTimes(2);
    expect(kv.delete).toHaveBeenCalledWith("match:code");
    expect(kv.delete).toHaveBeenCalledWith("match:review");
  });
});
