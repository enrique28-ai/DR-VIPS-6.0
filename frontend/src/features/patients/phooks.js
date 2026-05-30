import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/axios.js";
import { toast } from "react-hot-toast";
import i18n from "../../i18n";


const patientErrorKey = (code) => {
  const map = {
    // Minors / Parents
    PARENT_EMAIL_REQUIRED: "patients.errors.parentEmailRequired",
    PARENT_NOT_FOUND: "patients.errors.parentNotFound",
    PARENT_NOT_ADULT: "patients.errors.parentNotAdult",
    MINOR_NOT_LISTED: "patients.errors.minorNotListed",
    MINOR_CANNOT_DECLARE_CHILDREN: "patients.errors.minorCannotDeclareChildren",
    MINOR_FULLNAME_IMMUTABLE: "patients.errors.minorFullnameImmutable",
    PARENT_EMAIL_NOT_ALLOWED: "patients.errors.parentEmailNotAllowed",
    CHILD_NAME_ALREADY_EXISTS: "patients.errors.childNameAlreadyExists",

    // Children (Adults)
    CHILDREN_COUNT_REQUIRED: "patients.errors.childrenCountRequired",
    CHILDREN_COUNT_INVALID: "patients.errors.childrenCountInvalid",
    CHILDREN_COUNT_MISMATCH: "patients.errors.childrenCountMismatch",
    PENDING_GUARDIAN_DECISION: "patients.errors.pendingGuardianDecision",
    PATIENT_DECEASED_READONLY: "patients.errors.patientDeceasedReadonly",
    DEATH_STATUS_UPDATE_ONLY: "patients.errors.deathStatusUpdateOnly",
  };
  return map[code] || null;
};
// Build a stable params object (omit "All"/empty so cache keys are clean)
export const buildPatientParams = ({ q = "", category = "All", bloodtype = "All", gender = "All", organDonor = "All", bloodDonor = "All",
   bmiCategory = "All", status = "All", country = "All", hasDiseases = "All", hasAllergies = "All", hasMedications = "All", page = 1 }) => ({
  q: q?.trim() || undefined,
  category: category !== "All" ? category : undefined,
  bloodtype: bloodtype !== "All" ? bloodtype : undefined,
  gender: gender !== "All" ? gender.toLowerCase() : undefined, // → male|female
  organDonor: organDonor === "Yes" ? true : organDonor === "No" ? false : undefined,
  bloodDonor: bloodDonor === "Yes" ? true : bloodDonor === "No" ? false : undefined,
  bmiCategory: (["Underweight","Healthy","Overweight"].includes(bmiCategory) ? bmiCategory.toLowerCase() : undefined),
  deceased: status === "Deceased" ? true : status === "Alive" ? false : undefined,
  country: country !== "All" ? country : undefined,
  hasDiseases: hasDiseases === "Yes" ? true : hasDiseases === "No" ? false : undefined,
  hasAllergies: hasAllergies === "Yes" ? true : hasAllergies === "No" ? false : undefined,
  hasMedications: hasMedications === "Yes" ? true : hasMedications === "No" ? false : undefined,
  page,
});

// Query: list
export function usePatients(params, options = {}) {
  return useQuery({
    queryKey: ["patients", params],
    queryFn: async () => (await api.get("/patients", { params })).data, // { items,total,page,pages }
    enabled: options.enabled ?? true,
    keepPreviousData: true,
    placeholderData: (prev) => prev,         // conserva la data anterior mientras llega la nueva
    notifyOnChangeProps: ["data", "isFetching"],
    staleTime: 30_000,                       // evita refetches seguidos y parpadeos
    refetchOnWindowFocus: false,             // no revalidar al cambiar de pestaña
    refetchOnReconnect: false,
    onError: (e) =>{
      if (e?.response?.status !== 429) toast.error(i18n.t("patients.toasts.loadFailed"));
    }
  });
}

// Query: one
export function usePatient(id) {
  return useQuery({
    queryKey: ["patient", id],
    queryFn: async () => (await api.get(`/patients/${id}`)).data,
    enabled: !!id,
    retry: false,
    onError: (e) => {
    const s = e?.response?.status;
    if (s !== 404 && s !== 429) toast.error(i18n.t("patients.toasts.loadOneFailed"));
  },
  });
}

