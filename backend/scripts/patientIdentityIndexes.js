import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

import dotenv from "dotenv";
import mongoose from "mongoose";

import { PATIENT_IDENTITY_INDEXES } from "../src/config/patientIdentityIndexes.js";

export const APPLY_CONFIRMATION = "CREATE_PATIENT_IDENTITY_INDEXES";

const SUPPORTED_OPTIONS = new Set([
  "--apply",
  "--writes-paused",
]);

export const parseCliOptions = (argv = []) => {
  const options = {
    apply: false,
    confirm: undefined,
    writesPaused: false,
    unknown: [],
  };

  for (const argument of argv) {
    if (argument === "--apply") {
      options.apply = true;
    } else if (argument === "--writes-paused") {
      options.writesPaused = true;
    } else if (argument.startsWith("--confirm=")) {
      options.confirm = argument.slice("--confirm=".length);
    } else if (!SUPPORTED_OPTIONS.has(argument)) {
      options.unknown.push(argument);
    }
  }

  return options;
};

export const evaluateApplyAuthorization = (options) => {
  const reasons = [];

  if (!options.apply) reasons.push("apply_not_requested");
  if (options.confirm !== APPLY_CONFIRMATION) reasons.push("confirmation_missing");
  if (!options.writesPaused) reasons.push("writes_not_acknowledged_paused");
  if (options.unknown.length > 0) reasons.push("unknown_options");

  return { permitted: reasons.length === 0, reasons };
};

const expectedIndexOptions = ({ name, unique, partialFilterExpression }) => ({
  name,
  unique,
  partialFilterExpression,
});

export const indexMatchesExpected = (liveIndex, expectedIndex) =>
  liveIndex?.name === expectedIndex.name
  && isDeepStrictEqual(liveIndex?.key, expectedIndex.key)
  && liveIndex?.unique === true
  && liveIndex?.sparse !== true
  && liveIndex?.collation === undefined
  && isDeepStrictEqual(
    liveIndex?.partialFilterExpression,
    expectedIndex.partialFilterExpression,
  );

export const decideIndexActions = (
  liveIndexes,
  expectedIndexes = PATIENT_IDENTITY_INDEXES,
) => expectedIndexes.map((expected) => {
  const related = liveIndexes.filter((live) =>
    live.name === expected.name || isDeepStrictEqual(live.key, expected.key));
  const exact = related.find((live) => indexMatchesExpected(live, expected));

  if (exact && related.length === 1) {
    return { name: expected.name, action: "healthy" };
  }
  if (related.length > 0) {
    return { name: expected.name, action: "conflict" };
  }
  return { name: expected.name, action: "create" };
});

const zeroDuplicateCounts = () => ({
  duplicateGroups: 0,
  documentsInDuplicateGroups: 0,
});

export const evaluateCompatibility = ({
  collectionExists,
  fieldShapes,
  duplicateCounts,
  indexActions,
}) => {
  const reasons = [];

  if (!collectionExists) reasons.push("patients_collection_missing");
  if ((fieldShapes?.email?.whitespaceOnly ?? 0) > 0) {
    reasons.push("email_has_whitespace_only_values");
  }
  if ((fieldShapes?.phoneDigits?.whitespaceOnly ?? 0) > 0) {
    reasons.push("phoneDigits_has_whitespace_only_values");
  }
  if ((fieldShapes?.email?.otherType ?? 0) > 0) {
    reasons.push("email_has_incompatible_types");
  }
  if ((fieldShapes?.phoneDigits?.otherType ?? 0) > 0) {
    reasons.push("phoneDigits_has_incompatible_types");
  }

  for (const [check, counts] of Object.entries(duplicateCounts ?? {})) {
    if ((counts?.duplicateGroups ?? 0) > 0) {
      reasons.push(`${check}_duplicates_present`);
    }
  }

  if ((indexActions ?? []).some(({ action }) => action === "conflict")) {
    reasons.push("conflicting_identity_index_present");
  }

  return { compatible: reasons.length === 0, reasons };
};

