import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/axios.js";
import { toast } from "react-hot-toast";
import i18n from "../../i18n"; 

const DIAGNOSIS_ERROR_TO_TOAST_KEY = {
  DIAGNOSIS_PATIENT_DECEASED: "diagnoses.toasts.patientDeceased",
};

const getDiagnosisErrorToastKey = (error, fallbackKey) => {
  const code = error?.response?.data?.errorCode;
  return DIAGNOSIS_ERROR_TO_TOAST_KEY[code] ?? fallbackKey;
};


// Normaliza los params para la query-string (texto y fecha)
export const buildDiagnosisParams = ({ q = "", hasMedicines = "All", hasTreatments = "All",  hasOperations = "All", date = "" , page = 1}) => ({
  q: q?.trim() || undefined,
  date: date || undefined, // YYYY-MM-DD
  hasMedicines: hasMedicines === "Yes" ? true : hasMedicines === "No"  ? false : undefined,
  hasTreatments: hasTreatments === "Yes" ? true : hasTreatments === "No" ? false : undefined,
  hasOperations: hasOperations === "Yes" ? true : hasOperations === "No" ? false : undefined,
  page,
});

// === READ ONE (detalle) ===
export function useDiagnosis(diagnosisId) {
  return useQuery({
    queryKey: ["diagnosis", diagnosisId],
    queryFn: async () => (await api.get(`/diagnoses/${diagnosisId}`)).data,
    enabled: !!diagnosisId,
    retry: false,
     onError: (e) => {
      const s = e?.response?.status;
      if (s !== 404 && s !== 429) toast.error(i18n.t("diagnoses.toasts.loadOneFailed"));
    },
    // no placeholder para evitar mostrar otro detalle por error
  });
}


// === LIST by PATIENT ===

/*export function useDiagnosesByPatient(patientId, params) {
  return useQuery({
    queryKey: ["diagnoses", patientId, params], // en phooks se incluye params en la key
    queryFn: async () =>
      (await api.get(`/diagnoses/patient/${patientId}`, { params })).data, // {items,total,page,pages}
    enabled: !!patientId,
    keepPreviousData: true,
    placeholderData: (prev) => prev,
    notifyOnChangeProps: ["data", "isFetching"], // igual que patients
    staleTime: 30_000,
   refetchOnWindowFocus: false,
   refetchOnReconnect: false,
   onError: (e) => {
      if (e?.response?.status !== 429) toast.error(i18n.t("diagnoses.toasts.loadFailed"));
    },

  });

}*/

// === LIST by PATIENT - ORIGINAL ===
export function useDiagnosesByPatient(patientId, params) {
  return useQuery({
    queryKey: ["diagnoses", patientId, params],
    queryFn: async () =>
      (await api.get(`/diagnoses/patient/${patientId}`, { params })).data,
    enabled: !!patientId,
    keepPreviousData: true,
    placeholderData: (prev) => prev,
    notifyOnChangeProps: ["data", "isFetching"],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    onError: (e) => {
      if (e?.response?.status !== 429) toast.error(i18n.t("diagnoses.toasts.loadFailed"));
    },
  });
}


// === CREATE ===

  export function useCreateDiagnosis(patientId) {
  const qc = useQueryClient();

  return useMutation({
    // POST /diagnoses  (el back espera { ...payload, patient })
    mutationFn: (payload) =>
      api.post(`/diagnoses`, { ...payload, patient: patientId }).then(r => r.data),

    // 1) Optimistic: inserta el nuevo item en TODAS las listas ["diagnoses", patientId, *]
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["diagnoses", patientId] });

      const optimistic = {
        _id: `tmp-${Date.now()}`,
        patient: patientId,
        title: payload.title ?? payload.diagnosis ?? i18n.t("diagnoses.card.newOptimistic"),
        description: payload.description ?? "",
        medicine: Array.isArray(payload.medicine) ? payload.medicine : [],
        treatment: Array.isArray(payload.treatment) ? payload.treatment : [],
        operation: Array.isArray(payload.operation) ? payload.operation : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        __optimistic: true,
      };

      // snapshot de todas las queries afectadas para rollback
      const snaps = qc.getQueriesData({ queryKey: ["diagnoses", patientId] });

      snaps.forEach(([key, prev]) => {
        if (!prev) return;
        const items = Array.isArray(prev.items) ? prev.items : [];
        const next = {
          ...prev,
          items: [optimistic, ...items],
          total: (prev.total ?? items.length) + 1,
        };
        qc.setQueryData(key, next);
      });

      return { snaps };
    },

    // 2) Si falla → rollback
    onError: (e, _vars, ctx) => {
      ctx?.snaps?.forEach(([key, prev]) => qc.setQueryData(key, prev));
       if (e?.response?.status !== 429) {
         toast.error(i18n.t(getDiagnosisErrorToastKey(e, "diagnoses.toasts.createFailed")));
       }
    },

    // 3) Si ok → sustituye el optimistic por el real
    onSuccess: (created) => {
      toast.success(i18n.t("diagnoses.toasts.createSuccess"));
      qc.setQueriesData({ queryKey: ["diagnoses", patientId], exact: false }, (prev) => {
        if (!prev) return prev;
        const items = Array.isArray(prev.items) ? prev.items : [];
        const nextItems = [created, ...items.filter(d => !d.__optimistic)];
        return { ...prev, items: nextItems };
      });
    },

    // 4) Revalida suave con el servidor
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["diagnoses", patientId], exact: false });
    },
  });
}

