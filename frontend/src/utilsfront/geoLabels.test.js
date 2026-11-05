import { getDialCodeByCountryIso } from "./geoLabels.js";

const { describe, expect, test } = globalThis;

// Root npm test uses node --test and discovers frontend *.test.js files.
if (globalThis.vi) {
  describe("getDialCodeByCountryIso", () => {
    test("returns the United Kingdom dial code", () => {
      expect(getDialCodeByCountryIso("GB")).toBe("+44");
    });

    test("returns the Mexico dial code", () => {
      expect(getDialCodeByCountryIso("MX")).toBe("+52");
    });

    test("accepts lowercase ISO input", () => {
      expect(getDialCodeByCountryIso("gb")).toBe("+44");
    });

    test("returns blank for blank ISO input", () => {
      expect(getDialCodeByCountryIso("")).toBe("");
    });
  });
}
