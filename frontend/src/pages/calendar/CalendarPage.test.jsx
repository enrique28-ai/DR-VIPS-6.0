import { render, screen, fireEvent, act } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import CalendarPage from "./CalendarPage.jsx";

const authState = vi.hoisted(() => ({
  user: null,
}));

vi.mock("react-big-calendar", () => ({
  Calendar: ({
    events,
    culture,
    titleAccessor,
    onSelectEvent,
    view,
    views,
    onView,
    date,
    onNavigate,
  }) => (
    <div data-testid="calendar">
      <div data-testid="event-count">{events?.length ?? 0}</div>
      <div data-testid="culture">{culture}</div>
      <div data-testid="calendar-view">{view}</div>
      <div data-testid="calendar-views">{views?.join(",")}</div>
      <div data-testid="calendar-date">{date?.toISOString()}</div>
      {views?.map((availableView) => (
        <button
          key={availableView}
          type="button"
          onClick={() => onView?.(availableView)}
        >
          Set calendar view {availableView}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onNavigate?.(new Date("2026-07-10T00:00:00Z"))}
      >
        Navigate calendar
      </button>
      {events?.map((evt, idx) => (
        <div key={idx} data-testid="event-title">
          <span>{typeof titleAccessor === "function" ? titleAccessor(evt) : evt.title}</span>
          <button type="button" onClick={() => onSelectEvent?.(evt)}>
            Select event {evt._id ?? idx}
          </button>
        </div>
      ))}
    </div>
  ),
  dateFnsLocalizer: vi.fn(() => "localizer"),
}));

vi.mock("react-big-calendar/lib/css/react-big-calendar.css", () => ({}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) =>
      ({
        "common.loading": "Loading...",
        "calendar.title": "Calendar",
        "calendar.newAppointment": "New Appointment",
        "calendar.selectPatient": "Patient",
        "calendar.choosePatient": "Choose a patient...",
        "calendar.start": "Start",
        "calendar.end": "End",
        "calendar.duration": "Duration",
        "calendar.reason": "Reason",
        "calendar.reasonPlaceholder": "e.g. Follow up...",
        "calendar.scheduleBtn": "Schedule",
        "calendar.scheduling": "Scheduling...",
        "calendar.legendPending": "Pending",
        "calendar.legendAccepted": "Accepted",
        "calendar.legend": "Appointment status legend",
        "calendar.patientPrefix": "P:",
        "calendar.doctorPrefix": "Dr:",
        "calendar.unknown": "Unknown",
        "calendar.intervals.15min": "15 min",
        "calendar.intervals.30min": "30 min",
        "calendar.intervals.45min": "45 min",
        "calendar.intervals.1h": "1 hr",
        "calendar.intervals.1_5h": "1.5 hrs",
        "calendar.intervals.2h": "2 hrs",
        "calendar.rbc.today": "Today",
        "calendar.rbc.previous": "Back",
        "calendar.rbc.next": "Next",
        "calendar.rbc.month": "Month",
        "calendar.rbc.week": "Week",
        "calendar.rbc.day": "Day",
        "calendar.rbc.agenda": "Agenda",
        "calendar.rbc.date": "Date",
        "calendar.rbc.time": "Time",
        "calendar.rbc.event": "Event",
        "calendar.rbc.noEventsInRange": "No events in this range",
        "calendar.validation.missingFields": "Please select a patient and a date",
        "calendar.validation.invalidRange": "Please select a valid time range",
        "calendar.validation.overlap": "That time range is already taken!",
        "calendar.defaultReason": "General consultation",
      })[key] ?? key,
    i18n: { language: "en" },
  }),
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: (selector) => (selector ? selector(authState) : authState),
}));

const inertMutation = vi.hoisted(() => () => ({ mutate: vi.fn(), isPending: false }));

vi.mock("../../features/appointments/ahooks.js", () => ({
  useAppointments: vi.fn(),
  useCreateAppointment: vi.fn(inertMutation),
  useAcceptAppointment: vi.fn(inertMutation),
  useRejectAppointment: vi.fn(inertMutation),
}));

vi.mock("../../features/patients/phooks.js", () => ({
  buildPatientParams: vi.fn((params) => ({ ...params, mocked: true })),
  usePatients: vi.fn(),
}));

