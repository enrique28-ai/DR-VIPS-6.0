import Patient from "../../models/Patient.js";
import {
  normLower,
  minorQueryByBirthDateOrLegacy,
  minorKeyOf,
  buildHealthSnapshotFromPatients,
  normalize,
  getLang,
} from "../../controllers/helpers/patienthelpers.js";
import { translateHealthSnapshot } from "../../utils/deeplTranslate.js";

export const getMyChildrenHealthInfoService = async ({ user, req }) => {
  if (user.role !== "patient") {
    const err = new Error("Insufficient role");
    err.status = 403;
    throw err;
  }

  const parentEmail = normLower(user.email);
  if (!parentEmail) return [];

  const all = await Patient.find({
    parentEmail,
    ...minorQueryByBirthDateOrLegacy(new Date(), { includeDeceased: true }),
  })
    .sort({ updatedAt: -1 })
    .populate("createdBy", "name email role")
    .lean({ virtuals: true });

  if (!all.length) return [];

  const groups = new Map();
  for (const p of all) {
    const key = p.minorKey || minorKeyOf(parentEmail, p.fullname);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const lang = getLang(req);
  const results = [];

  for (const [key, list] of groups.entries()) {
    const base = buildHealthSnapshotFromPatients(list, null);
    let snapshot = base.snapshot;
    const latest = list[0];

    const pendingDecision =
      !latest.approvedAt ||
      new Date(latest.updatedAt).getTime() > new Date(latest.approvedAt).getTime();

    if (snapshot && snapshot.sources && Array.isArray(snapshot.sources)) {
      snapshot.sources.forEach((source, index) => {
        const p = list[index];
        if (p && p.createdBy) {
          source.doctorName = p.createdBy.name;
          source.doctorEmail = p.createdBy.email;
        }
      });
    }

    if (snapshot && list.length > 1) {
      const intersectOthers = (field) => {
        const others = list.slice(1);
        if (!others.length) return [];

        let baseSet = new Set(normalize(others[0][field]));
        for (let i = 1; i < others.length; i++) {
          const current = new Set(normalize(others[i][field]));
          baseSet = new Set([...baseSet].filter((x) => current.has(x)));
        }
        return Array.from(baseSet);
      };

      snapshot.commonDiseases = intersectOthers("diseases");
      snapshot.commonAllergies = intersectOthers("allergies");
      snapshot.commonMedications = intersectOthers("medications");
    }

    if (pendingDecision && snapshot && list.length === 1 && latest.approvedSnapshot) {
      const rawSnap = latest.approvedSnapshot;
      const prev =
        rawSnap && typeof rawSnap === "object"
          ? rawSnap.set && typeof rawSnap.set === "object"
            ? rawSnap.set
            : rawSnap
          : null;

      const norm = (v) => (v === undefined ? null : v);

      const attachPrev = (w, prevVal) => {
        if (!w || typeof w !== "object" || !("value" in w)) return;
        const cur = norm(w.value);
        const pv = norm(prevVal);
        if (cur === pv) return;
        w.alternatives = [cur, pv];
        w.changed = true;
        w.conflict = false;
      };

      const setArrayBaseline = (field, combinedKey, commonKey, changedKey) => {
        const cur = normalize(snapshot[field]);
        const prevArr = normalize(prev?.[field]);
        if (!prevArr.length && !cur.length) return;

        const s1 = [...cur].sort().join("||");
        const s2 = [...prevArr].sort().join("||");
        if (s1 === s2) return;

        snapshot[commonKey] = prevArr;
        snapshot[combinedKey] = Array.from(new Set([...cur, ...prevArr]));
        snapshot[changedKey] = true;
      };

      setArrayBaseline("diseases", "diseasesCombined", "commonDiseases", "diseasesChanged");
      setArrayBaseline("allergies", "allergiesCombined", "commonAllergies", "allergiesChanged");
      setArrayBaseline("medications", "medicationsCombined", "commonMedications", "medicationsChanged");

      if (prev && typeof prev === "object") {
        if (!snapshot.fullnameWrapper || typeof snapshot.fullnameWrapper !== "object") {
          snapshot.fullnameWrapper = { value: snapshot.fullname ?? null, conflict: false };
        }
        if (!("value" in snapshot.fullnameWrapper)) {
          snapshot.fullnameWrapper.value = snapshot.fullname ?? null;
        }

        attachPrev(snapshot.fullnameWrapper, prev.fullname);
        attachPrev(snapshot.age, prev.age);
        attachPrev(snapshot.gender, prev.gender);
        attachPrev(snapshot.bloodtype, prev.bloodtype);
        attachPrev(snapshot.organDonor, prev.organDonor);
        attachPrev(snapshot.bloodDonor, prev.bloodDonor);
        attachPrev(snapshot.country, prev.country);
        attachPrev(snapshot.state, prev.state);
        attachPrev(snapshot.city, prev.city);
        attachPrev(snapshot.status, prev.isDeceased);

        if (!snapshot.measurementSystemWrapper || typeof snapshot.measurementSystemWrapper !== "object") {
          snapshot.measurementSystemWrapper = {
            value: snapshot.measurementSystem ?? null,
            conflict: false,
            alternatives: [snapshot.measurementSystem ?? null],
          };
        }

        attachPrev(snapshot.measurementSystemWrapper, prev.measurementSystem);
        attachPrev(snapshot.heightWrapper, prev.heightM);
        attachPrev(snapshot.weightWrapper, prev.weightKg);
        attachPrev(snapshot.bmiWrapper, prev.bmi);
        snapshot.approvedBaselineAt = latest.approvedAt || null;
      }
    }

    if (lang && snapshot) {
      snapshot = await translateHealthSnapshot(snapshot, lang);
    }

    results.push({
      childKey: key,
      profileId: latest._id.toString(),
      parentEmail,
      pendingDecision,
      hasRecords: base.hasRecords,
      snapshot,
    });
  }

  return results;
};