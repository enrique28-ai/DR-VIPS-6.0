import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import AppointmentActionModal from "./AppointmentActionModal.jsx";

const t = (key, optsOrFallback) => {
  const map = {
    "calendar.unknown": "Unknown",
    "calendar.defaultReason": "No reason specified",
    "calendar.modal.pendingTitle": "Appointment Request",
    "calendar.modal.pendingDesc": "Accept or reject appointment with {{doctorName}}?",
    "calendar.modal.cancelReqTitle": "Cancel Request",
    "calendar.modal.cancelReqDesc": "Do you want to cancel this pending request?",
    "calendar.modal.cancelTitle": "Cancel Appointment",
    "calendar.modal.cancelDesc": "Are you sure you want to cancel this appointment?",
    "calendar.modal.date": "Date",
    "calendar.modal.time": "Time",
    "calendar.modal.patient": "Patient",
    "calendar.modal.doctor": "Doctor",
    "calendar.reason": "Reason",
    "calendar.modal.cancelBtn": "Cancel Appointment",
    "common.loading": "Loading...",
    "common.close": "Close",
    "common.reject": "Reject",
    "common.accept": "Accept",
  };

  if (typeof optsOrFallback === "string") return map[key] ?? optsOrFallback;

  const fallback =
    optsOrFallback?.defaultValue ??
    (optsOrFallback && typeof optsOrFallback === "object" ? undefined : optsOrFallback);

  let value = map[key] ?? fallback ?? key;
  if (optsOrFallback && typeof optsOrFallback === "object") {
    Object.entries(optsOrFallback).forEach(([k, v]) => {
      value = value.replaceAll(`{{${k}}}`, v);
    });
  }
  return value;
};

const event = {
  _id: "appt-1",
  status: "pending",
  start: new Date("2026-06-25T10:00:00Z"),
  end: new Date("2026-06-25T11:00:00Z"),
  reason: "Follow up",
  titleData: {
    doctor: { name: "Dr. Smith" },
    patient: { fullname: "John Doe" },
  },
};

const acceptedEvent = { ...event, _id: "appt-accepted", status: "accepted" };

const renderModal = (props = {}) => {
  const onClose = vi.fn();
  const onAccept = vi.fn();
  const onReject = vi.fn();

  const result = render(
    <AppointmentActionModal
      open
      mode="pending"
      event={event}
      isDoctor={false}
      t={t}
      currentLang="en-US"
      onClose={onClose}
      onAccept={onAccept}
      onReject={onReject}
      {...props}
    />
  );

  return { ...result, onClose, onAccept, onReject };
};