vi.mock("../../components/calendar/AppointmentActionModal.jsx", () => ({
  default: ({ open, mode, event, isDoctor, busy, onClose, onAccept, onReject }) =>
    open ? (
      <div data-testid="appointment-modal">
        <p>Modal mode: {mode}</p>
        <p>Modal event: {event?._id}</p>
        <p>Modal isDoctor: {String(isDoctor)}</p>
        <p>Modal busy: {String(busy)}</p>
        <button type="button" onClick={onClose} disabled={busy}>
          Close modal
        </button>
        <button type="button" onClick={() => onAccept(event._id)} disabled={busy}>
          Accept modal
        </button>
        <button type="button" onClick={() => onReject(event._id)} disabled={busy}>
          Reject modal
        </button>
      </div>
    ) : null,
}));

const dateMap = vi.hoisted(() => ({
  start: new Date("2026-06-25T10:00:00Z"),
  end: new Date("2026-06-25T11:00:00Z"),
  earlyEnd: new Date("2026-06-25T09:00:00Z"),
  overlapStart: new Date("2026-06-25T10:30:00Z"),
  overlapEnd: new Date("2026-06-25T11:30:00Z"),
  laterStart: new Date("2026-06-25T14:00:00Z"),
  laterEnd: new Date("2026-06-25T15:00:00Z"),
}));

vi.mock("../../components/forms/LocalizedDatePicker.jsx", () => ({
  default: ({ value, onChange, placeholder, ...rest }) => (
    <input
      {...rest}
      type="text"
      data-testid="localized-date-picker"
      value={value ? value.toISOString() : ""}
      placeholder={placeholder}
      onChange={(e) => onChange?.(dateMap[e.target.value] ?? null)}
    />
  ),
}));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

import {
  useAppointments,
  useCreateAppointment,
  useAcceptAppointment,
  useRejectAppointment,
} from "../../features/appointments/ahooks.js";
import { buildPatientParams, usePatients } from "../../features/patients/phooks.js";
import toast from "react-hot-toast";

const doctorUser = { _id: "doctor-1", role: "doctor", name: "Dr. Current" };
const patientUser = { _id: "patient-1", role: "patient", name: "Patient Current" };

const patientsData = {
  items: [
    { _id: "p1", fullname: "Ana Patient" },
    { _id: "p2", fullname: "Luis Patient" },
  ],
};

const appointment = {
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

const existingAppointment = {
  _id: "appt-existing",
  status: "accepted",
  start: new Date("2026-06-25T10:00:00Z"),
  end: new Date("2026-06-25T11:00:00Z"),
  titleData: {
    doctor: { name: "Dr. Smith" },
    patient: { fullname: "John Doe" },
  },
};

const acceptedAppointment = {
  ...appointment,
  _id: "appt-accepted",
  status: "accepted",
};

const noIdAppointment = {
  ...appointment,
  _id: undefined,
  status: "pending",
};

const renderCalendarPage = () => render(<CalendarPage />);

let compactMediaQuery;

const installMatchMedia = (matches = false) => {
  const listeners = new Set();
  compactMediaQuery = {
    matches,
    media: "(max-width: 639px)",
    addEventListener: vi.fn((event, listener) => {
      if (event === "change") listeners.add(listener);
    }),
    removeEventListener: vi.fn((event, listener) => {
      if (event === "change") listeners.delete(listener);
    }),
    dispatch(matchesNext) {
      this.matches = matchesNext;
      listeners.forEach((listener) =>
        listener({ matches: matchesNext, media: this.media }),
      );
    },
  };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn(() => compactMediaQuery),
  });
};

const setCompactCalendar = (matches) => {
  act(() => compactMediaQuery.dispatch(matches));
};

const resetAuth = () => {
  authState.user = null;
};

const resetMocks = () => {
  vi.clearAllMocks();
  useAppointments.mockReturnValue({ data: [], isLoading: false });
  usePatients.mockReturnValue({ data: { items: [] } });
  useCreateAppointment.mockReturnValue(inertMutation());
  useAcceptAppointment.mockReturnValue(inertMutation());
  useRejectAppointment.mockReturnValue(inertMutation());
};

