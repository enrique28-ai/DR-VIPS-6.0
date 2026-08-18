import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeDynamicAge,
  isCurrentMinorPatient,
  minorQueryByBirthDateOrLegacy,
} from "../../helpers/patienthelpers.js";

const localDate = (year, month, day, hour = 12) =>
  new Date(year, month - 1, day, hour, 0, 0, 0);

const matchesBirthDateBranch = (birthDate, query) => {
  const range = query.$or[0].birthDate;
  return birthDate > range.$gt && birthDate <= range.$lte;
};

test("legacy records use stored age only when birthDate is absent", () => {
  const referenceDate = localDate(2026, 8, 16, 10);

  assert.equal(isCurrentMinorPatient({ age: 17 }, referenceDate), true);
  assert.equal(isCurrentMinorPatient({ age: 0 }, referenceDate), true);
  assert.equal(isCurrentMinorPatient({ age: 17.5 }, referenceDate), true);
  assert.equal(isCurrentMinorPatient({ age: 18 }, referenceDate), false);
  assert.equal(isCurrentMinorPatient({ birthDate: null, age: 17 }, referenceDate), true);
  assert.equal(isCurrentMinorPatient({ birthDate: null, age: 18 }, referenceDate), false);
});

test("legacy age fallback rejects missing, empty, negative, and malformed values", () => {
  const referenceDate = localDate(2026, 8, 16, 10);
  const invalidLegacyAges = [
    null,
    undefined,
    "",
    -1,
    false,
    "17",
    "not-a-number",
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ];

  for (const age of invalidLegacyAges) {
    assert.equal(computeDynamicAge({ age }, referenceDate), undefined);
    assert.equal(isCurrentMinorPatient({ age }, referenceDate), false);
    assert.equal(computeDynamicAge({ birthDate: null, age }, referenceDate), undefined);
    assert.equal(isCurrentMinorPatient({ birthDate: null, age }, referenceDate), false);
  }
});

test("minor query requires a non-negative numeric legacy age", () => {
  const query = minorQueryByBirthDateOrLegacy(localDate(2026, 8, 16, 10));
  const legacyAgeRange = { $gte: 0, $lt: 18 };

  assert.deepEqual(query.$or[1], {
    birthDate: { $exists: false },
    age: legacyAgeRange,
  });
  assert.deepEqual(query.$or[2], {
    birthDate: null,
    age: legacyAgeRange,
  });
});

test("current-minor authorization derives exact 17 and 18 boundaries from birthDate", () => {
  const referenceDate = localDate(2026, 8, 16, 10);

  assert.equal(
    computeDynamicAge(
      { birthDate: localDate(2008, 8, 16), age: 17 },
      referenceDate
    ),
    18
  );
  assert.equal(
    computeDynamicAge(
      { birthDate: localDate(2008, 8, 17), age: 18 },
      referenceDate
    ),
    17
  );
  assert.equal(
    isCurrentMinorPatient(
      { birthDate: localDate(2008, 8, 16), age: 17 },
      referenceDate
    ),
    false
  );
  assert.equal(
    isCurrentMinorPatient(
      { birthDate: localDate(2008, 8, 17), age: 18 },
      referenceDate
    ),
    true
  );
});

test("invalid and future birth dates fail closed instead of trusting legacy age", () => {
  const referenceDate = localDate(2026, 8, 16, 10);
  const invalidPatient = { birthDate: "invalid-date", age: 17 };
  const futurePatient = { birthDate: localDate(2026, 8, 17), age: 17 };

  assert.equal(computeDynamicAge(invalidPatient, referenceDate), undefined);
  assert.equal(isCurrentMinorPatient(invalidPatient, referenceDate), false);
  assert.equal(computeDynamicAge(futurePatient, referenceDate), undefined);
  assert.equal(isCurrentMinorPatient(futurePatient, referenceDate), false);
  assert.equal(
    computeDynamicAge(
      {
        ...futurePatient,
        isDeceased: true,
        dateOfDeath: localDate(2027, 8, 17),
      },
      referenceDate
    ),
    undefined
  );
  assert.equal(
    isCurrentMinorPatient({ birthDate: localDate(2026, 8, 16, 23) }, referenceDate),
    true
  );
});

test("minor birth-date query excludes the entire 18th birthday and future dates", () => {
  const referenceDate = localDate(2026, 8, 16, 10);
  const query = minorQueryByBirthDateOrLegacy(referenceDate);
  const range = query.$or[0].birthDate;
  const expected = new Date(referenceDate);
  expected.setHours(23, 59, 59, 999);
  expected.setFullYear(expected.getFullYear() - 18);
  const expectedLatestBirthDate = new Date(referenceDate);
  expectedLatestBirthDate.setHours(23, 59, 59, 999);

  assert.equal(range.$gt.getTime(), expected.getTime());
  assert.equal(range.$lte.getTime(), expectedLatestBirthDate.getTime());
  assert.equal(matchesBirthDateBranch(localDate(2026, 8, 17), query), false);
});

test("query and object predicates agree at 17, 18, and leap-day boundaries", () => {
  const referenceDate = localDate(2028, 2, 29, 10);
  const justUnder18 = localDate(2010, 3, 1);
  const exactly18 = localDate(2010, 2, 28);
  const query = minorQueryByBirthDateOrLegacy(referenceDate);
  const cutoff = query.$or[0].birthDate.$gt;

  assert.equal(isCurrentMinorPatient({ birthDate: justUnder18 }, referenceDate), true);
  assert.equal(matchesBirthDateBranch(justUnder18, query), true);
  assert.equal(isCurrentMinorPatient({ birthDate: exactly18 }, referenceDate), false);
  assert.equal(matchesBirthDateBranch(exactly18, query), false);
  assert.equal(cutoff.getTime(), new Date(2010, 1, 28, 23, 59, 59, 999).getTime());
});

test("deceased age remains frozen for history but cannot grant current guardian authority", () => {
  const patient = {
    birthDate: localDate(2010, 3, 1),
    dateOfDeath: localDate(2020, 3, 1),
    isDeceased: true,
    age: 17,
  };

  assert.equal(computeDynamicAge(patient, localDate(2028, 2, 29)), 10);
  assert.equal(isCurrentMinorPatient(patient, localDate(2028, 2, 29)), false);
  assert.deepEqual(
    minorQueryByBirthDateOrLegacy(localDate(2028, 2, 29)).isDeceased,
    { $ne: true }
  );
});