// Mutations
export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post("/patients", payload).then(r => r.data),
    onSuccess: (created) => {
      toast.success(i18n.t("patients.toasts.createSuccess"));
     // opcional: cachea el detalle
     qc.setQueryData(["patient", created._id], created);

     // siembra el nuevo paciente en las listas relevantes (sin filtros, page 1)
     const snaps = qc.getQueriesData({ queryKey: ["patients"] });
     snaps.forEach(([key, data]) => {
       const params = key?.[1] || {};
       const isDefault =
         !params.q && !params.category && !params.bloodtype && (params.page ?? 1) === 1;
       if (!isDefault) return;

       const prevItems = data?.items ?? [];
       if (prevItems.some(p => p._id === created._id)) return;
       const next = { ...(data || {}), items: [created, ...prevItems] };
       qc.setQueryData(key, next);
     });

     // revalida en background (suave, sin parpadeo)
     setTimeout(() => {
       qc.invalidateQueries({ queryKey: ["patients"] });
     }, 100);
   },
    onError: (e) => {
      const status = e?.response?.status;
      const code = e?.response?.data?.errorCode;

      if (status === 409) {
        if (code === "PATIENT_EMAIL_EXISTS") {
          toast.error(i18n.t("patients.toasts.conflictEmailExists"));
          return;
        }
        if (code === "PATIENT_PHONE_EXISTS") {
          toast.error(i18n.t("patients.toasts.conflictPhoneExists", "A patient with this phone already exists."));
          return;
        }
        // Mensaje del backend: paciente tiene versión pendiente en el portal
        toast.error(i18n.t("patients.toasts.conflictPendingPortal"));
        return;
      }

       const key = patientErrorKey(code);
  if ((status === 400 || status === 403) && key) {
    toast.error(i18n.t(key));
    return;
  }

      if (status !== 429) {
        toast.error(i18n.t("patients.toasts.createFailed"));
      }
  },

  });
}

export function useUpdatePatient(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.put(`/patients/${id}`, payload).then(r => r.data),
     onMutate: async (payload) => {
      // 1) Detalle
      const prevDetail = qc.getQueryData(["patient", id]);
      qc.setQueryData(["patient", id], (old) =>
        old
          ? {
              ...old,
              ...(payload.isDeceased !== undefined ? { isDeceased: !!payload.isDeceased } : {}),
              ...(payload.causeOfDeath !== undefined ? { causeOfDeath: payload.causeOfDeath } : {}),
            }
          : old
      );

      // 2) Listas
      const snaps = qc.getQueriesData({ queryKey: ["patients"] });
      const rollbacks = snaps.map(([key, data]) => {
        if (!data?.items) return () => {};
        const params = key?.[1] || {};
        const wants = params.deceased; // true=Deceased, false=Alive, undefined=All
        const items = data.items.slice();
        const idx = items.findIndex((x) => x._id === id);
        if (idx === -1) return () => {};

        const nextIsDeceased =
          payload.isDeceased != null ? !!payload.isDeceased : !!items[idx].isDeceased;
        const nextCause =
          payload.causeOfDeath != null ? payload.causeOfDeath : items[idx].causeOfDeath;

        let nextItems;
        if (wants === true && !nextIsDeceased)      nextItems = items.filter((x) => x._id !== id);
        else if (wants === false && nextIsDeceased) nextItems = items.filter((x) => x._id !== id);
        else {
          nextItems = items;
          nextItems[idx] = { ...items[idx], isDeceased: nextIsDeceased, causeOfDeath: nextCause };
        }
        const prev = data;
        qc.setQueryData(key, { ...data, items: nextItems });
        return () => qc.setQueryData(key, prev);
      });

      // rollback
      return () => {
        qc.setQueryData(["patient", id], prevDetail);
        rollbacks.forEach((rb) => rb());
      };
    },
    onError: (e, _vars, rollback) => {
      rollback?.();

      const status = e?.response?.status;
      const code = e?.response?.data?.errorCode;
      const backendMsg = e?.response?.data?.error;

  // ✅ No permitir "guardar" si no hubo cambios reales
  if (status === 400 && code === "NO_CHANGES") {
    toast.error(
      i18n.t("patients.toasts.noChanges") ||
        backendMsg ||
        "No changes detected. Please modify at least one field before saving."
    );
    return;
  }

  if (status === 409 && code === "PATIENT_EMAIL_EXISTS") {
    toast.error(i18n.t("patients.toasts.conflictEmailExists"));
    return;
  }

  if (status === 409 && code === "PATIENT_PHONE_EXISTS") {
    toast.error(
      i18n.t(
        "patients.toasts.conflictPhoneExists",
        "A patient with this phone already exists."
      )
    );
    return;
  }
      

      const key = patientErrorKey(code);
      if ((status === 400 || status === 403 || status === 409) && key) {
        toast.error(i18n.t(key));
        return;
      }

      if (status === 409) {
        toast.error(i18n.t("patients.toasts.conflictPendingPortal"));
        return;
      }

      if (status !== 429) {
        toast.error(i18n.t("patients.toasts.updateFailed"));
      }
    },

    onSuccess: (updated) => {
      toast.success(i18n.t("patients.toasts.updateSuccess"));
      // asegura caches con la versión del server
      qc.setQueryData(["patient", id], updated);
      const snaps = qc.getQueriesData({ queryKey: ["patients"] });
      snaps.forEach(([key, data]) => {
        if (!data?.items) return;
        const params = key?.[1] || {};
        const wants = params.deceased;
        const idx = data.items.findIndex((x) => x._id === updated._id);
        if (idx === -1) return;
        let items = data.items.slice();
        if (wants === true && !updated.isDeceased)      items = items.filter(x => x._id !== updated._id);
        else if (wants === false && updated.isDeceased) items = items.filter(x => x._id !== updated._id);
        else items[idx] = updated;
        qc.setQueryData(key, { ...data, items });
      });
      // Revalida suave, en segundo plano
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["patients"], refetchType: "inactive" });
      }, 150);
    },
   });
 }


