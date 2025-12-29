import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/axios.js";
import { toast } from "react-hot-toast";
import i18n from "../../i18n"; 

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

export function useDiagnosesByPatient(patientId, params) {
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
       if (e?.response?.status !== 429) toast.error(i18n.t("diagnoses.toasts.createFailed"));
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
      if (e?.response?.status !== 429) toast.error(i18n.t("diagnoses.toasts.updateFailed"));
    },
  });
}

// === DELETE (idéntico al patrón de patients) ===
export function useDeleteDiagnosis() {
  const qc = useQueryClient();

  return useMutation({
    // Recibe { id, patientId } desde DiagnosisDetailPage
    mutationFn: async ({ id }) => {
      await api.delete(`/diagnoses/${id}`); // 204
      return id;
    },

    onMutate: async ({ id, patientId }) => {
      // 1) Detén cualquier refetch del detalle y de listas
      await qc.cancelQueries({ queryKey: ["diagnosis", id] });
      await qc.cancelQueries({ queryKey: ["diagnoses"] });

      // 2) Guarda y elimina el detalle del caché (para que no se vuelva a pintar)
      //const prevDetail = qc.getQueryData(["diagnosis", id]);
      //qc.removeQueries({ queryKey: ["diagnosis", id] });

      // 3) Optimista: quita el diagnóstico de TODAS las listas del mismo patientId
      const rollbacks = [];
      const snaps = qc.getQueriesData({ queryKey: ["diagnoses"] });
      snaps.forEach(([key, data]) => {
        const k1 = key?.[1];
        const keyPid = typeof k1 === "object" && k1 ? k1.patientId : k1;
        if (keyPid !== patientId) return;
        if (!data?.items) return;

        const prev = data;
        const next = { ...data, items: data.items.filter(d => d._id !== id) };
        qc.setQueryData(key, next);
        rollbacks.push(() => qc.setQueryData(key, prev));
      });

      // rollback por si falla la mutación
      //return () => {
        //if (prevDetail) qc.setQueryData(["diagnosis", id], prevDetail);
        //rollbacks.forEach(rb => rb());
      //};

      return () => rollbacks.forEach(rb => rb());
    },
 

    onError: (e, _vars, rollback) => {
      rollback?.();
      if (e?.response?.status !== 429) toast.error(i18n.t("diagnoses.toasts.deleteFailed"));
    },

    onSuccess: (_res, { patientId, id }) => {
      toast.success(i18n.t("diagnoses.toasts.deleteSuccess"));
      // 4) Confirma con el server las listas de ese paciente
      qc.removeQueries({ queryKey: ["diagnosis", id] });
      qc.invalidateQueries({ queryKey: ["diagnoses", patientId] });
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

