// src/utils/geoLabels.js
import { Country, State as CState, City as CCity } from "country-state-city";

// --- caches base (evita recomputar en cada render) ---
const ALL_COUNTRIES = Country.getAllCountries();
const COUNTRY_NAME_TO_CODE = new Map(ALL_COUNTRIES.map((c) => [c.name, c.isoCode]));

const REGION_NAMES_CACHE = new Map();          // lang -> Intl.DisplayNames|null
const LOCALIZED_COUNTRIES_CACHE = new Map();   // lang -> [{...country, label}]
const STATE_NAME_TO_ISO_CACHE = new Map();     // countryIso -> Map(normName -> iso)

// normaliza acentos y may/min para matching por nombre
const norm = (s = "") =>
  String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function normalizeLang(lang = "en") {
  const s = String(lang || "en").trim();
  // para caché: usa el base "es" de "es-MX" (más estable)
  return s.split("-")[0] || "en";
}

function getRegionNames(lang = "en") {
  const key = normalizeLang(lang);
  if (REGION_NAMES_CACHE.has(key)) return REGION_NAMES_CACHE.get(key);

  try {
    if (typeof Intl === "undefined" || typeof Intl.DisplayNames === "undefined") {
      REGION_NAMES_CACHE.set(key, null);
      return null;
    }
    const dn = new Intl.DisplayNames([lang], { type: "region" });
    REGION_NAMES_CACHE.set(key, dn);
    return dn;
  } catch {
    REGION_NAMES_CACHE.set(key, null);
    return null;
  }
}

export function getCountryIsoByName(countryName) {
  return COUNTRY_NAME_TO_CODE.get(countryName) || "";
}

export function localizeCountryName(countryNameOrIso, lang = "en") {
  if (!countryNameOrIso) return "";

  const raw = String(countryNameOrIso);

  // acepta "MX" o "Mexico"
  const iso =
    /^[A-Z]{2}$/.test(raw) ? raw : COUNTRY_NAME_TO_CODE.get(raw);

  if (!iso) return raw; // fallback si no encontramos ISO

  const dn = getRegionNames(lang);
  return (dn && dn.of(iso)) || raw;
}

export function getLocalizedCountries(lang = "en") {
  const key = normalizeLang(lang);
  if (LOCALIZED_COUNTRIES_CACHE.has(key)) return LOCALIZED_COUNTRIES_CACHE.get(key);

  const dn = getRegionNames(lang);

  const list = ALL_COUNTRIES
    .map((c) => ({
      ...c,
      label: (dn && dn.of(c.isoCode)) || c.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  LOCALIZED_COUNTRIES_CACHE.set(key, list);
  return list;
}

export function resolveStateIso(countryIso, stateName) {
  if (!countryIso || !stateName) return "";
  const cIso = String(countryIso).toUpperCase();

  let map = STATE_NAME_TO_ISO_CACHE.get(cIso);
  if (!map) {
    map = new Map();
    try {
      CState.getStatesOfCountry(cIso).forEach((s) => {
        map.set(norm(s.name), s.isoCode);
      });
    } catch {
      // ignore
    }
    STATE_NAME_TO_ISO_CACHE.set(cIso, map);
  }
  return map.get(norm(stateName)) || "";
}

const MISSING = "__MISSING__";
function tTry(t, key) {
  if (!t) return null;
  const out = t(key, { defaultValue: MISSING });
  return out === MISSING ? null : out;
}

export function localizeStateName({ countryName, countryIso, stateName, stateIso, t }) {
  if (!stateName && !stateIso) return "";

  const cKey = countryIso || getCountryIsoByName(countryName) || countryName || "default";
  const iso = stateIso || (cKey && /^[A-Z]{2}$/.test(String(cKey)) ? resolveStateIso(cKey, stateName) : "");

  // 1) intento: geo.states.{COUNTRY}.{STATE_ISO}
  if (iso) {
    const hit = tTry(t, `geo.states.${cKey}.${iso}`);
    if (hit) return hit;
  }

  // 2) fallback: geo.states.{COUNTRY}.{STATE_NAME}
  if (stateName) {
    return (t && t(`geo.states.${cKey}.${stateName}`, { defaultValue: stateName })) || stateName;
  }

  return String(stateIso || "");
}

export function localizeCityName({ countryName, countryIso, stateName, stateIso, cityName, t }) {
  if (!cityName) return "";

  const cKey = countryIso || getCountryIsoByName(countryName) || countryName || "default";
  const sKey = stateIso || stateName || "_";

  // 1) intento: geo.cities.{COUNTRY}.{STATE_ISO_OR_NAME}.{CITY_NAME}
  const hit = tTry(t, `geo.cities.${cKey}.${sKey}.${cityName}`);
  if (hit) return hit;

  // 2) fallback: cityName tal cual
  return cityName;
}

export function getCountryNameByIso(countryIso) {
  if (!countryIso) return "";
  const iso = String(countryIso).toUpperCase();
  const rec = ALL_COUNTRIES.find((c) => c.isoCode === iso);
  return rec?.name || "";
}

export function getDialCodeByCountryIso(countryIso) {
  if (!countryIso) return "";
  const iso = String(countryIso).toUpperCase();
  const rec = ALL_COUNTRIES.find((c) => c.isoCode === iso);
  return rec?.phonecode ? `+${rec.phonecode}` : "";
}

export function getLocalizedStates(countryIso, t) {
  if (!countryIso) return [];
  const iso = String(countryIso).toUpperCase();
  const list = CState.getStatesOfCountry(iso) || [];
  return list
    .map((s) => ({
      ...s,
      label: localizeStateName({ countryIso: iso, stateIso: s.isoCode, stateName: s.name, t }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getLocalizedCities(countryIso, stateIso, t) {
  if (!countryIso || !stateIso) return [];
  const cIso = String(countryIso).toUpperCase();
  const sIso = String(stateIso).toUpperCase();
  const list = CCity.getCitiesOfState(cIso, sIso) || [];
  return list
    .map((ct) => ({
      ...ct,
      label: localizeCityName({ countryIso: cIso, stateIso: sIso, cityName: ct.name, t }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