export const buildFieldShapePipeline = (field) => {
  const isString = { $eq: [{ $type: `$${field}` }, "string"] };
  const trimmed = {
    $trim: { input: { $cond: [isString, `$${field}`, ""] } },
  };

  return [
    {
      $project: {
        fieldType: { $type: `$${field}` },
        isExactEmpty: { $cond: [isString, { $eq: [`$${field}`, ""] }, false] },
        isWhitespaceOnly: {
          $cond: [
            isString,
            { $and: [{ $ne: [`$${field}`, ""] }, { $eq: [trimmed, ""] }] },
            false,
          ],
        },
        isNonWhitespaceNonEmpty: {
          $cond: [isString, { $gt: [trimmed, ""] }, false],
        },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        missing: { $sum: { $cond: [{ $eq: ["$fieldType", "missing"] }, 1, 0] } },
        null: { $sum: { $cond: [{ $eq: ["$fieldType", "null"] }, 1, 0] } },
        empty: { $sum: { $cond: [{ $eq: ["$isExactEmpty", true] }, 1, 0] } },
        whitespaceOnly: {
          $sum: { $cond: [{ $eq: ["$isWhitespaceOnly", true] }, 1, 0] },
        },
        nonEmpty: {
          $sum: { $cond: [{ $eq: ["$isNonWhitespaceNonEmpty", true] }, 1, 0] },
        },
        otherType: {
          $sum: {
            $cond: [
              { $in: ["$fieldType", ["missing", "null", "string"]] },
              0,
              1,
            ],
          },
        },
      },
    },
    { $project: { _id: 0 } },
  ];
};

export const buildDuplicateCountPipeline = (field, { normalizeEmail = false } = {}) => {
  const trimmed = { $trim: { input: `$${field}` } };
  const groupValue = normalizeEmail ? { $toLower: trimmed } : `$${field}`;

  return [
    { $match: { [field]: { $type: "string", $gt: "" } } },
    ...(normalizeEmail ? [{ $match: { $expr: { $ne: [trimmed, ""] } } }] : []),
    { $group: { _id: groupValue, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    {
      $group: {
        _id: null,
        duplicateGroups: { $sum: 1 },
        documentsInDuplicateGroups: { $sum: "$count" },
      },
    },
    { $project: { _id: 0 } },
  ];
};

const aggregateOne = async (collection, pipeline, fallback) => {
  const [result] = await collection.aggregate(pipeline).toArray();
  return result ?? fallback;
};

const sanitizeFilter = (value, parentKey) => {
  if (Array.isArray(value)) return value.map((child) => sanitizeFilter(child, parentKey));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, sanitizeFilter(child, key)]),
    );
  }
  if (parentKey === "$type" && value === "string") return value;
  if (parentKey === "$gt" && value === "") return value;
  return "[redacted]";
};

export const sanitizeIndexMetadata = (index) => ({
  name: index.name,
  key: index.key,
  unique: index.unique === true,
  sparse: index.sparse === true,
  ...(index.partialFilterExpression
    ? { partialFilterExpression: sanitizeFilter(index.partialFilterExpression) }
    : {}),
});

export const collectPreflight = async (db) => {
  const collections = await db
    .listCollections({ name: "patients" }, { nameOnly: true })
    .toArray();
  const collectionExists = collections.length === 1;

  if (!collectionExists) {
    const indexActions = decideIndexActions([]);
    return {
      collectionExists,
      totalPatients: 0,
      safeLiveIndexes: [],
      fieldShapes: {},
      duplicateCounts: {},
      indexActions,
      compatibility: evaluateCompatibility({
        collectionExists,
        fieldShapes: {},
        duplicateCounts: {},
        indexActions,
      }),
    };
  }

  const collection = db.collection("patients");
  const [
    liveIndexes,
    emailShape,
    phoneShape,
    exactEmailDuplicates,
    normalizedEmailDuplicates,
    exactPhoneDuplicates,
  ] = await Promise.all([
    collection.listIndexes().toArray(),
    aggregateOne(collection, buildFieldShapePipeline("email"), {
      total: 0,
      missing: 0,
      null: 0,
      empty: 0,
      whitespaceOnly: 0,
      nonEmpty: 0,
      otherType: 0,
    }),
    aggregateOne(collection, buildFieldShapePipeline("phoneDigits"), {
      total: 0,
      missing: 0,
      null: 0,
      empty: 0,
      whitespaceOnly: 0,
      nonEmpty: 0,
      otherType: 0,
    }),
    aggregateOne(collection, buildDuplicateCountPipeline("email"), zeroDuplicateCounts()),
    aggregateOne(
      collection,
      buildDuplicateCountPipeline("email", { normalizeEmail: true }),
      zeroDuplicateCounts(),
    ),
    aggregateOne(
      collection,
      buildDuplicateCountPipeline("phoneDigits"),
      zeroDuplicateCounts(),
    ),
  ]);

  const fieldShapes = { email: emailShape, phoneDigits: phoneShape };
  const duplicateCounts = {
    exactEmail: exactEmailDuplicates,
    normalizedEmail: normalizedEmailDuplicates,
    exactPhoneDigits: exactPhoneDuplicates,
  };
  const indexActions = decideIndexActions(liveIndexes);

  return {
    collectionExists,
    totalPatients: emailShape.total,
    safeLiveIndexes: liveIndexes.map(sanitizeIndexMetadata),
    fieldShapes,
    duplicateCounts,
    indexActions,
    compatibility: evaluateCompatibility({
      collectionExists,
      fieldShapes,
      duplicateCounts,
      indexActions,
    }),
  };
};

