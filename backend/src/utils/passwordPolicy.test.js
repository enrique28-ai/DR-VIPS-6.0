import assert from "node:assert/strict";
import { test } from "node:test";

import { isStrongPassword } from "./passwordPolicy.js";

test("isStrongPassword accepts the existing frontend policy", () => {
  assert.equal(isStrongPassword("Abcd1!"), true);
});

test("isStrongPassword evaluates the original password without trimming", () => {
  assert.equal(isStrongPassword(" Ab1! "), true);
});

test("isStrongPassword rejects passwords shorter than six characters", () => {
  assert.equal(isStrongPassword("Aa1!"), false);
});

test("isStrongPassword rejects a password without an ASCII lowercase letter", () => {
  assert.equal(isStrongPassword("ABCD1!"), false);
});

test("isStrongPassword rejects a password without an ASCII uppercase letter", () => {
  assert.equal(isStrongPassword("abcd1!"), false);
});

test("isStrongPassword rejects a password without a digit", () => {
  assert.equal(isStrongPassword("Abcde!"), false);
});

test("isStrongPassword rejects a password without a non-alphanumeric character", () => {
  assert.equal(isStrongPassword("Abcd12"), false);
});

for (const value of [undefined, null, 0, true, {}, []]) {
  test(`isStrongPassword rejects non-string value ${String(value)}`, () => {
    assert.equal(isStrongPassword(value), false);
  });
}