/*export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/patients/${id}`), // 204
    // optimistic remove from any cached list
    onMutate: async (id) => {
      const snaps = qc.getQueriesData({ queryKey: ["patients"] });
      const rollbacks = snaps.map(([key, data]) => {
        if (!data?.items) return () => {};
        const prev = data;
        const next = { ...data, items: data.items.filter(x => x._id !== id) };
        qc.setQueryData(key, next);
        return () => qc.setQueryData(key, prev);
      });
      return () => rollbacks.forEach(rb => rb());
    },
    onError: (e, _id, rollback) =>{
      rollback?.();
      if (e?.response?.status !== 429) toast.error(i18n.t("patients.toasts.deleteFailed"));
    },
    onSuccess: (_res, id) => {
      toast.success(i18n.t("patients.toasts.deleteSuccess"));
     // limpia el detalle si estaba en caché; la lista ya quedó sin el item (optimista)
     qc.removeQueries({ queryKey: ["patient", id] });
     // ✅ Revalida listas para confirmar con el servidor
     qc.invalidateQueries({ queryKey: ["patients"] });
     //setTimeout(() => qc.invalidateQueries({ queryKey: ["patients"] }), 300);
   },
  });
}*/

// === Patient portal: aggregated health info for the logged-in patient ===
export function useMyHealthInfo() {
  return useQuery({
    queryKey: ["myHealthInfo"],
    queryFn: async () => {
      const res = await api.get("/patients/me/health-info");
      return res.data; // { hasRecords, snapshot }
    },
    retry: false,
  });
}

export function useApprovePatientProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profileId) => {
      const res = await api.post(
        `/patients/me/health-info/approve/${profileId}`
      );
      return res.data; // { ok, hasRecords, snapshot }
    },
    onSuccess: (data) => {
      qc.setQueryData(["myHealthInfo"], data);
      qc.invalidateQueries({ queryKey: ["my-history"] });
       toast.success(i18n.t("patients.toasts.approveHealthInfoSuccess"));
    },
    onError: () => {
       toast.error(i18n.t("patients.toasts.approveHealthInfoFailed"));
    },
  });
}

