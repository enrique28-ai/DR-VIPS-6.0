import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";

import { PATIENT_IDENTITY_INDEXES } from "./patientIdentityIndexes.js";
import Patient from "../models/Patient.js";

const containsOperator = (value, operator) => {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    key === operator || containsOperator(child, operator));
};

test("canonical Patient identity indexes are named unique non-empty string indexes", () => {
  assert.equal(PATIENT_IDENTITY_INDEXES.length, 2);
  assert.deepEqual(PATIENT_IDENTITY_INDEXES.map(({ name, key }) => ({ name, key })), [
    { name: "uniq_patients_email_nonempty", key: { email: 1 } },
    { name: "uniq_patients_phoneDigits_nonempty", key: { phoneDigits: 1 } },
  ]);

  for (const specification of PATIENT_IDENTITY_INDEXES) {
    const field = Object.keys(specification.key)[0];
    assert.deepEqual(Object.keys(specification).sort(), [
      "key",
      "name",
      "partialFilterExpression",
      "unique",
    ]);
    assert.equal(specification.unique, true);
    assert.deepEqual(specification.partialFilterExpression, {
      [field]: { $type: "string", $gt: "" },
    });
    assert.equal(containsOperator(specification, "$ne"), false);
  }
});

test("Patient schema leaves identity indexes migration-owned and preserves unrelated indexes", () => {
  const schemaIndexes = Patient.schema.indexes();

  for (const expected of PATIENT_IDENTITY_INDEXES) {
    assert.equal(schemaIndexes.some(([key, options]) =>
      options.name === expected.name || isDeepStrictEqual(key, expected.key)), false,
    `schema must not register ${expected.name}`);
  }

  const identityIndexes = schemaIndexes.filter(([key]) =>
    key.email === 1 || key.phoneDigits === 1);
  assert.equal(identityIndexes.some(([, options]) => options.unique === true), false);
  assert.equal(identityIndexes.some(([, options]) =>
    containsOperator(options.partialFilterExpression, "$ne")), false);

  const unrelatedIndexes = [
    { birthDate: 1 },
    { parentEmail: 1 },
    { minorKey: 1 },
    { measurementSystem: 1 },
    { isDeceased: 1 },
    { country: 1 },
    { state: 1 },
    { city: 1 },
    { owners: 1 },
    { owners: 1, fullname: 1 },
    { owners: 1, ageCategory: 1 },
    { owners: 1, gender: 1 },
    { owners: 1, organDonor: 1 },
    { owners: 1, bloodtype: 1 },
    { owners: 1, bloodDonor: 1 },
    { owners: 1, bmiCategory: 1 },
    { owners: 1, isDeceased: 1, birthDate: 1 },
    { createdBy: 1 },
  ];

  for (const expected of unrelatedIndexes) {
    assert.ok(
      schemaIndexes.some(([key]) => isDeepStrictEqual(key, expected)),
      `missing unrelated schema index ${JSON.stringify(expected)}`,
    );
  }
});
