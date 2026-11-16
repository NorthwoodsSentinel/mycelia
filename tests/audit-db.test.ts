// Unit tests for src/lib/audit.ts and src/lib/db.ts: the audit-log insert and
// the paginated D1 query helpers. NOR-389 brought both files under the
// per-file coverage bar with this file. D1 is a recording stand-in; nothing
// here touches Cloudflare.

import { describe, expect, it, vi } from "vitest";
import { writeAuditLog } from "../src/lib/audit";
import { paginatedQuery, parsePagination } from "../src/lib/db";

interface Prepared {
  sql: string;
  args: unknown[];
}

function recordingDb(rows: unknown[], count: { count: number } | null) {
  const prepared: Prepared[] = [];
  const db: Partial<D1Database> = {
    prepare: vi.fn((sql: string) => {
      const entry: Prepared = { sql, args: [] };
      prepared.push(entry);
      const statement = {
        bind: (...args: unknown[]) => {
          entry.args = args;
          return statement;
        },
        run: async () => ({ success: true }),
        all: async () => ({ results: rows }),
        first: async () => count,
      };
      return statement as unknown as D1PreparedStatement; // a test stand-in for the three methods these helpers call; D1PreparedStatement has no constructor to build a real one outside the Workers runtime
    }),
  };
  return { db: db as D1Database, prepared };
}

const kv = {} as KVNamespace; // writeAuditLog takes KV but does not use it

describe("writeAuditLog", () => {
  it("inserts the entry with its detail serialized as JSON", async () => {
    const { db, prepared } = recordingDb([], null);
    await writeAuditLog(db, kv, {
      event_type: "agent.deactivated",
      actor_id: "admin",
      target_type: "agent",
      target_id: "agent-1",
      detail: { reason: "test" },
    });
    expect(prepared).toHaveLength(1);
    expect(prepared[0].sql).toContain("INSERT INTO audit_log");
    expect(prepared[0].args.slice(0, 5)).toEqual([
      "agent.deactivated",
      "admin",
      "agent",
      "agent-1",
      '{"reason":"test"}',
    ]);
    expect(typeof prepared[0].args[5]).toBe("string");
  });

  it("stores a null detail when none is given", async () => {
    const { db, prepared } = recordingDb([], null);
    await writeAuditLog(db, kv, {
      event_type: "agent.deactivated",
      actor_id: null,
      target_type: "agent",
      target_id: "agent-1",
    });
    expect(prepared[0].args[4]).toBeNull();
  });
});

describe("paginatedQuery", () => {
  it("appends LIMIT/OFFSET, binds the page window and reports has_more", async () => {
    const { db, prepared } = recordingDb([{ id: "a" }], { count: 45 });
    const page = await paginatedQuery<{ id: string }>(
      db,
      "SELECT id FROM t WHERE x = ?",
      "SELECT COUNT(*) AS count FROM t WHERE x = ?",
      ["x"],
      { page: 2, limit: 20 },
    );
    expect(prepared[0].sql).toBe(
      "SELECT id FROM t WHERE x = ? LIMIT ? OFFSET ?",
    );
    expect(prepared[0].args).toEqual(["x", 20, 20]);
    expect(prepared[1].args).toEqual(["x"]);
    expect(page).toEqual({
      items: [{ id: "a" }],
      pagination: { page: 2, limit: 20, total: 45, has_more: true },
    });
  });

  it("treats a missing count row as zero", async () => {
    const { db } = recordingDb([], null);
    const page = await paginatedQuery(db, "SELECT 1", "SELECT 0", [], {
      page: 1,
      limit: 10,
    });
    expect(page.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      has_more: false,
    });
  });
});

describe("parsePagination", () => {
  it("defaults to page 1, limit 20", () => {
    expect(parsePagination({})).toEqual({
      page: 1,
      limit: 20,
      sort: undefined,
    });
  });

  it("clamps page to at least 1 and limit to 1..50, and keeps sort", () => {
    expect(parsePagination({ page: "0", limit: "500", sort: "new" })).toEqual({
      page: 1,
      limit: 50,
      sort: "new",
    });
    expect(parsePagination({ page: "3", limit: "0" })).toEqual({
      page: 3,
      limit: 1,
      sort: undefined,
    });
  });
});