export function useRejectPatientProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profileId) => {
      const res = await api.post(
        `/patients/me/health-info/reject/${profileId}`
      );
      return res.data; // { ok, hasRecords, snapshot, pendingDecision }
    },
    onSuccess: (data) => {
      qc.setQueryData(["myHealthInfo"], data);
       
      // SI YA NO HAY REGISTROS EN EL PORTAL (caso 1):
  if (data?.hasRecords === false) {
    // Dejamos TODAS las queries ["my-diagnoses", *] con lista vacía
    qc.setQueriesData(
      { queryKey: ["my-diagnoses"], exact: false },
      (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: [],
          total: 0,
          page: 1,
          pages: 1,
        };
      }
    );
  }

  // En todos los casos: limpiamos detalles e invalidamos para que revaliden suave
      qc.removeQueries({ queryKey: ["my-diagnosis"], exact: false });   // detalles
      qc.invalidateQueries({ queryKey: ["my-diagnoses"], exact: false }); // listas
       toast.success(i18n.t("patients.toasts.rejectHealthInfoSuccess"));
    },
    onError: () => {
      toast.error(i18n.t("patients.toasts.rejectHealthInfoFailed"));
    },
  });
}

// 1) Buscar globalmente
export function useSearchGlobalPatients(term, options = {}) {
  const enabled = options.enabled ?? true;
  const q = (term || "").trim();

  return useQuery({
    queryKey: ["patients-global-search", q],
    enabled: enabled && q.length >= 3,
    queryFn: async () => {
      const res = await api.get("/patients/global-search", { params: { q } });
      return res.data;
    },
    staleTime: 30_000,
    retry: false,
  });
}

// 2) Preview global (solo lectura)
export function useGlobalPatient(id, options = {}) {
  const enabled = options.enabled ?? true;

  return useQuery({
    queryKey: ["patient-global", id],
    enabled: enabled && !!id,
    queryFn: async () => (await api.get(`/patients/global/${id}`)).data,
    staleTime: 30_000,
    retry: false,
    onError: (e) => {
      if (e?.response?.status !== 404) {
        toast.error(i18n.t("patients.toasts.loadOneFailed") || "Failed to load patient");
      }
    },
  });
}


// 3) Importar paciente (me agrega a owners)
export function useImportPatient() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id) => (await api.post(`/patients/import/${id}`)).data,

    // 👇 IMPORTANTE: aquí recibes el id importado como 2do parámetro (variables)
    onSuccess: (data, importedId) => {
      toast.success(i18n.t("patients.toasts.importSuccess") || "Patient imported");

      const imported = data?.patient;

      // Si por alguna razón el back no devolvió el paciente
      if (!imported?._id) {
        qc.invalidateQueries({ queryKey: ["patients"] });
        qc.invalidateQueries({ queryKey: ["patients-global-search"], exact: false });
        return;
      }

      // ✅ 1) Quitar inmediatamente al paciente de TODAS las caches de búsquedas globales
      // Tus queryKeys son: ["patients-global-search", q]
      qc.setQueriesData(
        { queryKey: ["patients-global-search"], exact: false },
        (old) => {
          if (!Array.isArray(old)) return old;
          return old.filter((p) => p?._id !== imported._id);
        }
      );

      // ✅ 2) Invalidar búsquedas globales para confirmar con server (background)
      qc.invalidateQueries({ queryKey: ["patients-global-search"], exact: false });

      // ✅ 3) Marcar el preview global como "ya soy owner" (por si vuelves al detail global)
      qc.setQueryData(["patient-global", importedId], (old) =>
        old && typeof old === "object"
          ? { ...old, amIOwner: true }
          : { ...imported, amIOwner: true }
      );

      // ✅ 4) Cachear el detalle normal
      qc.setQueryData(["patient", imported._id], imported);

      // ✅ 5) Opcional pero recomendado: sembrar la lista default (page 1 sin filtros)
      // para que se vea instantáneo al volver a /patients
      const defaultKey = ["patients", buildPatientParams({ page: 1 })];
      qc.setQueryData(defaultKey, (prev) => {
        const prevItems = prev?.items ?? [];
        if (prevItems.some((p) => p._id === imported._id)) return prev;

        return {
          ...(prev || { items: [], total: 0, page: 1, pages: 1 }),
          items: [imported, ...prevItems],
          total: (prev?.total ?? prevItems.length) + 1,
          page: prev?.page ?? 1,
          pages: prev?.pages ?? 1,
        };
      });

      // ✅ 6) Revalidar mis pacientes (background)
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["patients"] });
      }, 150);
    },

    onError: () => {
      toast.error(i18n.t("patients.toasts.importFailed") || "Failed to import patient");
    },
  });
}

