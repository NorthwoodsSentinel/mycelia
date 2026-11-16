// Cases for src/models/state-machine.ts that tests/state-machine.test.ts does
// not reach: getTransition and afterExpiry. NOR-389 added this file to bring
// the state machine under the per-file coverage bar; the existing test file is
// left as it is (it is outside format and lint until the follow-up that
// brings existing files under them).

import { describe, expect, it } from "vitest";
import {
  afterExpiry,
  getTransition,
  InvalidTransitionError,
} from "../src/models/state-machine";

describe("getTransition", () => {
  it("returns the rule for a valid pair", () => {
    expect(getTransition("open", "claimed")).toMatchObject({
      from: "open",
      to: "claimed",
    });
  });

  it("returns null for an invalid pair", () => {
    expect(getTransition("closed", "open")).toBeNull();
  });
});

describe("afterExpiry", () => {
  it("expires an open request", () => {
    expect(afterExpiry("open")).toBe("expired");
  });

  it("refuses to expire anything that is not open", () => {
    expect(() => afterExpiry("claimed")).toThrow(InvalidTransitionError);
  });
});