describe("CalendarPage", () => {
  beforeEach(() => {
    installMatchMedia(false);
    resetAuth();
    resetMocks();
  });

  test("renders loading state while appointments are loading", () => {
    authState.user = patientUser;
    useAppointments.mockReturnValue({ data: undefined, isLoading: true });

    renderCalendarPage();

    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    expect(screen.queryByTestId("calendar")).not.toBeInTheDocument();
  });

  test("renders patient calendar view without doctor appointment form", () => {
    authState.user = patientUser;
    useAppointments.mockReturnValue({ data: [], isLoading: false });
    usePatients.mockReturnValue({ data: { items: [] } });

    renderCalendarPage();

    expect(screen.getByRole("heading", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes("Pending"))).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes("Accepted"))).toBeInTheDocument();
    expect(screen.getByTestId("calendar")).toBeInTheDocument();
    expect(screen.queryByText("New Appointment")).not.toBeInTheDocument();
    expect(screen.queryByText("Schedule")).not.toBeInTheDocument();
  });

  test("renders doctor appointment form with patient options", () => {
    authState.user = doctorUser;
    useAppointments.mockReturnValue({ data: [], isLoading: false });
    usePatients.mockReturnValue({ data: patientsData });

    renderCalendarPage();

    expect(screen.getByRole("heading", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByText("New Appointment")).toBeInTheDocument();

    const patientSelect = screen.getByLabelText("Patient");
    expect(patientSelect).toBeInTheDocument();
    expect(patientSelect).toHaveAttribute("id", "calendar-patient");
    expect(patientSelect).toHaveAttribute("name", "patientId");
    expect(patientSelect).toBeRequired();
    expect(patientSelect).toHaveAttribute("aria-required", "true");
    const options = screen.getAllByRole("option");
    const optionTexts = options.map((o) => o.textContent);
    expect(optionTexts).toContain("Choose a patient...");
    expect(optionTexts).toContain("Ana Patient");
    expect(optionTexts).toContain("Luis Patient");

    const datePickers = screen.getAllByTestId("localized-date-picker");
    expect(datePickers.length).toBeGreaterThanOrEqual(2);
    expect(datePickers[0]).toHaveAttribute("placeholder", "Start");
    expect(datePickers[1]).toHaveAttribute("placeholder", "End");
    expect(screen.getByLabelText("Start")).toHaveAttribute("name", "start");
    expect(screen.getByLabelText("Start")).toBeRequired();
    expect(screen.getByLabelText("Start")).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText("End")).toHaveAttribute("name", "end");
    expect(screen.getByLabelText("End")).not.toBeRequired();
    expect(screen.getByLabelText("Duration")).toHaveAttribute("name", "duration");

    expect(screen.getByLabelText("Reason")).toHaveAttribute("name", "reason");
    expect(screen.getByLabelText("Reason")).not.toBeRequired();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByTestId("calendar")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Appointment status legend" })).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  describe("responsive calendar views", () => {
    test("desktop starts in month view and exposes every calendar view", () => {
      authState.user = patientUser;

      renderCalendarPage();

      expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 639px)");
      expect(screen.getByTestId("calendar-view")).toHaveTextContent("month");
      expect(screen.getByTestId("calendar-views")).toHaveTextContent(
        "month,week,day,agenda",
      );
      expect(screen.getByRole("button", { name: "Set calendar view month" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Set calendar view week" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Set calendar view day" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Set calendar view agenda" })).toBeInTheDocument();
    });

    test("mobile starts in agenda view and exposes only agenda and day", () => {
      installMatchMedia(true);
      authState.user = patientUser;

      renderCalendarPage();

      expect(screen.getByTestId("calendar-view")).toHaveTextContent("agenda");
      expect(screen.getByTestId("calendar-views")).toHaveTextContent("agenda,day");
      expect(screen.getByRole("button", { name: "Set calendar view agenda" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Set calendar view day" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Set calendar view month" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Set calendar view week" })).not.toBeInTheDocument();
    });

    test("onView controls desktop view changes", () => {
      authState.user = patientUser;
      renderCalendarPage();

      fireEvent.click(screen.getByRole("button", { name: "Set calendar view week" }));

      expect(screen.getByTestId("calendar-view")).toHaveTextContent("week");
    });

    test.each(["month", "week"])(
      "entering compact mode from %s changes the view to agenda without resetting the date",
      (desktopView) => {
        authState.user = patientUser;
        renderCalendarPage();
        if (desktopView === "week") {
          fireEvent.click(screen.getByRole("button", { name: "Set calendar view week" }));
        }
        fireEvent.click(screen.getByRole("button", { name: "Navigate calendar" }));

        setCompactCalendar(true);

        expect(screen.getByTestId("calendar-view")).toHaveTextContent("agenda");
        expect(screen.getByTestId("calendar-date")).toHaveTextContent(
          "2026-07-10T00:00:00.000Z",
        );
      },
    );

    test("entering compact mode while on day preserves day", () => {
      authState.user = patientUser;
      renderCalendarPage();
      fireEvent.click(screen.getByRole("button", { name: "Set calendar view day" }));

      setCompactCalendar(true);

      expect(screen.getByTestId("calendar-view")).toHaveTextContent("day");
      expect(screen.getByTestId("calendar-views")).toHaveTextContent("agenda,day");
    });

    test.each(["agenda", "day"])(
      "returning to desktop preserves the current %s view",
      (view) => {
        installMatchMedia(true);
        authState.user = patientUser;
        renderCalendarPage();
        if (view === "day") {
          fireEvent.click(screen.getByRole("button", { name: "Set calendar view day" }));
        }

        setCompactCalendar(false);

        expect(screen.getByTestId("calendar-view")).toHaveTextContent(view);
        expect(screen.getByTestId("calendar-views")).toHaveTextContent(
          "month,week,day,agenda",
        );
      },
    );

    test("removes the media-query listener on unmount", () => {
      authState.user = patientUser;
      const { unmount } = renderCalendarPage();
      const registeredListener = compactMediaQuery.addEventListener.mock.calls.find(
        ([event]) => event === "change",
      )[1];

      unmount();

      expect(compactMediaQuery.removeEventListener).toHaveBeenCalledWith(
        "change",
        registeredListener,
      );
    });

    test("calendar container prevents horizontal overflow at responsive heights", () => {
      authState.user = patientUser;
      renderCalendarPage();

      expect(screen.getByTestId("calendar").parentElement).toHaveClass(
        "min-w-0",
        "h-[520px]",
        "overflow-hidden",
        "p-2",
        "sm:h-[600px]",
        "sm:p-4",
      );
    });
  });

  test("calls usePatients with enabled false for patient and true for doctor", () => {
    authState.user = patientUser;
    useAppointments.mockReturnValue({ data: [], isLoading: false });
    usePatients.mockReturnValue({ data: { items: [] } });

    renderCalendarPage();

    expect(usePatients).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, status: "Alive", mocked: true }),
      { enabled: false },
    );
    expect(buildPatientParams).toHaveBeenCalledWith({ page: 1, status: "Alive" });

    vi.clearAllMocks();

    authState.user = doctorUser;
    useAppointments.mockReturnValue({ data: [], isLoading: false });
    usePatients.mockReturnValue({ data: patientsData });

    renderCalendarPage();

    expect(usePatients).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, status: "Alive", mocked: true }),
      { enabled: true },
    );
    expect(buildPatientParams).toHaveBeenCalledWith({ page: 1, status: "Alive" });
  });

  test("calendar receives appointment events and renders patient-view doctor title", () => {
    authState.user = patientUser;
    useAppointments.mockReturnValue({ data: [appointment], isLoading: false });
    usePatients.mockReturnValue({ data: { items: [] } });

    renderCalendarPage();

    expect(screen.getByTestId("event-count").textContent).toBe("1");
    expect(screen.getByText("Dr: Dr. Smith")).toBeInTheDocument();
  });

  test("calendar receives appointment events and renders doctor-view patient title", () => {
    authState.user = doctorUser;
    useAppointments.mockReturnValue({ data: [appointment], isLoading: false });
    usePatients.mockReturnValue({ data: patientsData });

    renderCalendarPage();

    expect(screen.getByTestId("event-count").textContent).toBe("1");
    expect(screen.getByText("P: John Doe")).toBeInTheDocument();
  });

  test("appointment action modal starts closed", () => {
    authState.user = patientUser;
    useAppointments.mockReturnValue({ data: [], isLoading: false });

    renderCalendarPage();

    expect(screen.queryByTestId("appointment-modal")).not.toBeInTheDocument();
  });

  describe("appointment creation", () => {
    test("shows missing-fields toast when patient and date are empty", () => {
      authState.user = doctorUser;
      const createMutate = vi.fn();
      useCreateAppointment.mockReturnValue({ mutate: createMutate, isPending: false });
      useAppointments.mockReturnValue({ data: [], isLoading: false });
      usePatients.mockReturnValue({ data: patientsData });

      renderCalendarPage();
      fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

      expect(toast.error).toHaveBeenCalledWith("Please select a patient and a date");
      expect(createMutate).not.toHaveBeenCalled();
    });

    test("shows missing-fields toast when only patient is selected", () => {
      authState.user = doctorUser;
      const createMutate = vi.fn();
      useCreateAppointment.mockReturnValue({ mutate: createMutate, isPending: false });
      useAppointments.mockReturnValue({ data: [], isLoading: false });
      usePatients.mockReturnValue({ data: patientsData });

      renderCalendarPage();
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "p1" } });
      fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

      expect(toast.error).toHaveBeenCalledWith("Please select a patient and a date");
      expect(createMutate).not.toHaveBeenCalled();
    });

    test("shows invalid-range toast when end is before start", () => {
      authState.user = doctorUser;
      const createMutate = vi.fn();
      useCreateAppointment.mockReturnValue({ mutate: createMutate, isPending: false });
      useAppointments.mockReturnValue({ data: [], isLoading: false });
      usePatients.mockReturnValue({ data: patientsData });

      renderCalendarPage();
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "p1" } });
      fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "start" } });
      fireEvent.change(screen.getByPlaceholderText("End"), { target: { value: "earlyEnd" } });
      fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

      expect(toast.error).toHaveBeenCalledWith("Please select a valid time range");
      expect(createMutate).not.toHaveBeenCalled();
    });

    test("shows overlap toast when requested range overlaps existing appointment", () => {
      authState.user = doctorUser;
      const createMutate = vi.fn();
      useCreateAppointment.mockReturnValue({ mutate: createMutate, isPending: false });
      useAppointments.mockReturnValue({ data: [existingAppointment], isLoading: false });
      usePatients.mockReturnValue({ data: patientsData });

      renderCalendarPage();
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "p1" } });
      fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "overlapStart" } });
      fireEvent.change(screen.getByPlaceholderText("End"), { target: { value: "overlapEnd" } });
      fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

      expect(toast.error).toHaveBeenCalledWith("That time range is already taken!", {
        icon: "🚫",
        duration: 4000,
      });
      expect(createMutate).not.toHaveBeenCalled();
    });

    test("calls create mutation with selected patient, dates, and reason", () => {
      authState.user = doctorUser;
      const createMutate = vi.fn();
      useCreateAppointment.mockReturnValue({ mutate: createMutate, isPending: false });
      useAppointments.mockReturnValue({ data: [existingAppointment], isLoading: false });
      usePatients.mockReturnValue({ data: patientsData });

      renderCalendarPage();
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "p1" } });
      fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "laterStart" } });
      fireEvent.change(screen.getByPlaceholderText("End"), { target: { value: "laterEnd" } });
      fireEvent.change(screen.getByPlaceholderText("e.g. Follow up..."), {
        target: { value: "Follow up visit" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

      expect(createMutate).toHaveBeenCalledTimes(1);
      const [payload, options] = createMutate.mock.calls[0];
      expect(payload).toEqual({
        patientId: "p1",
        start: dateMap.laterStart,
        end: dateMap.laterEnd,
        reason: "Follow up visit",
      });
      expect(typeof options.onSuccess).toBe("function");
    });

    test("uses default reason when reason input is empty or whitespace", () => {
      authState.user = doctorUser;
      const createMutate = vi.fn();
      useCreateAppointment.mockReturnValue({ mutate: createMutate, isPending: false });
      useAppointments.mockReturnValue({ data: [], isLoading: false });
      usePatients.mockReturnValue({ data: patientsData });

      renderCalendarPage();
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "p1" } });
      fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "start" } });
      fireEvent.change(screen.getByPlaceholderText("End"), { target: { value: "end" } });
      fireEvent.change(screen.getByPlaceholderText("e.g. Follow up..."), {
        target: { value: "   " },
      });
      fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

      expect(createMutate).toHaveBeenCalledTimes(1);
      expect(createMutate.mock.calls[0][0]).toEqual({
        patientId: "p1",
        start: dateMap.start,
        end: dateMap.end,
        reason: "General consultation",
      });
    });

    test("recalculates end from selected start and duration", () => {
      authState.user = doctorUser;
      const createMutate = vi.fn();
      useCreateAppointment.mockReturnValue({ mutate: createMutate, isPending: false });
      useAppointments.mockReturnValue({ data: [], isLoading: false });
      usePatients.mockReturnValue({ data: patientsData });

      renderCalendarPage();
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "p1" } });
      fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "start" } });
      fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "120" } });
      fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

      expect(createMutate).toHaveBeenCalledTimes(1);
      expect(createMutate.mock.calls[0][0]).toEqual({
        patientId: "p1",
        start: dateMap.start,
        end: new Date(dateMap.start.getTime() + 120 * 60 * 1000),
        reason: "General consultation",
      });
    });

    test("resets form fields on successful create", () => {
      authState.user = doctorUser;
      const createMutate = vi.fn();
      useCreateAppointment.mockReturnValue({ mutate: createMutate, isPending: false });
      useAppointments.mockReturnValue({ data: [], isLoading: false });
      usePatients.mockReturnValue({ data: patientsData });

      renderCalendarPage();
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "p1" } });
      fireEvent.change(screen.getByPlaceholderText("Start"), { target: { value: "start" } });
      fireEvent.change(screen.getByPlaceholderText("End"), { target: { value: "end" } });
      fireEvent.change(screen.getByPlaceholderText("e.g. Follow up..."), {
        target: { value: "Follow up visit" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

      const [, options] = createMutate.mock.calls[0];
      act(() => options.onSuccess());

      expect(screen.getAllByRole("combobox")[0]).toHaveValue("");
      expect(screen.getByPlaceholderText("e.g. Follow up...")).toHaveValue("");
      expect(screen.getAllByTestId("localized-date-picker")[0]).toHaveValue("");
      expect(screen.getAllByTestId("localized-date-picker")[1]).toHaveValue("");
      expect(screen.getAllByRole("combobox")[1]).toHaveValue("60");
    });

    test("disables schedule button and shows scheduling text while mutation is pending", () => {
      authState.user = doctorUser;
      useCreateAppointment.mockReturnValue({ mutate: vi.fn(), isPending: true });
      useAppointments.mockReturnValue({ data: [], isLoading: false });
      usePatients.mockReturnValue({ data: patientsData });

      renderCalendarPage();

      const button = screen.getByRole("button", { name: "Scheduling..." });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });
  });

  describe("event selection and modal actions", () => {
    test("patient selecting pending appointment opens pending modal", () => {
      authState.user = patientUser;
      useAppointments.mockReturnValue({ data: [appointment], isLoading: false });

      renderCalendarPage();
      fireEvent.click(screen.getByRole("button", { name: "Select event appt-1" }));

      expect(screen.getByTestId("appointment-modal")).toBeInTheDocument();
      expect(screen.getByText("Modal mode: pending")).toBeInTheDocument();
      expect(screen.getByText("Modal event: appt-1")).toBeInTheDocument();
      expect(screen.getByText("Modal isDoctor: false")).toBeInTheDocument();
    });

    test("patient selecting accepted appointment opens cancel modal", () => {
      authState.user = patientUser;
      useAppointments.mockReturnValue({ data: [acceptedAppointment], isLoading: false });

      renderCalendarPage();
      fireEvent.click(screen.getByRole("button", { name: "Select event appt-accepted" }));

      expect(screen.getByTestId("appointment-modal")).toBeInTheDocument();
      expect(screen.getByText("Modal mode: cancel")).toBeInTheDocument();
      expect(screen.getByText("Modal event: appt-accepted")).toBeInTheDocument();
    });

    test("doctor selecting pending appointment opens cancel modal", () => {
      authState.user = doctorUser;
      usePatients.mockReturnValue({ data: patientsData });
      useAppointments.mockReturnValue({ data: [appointment], isLoading: false });

      renderCalendarPage();
      fireEvent.click(screen.getByRole("button", { name: "Select event appt-1" }));

      expect(screen.getByTestId("appointment-modal")).toBeInTheDocument();
      expect(screen.getByText("Modal mode: cancel")).toBeInTheDocument();
      expect(screen.getByText("Modal isDoctor: true")).toBeInTheDocument();
    });

    test("selecting event without id does not open modal", () => {
      authState.user = patientUser;
      useAppointments.mockReturnValue({ data: [noIdAppointment], isLoading: false });

      renderCalendarPage();
      fireEvent.click(screen.getByRole("button", { name: "Select event 0" }));

      expect(screen.queryByTestId("appointment-modal")).not.toBeInTheDocument();
    });

    test("closing modal hides it", () => {
      authState.user = patientUser;
      useAppointments.mockReturnValue({ data: [appointment], isLoading: false });

      renderCalendarPage();
      fireEvent.click(screen.getByRole("button", { name: "Select event appt-1" }));
      expect(screen.getByTestId("appointment-modal")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
      expect(screen.queryByTestId("appointment-modal")).not.toBeInTheDocument();
    });

    test("accept action calls accept mutation and closes modal on success", () => {
      authState.user = patientUser;
      const acceptMutate = vi.fn();
      useAcceptAppointment.mockReturnValue({ mutate: acceptMutate, isPending: false });
      useAppointments.mockReturnValue({ data: [appointment], isLoading: false });

      renderCalendarPage();
      fireEvent.click(screen.getByRole("button", { name: "Select event appt-1" }));
      fireEvent.click(screen.getByRole("button", { name: "Accept modal" }));

      expect(acceptMutate).toHaveBeenCalledTimes(1);
      expect(acceptMutate.mock.calls[0][0]).toBe("appt-1");
      expect(typeof acceptMutate.mock.calls[0][1].onSuccess).toBe("function");

      act(() => acceptMutate.mock.calls[0][1].onSuccess());
      expect(screen.queryByTestId("appointment-modal")).not.toBeInTheDocument();
    });

    test("reject action from pending modal calls reject mutation and closes modal on success", () => {
      authState.user = patientUser;
      const rejectMutate = vi.fn();
      useRejectAppointment.mockReturnValue({ mutate: rejectMutate, isPending: false });
      useAppointments.mockReturnValue({ data: [appointment], isLoading: false });

      renderCalendarPage();
      fireEvent.click(screen.getByRole("button", { name: "Select event appt-1" }));
      fireEvent.click(screen.getByRole("button", { name: "Reject modal" }));

      expect(rejectMutate).toHaveBeenCalledTimes(1);
      expect(rejectMutate.mock.calls[0][0]).toBe("appt-1");
      expect(typeof rejectMutate.mock.calls[0][1].onSuccess).toBe("function");

      act(() => rejectMutate.mock.calls[0][1].onSuccess());
      expect(screen.queryByTestId("appointment-modal")).not.toBeInTheDocument();
    });

    test("reject action from cancel modal calls reject mutation", () => {
      authState.user = doctorUser;
      const rejectMutate = vi.fn();
      useRejectAppointment.mockReturnValue({ mutate: rejectMutate, isPending: false });
      usePatients.mockReturnValue({ data: patientsData });
      useAppointments.mockReturnValue({ data: [acceptedAppointment], isLoading: false });

      renderCalendarPage();
      fireEvent.click(screen.getByRole("button", { name: "Select event appt-accepted" }));
      fireEvent.click(screen.getByRole("button", { name: "Reject modal" }));

      expect(rejectMutate).toHaveBeenCalledTimes(1);
      expect(rejectMutate.mock.calls[0][0]).toBe("appt-accepted");
      expect(typeof rejectMutate.mock.calls[0][1].onSuccess).toBe("function");
    });

    test("modal shows busy state when accept mutation is pending", () => {
      authState.user = patientUser;
      useAcceptAppointment.mockReturnValue({ mutate: vi.fn(), isPending: true });
      useAppointments.mockReturnValue({ data: [appointment], isLoading: false });

      renderCalendarPage();
      fireEvent.click(screen.getByRole("button", { name: "Select event appt-1" }));

      expect(screen.getByText("Modal busy: true")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Accept modal" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Reject modal" })).toBeDisabled();
    });

    test("modal shows busy state when reject mutation is pending", () => {
      authState.user = patientUser;
      useRejectAppointment.mockReturnValue({ mutate: vi.fn(), isPending: true });
      useAppointments.mockReturnValue({ data: [appointment], isLoading: false });

      renderCalendarPage();
      fireEvent.click(screen.getByRole("button", { name: "Select event appt-1" }));

      expect(screen.getByText("Modal busy: true")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Accept modal" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Reject modal" })).toBeDisabled();
    });
  });
});