describe("AppointmentActionModal", () => {
  test("returns null when closed or event is missing", () => {
    const { container: closedContainer } = renderModal({ open: false });
    expect(closedContainer.firstChild).toBeNull();

    const { container: missingContainer } = renderModal({ event: null });
    expect(missingContainer.firstChild).toBeNull();
  });

  test("renders pending patient modal with doctor details and accept/reject actions", () => {
    renderModal({ mode: "pending", isDoctor: false });

    const dialog = screen.getByRole("dialog", { name: "Appointment Request" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(/Accept or reject appointment with Dr\. Smith\?/);
    expect(screen.getByText("Appointment Request")).toBeInTheDocument();
    expect(screen.getByText("Accept or reject appointment with Dr. Smith?")).toBeInTheDocument();
    expect(screen.getByText("Doctor:")).toBeInTheDocument();
    expect(screen.getByText("Date:")).toBeInTheDocument();
    expect(screen.getByText("Time:")).toBeInTheDocument();
    expect(screen.getByText("Reason:")).toBeInTheDocument();
    expect(screen.getByText("Follow up")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Appointment Request" })).toHaveAttribute(
      "type",
      "button",
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  test("accept and reject buttons call handlers with event id", () => {
    const { onAccept, onReject } = renderModal({ mode: "pending", isDoctor: false });

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith("appt-1");

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith("appt-1");
  });

  test("renders cancel modal for accepted appointment and cancel calls onReject", () => {
    const { onReject } = renderModal({ mode: "cancel", event: acceptedEvent });

    expect(screen.getByRole("heading", { name: "Cancel Appointment" })).toBeInTheDocument();
    expect(
      screen.getByText("Are you sure you want to cancel this appointment?")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel Appointment" }));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith("appt-accepted");
  });

  test("renders cancel modal for pending request and cancel calls onReject", () => {
    const { onReject } = renderModal({ mode: "cancel", event });

    expect(screen.getByRole("heading", { name: "Cancel Request" })).toBeInTheDocument();
    expect(screen.getByText("Do you want to cancel this pending request?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel Appointment" }));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith("appt-1");
  });

  test("doctor cancel modal displays patient name instead of doctor name", () => {
    renderModal({ mode: "cancel", event: acceptedEvent, isDoctor: true });

    expect(screen.getByText("Patient:")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.queryByText("Doctor:")).not.toBeInTheDocument();
  });

  test("Escape key closes when not busy", () => {
    const { onClose } = renderModal();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("focus moves inside the dialog when opened", () => {
    renderModal();

    expect(screen.getByRole("button", { name: "Close Appointment Request" })).toHaveFocus();
  });

  test("Tab wraps from the last focusable control to the first", () => {
    renderModal();

    screen.getByRole("button", { name: "Accept" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });

    expect(screen.getByRole("button", { name: "Close Appointment Request" })).toHaveFocus();
  });

  test("Shift+Tab wraps from the first focusable control to the last", () => {
    renderModal();

    screen.getByRole("button", { name: "Close Appointment Request" }).focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(screen.getByRole("button", { name: "Accept" })).toHaveFocus();
  });

  test("Tab from the panel moves focus to the first focusable control", () => {
    renderModal();

    const dialog = screen.getByRole("dialog");
    const panel = dialog.lastElementChild;
    panel.focus();
    fireEvent.keyDown(document, { key: "Tab" });

    expect(screen.getByRole("button", { name: "Close Appointment Request" })).toHaveFocus();
  });

  test("Shift+Tab from the panel moves focus to the last focusable control", () => {
    renderModal();

    const dialog = screen.getByRole("dialog");
    const panel = dialog.lastElementChild;
    panel.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(screen.getByRole("button", { name: "Accept" })).toHaveFocus();
  });

  test("focus falls back to the panel when all controls are disabled", () => {
    renderModal({ busy: true });

    const dialog = screen.getByRole("dialog");
    const panel = dialog.lastElementChild;

    expect(panel).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(panel).toHaveFocus();
  });

  test("focus returns to the previous focused element after unmount", () => {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.textContent = "Open modal";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = renderModal();
    expect(screen.getByRole("button", { name: "Close Appointment Request" })).toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();

    trigger.remove();
  });

  test("Escape key does not close when busy and lockCloseWhenBusy is true", () => {
    const { onClose } = renderModal({ busy: true });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  test("lockCloseWhenBusy false allows Escape close while busy", () => {
    const { onClose } = renderModal({ busy: true, lockCloseWhenBusy: false });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("close button and backdrop close when not busy", () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.firstElementChild;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("busy pending mode disables close and action buttons and shows loading labels", () => {
    renderModal({ mode: "pending", isDoctor: false, busy: true });

    expect(screen.getByRole("button", { name: "Close Appointment Request" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();

    const loadingButtons = screen.getAllByRole("button", { name: "Loading..." });
    expect(loadingButtons.length).toBeGreaterThanOrEqual(1);
    loadingButtons.forEach((button) => expect(button).toBeDisabled());
  });

  test("busy cancel mode disables cancel action and shows loading label", () => {
    renderModal({ mode: "cancel", event: acceptedEvent, busy: true });

    expect(screen.getByRole("button", { name: "Close Cancel Appointment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();

    const loadingButtons = screen.getAllByRole("button", { name: "Loading..." });
    expect(loadingButtons.length).toBeGreaterThanOrEqual(1);
    loadingButtons.forEach((button) => expect(button).toBeDisabled());
  });

  test("body overflow is hidden while open and restored after unmount", () => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "auto";

    const { unmount } = renderModal();

    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("auto");

    document.body.style.overflow = prevOverflow;
  });
});
