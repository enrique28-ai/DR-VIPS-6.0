import {
  feetInchesToDecimalFeet,
  feetInchesToMeters,
  metersToFeetInches,
  decimalFeetToFeetInches,
  isValidFeetInches,
  resolveImperialHeightParts,
  formatFeetInches,
  formatHeightForSystem,
  formatNumber,
  kgToLb,
  lbToKg,
  MAX_HEIGHT_M,
} from "./measurements.js";

const { describe, expect, test } = globalThis;

if (globalThis.vi) {
  describe("measurements imperial height conversion", () => {
    test("feetInchesToDecimalFeet converts 5 ft 10 in to ~5.8333 decimal feet, not 5.1", () => {
      const value = feetInchesToDecimalFeet(5, 10);
      expect(Math.abs(value - 5.8333)).toBeLessThanOrEqual(1e-4);
      expect(value).not.toBe(5.1);
    });

    test("feetInchesToMeters converts 5 ft 10 in to ~1.778 m", () => {
      expect(Math.abs(feetInchesToMeters(5, 10) - 70 * 0.0254)).toBeLessThanOrEqual(1e-4);
    });

    test("feetInchesToDecimalFeet uses base-12 ordering so 5 ft 11 in > 5 ft 9 in", () => {
      expect(feetInchesToDecimalFeet(5, 11)).toBeGreaterThan(feetInchesToDecimalFeet(5, 9));
    });

    test("decimalFeetToFeetInches converts 5.8333 decimal feet back to 5 ft 10 in", () => {
      expect(decimalFeetToFeetInches(5.8333)).toEqual({ feet: "5", inches: "10" });
    });

    test("metersToFeetInches converts 1.78 m to 5 ft 10 in", () => {
      expect(metersToFeetInches(1.78)).toEqual({ feet: "5", inches: "10" });
    });

    test("formatFeetInches renders 5 ft 10 in as '5 ft 10 in'", () => {
      expect(formatFeetInches(5, 10)).toBe("5 ft 10 in");
      expect(formatFeetInches(6, 0)).toBe("6 ft 0 in");
    });

    test("isValidFeetInches accepts whole feet and inches 0-11", () => {
      expect(isValidFeetInches(5, 10)).toBe(true);
      expect(isValidFeetInches(6, 0)).toBe(true);
      expect(isValidFeetInches(5, 11)).toBe(true);
    });

    test("isValidFeetInches rejects inches >= 12", () => {
      expect(isValidFeetInches(5, 12)).toBe(false);
      expect(isValidFeetInches(5, 13)).toBe(false);
    });

    test("isValidFeetInches rejects negative inches", () => {
      expect(isValidFeetInches(5, -1)).toBe(false);
    });

    test("isValidFeetInches rejects fractional feet", () => {
      expect(isValidFeetInches(5.5, 10)).toBe(false);
    });

    test("isValidFeetInches rejects fractional inches", () => {
      expect(isValidFeetInches(5, 10.5)).toBe(false);
    });

    test("isValidFeetInches rejects missing feet or inches", () => {
      expect(isValidFeetInches("", 10)).toBe(false);
      expect(isValidFeetInches(5, "")).toBe(false);
      expect(isValidFeetInches(undefined, 10)).toBe(false);
      expect(isValidFeetInches(5, undefined)).toBe(false);
    });

    test("isValidFeetInches rejects total height above 2.5 m by default", () => {
      expect(MAX_HEIGHT_M).toBe(2.5);
      expect(isValidFeetInches(9, 0)).toBe(false);
      expect(isValidFeetInches(9, 0, Infinity)).toBe(true);
    });

    test("formatHeightForSystem renders imperial as '5 ft 10 in', not '5.83 ft'", () => {
      const text = formatHeightForSystem({
        measurementSystem: "imperial",
        heightFeet: 5,
        heightInches: 10,
      });
      expect(text).toBe("5 ft 10 in");
      expect(text).not.toBe("5.83 ft");
    });

    test("formatHeightForSystem derives feet/inches from heightM when explicit parts missing", () => {
      expect(
        formatHeightForSystem({
          measurementSystem: "imperial",
          heightM: 1.78,
        }),
      ).toBe("5 ft 10 in");
    });

    test("formatHeightForSystem renders metric as meters", () => {
      expect(
        formatHeightForSystem({
          measurementSystem: "metric",
          heightM: 1.7,
        }),
      ).toBe("1.70 m");
    });

    test("resolveImperialHeightParts prefers explicit heightFeet/heightInches over heightM", () => {
      expect(
        resolveImperialHeightParts({
          heightFeet: 5,
          heightInches: 10,
          heightM: 1.7,
        }),
      ).toEqual({ feet: "5", inches: "10" });
    });
  });
}

if (globalThis.vi) {
  describe("measurements weight conversion precision", () => {
    test("87 lb round-trips through 4-decimal kg within 0.01 lb", () => {
      const kg = Number(formatNumber(lbToKg(87), 4));
      const lb = Number(formatNumber(kgToLb(kg), 2));
      expect(kg).toBeCloseTo(39.4625, 4);
      expect(Math.abs(lb - 87)).toBeLessThanOrEqual(0.01);
      expect(lb).not.toBe(86.99);
    });

    test("87 lb round-trips through 2-decimal kg drifts to 86.99 (documents the drift avoided by 4 decimals)", () => {
      const kg = Number(formatNumber(lbToKg(87), 2));
      const lb = Number(formatNumber(kgToLb(kg), 2));
      expect(kg).toBe(39.46);
      expect(lb).toBe(86.99);
    });
  });
}
