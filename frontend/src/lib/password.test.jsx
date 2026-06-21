import { describe, expect, test } from "vitest";
import { getScore, isStrongPassword, passwordRules } from "./password.js";

describe("password helpers", () => {
  test("scores password strength by fulfilled rules", () => {
    expect(getScore("")).toBe(0);
    expect(getScore("abcdef")).toBe(1);
    expect(getScore("abcdefA")).toBe(2);
    expect(getScore("abcdefA1")).toBe(3);
    expect(getScore("abcdefA1!")).toBe(4);
  });

  test("reports individual password rules", () => {
    expect(passwordRules("")).toEqual({
      minLen: false,
      hasCase: false,
      hasNumber: false,
      hasSpecial: false,
    });

    expect(passwordRules("Abcdef1!")).toEqual({
      minLen: true,
      hasCase: true,
      hasNumber: true,
      hasSpecial: true,
    });
  });

  test("requires every password rule for a strong password", () => {
    expect(isStrongPassword("Abcdef1!")).toBe(true);
    expect(isStrongPassword("abcdef1!")).toBe(false);
    expect(isStrongPassword("Abcdef!")).toBe(false);
    expect(isStrongPassword("Abcdef1")).toBe(false);
  });
});
