import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/axios.js";
import { toast } from "react-hot-toast";
import i18n from "../../i18n";

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
export function usePatients(params) {
  return useQuery({
    queryKey: ["patients", params],
    queryFn: async () => (await api.get("/patients", { params })).data, // { items,total,page,pages }
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

      if (status === 409) {
        // Mensaje del backend: paciente tiene versión pendiente en el portal
        toast.error(i18n.t("patients.toasts.conflictPendingPortal"));
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
      

      if (status === 409) {
        toast.error(i18n.t("patients.toasts.conflictPendingPortal")); // "This patient has a pending profile..." etc.
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


export function useDeletePatient() {
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
}

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


