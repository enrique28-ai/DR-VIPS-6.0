import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import "react-big-calendar/lib/css/react-big-calendar.css";

// Importamos el DatePicker corregido
import LocalizedDatePicker from "../../components/forms/LocalizedDatePicker.jsx";

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
import Button from "../../components/forms/Button.jsx";

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

  const [selectedPatient, setSelectedPatient] = useState("");
  const [startDate, setStartDate] = useState(null);

  const onNavigate = (newDate) => setCurrentDate(newDate);
  const onView = (newView) => setCurrentView(newView);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!selectedPatient || !startDate) return;
    
    // Duración de 1 hora por defecto
    const end = new Date(startDate.getTime() + 60 * 60 * 1000);

    createMutation.mutate(
      { patientId: selectedPatient, start: startDate, end, reason: "General consultation" },
      { onSuccess: () => { setStartDate(null); setSelectedPatient(""); } }
    );
  };

  const onSelectEvent = (event) => {
    const docName = event.titleData?.doctor?.name || t("calendar.unknown", "Unknown");
    if (event.status === "pending") {
      if (!isDoctor) {
        if (window.confirm(t("calendar.confirmAccept", { name: docName }))) {
          acceptMutation.mutate(event._id);
        } else if (window.confirm(t("calendar.confirmReject", "Reject?"))) {
          rejectMutation.mutate(event._id);
        }
      } else {
        alert(t("calendar.pendingHint", "Wait for patient action"));
      }
    } else {
      if (window.confirm(t("calendar.confirmCancel", "Cancel appointment?"))) {
        rejectMutation.mutate(event._id);
      }
    }
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

  if (isLoading) return <div className="p-10 text-center">{t("common.loading", "Loading...")}</div>;

  return (
    <div className="max-w-7xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">
        {t("calendar.title", "Calendar")}
      </h2>

      {isDoctor && (
        // z-20 para que los inputs estén sobre el calendario grande
        <div className="relative z-20 bg-white p-4 rounded shadow mb-6 flex flex-wrap gap-4 items-end border border-gray-200">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("calendar.selectPatient", "Select Patient")}
            </label>
            <select
              className="border p-2 rounded w-64 bg-gray-50 h-11"
              value={selectedPatient}
              onChange={(e) => setSelectedPatient(e.target.value)}
            >
              <option value="">{t("calendar.choosePatient", "Choose...")}</option>
              {patientData?.items?.map((p) => (
                <option key={p._id} value={p._id}>{p.fullname}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("calendar.dateTime", "Date & Time")}
            </label>
            
            {/* CONFIGURACIÓN DEL PICKER */}
            <LocalizedDatePicker
              value={startDate}
              onChange={setStartDate}
              
              // Activa el selector de hora (lista)
              showTimeSelect
              
              // 🔥 TRUCO: Pone intervalos de 5 minutos en la lista para que no sea tan larga,
              // PERO el usuario puede borrar y escribir "10:33 PM" manualmente si quiere un minuto exacto.
              timeIntervals={1} 
              
              timeCaption={t("calendar.rbc.time", "Time")}
              timeFormat="h:mm aa"
              
              className="border p-2 rounded bg-gray-50 w-64 h-11 cursor-pointer"
              placeholder={t("calendar.dateTime", "Select date & time")}
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
      )}

      {/* z-0 para que el calendario grande quede detrás del popup del datepicker */}
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
              ? `P: ${evt.titleData?.patient?.fullname || t("calendar.unknown")}`
              : `Dr: ${evt.titleData?.doctor?.name || t("calendar.unknown")}`
          }
        />
      </div>

      <div className="mt-4 text-sm text-gray-500">
        <span className="inline-block w-3 h-3 rounded-full bg-[#F59E0B] mr-1"></span>
        {t("calendar.legendPending", "Pending")}
        <span className="inline-block w-3 h-3 rounded-full bg-[#10B981] ml-4 mr-1"></span>
        {t("calendar.legendAccepted", "Accepted")}
      </div>
    </div>
  );
}