// ✅ History (Doctor): /patients/:id/history
export function usePatientHistory(id, options = {}) {
  const enabled = options.enabled ?? true;

  return useQuery({
    queryKey: ["patient-history", id],
    enabled: enabled && !!id,
    queryFn: async () => (await api.get(`/patients/${id}/history`)).data,
    retry: false,
    staleTime: 30_000,
    onError: (e) => {
      console.error("usePatientHistory error:", e);
    },
  });
}

// ✅ History (Patient): /patients/me/history
export function useMyHistory(options = {}) {
  const enabled = options.enabled ?? true;

  return useQuery({
    queryKey: ["my-history"],
    enabled,
    queryFn: async () => (await api.get(`/patients/me/history`)).data,
    retry: false,
    staleTime: 30_000,
    onError: (e) => {
      console.error("useMyHistory error:", e);
    },
  });
}

export function useTranslatePatient() {
  return useMutation({
    mutationFn: async ({ id, lang }) =>
      (await api.get(`/patients/${id}`, { params: { lang } })).data,
    onError: () => toast.error("Translation failed"),
  });
}

// ✅ Traduce SOLO 1 item del historial (barato)
export function useTranslatePatientHistorySnapshot() {
  return useMutation({
    mutationFn: async ({ variant, patientId, historyId, lang }) => {
      const url =
        variant === "doctor"
          ? `/patients/${patientId}/history/${historyId}`
          : variant === "child"
          ? `/patients/me/children/${patientId}/history/${historyId}`
          : `/patients/me/history/${historyId}`;

      return (await api.get(url, { params: { lang } })).data;
    },
    onError: () => toast.error("Translation failed"),
  });
}
export function useTranslateMyHealthInfo() {
  return useMutation({
    mutationFn: async ({ lang }) =>
      (await api.get("/patients/me/health-info", { params: { lang } })).data,
    onError: () => toast.error("Translation failed"),
  });
}
export function useTranslateMyChildrenHealthInfo() {
  return useMutation({
    mutationFn: async ({ lang }) =>
      (await api.get("/patients/me/children/health-info", { params: { lang } })).data,
    onError: () => toast.error("Translation failed"),
  });
}


// === PARENT/TUTOR: CHILDREN HEALTH INFO (MINORS) ===
export function useMyChildrenHealthInfo(lang) {
  return useQuery({
    queryKey: ["my-children-health-info", lang],
    queryFn: async () => {
      const q = lang ? `?lang=${lang}` : "";
      return (await api.get(`/patients/me/children/health-info${q}`)).data;
    },
    retry: false,
    refetchOnWindowFocus: false,
    onError: (e) => {
      if (e?.response?.status !== 429) toast.error(i18n.t("myChildren.toasts.loadFailed"));
    },
  });
}

// Nota: aquí el parámetro debe ser un Patient _id (profileId), no childKey.
export function useApproveChildProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profileId) =>
      (await api.post(`/patients/me/children/health-info/approve/${profileId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-children-health-info"] });
      qc.invalidateQueries({ queryKey: ["child-history"] });
      toast.success(i18n.t("myChildren.toasts.approveOk"));
    },
    onError: () => {
      toast.error(i18n.t("myChildren.toasts.approveFail"));
    },
  });
}

export function useRejectChildProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profileId) =>
      (await api.post(`/patients/me/children/health-info/reject/${profileId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-children-health-info"] });
      qc.invalidateQueries({ queryKey: ["child-history"] });
      toast.success(i18n.t("myChildren.toasts.rejectOk"));
    },
    onError: () => {
      toast.error(i18n.t("myChildren.toasts.rejectFail"));
    },
  });
}

// Nota: childId aquí también es un Patient _id (cualquier doc del grupo sirve)
export function useChildHistory(childId, options = {}) {
  return useQuery({
    queryKey: ["child-history", childId],
    enabled: !!childId && (options.enabled ?? true),
    queryFn: async () => (await api.get(`/patients/me/children/${childId}/history`)).data,
    retry: false,
    refetchOnWindowFocus: false,
    ...(options || {}),
  });
}

