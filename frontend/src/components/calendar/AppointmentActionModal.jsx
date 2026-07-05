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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={() => canClose && onClose()} 
      />

      {/* Card */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 w-[95%] max-w-md transform rounded-xl bg-white p-6 shadow-2xl transition-all border border-gray-100"
      >
        
        {/* Header */}
        <div className="flex items-start justify-between">
          <h3 id={titleId} className="text-lg font-bold text-gray-900 leading-6">
            {title}
          </h3>
          <button
            type="button"
            onClick={() => canClose && onClose()}
            className="ml-4 text-gray-400 hover:text-gray-600 transition-colors"
            disabled={!canClose}
            aria-label={`${t("common.close", "Close")} ${title}`}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="mt-4">
          <p id={descriptionId} className="text-sm text-gray-600 mb-4">
            {description}
          </p>

          {/* Detalles de la cita (Recuadro gris) */}
          <div id={detailsId} className="rounded-lg bg-gray-50 p-3 text-sm border border-gray-100 space-y-2">
            <div className="flex justify-between">
              <span className="font-semibold text-gray-500">{t("calendar.modal.date", "Date")}:</span>
              <span className="text-gray-900 font-medium capitalize">{dateStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-gray-500">{t("calendar.modal.time", "Time")}:</span>
              <span className="text-gray-900 font-medium">{timeStart} - {timeEnd}</span>
            </div>
            <div className="border-t border-gray-200 my-1"></div>
            <div className="flex justify-between">
               <span className="font-semibold text-gray-500">
                 {isDoctor ? t("calendar.modal.patient", "Patient") : t("calendar.modal.doctor", "Doctor")}:
               </span>
               <span className="text-gray-900 font-medium">
                 {isDoctor ? patientName : doctorName}
               </span>
            </div>
             <div className="flex items-start justify-between gap-3">
               <span className="font-semibold text-gray-500">{t("calendar.reason", "Reason")}:</span>
               <span className="min-w-0 text-right text-gray-900 italic break-words">{reason}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
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
                className="px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                onClick={() => onReject(event._id)}
                disabled={busy}
              >
                {t("common.reject", "Reject")}
              </button>

              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 shadow-md transition-all hover:shadow-lg disabled:opacity-50"
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
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 shadow-md transition-all hover:shadow-lg disabled:opacity-50"
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
