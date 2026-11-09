import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { PATIENT_IDENTITY_INDEXES } from "../src/config/patientIdentityIndexes.js";
import {
  APPLY_CONFIRMATION,
  buildFieldShapePipeline,
  decideIndexActions,
  evaluateApplyAuthorization,
  evaluateCompatibility,
  indexMatchesExpected,
  parseCliOptions,
  runPatientIdentityIndexMigration,
  sanitizeIndexMetadata,
} from "./patientIdentityIndexes.js";

const expectedLiveIndex = (expected) => ({
  name: expected.name,
  key: expected.key,
  unique: true,
  partialFilterExpression: expected.partialFilterExpression,
});

const compatibleInput = () => ({
  collectionExists: true,
  fieldShapes: {
    email: {
      total: 0,
      missing: 0,
      null: 0,
      empty: 0,
      whitespaceOnly: 0,
      nonEmpty: 0,
      otherType: 0,
    },
    phoneDigits: {
      total: 0,
      missing: 0,
      null: 0,
      empty: 0,
      whitespaceOnly: 0,
      nonEmpty: 0,
      otherType: 0,
    },
  },
  duplicateCounts: {
    exactEmail: { duplicateGroups: 0, documentsInDuplicateGroups: 0 },
    normalizedEmail: { duplicateGroups: 0, documentsInDuplicateGroups: 0 },
    exactPhoneDigits: { duplicateGroups: 0, documentsInDuplicateGroups: 0 },
  },
  indexActions: decideIndexActions([]),
});

const createCompatibleDatabase = () => {
  let createIndexCalls = 0;
  const collection = {
    listIndexes: () => ({ toArray: async () => [] }),
    aggregate: (pipeline) => ({
      toArray: async () => {
        const source = JSON.stringify(pipeline);
        if (source.includes('"total"')) {
          return [{
            total: 0,
            missing: 0,
            null: 0,
            empty: 0,
            whitespaceOnly: 0,
            nonEmpty: 0,
            otherType: 0,
          }];
        }
        return [];
      },
    }),
    createIndex: async () => {
      createIndexCalls += 1;
    },
  };
  const db = {
    listCollections: () => ({ toArray: async () => [{ name: "patients" }] }),
    collection: () => collection,
  };

  return { db, getCreateIndexCalls: () => createIndexCalls };
};

test("default CLI options select read-only mode", () => {
  const options = parseCliOptions([]);
  assert.equal(options.apply, false);
  assert.equal(options.writesPaused, false);
  assert.equal(options.confirm, undefined);
});

test("field-shape pipeline classifies whitespace-only strings using counts only", () => {
  const pipeline = buildFieldShapePipeline("email");
  const source = JSON.stringify(pipeline);

  assert.equal(source.includes('"$trim"'), true);
  assert.equal(source.includes('"isWhitespaceOnly"'), true);
  assert.equal(source.includes('"isNonWhitespaceNonEmpty"'), true);
  assert.equal(source.includes('"fieldValue"'), false);
  assert.deepEqual(
    pipeline[0].$project.isWhitespaceOnly.$cond[1].$and[1].$eq[0].$trim.input,
    { $cond: [{ $eq: [{ $type: "$email" }, "string"] }, "$email", ""] },
  );
  assert.deepEqual(Object.keys(pipeline[1].$group), [
    "_id",
    "total",
    "missing",
    "null",
    "empty",
    "whitespaceOnly",
    "nonEmpty",
    "otherType",
  ]);
  assert.deepEqual(pipeline[2], { $project: { _id: 0 } });
});

test("default execution completes preflight without calling createIndex", async () => {
  const database = createCompatibleDatabase();
  const output = [];
  let disconnectCalls = 0;

  const result = await runPatientIdentityIndexMigration({
    argv: [],
    uri: "synthetic-test-uri",
    connect: async (_uri, options) => {
      assert.deepEqual(options, { autoIndex: false, autoCreate: false });
      return { connection: { db: database.db } };
    },
    disconnect: async () => {
      disconnectCalls += 1;
    },
    write: (value) => output.push(value),
  });

  assert.equal(result.status, "read-only");
  assert.equal(database.getCreateIndexCalls(), 0);
  assert.equal(disconnectCalls, 1);
  assert.equal(output[0].mode, "read-only");
  assert.equal(output[0].fieldShapes.email.whitespaceOnly, 0);
  assert.equal(output[0].fieldShapes.phoneDigits.whitespaceOnly, 0);
});

test("apply authorization requires all explicit signals", () => {
  assert.equal(evaluateApplyAuthorization(parseCliOptions(["--apply"])).permitted, false);
  assert.equal(evaluateApplyAuthorization(parseCliOptions([
    "--apply",
    "--confirm=WRONG",
    "--writes-paused",
  ])).permitted, false);
  assert.equal(evaluateApplyAuthorization(parseCliOptions([
    "--apply",
    `--confirm=${APPLY_CONFIRMATION}`,
  ])).permitted, false);
  assert.equal(evaluateApplyAuthorization(parseCliOptions([
    "--apply",
    `--confirm=${APPLY_CONFIRMATION}`,
    "--writes-paused",
  ])).permitted, true);
});

