const FT_TO_M = 0.3048;
const IN_TO_M = 0.0254;
const KG_TO_LB = 2.2046226218;
const LB_TO_KG = 0.45359237;
const MAX_HEIGHT_M = 2.5;

const hasValue = (value) => value !== undefined && value !== null && value !== "";
const toNumber = (value) => (hasValue(value) ? Number(value) : NaN);

export const formatNumber = (value, decimals = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return String(Number(n.toFixed(decimals)));
};

export const feetInchesToDecimalFeet = (feet, inches) =>
  Number(feet) + Number(inches) / 12;

export const feetInchesToMeters = (feet, inches) =>
  (Number(feet) * 12 + Number(inches)) * IN_TO_M;

export const metersToFeetInches = (meters) => {
  const m = Number(meters);
  if (!Number.isFinite(m) || m <= 0) return { feet: "", inches: "" };
  const totalInches = Math.round(m / IN_TO_M);
  return {
    feet: String(Math.floor(totalInches / 12)),
    inches: String(totalInches % 12),
  };
};

export const decimalFeetToFeetInches = (decimalFeet) => {
  const ft = Number(decimalFeet);
  if (!Number.isFinite(ft) || ft <= 0) return { feet: "", inches: "" };
  const totalInches = Math.round(ft * 12);
  return {
    feet: String(Math.floor(totalInches / 12)),
    inches: String(totalInches % 12),
  };
};

export const isValidFeetInches = (feet, inches, maxHeightM = MAX_HEIGHT_M) => {
  if (!hasValue(feet) || !hasValue(inches)) return false;

  const f = toNumber(feet);
  const i = toNumber(inches);
  if (!Number.isInteger(f) || !Number.isInteger(i)) return false;
  if (f <= 0 || i < 0 || i > 11) return false;

  const heightM = feetInchesToMeters(f, i);
  return heightM > 0 && heightM <= maxHeightM;
};

export const resolveImperialHeightParts = (patient = {}) => {
  if (Number.isInteger(Number(patient.heightFeet)) && Number.isInteger(Number(patient.heightInches))) {
    return {
      feet: String(Number(patient.heightFeet)),
      inches: String(Number(patient.heightInches)),
    };
  }

  if (typeof patient.heightM === "number") {
    return metersToFeetInches(patient.heightM);
  }

  if (patient.heightDisplay != null) {
    return decimalFeetToFeetInches(patient.heightDisplay);
  }

  return { feet: "", inches: "" };
};

export const formatFeetInches = (feet, inches) => {
  if (!isValidFeetInches(feet, inches, Infinity)) return "";
  return `${Number(feet)} ft ${Number(inches)} in`;
};

export const formatHeightForSystem = ({
  measurementSystem,
  heightM,
  heightFeet,
  heightInches,
  heightDisplay,
  notSpecified = "",
} = {}) => {
  const sys = String(measurementSystem || "metric").toLowerCase();

  if (sys === "imperial") {
    const parts = resolveImperialHeightParts({ heightFeet, heightInches, heightM, heightDisplay });
    return formatFeetInches(parts.feet, parts.inches) || notSpecified;
  }

  return typeof heightM === "number" ? `${heightM.toFixed(2)} m` : notSpecified;
};

export const kgToLb = (kg) => Number(kg) * KG_TO_LB;
export const lbToKg = (lb) => Number(lb) * LB_TO_KG;
export { MAX_HEIGHT_M };
