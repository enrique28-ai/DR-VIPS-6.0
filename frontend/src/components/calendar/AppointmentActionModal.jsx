import { useEffect, useRef } from "react";
// Importaciones consistentes para evitar problemas de bundler
import format from "date-fns/format";
import enUS from "date-fns/locale/en-US";
import es from "date-fns/locale/es";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const isFocusableElement = (element) => {
  if (!(element instanceof HTMLElement)) return false;
  if (!element.matches(FOCUSABLE_SELECTOR)) return false;
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") {
    return false;
  }

  const style = window.getComputedStyle(element);
  return !element.closest("[hidden]") && style.display !== "none" && style.visibility !== "hidden";
};

const getFocusableElements = (container) => {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isFocusableElement);
};

export default function AppointmentActionModal({
  open,
  mode, // "pending" | "cancel"
  event,
  isDoctor,
  t, // función de traducción
  currentLang, // "es" | "en-US"
  onClose,
  onAccept,
  onReject,
  busy = false,
  lockCloseWhenBusy = true,
}) {
  const canClose = !busy || !lockCloseWhenBusy;
  const dialogRef = useRef(null);
  const panelRef = useRef(null);
  const previousActiveElementRef = useRef(null);
  const canCloseRef = useRef(canClose);
  const onCloseRef = useRef(onClose);

  canCloseRef.current = canClose;
  onCloseRef.current = onClose;

  // Bloquear scroll, gestionar foco y cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    previousActiveElementRef.current = document.activeElement;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e) => {
      if (e.key === "Escape" && canCloseRef.current) {
        onCloseRef.current();
        return;
      }

      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusableElements = getFocusableElements(panel);
      if (focusableElements.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (activeElement === panel || activeElement === dialogRef.current || !panel.contains(activeElement)) {
        e.preventDefault();
        (e.shiftKey ? lastFocusable : firstFocusable).focus();
        return;
      }

      if (!e.shiftKey && activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
        return;
      }

      if (e.shiftKey && activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    const focusableElements = getFocusableElements(panelRef.current);
    const initialFocusTarget = focusableElements[0] || panelRef.current;
    initialFocusTarget?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
      const previousActiveElement = previousActiveElementRef.current;
      if (previousActiveElement?.isConnected && isFocusableElement(previousActiveElement)) {
        previousActiveElement.focus();
      }
      previousActiveElementRef.current = null;
    };
  }, [open]);

  if (!open || !event) return null;

  const titleId = "appointment-action-modal-title";
  const descriptionId = "appointment-action-modal-description";
  const detailsId = "appointment-action-modal-details";
  const loadingLabel = t("common.loading", "Loading...");

  // --- Helpers de visualización ---
  const doctorName = event.titleData?.doctor?.name || t("calendar.unknown", "Unknown");
  const patientName = event.titleData?.patient?.fullname || t("calendar.unknown", "Unknown");
  
  // Detección de idioma
  const lang = (currentLang || "").toLowerCase();
  const locale = lang.startsWith("es") ? es : enUS;

  // Formatos localizados
  const dateStr = format(event.start, "PPPP", { locale }); 
  const timeStart = format(event.start, "p", { locale });
  const timeEnd = format(event.end, "p", { locale });
  const reason = event.reason || t("calendar.defaultReason", "No reason specified");

  // --- LÓGICA DINÁMICA DE TÍTULOS ---
  let title = "";
  let description = "";

  if (mode === "pending") {
    // Modo Decisión (Solo Paciente)
    title = t("calendar.modal.pendingTitle", "Appointment Request");
    description = t("calendar.modal.pendingDesc",{doctorName, defaultValue:  `Accept or reject appointment with Dr. ${doctorName}?`});
  } else {
    // Modo Cancelar (Para Doctor o Paciente en citas aceptadas/pendientes)
    if (event.status === "pending") {
      // Caso Pro: Cancelar una solicitud pendiente
      title = t("calendar.modal.cancelReqTitle", "Cancel Request");
      description = t("calendar.modal.cancelReqDesc", "Do you want to cancel this pending request?");
    } else {
      // Caso Normal: Cancelar una cita aceptada
      title = t("calendar.modal.cancelTitle", "Cancel Appointment");
      description = t("calendar.modal.cancelDesc", "Are you sure you want to cancel this appointment?");
    }
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={`${descriptionId} ${detailsId}`}
    >
      {/* Backdrop oscuro */}
      <div 
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm transition-opacity"
        onClick={() => canClose && onClose()} 
      />

      {/* Card */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 max-h-[calc(100vh-2rem)] w-[calc(100%-1rem)] max-w-lg transform overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-950/20 outline-none transition-all sm:w-[92%] sm:p-6"
      >
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <h3 id={titleId} className="min-w-0 text-lg font-semibold leading-6 text-slate-950">
            {title}
          </h3>
          <button
            type="button"
            onClick={() => canClose && onClose()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canClose}
            aria-label={`${t("common.close", "Close")} ${title}`}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="mt-4">
          <p id={descriptionId} className="mb-4 text-sm leading-6 text-slate-600">
            {description}
          </p>

          {/* Detalles de la cita (Recuadro gris) */}
          <div id={detailsId} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4 text-sm">
            <div className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-3">
              <span className="font-semibold text-slate-500">{t("calendar.modal.date", "Date")}:</span>
              <span className="min-w-0 text-right font-medium capitalize text-slate-950 break-words">{dateStr}</span>
            </div>
            <div className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-3">
              <span className="font-semibold text-slate-500">{t("calendar.modal.time", "Time")}:</span>
              <span className="min-w-0 text-right font-medium text-slate-950 break-words">{timeStart} - {timeEnd}</span>
            </div>
            <div className="border-t border-slate-200"></div>
            <div className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-3">
               <span className="font-semibold text-slate-500">
                 {isDoctor ? t("calendar.modal.patient", "Patient") : t("calendar.modal.doctor", "Doctor")}:
               </span>
               <span className="min-w-0 text-right font-medium text-slate-950 break-words">
                 {isDoctor ? patientName : doctorName}
               </span>
            </div>
             <div className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-3">
               <span className="font-semibold text-slate-500">{t("calendar.reason", "Reason")}:</span>
               <span className="min-w-0 text-right italic text-slate-950 break-words">{reason}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            onClick={() => canClose && onClose()}
            disabled={!canClose}
          >
            {t("common.close", "Close")}
          </button>

          {/* Botones para PACIENTE (Pendiente: Aceptar/Rechazar) */}
          {mode === "pending" && !isDoctor && (
            <>
              <button
                type="button"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                onClick={() => onReject(event._id)}
                disabled={busy}
              >
                {t("common.reject", "Reject")}
              </button>

              <button
                type="button"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                onClick={() => onAccept(event._id)}
                disabled={busy}
              >
                {busy ? loadingLabel : t("common.accept", "Accept")}
              </button>
            </>
          )}

          {/* Botón de Cancelar (Ya aceptada o rechazo directo del Doctor) */}
          {mode === "cancel" && (
            <button
              type="button"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              onClick={() => onReject(event._id)}
              disabled={busy}
            >
              {busy ? loadingLabel : t("calendar.modal.cancelBtn", "Cancel Appointment")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