const safePreflightOutput = (preflight) => ({
  collectionExists: preflight.collectionExists,
  totalPatients: preflight.totalPatients,
  fieldShapes: preflight.fieldShapes,
  duplicateCounts: preflight.duplicateCounts,
  liveIndexes: preflight.safeLiveIndexes,
  indexActions: preflight.indexActions,
  compatibility: preflight.compatibility,
});

export const runPatientIdentityIndexMigration = async ({
  argv = [],
  connect = (uri, options) => mongoose.connect(uri, options),
  disconnect = () => mongoose.disconnect(),
  uri = process.env.MONGO_URI,
  write = (value) => console.log(JSON.stringify(value, null, 2)),
} = {}) => {
  const options = parseCliOptions(argv);
  const authorization = evaluateApplyAuthorization(options);

  if (options.apply && !authorization.permitted) {
    write({ mode: "apply", status: "aborted", reasons: authorization.reasons });
    return { status: "aborted", reasons: authorization.reasons };
  }

  if (!uri) {
    write({ mode: options.apply ? "apply" : "read-only", status: "failed", reason: "mongo_uri_missing" });
    return { status: "failed", reason: "mongo_uri_missing" };
  }

  let connection;
  try {
    connection = await connect(uri, { autoIndex: false, autoCreate: false });
    const initial = await collectPreflight(connection.connection.db);
    write({
      mode: options.apply ? "apply" : "read-only",
      status: initial.compatibility.compatible ? "preflight_passed" : "preflight_failed",
      ...safePreflightOutput(initial),
    });

    if (!options.apply) {
      return { status: "read-only", preflight: initial };
    }

    const finalPreflight = await collectPreflight(connection.connection.db);
    if (!finalPreflight.compatibility.compatible) {
      write({ mode: "apply", status: "aborted", reasons: finalPreflight.compatibility.reasons });
      return { status: "aborted", reasons: finalPreflight.compatibility.reasons };
    }

    const collection = connection.connection.db.collection("patients");
    for (const action of finalPreflight.indexActions) {
      if (action.action !== "create") continue;
      const expected = PATIENT_IDENTITY_INDEXES.find(({ name }) => name === action.name);
      await collection.createIndex(expected.key, expectedIndexOptions(expected));
    }

    const verifiedIndexes = await collection.listIndexes().toArray();
    const verification = decideIndexActions(verifiedIndexes);
    const verified = verification.every(({ action }) => action === "healthy");
    write({ mode: "apply", status: verified ? "verified" : "verification_failed", indexActions: verification });
    return { status: verified ? "verified" : "verification_failed", indexActions: verification };
  } catch {
    write({
      mode: options.apply ? "apply" : "read-only",
      status: "failed",
      reason: "patient_identity_index_operation_failed",
    });
    return { status: "failed", reason: "patient_identity_index_operation_failed" };
  } finally {
    if (connection) {
      try {
        await disconnect();
      } catch {
        const result = { status: "failed", reason: "mongo_disconnect_failed" };
        write({ mode: options.apply ? "apply" : "read-only", ...result });
        return result;
      }
    }
  }
};

export const main = async () => {
  dotenv.config({ quiet: true });
  const result = await runPatientIdentityIndexMigration({ argv: process.argv.slice(2) });
  if (["failed", "aborted", "verification_failed"].includes(result.status)) {
    process.exitCode = 1;
  }
};

const directPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (directPath === import.meta.url) {
  await main();
}
