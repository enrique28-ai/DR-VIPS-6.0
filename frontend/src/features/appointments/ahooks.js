import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/axios.js";
import toast from "react-hot-toast";
import i18n from "../../i18n";

const appointmentErrorKey = (code) => {
  const map = {
    APPOINTMENT_PATIENT_DECEASED: "calendar.errors.patientDeceased",
  };
  return map[code] || null;
};

const appointmentErrorMessage = (error, fallbackKey, { allowBackendMessage = false } = {}) => {
  const code = error?.response?.data?.errorCode;
  const key = appointmentErrorKey(code);
  if (key) return i18n.t(key);

  const backendMessage = error?.response?.data?.error;
  if (allowBackendMessage && backendMessage) return backendMessage;

  return i18n.t(fallbackKey);
};

export function useAppointments() {
  return useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data } = await api.get("/appointments");
      return data.map((appt) => ({
        ...appt,
        start: new Date(appt.start),
        end: new Date(appt.end),
        titleData: { doctor: appt.doctor, patient: appt.patient },
      }));
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    onError: (e) => {
      if (e?.response?.status !== 429) toast.error(i18n.t("calendar.toasts.loadFailed"));
    },
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post("/appointments", payload).then((r) => r.data),
    onSuccess: () => {
      toast.success(i18n.t("calendar.toasts.createSuccess"));
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e) =>
      toast.error(
        appointmentErrorMessage(e, "calendar.toasts.createFailed", {
          allowBackendMessage: true,
        })
      ),
  });
}

export function useAcceptAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.put(`/appointments/${id}/accept`).then((r) => r.data),
    onSuccess: () => {
      toast.success(i18n.t("calendar.toasts.acceptSuccess"));
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e) => toast.error(appointmentErrorMessage(e, "calendar.toasts.acceptFailed")),
  });
}

export function useRejectAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/appointments/${id}`).then((r) => r.data),
    onSuccess: () => {
      toast.success(i18n.t("calendar.toasts.deleteSuccess"));
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e) => toast.error(appointmentErrorMessage(e, "calendar.toasts.deleteFailed")),
  });
}