test("unauthorized apply variants abort before connecting or creating indexes", async () => {
  const variants = [
    {
      argv: ["--apply"],
      reasons: ["confirmation_missing", "writes_not_acknowledged_paused"],
    },
    {
      argv: ["--apply", "--confirm=WRONG", "--writes-paused"],
      reasons: ["confirmation_missing"],
    },
    {
      argv: ["--apply", `--confirm=${APPLY_CONFIRMATION}`],
      reasons: ["writes_not_acknowledged_paused"],
    },
  ];

  for (const { argv, reasons } of variants) {
    const database = createCompatibleDatabase();
    let connectCalls = 0;
    let disconnectCalls = 0;

    const result = await runPatientIdentityIndexMigration({
      argv,
      uri: "synthetic-test-uri",
      connect: async () => {
        connectCalls += 1;
        return { connection: { db: database.db } };
      },
      disconnect: async () => {
        disconnectCalls += 1;
      },
      write: () => {},
    });

    assert.deepEqual(result, { status: "aborted", reasons });
    assert.equal(connectCalls, 0);
    assert.equal(disconnectCalls, 0);
    assert.equal(database.getCreateIndexCalls(), 0);
  }
});

test("index decisions distinguish healthy, conflicting, and absent indexes", () => {
  const [email, phone] = PATIENT_IDENTITY_INDEXES;
  assert.equal(indexMatchesExpected(expectedLiveIndex(email), email), true);
  assert.deepEqual(decideIndexActions([expectedLiveIndex(email)]), [
    { name: email.name, action: "healthy" },
    { name: phone.name, action: "create" },
  ]);

  const conflictingEmail = {
    ...expectedLiveIndex(email),
    unique: false,
  };
  assert.deepEqual(decideIndexActions([conflictingEmail])[0], {
    name: email.name,
    action: "conflict",
  });

  const sameKeyWithDifferentName = {
    ...expectedLiveIndex(email),
    name: "unexpected_email_index",
  };
  assert.deepEqual(
    decideIndexActions([expectedLiveIndex(email), sameKeyWithDifferentName])[0],
    { name: email.name, action: "conflict" },
  );

  const differentStringCollation = {
    ...expectedLiveIndex(email),
    collation: { locale: "en", strength: 2 },
  };
  assert.equal(indexMatchesExpected(differentStringCollation, email), false);
  assert.deepEqual(decideIndexActions([differentStringCollation])[0], {
    name: email.name,
    action: "conflict",
  });
});

test("safe index metadata redacts unexpected partial-filter scalar literals", () => {
  const safe = sanitizeIndexMetadata({
    name: "conflicting_identity_index",
    key: { phoneDigits: 1 },
    unique: true,
    partialFilterExpression: {
      phoneDigits: { $eq: 6195550102 },
      email: { $eq: "private@example.test" },
      expectedType: { $type: "string" },
      expectedLowerBound: { $gt: "" },
      unexpectedLowerBound: { $gt: 7 },
    },
  });

  assert.deepEqual(safe.partialFilterExpression, {
    phoneDigits: { $eq: "[redacted]" },
    email: { $eq: "[redacted]" },
    expectedType: { $type: "string" },
    expectedLowerBound: { $gt: "" },
    unexpectedLowerBound: { $gt: "[redacted]" },
  });
  const output = JSON.stringify(safe);
  assert.equal(output.includes("6195550102"), false);
  assert.equal(output.includes("private@example.test"), false);
});

test("compatibility rejects duplicates, incompatible types, and conflicting indexes", () => {
  const duplicateInput = compatibleInput();
  duplicateInput.duplicateCounts.normalizedEmail.duplicateGroups = 1;
  assert.equal(evaluateCompatibility(duplicateInput).compatible, false);

  const incompatibleInput = compatibleInput();
  incompatibleInput.fieldShapes.phoneDigits.otherType = 1;
  assert.equal(evaluateCompatibility(incompatibleInput).compatible, false);

  const conflictInput = compatibleInput();
  conflictInput.indexActions[0].action = "conflict";
  assert.equal(evaluateCompatibility(conflictInput).compatible, false);
});

test("compatible data with absent indexes yields planned create actions", () => {
  const input = compatibleInput();
  assert.equal(evaluateCompatibility(input).compatible, true);
  assert.deepEqual(input.indexActions.map(({ action }) => action), ["create", "create"]);
});

test("exact empty strings do not by themselves fail compatibility", () => {
  const input = compatibleInput();
  input.fieldShapes.email.empty = 2;
  input.fieldShapes.phoneDigits.empty = 1;

  assert.deepEqual(evaluateCompatibility(input), { compatible: true, reasons: [] });
});

test("whitespace-only values fail compatibility with safe field-specific reasons", () => {
  for (const field of ["email", "phoneDigits"]) {
    const input = compatibleInput();
    input.fieldShapes[field].whitespaceOnly = 1;

    assert.deepEqual(evaluateCompatibility(input), {
      compatible: false,
      reasons: [`${field}_has_whitespace_only_values`],
    });
  }
});

test("migration source has no model registration or destructive index operation", async () => {
  const source = await readFile(new URL("./patientIdentityIndexes.js", import.meta.url), "utf8");
  assert.equal(source.includes("models/Patient"), false);
  assert.equal(source.includes("syncIndexes("), false);
  assert.equal(source.includes("dropIndex("), false);
  assert.equal(source.includes("dropIndexes("), false);
  assert.equal(source.includes("autoIndex: false"), true);
  assert.equal(source.includes("autoCreate: false"), true);
});