// === UPDATE ===
export function useUpdateDiagnosis(diagnosisId, patientId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.put(`/diagnoses/${diagnosisId}`, payload).then(r => r.data),
    onSuccess: () => {
      toast.success(i18n.t("diagnoses.toasts.updateSuccess"));
      qc.invalidateQueries({ queryKey: ["diagnosis", diagnosisId] });
      qc.invalidateQueries({ queryKey: ["diagnoses", patientId] });
    },
    onError: (e) => {
      const status = e?.response?.status;
      const code = e?.response?.data?.errorCode;

      if (status === 400 && code === "NO_CHANGES") {
        toast.error(i18n.t("diagnoses.toasts.noChanges"));
        return;
      }
      if (status !== 429) {
        toast.error(i18n.t(getDiagnosisErrorToastKey(e, "diagnoses.toasts.updateFailed")));
      }
    },
  });
}


export function useMyDiagnoses(params) {
  return useQuery({
    queryKey: ["my-diagnoses", params],
    queryFn: async () => (await api.get(`/diagnoses/mine`, { params })).data, // {items,total,page,pages}
    keepPreviousData: true,
    placeholderData: (prev) => prev,
    notifyOnChangeProps: ["data","isFetching"],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    onError: (e) => {
      if (e?.response?.status !== 429) toast.error(i18n.t("diagnoses.toasts.loadMineFailed"));
    },
  });
}

export function useMyDiagnosis(id) {
  return useQuery({
    queryKey: ["my-diagnosis", id],
    queryFn: async () => (await api.get(`/diagnoses/mine/${id}`)).data,
    enabled: !!id,
    retry: false,
    onError: (e) => {
      const s = e?.response?.status;
      if (s !== 404 && s !== 429) toast.error(i18n.t("diagnoses.toasts.loadMineFailed"));
    },
  });
}
export function useDiagnosisHistory(id, options = {}) {
  const enabled = options.enabled ?? !!id;

  return useQuery({
    queryKey: ["diagnosis-history", id],
    enabled: enabled && !!id,
    queryFn: async () => (await api.get(`/diagnoses/${id}/history`)).data,
    retry: false,
    staleTime: 30_000,
  });
}

// Traduce TODO el diagnóstico (detalle) bajo demanda
export function useTranslateDiagnosis() {
  return useMutation({
    mutationFn: async ({ id, lang }) =>
      (await api.get(`/diagnoses/${id}`, { params: { lang } })).data,
    onError: () => toast.error("Translation failed"),
  });
}


export function useTranslateDiagnosisHistorySnapshot() {
  return useMutation({
    mutationFn: async ({ diagnosisId, historyId, lang }) =>
      (await api.get(`/diagnoses/${diagnosisId}/history/${historyId}`, { params: { lang } })).data,
    onError: () => toast.error("Translation failed"),
  });
}

// === CHILDREN (PARENT PORTAL) ===
export function useMyChildDiagnoses(childId, params = {}, options = {}) {
  return useQuery({
    queryKey: ["child-diagnoses", childId, params],
    enabled: !!childId && (options.enabled ?? true),
    queryFn: async () => {
      const res = await api.get(`/diagnoses/children/${childId}/mine`, { params });
      return res.data;
    },
    retry: false,
    ...(options || {}),
  });
}

export function useMyChildDiagnosis(childId, diagnosisId, options = {}) {
  return useQuery({
    queryKey: ["child-diagnosis", childId, diagnosisId],
    enabled: !!childId && !!diagnosisId && (options.enabled ?? true),
    queryFn: async () => (await api.get(`/diagnoses/children/${childId}/mine/${diagnosisId}`)).data,
    retry: false,
    ...(options || {}),
  });
}

export function useTranslateMyChildDiagnosis() {
  return useMutation({
    mutationFn: async ({ childId, diagnosisId, lang }) =>
      (
        await api.get(`/diagnoses/children/${childId}/mine/${diagnosisId}`, {
          params: { lang },
        })
      ).data,
    onError: () => toast.error("Translation failed"),
  });
}

// === CHILD (MINORS): HISTORY ===
export function useMyChildDiagnosisHistory(childId, diagnosisId, options = {}) {
  const enabled = options.enabled ?? (!!childId && !!diagnosisId);

  return useQuery({
    queryKey: ["child-diagnosis-history", childId, diagnosisId],
    enabled: enabled && !!childId && !!diagnosisId,
    queryFn: async () =>
      (await api.get(`/diagnoses/children/${childId}/mine/${diagnosisId}/history`)).data,
    retry: false,
    staleTime: 30_000,
    ...(options || {}),
  });
}

export function useTranslateChildDiagnosisHistorySnapshot() {
  return useMutation({
    mutationFn: async ({ childId, diagnosisId, historyId, lang }) =>
      (
        await api.get(
          `/diagnoses/children/${childId}/mine/${diagnosisId}/history/${historyId}`,
          { params: { lang } }
        )
      ).data,
    onError: () => toast.error("Translation failed"),
  });
}


