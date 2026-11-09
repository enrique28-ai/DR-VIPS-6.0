import { describe, expect, test } from "vitest";
import { notificationsEnabledForEnvironment } from "./features.js";

describe("frontend feature configuration", () => {
  test("disables notifications in production", () => {
    expect(notificationsEnabledForEnvironment(true)).toBe(false);
  });

  test("enables notifications outside production", () => {
    expect(notificationsEnabledForEnvironment(false)).toBe(true);
  });
});
