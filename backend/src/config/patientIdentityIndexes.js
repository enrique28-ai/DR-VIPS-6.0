export const PATIENT_IDENTITY_INDEXES = Object.freeze([
  Object.freeze({
    name: "uniq_patients_email_nonempty",
    key: Object.freeze({ email: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({
      email: Object.freeze({ $type: "string", $gt: "" }),
    }),
  }),
  Object.freeze({
    name: "uniq_patients_phoneDigits_nonempty",
    key: Object.freeze({ phoneDigits: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({
      phoneDigits: Object.freeze({ $type: "string", $gt: "" }),
    }),
  }),
]);
