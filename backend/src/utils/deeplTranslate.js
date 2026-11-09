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

  const titleField = ["title", "Diagnostic", "diagnosis"].find((field) => doc[field] != null);
  const textFields = [titleField, "description"].filter((field) => field && Object.hasOwn(doc, field));
  const listFields = ["medicine", "treatment", "operation"].filter((field) => Array.isArray(doc[field]));
  const isText = (value) => typeof value === "string" && value.trim().length > 0;
  const pack = [...textFields.map((field) => doc[field]), ...listFields.flatMap((field) => doc[field])].filter(isText);
  if (!pack.length) return doc;

  const translated = await deeplTranslate(pack, langLike);
  if (!Array.isArray(translated) || translated.length !== pack.length) return doc;

  let index = 0;
  const translateText = (value) => isText(value) ? translated[index++] ?? value : value;
  const result = { ...doc };
  for (const field of textFields) result[field] = translateText(doc[field]);
  for (const field of listFields) result[field] = doc[field].map(translateText);
  return result;
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
// Traduce SOLO las listas dinámicas del snapshot de MyHealthInfo
export async function translateHealthSnapshot(snapshot, langLike) {
  if (!snapshot) return snapshot;

  const arrayKeys = [
    "diseases", "allergies", "medications",
    "commonDiseases", "commonAllergies", "commonMedications",
    "diseasesCombined", "allergiesCombined", "medicationsCombined",
  ];

  // 1) juntar textos (dedupe para ahorrar $$$)
  const uniq = [];
  const seen = new Map(); // original -> index

  const take = (s) => {
    const v = (s ?? "").toString().trim();
    if (!v) return;
    if (seen.has(v)) return;
    seen.set(v, uniq.length);
    uniq.push(v);
  };

  for (const k of arrayKeys) {
    const arr = Array.isArray(snapshot[k]) ? snapshot[k] : [];
    for (const item of arr) take(item);
  }

  if (!uniq.length) return snapshot;

  // 2) traducir en una sola llamada
  const translated = await deeplTranslate(uniq, langLike);
  if (!Array.isArray(translated)) return snapshot;

  // 3) diccionario original->traducido
  const dict = new Map();
  for (let i = 0; i < uniq.length; i++) {
    dict.set(uniq[i], translated[i] ?? uniq[i]);
  }

  // 4) reconstruir snapshot con esas listas traducidas
  const next = { ...snapshot };
  for (const k of arrayKeys) {
    const arr = Array.isArray(snapshot[k]) ? snapshot[k] : null;
    if (!arr) continue;
    next[k] = arr.map((x) => {
      const key = (x ?? "").toString().trim();
      return dict.get(key) ?? x;
    });
  }

  return next;
}
