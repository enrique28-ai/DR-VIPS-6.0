// backend/src/utils/deeplTranslate.js
import fetch from "node-fetch";


const FREE_URL = "https://api-free.deepl.com/v2/translate";
const PRO_URL  = "https://api.deepl.com/v2/translate";

const API_KEY = process.env.DEEPL_API_KEY;
const API_URL = process.env.DEEPL_API_URL || FREE_URL;

// Convierte i18n lang (en, en-US, es, es-MX) -> DeepL target (EN, EN-US, ES, etc.)
function toDeepLTarget(langLike) {
  if (!langLike) return null;
  const raw = String(langLike).trim().replace("_", "-").toLowerCase();
  if (!raw) return null;

  // Comunes (tu app casi seguro usa EN / ES)
  if (raw === "en") return "EN";
  if (raw === "en-us") return "EN-US";
  if (raw === "en-gb") return "EN-GB";
  if (raw === "es" || raw.startsWith("es-")) return "ES";

  // Fallback genérico
  return raw.split("-")[0].toUpperCase();
}

async function deeplTranslate(textOrArray, langLike) {
  const target = toDeepLTarget(langLike);
  if (!API_KEY || !target) return textOrArray;

  const isArr = Array.isArray(textOrArray);
  const texts = isArr ? textOrArray : [textOrArray];

  // Limpieza básica
  const clean = texts.map((t) => (t == null ? "" : String(t)));

  // Nada que traducir
  if (clean.every((t) => !t.trim())) return textOrArray;

  const body = new URLSearchParams();
  body.append("target_lang", target);
  clean.forEach((t) => body.append("text", t));

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    // DeepL manda detalles útiles en error body
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("DeepL error:", resp.status, errText);
      return textOrArray; // fallback
    }

    const data = await resp.json();
    const out = Array.isArray(data?.translations)
      ? data.translations.map((x) => x.text)
      : clean;

    return isArr ? out : (out[0] ?? textOrArray);
  } catch (e) {
    console.error("DeepL fetch failed:", e?.message || e);
    return textOrArray;
  }
}

// Traduce TODO el diagnóstico (detalle)
export async function translateDiagnosisDoc(doc, langLike) {
  if (!doc) return doc;

  const title = doc.title ?? "";
  const description = doc.description ?? "";

  const medicine = Array.isArray(doc.medicine) ? doc.medicine : [];
  const treatment = Array.isArray(doc.treatment) ? doc.treatment : [];
  const operation = Array.isArray(doc.operation) ? doc.operation : [];

  const pack = [
    title,
    description,
    ...medicine,
    ...treatment,
    ...operation,
  ];

  const translated = await deeplTranslate(pack, langLike);

  // Si algo raro pasó, fallback
  if (!Array.isArray(translated) || translated.length < 2) return doc;

  let idx = 0;
  const nextTitle = translated[idx++] ?? title;
  const nextDesc  = translated[idx++] ?? description;

const nextMedicine  = medicine.map((v) => translated[idx++] ?? v);
const nextTreatment = treatment.map((v) => translated[idx++] ?? v);
const nextOperation = operation.map((v) => translated[idx++] ?? v);


  return {
    ...doc,
    title: nextTitle,
    description: nextDesc,
    medicine: nextMedicine,
    treatment: nextTreatment,
    operation: nextOperation,
  };
}

// Traduce SOLO títulos (lista/card)
export async function translateDiagnosisTitles(items, langLike) {
  if (!Array.isArray(items) || items.length === 0) return items;

  const titles = items.map((d) => d?.title ?? "");
  const translated = await deeplTranslate(titles, langLike);

  if (!Array.isArray(translated)) return items;

  return items.map((d, i) => ({
    ...d,
    title: translated[i] ?? d.title,
  }));
}


// Traduce campos del paciente (DETAIL) bajo demanda
export async function translatePatientDoc(doc, langLike) {
  if (!doc) return doc;

  const diseases = Array.isArray(doc.diseases) ? doc.diseases : [];
  const allergies = Array.isArray(doc.allergies) ? doc.allergies : [];
  const medications = Array.isArray(doc.medications) ? doc.medications : [];

  const pack = [...diseases, ...allergies, ...medications];
  const translated = await deeplTranslate(pack, langLike);

  if (!Array.isArray(translated)) return doc;

  let idx = 0;
  const nextDiseases = diseases.map((v) => translated[idx++] ?? v);
  const nextAllergies = allergies.map((v) => translated[idx++] ?? v);
  const nextMedications = medications.map((v) => translated[idx++] ?? v);

 
  return {
    ...doc,
    diseases: nextDiseases,
    allergies: nextAllergies,
    medications: nextMedications,
  };
}

