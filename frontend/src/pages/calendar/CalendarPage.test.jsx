import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import CalendarPage from "./CalendarPage.jsx";

const authState = vi.hoisted(() => ({
  user: null,
}));

vi.mock("react-big-calendar", () => ({
  Calendar: ({ events, culture, titleAccessor }) => (
    <div data-testid="calendar">
      <div data-testid="event-count">{events?.length ?? 0}</div>
      <div data-testid="culture">{culture}</div>
      {events?.map((evt, idx) => (
        <div key={idx} data-testid="event-title">
          {typeof titleAccessor === "function" ? titleAccessor(evt) : evt.title}
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
  default: ({ open, mode }) =>
    open ? <div data-testid="appointment-modal">{mode}</div> : null,
}));

vi.mock("../../components/forms/LocalizedDatePicker.jsx", () => ({
  default: ({ value, placeholder }) => (
    <input
      type="text"
      data-testid="localized-date-picker"
      value={value ? value.toISOString() : ""}
      readOnly
      placeholder={placeholder}
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

const renderCalendarPage = () => render(<CalendarPage />);

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
    resetAuth();
    resetMocks();
  });

  test("renders loading state while appointments are loading", () => {
    authState.user = patientUser;
    useAppointments.mockReturnValue({ data: undefined, isLoading: true });

    renderCalendarPage();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
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

    const comboboxes = screen.getAllByRole("combobox");
    const patientSelect = comboboxes[0];
    expect(patientSelect).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    const optionTexts = options.map((o) => o.textContent);
    expect(optionTexts).toContain("Choose a patient...");
    expect(optionTexts).toContain("Ana Patient");
    expect(optionTexts).toContain("Luis Patient");

    const datePickers = screen.getAllByTestId("localized-date-picker");
    expect(datePickers.length).toBeGreaterThanOrEqual(2);
    expect(datePickers[0]).toHaveAttribute("placeholder", "Start");
    expect(datePickers[1]).toHaveAttribute("placeholder", "End");

    expect(screen.getByPlaceholderText("e.g. Follow up...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByTestId("calendar")).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes("Pending"))).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes("Accepted"))).toBeInTheDocument();
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
});
