import Patient from "../../models/Patient.js";
import PatientHistory from "../../models/PatientHistory.js";
import User from "../../models/User.js";
import {
  normalize,
  getLang,
  computeHealthSnapshotByEmail,
  normLower,
  minorQueryByBirthDateOrLegacy,
  minorKeyOf,
  buildHealthSnapshotFromPatients,
  sanitizeChildren,
} from "../../controllers/helpers/patienthelpers.js";
import { translateHealthSnapshot } from "../../utils/deeplTranslate.js";
import { hasChildDeathChange, snapshotSet } from "./patientHistorySnapshot.js";

export const getMyHealthInfoService = async ({ user, req }) => {
  if (user.role !== "patient") {
    const err = new Error("Insufficient role");
    err.status = 403;
    throw err;
  }

  const email = (user.email || "").toLowerCase().trim();
  if (!email) {
    const err = new Error("User has no email on file");
    err.status = 400;
    throw err;
  }

  const snapshotData = await computeHealthSnapshotByEmail(email);
  const { hasRecords } = snapshotData;
  let { snapshot, pats } = snapshotData;

  const deceased = pats.find((profile) => profile.isDeceased === true);
  const reviewProfile = deceased ?? pats[0];
  const unresolvedReviewId = reviewProfile?.approvedSnapshot?.unresolvedReviewId;
  const unresolved = unresolvedReviewId && await PatientHistory.findOne({
    _id: unresolvedReviewId,
    patientEmail: email,
    eventType: "unresolvedAtDeath",
  }).lean();
  const lang = getLang(req);

  if (deceased) {
    const approved = snapshotSet(deceased.approvedSnapshot);
    const proposal = snapshotSet(unresolved?.proposedSnapshot);
    const { snapshot: approvedView } = buildHealthSnapshotFromPatients([{
      ...approved,
      _id: deceased._id,
      updatedAt: deceased.approvedAt ?? deceased.updatedAt,
      isDeceased: true,
      dateOfDeath: deceased.dateOfDeath,
      causeOfDeath: deceased.causeOfDeath,
    }], email);
    approvedView.childrenReview = {
      approvedCount: Array.isArray(approved?.children) ? sanitizeChildren(approved.children).length : null,
      proposedCount: Array.isArray(proposal?.children) ? sanitizeChildren(proposal.children).length : null,
    };
    return {
      hasRecords,
      snapshot: lang ? await translateHealthSnapshot(approvedView, lang) : approvedView,
      pendingDecision: false,
      unresolvedAtDeath: Boolean(unresolved),
    };
  }

  const userDoc = await User.findById(user._id)
    .select("lastHealthDecisionAt")
    .lean();

  let pendingDecision = false;

  if (hasRecords && snapshot && Array.isArray(pats) && pats.length > 0) {
    const latestUpdate = pats[0]?.updatedAt
      ? new Date(pats[0].updatedAt).getTime()
      : NaN;

    const lastDecision = userDoc?.lastHealthDecisionAt
      ? new Date(userDoc.lastHealthDecisionAt).getTime()
      : NaN;

    if (!Number.isFinite(latestUpdate)) {
      pendingDecision = false;
    } else if (!Number.isFinite(lastDecision)) {
      pendingDecision = true;
    } else {
      pendingDecision = latestUpdate > lastDecision;
    }
  }

  if (pendingDecision && unresolved) {
    // A correction to living reopens the still-pending draft from its original profile.
    const sourceIndex = pats.findIndex((profile) => String(profile._id) === String(unresolved.approvedFromProfile));
    if (sourceIndex > 0) {
      pats = [pats[sourceIndex], ...pats.filter((_profile, index) => index !== sourceIndex)];
      const childrenReview = {
        ...snapshot.childrenReview,
        proposedCount: Array.isArray(pats[0].children) ? sanitizeChildren(pats[0].children).length : null,
      };
      snapshot = buildHealthSnapshotFromPatients(pats, email).snapshot;
      snapshot.childrenReview = childrenReview;
    }
  }

  if (snapshot?.sources) {
    snapshot.sources.forEach((source, index) => {
      const doctor = pats[index]?.createdBy;
      if (doctor) {
        source.doctorName = doctor.name;
        source.doctorEmail = doctor.email;
      }
    });
  }

  if (snapshot && pats.length > 1) {
    const [first, ...others] = pats.slice(1);
    const intersectOthers = (field) => {
      let common = normalize(first[field]);
      for (const profile of others) {
        const current = new Set(normalize(profile[field]));
        common = common.filter((entry) => current.has(entry));
      }
      return [...new Set(common)];
    };

    snapshot.commonDiseases = intersectOthers("diseases");
    snapshot.commonAllergies = intersectOthers("allergies");
    snapshot.commonMedications = intersectOthers("medications");
  }

  if (
    pendingDecision &&
    snapshot &&
    Array.isArray(pats) &&
    pats.length === 1 &&
    pats[0]?.approvedSnapshot
  ) {
    const latest = pats[0];

    const rawSnap = latest?.approvedSnapshot;
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
      attachPrev(snapshot.birthCountry, prev.birthCountry);
      attachPrev(snapshot.birthState, prev.birthState);
      attachPrev(snapshot.birthCity, prev.birthCity);
      attachPrev(snapshot.phone, prev.phone);
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

  const outSnapshot =
    lang && snapshot ? await translateHealthSnapshot(snapshot, lang) : snapshot;

  return { hasRecords, snapshot: outSnapshot, pendingDecision };
};

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
    const latest = list[0];
    const approved = snapshotSet(latest.approvedSnapshot);
    const confirmedDeath = approved?.isDeceased === true && !hasChildDeathChange(latest);
    const pendingDecision = !confirmedDeath && (
      !latest.approvedAt || new Date(latest.updatedAt) > new Date(latest.approvedAt)
    );
    const useConfirmedSnapshot = confirmedDeath || (latest.approvedSnapshot?.deathStatusOnly && !pendingDecision);
    const visibleProfiles = useConfirmedSnapshot ? list.map((profile) => ({
      fullname: profile.fullname,
      ...approved,
      _id: profile._id,
      createdBy: profile.createdBy,
      updatedAt: profile.updatedAt,
      approvedAt: profile.approvedAt,
    })) : list;
    const base = buildHealthSnapshotFromPatients(visibleProfiles, null);
    let snapshot = base.snapshot;

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
        const others = visibleProfiles.slice(1);
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
        attachPrev(snapshot.birthCountry, prev.birthCountry);
        attachPrev(snapshot.birthState, prev.birthState);
        attachPrev(snapshot.birthCity, prev.birthCity);
        attachPrev(snapshot.phone, prev.phone);
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
