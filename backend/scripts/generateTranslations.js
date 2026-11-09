// backend/scripts/generateTranslations.js
import fs from "fs";
import path from "path";
import * as deepl from "deepl-node";
import dotenv from "dotenv";

// Cargar .env desde la RAÍZ del proyecto (una carpeta arriba de /backend)
dotenv.config({
  path: path.resolve(process.cwd(), "..", ".env"),
});

// Verificamos que sí se leyó la API key
const authKey = process.env.DEEPL_API_KEY;
if (!authKey) {
  console.error("Missing DEEPL_API_KEY in .env");
  process.exit(1);
}

const translator = new deepl.Translator(authKey);

// Idiomas destino: puedes agregar más si quieres
const targets = [
  { code: "ES", folder: "es" },
  // Si quieres que sea más ligero, deja solo ES mientras pruebas:
  // { code: "FR", folder: "fr" },
];

// Ruta a frontend/src/locals (ajusta si tu carpeta se llama distinto)
const FRONT_LOCALES_DIR = path.join(
  process.cwd(), // backend/
  "..",          // → raíz (Dr-VIPS-5.0)
  "frontend",
  "src",
  "locals"
);

// Archivo base en inglés
const basePath = path.join(FRONT_LOCALES_DIR, "en", "common.json");

if (!fs.existsSync(basePath)) {
  console.error("No se encontró:", basePath);
  process.exit(1);
}

const base = JSON.parse(fs.readFileSync(basePath, "utf8"));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// value: string a traducir
// targetLang: "ES", "FR", ...
// attempt: número de intento (para el backoff)
async function translateValue(value, targetLang, attempt = 1) {
  if (typeof value !== "string") return value;

  try {
    const result = await translator.translateText(value, null, targetLang);
    return result.text;
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";

    // Si es error de "Too many requests", reintentamos con backoff
    if (msg.includes("Too many requests") && attempt <= 5) {
      const delay = 1000 * attempt; // 1s, 2s, 3s, ...
      console.warn(
        `Too many requests (${targetLang}). Reintento ${attempt}/5 en ${delay} ms...`
      );
      await sleep(delay);
      return translateValue(value, targetLang, attempt + 1);
    }

    console.error("Error al traducir el valor:", value);
    console.error(err);
    throw err; // ya no es un rate limit o se acabaron reintentos
  }
}

async function translateObject(obj, targetLang) {
  const out = Array.isArray(obj) ? [] : {};

  for (const key of Object.keys(obj)) {
    const v = obj[key];

    if (typeof v === "string") {
      out[key] = await translateValue(v, targetLang);
    } else if (typeof v === "object" && v !== null) {
      out[key] = await translateObject(v, targetLang);
    } else {
      out[key] = v;
    }
  }

  return out;
}

async function main() {
  console.log("Using DEEPL_API_KEY:", authKey.slice(0, 6) + "...");

  for (const t of targets) {
    console.log(`Translating to ${t.code}...`);
    const translated = await translateObject(base, t.code);

    const outDir = path.join(FRONT_LOCALES_DIR, t.folder);
    fs.mkdirSync(outDir, { recursive: true });

    const outPath = path.join(outDir, "common.json");
    fs.writeFileSync(outPath, JSON.stringify(translated, null, 2), "utf8");
    console.log(`Written ${outPath}`);
  }

  console.log("Done ✅");
}

main().catch((err) => {
  console.error("Error en generateTranslations:", err);
  process.exit(1);
});
