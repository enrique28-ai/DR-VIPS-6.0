import Patient from "../../models/Patient.js";
import {
  normBmiCat,
  normGender,
  ageCategoryToBirthDateQuery,
  applyDynamicAgeToPatient,
} from "../../controllers/helpers/patienthelpers.js";

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const getMyPatientsService = async ({ user, queryParams }) => {
  const {
    category,
    q,
    gender,
    organDonor,
    bloodDonor,
    bmiCategory: _bmiCategory,
    weightCategory: _weightCategory,
    bmi: _bmi,
  } = queryParams;

  const bmiCat = normBmiCat(_bmiCategory ?? _weightCategory ?? _bmi);

  const rawBT = queryParams.bloodtype;
  let bloodtypeFilter = null;

  if (rawBT && rawBT !== "All") {
    const arr = Array.isArray(rawBT) ? rawBT : [rawBT];
    const ups = arr
      .map((x) => String(x || "").trim().toUpperCase())
      .filter(Boolean);

    if (ups.length > 0) {
      bloodtypeFilter = ups.length === 1 ? ups[0] : { $in: ups };
    }
  }

  const page = Math.max(1, parseInt(queryParams.page ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit ?? "20", 10)));
  const skip = (page - 1) * limit;

  const query = {
    $or: [{ owners: user._id }, { createdBy: user._id }],
  };

  if (queryParams.country) {
    const c = String(queryParams.country).trim();
    if (c && c !== "All") query.country = c;
  }

  if (typeof queryParams.deceased !== "undefined") {
    if (queryParams.deceased === "true" || queryParams.deceased === true) query.isDeceased = true;
    if (queryParams.deceased === "false" || queryParams.deceased === false) query.isDeceased = false;
  }

  if (category && category !== "All") {
    const bdQuery = ageCategoryToBirthDateQuery(category);

    if (query.isDeceased === true) {
      query.ageCategory = category;
    } else if (bdQuery) {
      query.$and ||= [];
      query.$and.push({
        $or: [
          { isDeceased: { $ne: true }, birthDate: bdQuery },
          { isDeceased: { $ne: true }, birthDate: { $exists: false }, ageCategory: category },
          { isDeceased: true, ageCategory: category },
        ],
      });
    } else {
      query.ageCategory = category;
    }
  }

  if (bloodtypeFilter) query.bloodtype = bloodtypeFilter;
  if (bmiCat) query.bmiCategory = bmiCat;

  if (gender && ["male", "female"].includes(normGender(gender))) {
    query.gender = normGender(gender);
  }

  if (typeof organDonor !== "undefined") {
    if (organDonor === "true" || organDonor === true) query.organDonor = true;
    if (organDonor === "false" || organDonor === false) query.organDonor = false;
  }

  if (typeof bloodDonor !== "undefined") {
    if (bloodDonor === "true" || bloodDonor === true) query.bloodDonor = true;
    if (bloodDonor === "false" || bloodDonor === false) query.bloodDonor = false;
  }

  if (typeof queryParams.hasDiseases !== "undefined") {
    if (queryParams.hasDiseases === "true" || queryParams.hasDiseases === true) {
      query["diseases.0"] = { $exists: true };
    } else if (queryParams.hasDiseases === "false" || queryParams.hasDiseases === false) {
      query.diseases = { $size: 0 };
    }
  }

  if (typeof queryParams.hasAllergies !== "undefined") {
    if (queryParams.hasAllergies === "true" || queryParams.hasAllergies === true) {
      query["allergies.0"] = { $exists: true };
    } else if (queryParams.hasAllergies === "false" || queryParams.hasAllergies === false) {
      query.allergies = { $size: 0 };
    }
  }

  if (typeof queryParams.hasMedications !== "undefined") {
    if (queryParams.hasMedications === "true" || queryParams.hasMedications === true) {
      query["medications.0"] = { $exists: true };
    } else if (queryParams.hasMedications === "false" || queryParams.hasMedications === false) {
      query.medications = { $size: 0 };
    }
  }

  const term = q?.trim();
  if (term) {
    const safeTerm = escapeRegex(term);
    const searchOr = [
      { fullname: { $regex: safeTerm, $options: "i" } },
      { email: { $regex: safeTerm, $options: "i" } },
      { phone: { $regex: safeTerm, $options: "i" } },
    ];

    const qDigits = term.replace(/\D/g, "");
    if (qDigits) searchOr.push({ phoneDigits: new RegExp(qDigits) });

    query.$and ||= [];
    query.$and.push({ $or: searchOr });
  }

  const [items, total] = await Promise.all([
    Patient.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Patient.countDocuments(query),
  ]);

  const out = items.map((p) => applyDynamicAgeToPatient(p));

  return {
    items: out,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
};