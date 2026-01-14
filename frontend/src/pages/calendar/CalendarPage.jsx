import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import "react-big-calendar/lib/css/react-big-calendar.css";

// Componentes
import LocalizedDatePicker from "../../components/forms/LocalizedDatePicker.jsx";
import Button from "../../components/forms/Button.jsx";
import Input from "../../components/forms/Input.jsx";
import AppointmentActionModal from "../../components/calendar/AppointmentActionModal.jsx";

import toast from "react-hot-toast";
import enUS from "date-fns/locale/en-US";
import es from "date-fns/locale/es";

import { useTranslation } from "react-i18next"; 
import { useAuthStore } from "../../stores/authStore.js";
import { usePatients, buildPatientParams } from "../../features/patients/phooks.js";
import {
  useAppointments,
  useCreateAppointment,
  useAcceptAppointment,
  useRejectAppointment,
} from "../../features/appointments/ahooks.js";

export default function CalendarPage() {
  const { user } = useAuthStore();
  const isDoctor = user?.role === "doctor";
  const { t, i18n } = useTranslation(); 
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState("month");

  const lang = (i18n.language || "en").toLowerCase();
  const culture = lang.startsWith("es") ? "es" : "en-US";

  const localizer = useMemo(() => {
    const locales = { "en-US": enUS, es };
    return dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });
  }, []);

  const rbcMessages = useMemo(() => ({
    today: t("calendar.rbc.today", "Today"),
    previous: t("calendar.rbc.previous", "Back"),
    next: t("calendar.rbc.next", "Next"),
    month: t("calendar.rbc.month", "Month"),
    week: t("calendar.rbc.week", "Week"),
    day: t("calendar.rbc.day", "Day"),
    agenda: t("calendar.rbc.agenda", "Agenda"),
    date: t("calendar.rbc.date", "Date"),
    time: t("calendar.rbc.time", "Time"),
    event: t("calendar.rbc.event", "Event"),
    noEventsInRange: t("calendar.rbc.noEventsInRange", "No events in this range"),
  }), [t]);

  const { data: appointments = [], isLoading } = useAppointments();
  const createMutation = useCreateAppointment();
  const acceptMutation = useAcceptAppointment();
  const rejectMutation = useRejectAppointment();

  const patientsParams = buildPatientParams({ page: 1, status: "Alive" });
  const { data: patientData } = usePatients(patientsParams, { enabled: isDoctor });

  // --- FORM ---
  const [selectedPatient, setSelectedPatient] = useState("");
  const [startDate, setStartDate] = useState(null);
  
  // endDate para rango personalizado
  const [endDate, setEndDate] = useState(null);
  
  // Default 1h pero editable
  const [duration, setDuration] = useState("60");
  const [endAuto, setEndAuto] = useState(true); // Flag para saber si calculamos end automático

  const [reason, setReason] = useState("");

  // --- MODAL ---
  const [apptModal, setApptModal] = useState({
    open: false,
    mode: null, 
    event: null,
  });

  const closeApptModal = () => setApptModal({ open: false, mode: null, event: null });
  const openPendingModal = (event) => setApptModal({ open: true, mode: "pending", event });
  const openCancelModal = (event) => setApptModal({ open: true, mode: "cancel", event });

  const onNavigate = (newDate) => setCurrentDate(newDate);
  const onView = (newView) => setCurrentView(newView);

  // Helper para calcular fecha fin automática
  const applyDefaultEnd = (start, minutes) => {
    if (!start) return null;
    const mins = Number.isFinite(minutes) ? minutes : 60;
    return new Date(start.getTime() + mins * 60000);
  };

  const handleStartChange = (d) => {
    setStartDate(d);
    if (!d) {
      setEndDate(null);
      return;
    }
    // Si cambia start, reseteamos end al default (según duración actual)
    const mins = parseInt(duration, 10) || 60;
    setEndDate(applyDefaultEnd(d, mins));
    setEndAuto(true);
  };

  const handleEndChange = (d) => {
    setEndDate(d);
    setEndAuto(false); // El usuario tocó manualmente el fin, ya no es automático
  };

  // ✅ CORRECCIÓN FINAL: Prioridad al Dropdown
  const handleDurationChange = (e) => {
    const val = e.target.value;
    setDuration(val);
    
    // Si hay fecha de inicio, SIEMPRE recalculamos la fecha fin al cambiar el dropdown.
    // Ignoramos el estado anterior de 'endAuto' para dar prioridad a esta acción.
    if (startDate) {
      const mins = parseInt(val, 10) || 60;
      setEndDate(applyDefaultEnd(startDate, mins));
      setEndAuto(true); // Volvemos a marcarlo como automático
    }
  };

  // VALIDACIÓN LOCAL ANTI-OVERLAP
  const hasOverlapLocal = (start, end) => {
    return appointments.some((appt) => {
      if (!appt) return false;
      // Solo nos importan citas activas (pending o accepted)
      if (!["pending", "accepted"].includes(appt.status)) return false;

      const existingStart = new Date(appt.start);
      const existingEnd = new Date(appt.end);

      // Lógica de colisión: (NuevoInicio < ViejoFin) Y (NuevoFin > ViejoInicio)
      return (start < existingEnd && end > existingStart);
    });
  };

  const handleCreate = (e) => {
    e.preventDefault();

    if (!selectedPatient || !startDate) {
      toast.error(t("calendar.validation.missingFields", "Please select a patient and a date"));
      return;
    }

    // Si endDate está vacío por alguna razón, forzamos default
    const mins = parseInt(duration, 10) || 60;
    const start = startDate;
    const end = endDate || applyDefaultEnd(startDate, mins);

    if (!end || Number.isNaN(end.getTime()) || end <= start) {
      toast.error(t("calendar.validation.invalidRange", "Please select a valid time range"));
      return;
    }

    // CHECK DE TRASLAPE (FRONTEND)
    if (hasOverlapLocal(start, end)) {
      toast.error(
        t("calendar.validation.overlap", "That time range is already taken!"),
        { icon: "🚫", duration: 4000 }
      );
      return;
    }

    createMutation.mutate(
      {
        patientId: selectedPatient,
        start,
        end,
        reason: reason.trim() || t("calendar.defaultReason", "General consultation"),
      },
      {
        onSuccess: () => {
          setSelectedPatient("");
          setStartDate(null);
          setEndDate(null);
          setReason("");
          setDuration("60");
          setEndAuto(true);
        },
      }
    );
  };

  const onSelectEvent = (event) => {
    if (!event?._id) return;
    if (event.status === "pending" && !isDoctor) {
      openPendingModal(event);
      return;
    }
    openCancelModal(event);
  };

  const eventStyleGetter = (event) => ({
    style: {
      backgroundColor: event.status === "accepted" ? "#10B981" : "#F59E0B",
      borderRadius: "6px",
      opacity: 0.9,
      color: "white",
      border: "0px",
      display: "block",
    },
  });

  const patientPrefix = t("calendar.patientPrefix", "P:");
  const doctorPrefix = t("calendar.doctorPrefix", "Dr:");


  if (isLoading) return <div className="p-10 text-center">{t("common.loading", "Loading...")}</div>;

  return (
    <div className="max-w-7xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">
        {t("calendar.title", "Calendar")}
      </h2>

      {isDoctor && (
        <div className="relative z-20 bg-white p-4 rounded shadow mb-6 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">
            {t("calendar.newAppointment", "New Appointment")}
          </h3>

          <div className="flex flex-wrap gap-4 items-end">
            {/* 1. PACIENTE */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t("calendar.selectPatient", "Patient")}
              </label>
              <select
                className="border p-2 rounded w-64 bg-gray-50 h-11 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedPatient}
                onChange={(e) => setSelectedPatient(e.target.value)}
              >
                <option value="">{t("calendar.choosePatient", "Choose a patient...")}</option>
                {patientData?.items?.map((p) => (
                  <option key={p._id} value={p._id}>{p.fullname}</option>
                ))}
              </select>
            </div>

            {/* 2. INICIO (START) */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t("calendar.start", "Start")}
              </label>
              <LocalizedDatePicker
                value={startDate}
                onChange={handleStartChange}
                showTimeSelect
                timeIntervals={5}
                timeCaption={t("calendar.rbc.time", "Time")}
                timeFormat="h:mm aa"
                className="border p-2 rounded bg-gray-50 w-52 h-11 cursor-pointer text-sm"
                placeholder={t("calendar.start", "Select start...")}
                selectsStart
                startDate={startDate}
                endDate={endDate}
              />
            </div>

            {/* 3. FIN (END) */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t("calendar.end", "End")}
              </label>
              <LocalizedDatePicker
                value={endDate}
                onChange={handleEndChange}
                showTimeSelect
                timeIntervals={5}
                timeCaption={t("calendar.rbc.time", "Time")}
                timeFormat="h:mm aa"
                className="border p-2 rounded bg-gray-50 w-52 h-11 cursor-pointer text-sm"
                placeholder={t("calendar.end", "Select end...")}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
                minDate={startDate || undefined} 
                disabled={!startDate} 
              />
            </div>

            {/* 4. DURACIÓN */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t("calendar.duration", "Duration")}
              </label>
              <select
                className="border p-2 rounded w-32 bg-gray-50 h-11 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={duration}
                onChange={handleDurationChange}
                disabled={!startDate}
              >
                <option value="15">{t("calendar.intervals.15min", "15 min")}</option>
                <option value="30">{t("calendar.intervals.30min", "30 min")}</option>
                <option value="45">{t("calendar.intervals.45min", "45 min")}</option>
                <option value="60">{t("calendar.intervals.1h", "1 hr")}</option>
                <option value="90">{t("calendar.intervals.1_5h", "1.5 hrs")}</option>
                <option value="120">{t("calendar.intervals.2h", "2 hrs")}</option>
              </select>
            </div>

            {/* 5. MOTIVO */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t("calendar.reason", "Reason")}
              </label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("calendar.reasonPlaceholder", "e.g. Follow up...")}
                className="h-11 w-full text-sm"
              />
            </div>

            <div className="pb-0.5">
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending
                  ? t("calendar.scheduling", "Scheduling...")
                  : t("calendar.scheduleBtn", "Schedule")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Calendario Grande */}
      <div className="relative z-0 h-[600px] bg-white p-4 rounded shadow border border-gray-200">
        <Calendar
          culture={culture}
          localizer={localizer}
          messages={rbcMessages}
          events={appointments}
          startAccessor="start"
          endAccessor="end"
          style={{ height: "100%" }}
          onSelectEvent={onSelectEvent}
          eventPropGetter={eventStyleGetter}
          date={currentDate}
          view={currentView}
          onNavigate={onNavigate}
          onView={onView}
          titleAccessor={(evt) =>
            isDoctor
              ? `${patientPrefix} ${evt.titleData?.patient?.fullname || t("calendar.unknown")}`
              : `${doctorPrefix} ${evt.titleData?.doctor?.name || t("calendar.unknown")}`
          }
        />
      </div>

      <div className="mt-4 text-sm text-gray-500">
        <span className="inline-block w-3 h-3 rounded-full bg-[#F59E0B] mr-1"></span>
        {t("calendar.legendPending", "Pending")}
        <span className="inline-block w-3 h-3 rounded-full bg-[#10B981] ml-4 mr-1"></span>
        {t("calendar.legendAccepted", "Accepted")}
      </div>

      <AppointmentActionModal
        open={apptModal.open}
        mode={apptModal.mode}
        event={apptModal.event}
        isDoctor={isDoctor}
        t={t}
        currentLang={lang}
        busy={acceptMutation.isPending || rejectMutation.isPending}
        onClose={closeApptModal}
        onAccept={(id) => acceptMutation.mutate(id, { onSuccess: closeApptModal })}
        onReject={(id) => rejectMutation.mutate(id, { onSuccess: closeApptModal })}
      />
    </div>
  );
}