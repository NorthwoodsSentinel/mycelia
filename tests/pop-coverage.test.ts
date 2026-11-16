// Two hard-deny cases of decidePop (src/lib/pop.ts) that tests/pop.test.ts
// does not reach: a stored pop_jwk that is JSON but not an OKP key, and a
// Delegation header that is not base64url JSON. NOR-389 added this file to
// bring src/lib/pop.ts under the per-file coverage bar; the existing test file
// is left as it is (it is outside format and lint until the follow-up that
// brings existing files under them). No product code changed.

import { describe, expect, it } from "vitest";
import { generateDpopKeypair } from "../src/lib/dpop";
import { decidePop } from "../src/lib/pop";

// decidePop only reaches the database after a proof verifies; neither case
// below gets that far, so a stand-in with no methods is enough.
const db = {} as D1Database;
const URL_ = "https://node.example/v1/requests/x/claims";

describe("decidePop hard denies", () => {
  it("refuses a stored pop_jwk that parses but is not an OKP key", async () => {
    const kp = await generateDpopKeypair();
    const r = await decidePop({
      db,
      agent: {
        id: "a",
        pop_jkt: kp.jkt,
        pop_jwk: JSON.stringify({ kty: "EC" }),
        pop_mode: "shadow",
      },
      ceiling: undefined,
      bearer: "mycelia_live_" + "c".repeat(64),
      method: "POST",
      url: URL_,
      dpopHeader: undefined,
      delegationHeader: undefined,
    });
    expect(r).toMatchObject({ outcome: "denied", code: "POP_STATE_CORRUPT" });
  });

  it("refuses a Delegation header that is not base64url JSON", async () => {
    const kp = await generateDpopKeypair();
    const r = await decidePop({
      db,
      agent: {
        id: "a",
        pop_jkt: kp.jkt,
        pop_jwk: JSON.stringify(kp.publicJwk),
        pop_mode: "shadow",
      },
      ceiling: undefined,
      bearer: null,
      method: "POST",
      url: URL_,
      dpopHeader: undefined,
      delegationHeader: "%%%not-base64%%%",
    });
    expect(r).toMatchObject({ outcome: "denied", code: "DELEG_MALFORMED" });
  });
});
