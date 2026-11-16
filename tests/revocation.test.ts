// Unit tests for src/lib/revocation.ts: the KV kill-switch. NOR-389 brought
// src/lib/revocation.ts under the per-file coverage bar with this file. The KV
// namespace is an in-memory stand-in; nothing here touches Cloudflare.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkRevoked,
  revoke,
  unrevoke,
  type RevocationEntry,
} from "../src/lib/revocation";

function memoryKv() {
  const store = new Map<string, string>();
  const kv = {
    get: vi.fn(async (key: string) => {
      const raw = store.get(key);
      return raw === undefined ? null : (JSON.parse(raw) as unknown);
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
  // KVNamespace.get is overloaded per value type; this stand-in implements the
  // one overload revocation.ts calls (`get(key, "json")`), which TypeScript
  // cannot relate to the overload set without going through unknown.
  return { kv: kv as unknown as KVNamespace, store };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("revoke", () => {
  it("stores a forever entry under revoke:<id> when no expiry is given", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
    const { kv, store } = memoryKv();
    const entry = await revoke(kv, "agent-1", "test", "admin");
    const expected: RevocationEntry = {
      agent_id: "agent-1",
      reason: "test",
      revoked_by: "admin",
      revoked_at: "2026-01-02T03:04:05.000Z",
      revoke_until: null,
    };
    expect(entry).toEqual(expected);
    expect(JSON.parse(store.get("revoke:agent-1") ?? "null")).toEqual(expected);
  });

  it("keeps a given expiry", async () => {
    const { kv } = memoryKv();
    const entry = await revoke(
      kv,
      "agent-1",
      "test",
      "agent-1",
      "2999-01-01T00:00:00.000Z",
    );
    expect(entry.revoke_until).toBe("2999-01-01T00:00:00.000Z");
  });
});

describe("checkRevoked", () => {
  it("returns null for an agent with no entry", async () => {
    const { kv } = memoryKv();
    await expect(checkRevoked(kv, "nobody")).resolves.toBeNull();
  });

  it("returns a forever entry", async () => {
    const { kv } = memoryKv();
    await revoke(kv, "agent-1", "test", "admin");
    await expect(checkRevoked(kv, "agent-1")).resolves.toMatchObject({
      agent_id: "agent-1",
      revoke_until: null,
    });
  });

  it("returns an entry whose expiry is still ahead", async () => {
    const { kv } = memoryKv();
    await revoke(kv, "agent-1", "test", "admin", "2999-01-01T00:00:00.000Z");
    await expect(checkRevoked(kv, "agent-1")).resolves.not.toBeNull();
  });

  it("clears and ignores an entry whose expiry has passed", async () => {
    const { kv, store } = memoryKv();
    await revoke(kv, "agent-1", "test", "admin", "2000-01-01T00:00:00.000Z");
    await expect(checkRevoked(kv, "agent-1")).resolves.toBeNull();
    expect(store.has("revoke:agent-1")).toBe(false);
  });

  it("treats an unparseable expiry as still in effect (fails closed)", async () => {
    const { kv } = memoryKv();
    await revoke(kv, "agent-1", "test", "admin", "not-a-date");
    await expect(checkRevoked(kv, "agent-1")).resolves.toMatchObject({
      revoke_until: "not-a-date",
    });
  });
});

describe("unrevoke", () => {
  it("deletes the entry and reports true", async () => {
    const { kv, store } = memoryKv();
    await revoke(kv, "agent-1", "test", "admin");
    await expect(unrevoke(kv, "agent-1")).resolves.toBe(true);
    expect(store.has("revoke:agent-1")).toBe(false);
  });
});
