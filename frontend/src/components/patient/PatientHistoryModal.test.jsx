import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import PatientHistoryModal from "./PatientHistoryModal.jsx";
import en from "../../locals/en/common.json";
import es from "../../locals/es/common.json";
import {
  useChildHistory,
  useMyHistory,
  usePatientHistory,
  useTranslatePatientHistorySnapshot,
} from "../../features/patients/phooks.js";

const locale = vi.hoisted(() => ({ language: "en" }));

vi.mock("lucide-react", () => ({
  History: () => <span data-testid="history-icon" />,
  Languages: () => <span data-testid="languages-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
  X: () => <span data-testid="close-icon" />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: locale,
    t: (key) =>
      ({
        "patients.history.title": "Patient History",
        "patients.history.empty": "No history versions found.",
        "patients.history.systemUnknown": "System/Unknown",
        "patients.history.location": "Location",
        "patients.history.deceasedLabel": "Deceased",
        "patients.history.none": "None",
        "patients.history.notRecorded": "Not recorded",
        "patients.history.cleared": "Cleared in this version",
        "patients.history.childrenCount": "Number of children",
        "patients.detail.children": "Children",
        "patients.card.age": "Age",
        "patients.card.gender": "Gender",
        "patients.card.genderMale": "Male",
        "patients.card.genderFemale": "Female",
        "patients.card.blood": "Blood",
        "patients.create.placeOfResidence": "Place of Residence",
        "patients.create.placeOfBirth": "Place of Birth",
        "patients.create.yes": "Yes",
        "patients.create.no": "No",
        "patients.detail.height": "Height",
        "patients.detail.weight": "Weight",
        "patients.detail.diseases": "Diseases",
        "patients.detail.allergies": "Allergies",
        "patients.detail.medications": "Medications",
        "patients.detail.notSpecified": "Not specified",
        "common.close": "Close",
        "common.view": "View",
        "common.translate": "Translate",
      }[key] ?? key.split(".").reduce((value, part) => value?.[part], locale.language === "es" ? es : en) ?? key),
  }),
}));

vi.mock("../../features/patients/phooks.js", () => ({
  useChildHistory: vi.fn(),
  useMyHistory: vi.fn(),
  usePatientHistory: vi.fn(),
  useTranslatePatientHistorySnapshot: vi.fn(),
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: (select) => select({ user: { _id: "synthetic-doctor" } }),
}));

vi.mock("../../utilsfront/geoLabels.js", () => ({
  localizeCityName: ({ cityName }) => cityName || "",
  localizeCountryName: (countryName) => countryName || "",
  localizeStateName: ({ stateName }) => stateName || "",
}));

const baseSnapshot = (overrides = {}) => ({
  fullname: "Ana Martinez",
  age: 36,
  gender: "female",
  bloodtype: "O+",
  country: "United States",
  state: "California",
  city: "San Diego",
  birthCountry: "Mexico",
  birthState: "Baja California",
  birthCity: "Mexicali",
  measurementSystem: "metric",
  heightM: 1.68,
  weightKg: 63,
  isDeceased: false,
  diseases: [],
  allergies: [],
  medications: [],
  ...overrides,
});

const historyWithSnapshot = (snapshot) => [
  {
    _id: "history-1",
    approvedAt: "2026-01-02T12:00:00.000Z",
    editedBy: { name: "Dr. QA" },
    approvedSnapshot: { set: snapshot },
  },
];

const renderModal = (snapshot) => {
  usePatientHistory.mockReturnValue({
    data: historyWithSnapshot(snapshot),
    isLoading: false,
  });

  render(<PatientHistoryModal variant="doctor" patientId="patient-1" onClose={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: /view/i }));
};

describe("PatientHistoryModal birthplace snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChildHistory.mockReturnValue({ data: [], isLoading: false });
    useMyHistory.mockReturnValue({ data: [], isLoading: false });
    usePatientHistory.mockReturnValue({ data: [], isLoading: false });
    useTranslatePatientHistorySnapshot.mockReturnValue({ mutate: vi.fn() });
  });

  test("renders complete birthplace separately from residence", () => {
    renderModal(baseSnapshot());

    const locationLabel = screen.getByText("Place of Residence:");
    expect(locationLabel.parentElement).toHaveTextContent(
      "United States, California, San Diego",
    );

    const birthplaceLabel = screen.getByText("Place of Birth:");
    expect(birthplaceLabel.parentElement).toHaveTextContent(
      "Mexico, Baja California, Mexicali",
    );
    expect(birthplaceLabel.parentElement).not.toHaveTextContent(
      "United States, California, San Diego",
    );
  });

  test("renders not specified when birthplace is missing", () => {
    renderModal(
      baseSnapshot({
        birthCountry: undefined,
        birthState: undefined,
        birthCity: undefined,
      }),
    );

    const snapshotPanel = screen.getByText("Ana Martinez").closest(".grid");
    expect(snapshotPanel).toBeInTheDocument();
    expect(within(snapshotPanel).getByText("Place of Residence:").parentElement).toHaveTextContent(
      "United States, California, San Diego",
    );
    expect(within(snapshotPanel).getByText("Place of Birth:").parentElement).toHaveTextContent(
      "Not specified",
    );
  });
});

test("unresolved proposals display recorded values, empty lists, and unavailable fields distinctly", () => {
  useMyHistory.mockReturnValue({
    data: [{
      _id: "unresolved-id",
      eventType: "unresolvedAtDeath",
      eventAt: "2026-01-20T00:00:00Z",
      proposedSnapshot: { set: {
        fullname: "Historical patient",
        children: [{ name: "Synthetic first" }, { name: "Synthetic second" }],
        childrenCount: 2,
        allergies: [],
        medications: ["Recorded drug 5 mg"],
        organDonor: false,
      } },
    }],
  });
  render(<PatientHistoryModal onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /view/i }));
  expect(screen.getByText("Unresolved at time of death")).toBeInTheDocument();
  expect(screen.getByText("Synthetic first, Synthetic second")).toBeInTheDocument();
  expect(screen.getByText("2", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("Recorded drug 5 mg")).toBeInTheDocument();
  expect(screen.getByText("Allergies:").parentElement).toHaveTextContent("None");
  expect(screen.getByText("Diseases:").parentElement).toHaveTextContent("Not recorded");
  expect(screen.getByText("No", { exact: true })).toBeInTheDocument();
});

describe("localized history labels", () => {
  beforeEach(() => {
    useChildHistory.mockReturnValue({ data: [] });
    useMyHistory.mockReturnValue({ data: [] });
    usePatientHistory.mockReturnValue({ data: [] });
    useTranslatePatientHistorySnapshot.mockReturnValue({ mutate: vi.fn() });
  });

  afterEach(() => { locale.language = "en"; });

  test.each([
    ["patient", "en"], ["patient", "es"],
    ["doctor", "en"], ["doctor", "es"],
    ["child", "en"], ["child", "es"],
  ])("attributes each event independently for the %s view in %s", (variant, language) => {
    locale.language = language;
    const catalog = language === "es" ? es : en;
    const timestamp = "2026-01-20T00:00:00Z";
    const snapshot = { set: baseSnapshot() };
    const eventTypes = ["deathStatus", "deathRecorded", "deathCorrected", "unresolvedAtDeath", "approved", "rejected", "guardianReassigned"];
    const labels = language === "es"
      ? ["Registrado por", "Registrado por", "Registrado por", "Propuesto por", "Editado por", "Propuesto por", "Editado por"]
      : ["Recorded by", "Recorded by", "Recorded by", "Proposed by", "Edited by", "Proposed by", "Edited by"];
    const events = eventTypes.map((eventType) => ({
      _id: eventType,
      eventType,
      eventAt: timestamp,
      editedBy: { name: "Dr VIPS" },
      ...(eventType === "rejected" || eventType === "unresolvedAtDeath"
        ? { proposedSnapshot: snapshot }
        : { approvedSnapshot: snapshot }),
    }));
    const query = { doctor: usePatientHistory, patient: useMyHistory, child: useChildHistory }[variant];
    query.mockReturnValue({ data: events });
    render(<PatientHistoryModal variant={variant} patientId="patient-1" onClose={vi.fn()} />);

    for (const [index, eventType] of eventTypes.entries()) {
      const row = screen.getByText(catalog.patients.history.events[eventType]).closest("button");
      expect(within(row).getByText(`${labels[index]}: Dr VIPS`)).toBeInTheDocument();
      expect(within(row).getByText(new Date(timestamp).toLocaleString(language))).toBeInTheDocument();
    }
  });

  test.each([
    ["en", "healthy", "BMI: 23.2 (Healthy)"],
    ["es", "healthy", "IMC: 23.2 (Saludable)"],
    ["en", " Normal ", "BMI: 23.2 (Healthy)"],
    ["es", "underweight", "IMC: 23.2 (Bajo peso)"],
    ["en", "OVERWEIGHT", "BMI: 23.2 (Overweight)"],
    ["en", undefined, "BMI: 23.2"],
    ["es", "unknown", "IMC: 23.2"],
  ])("renders BMI in %s with category %s", (language, bmiCategory, expected) => {
    locale.language = language;
    renderModal(baseSnapshot({ bmi: 23.2, bmiCategory }));
    const label = screen.getByText(language === "es" ? "IMC:" : "BMI:");
    expect(label.parentElement.textContent).toBe(expected);
  });
});

test("a translation response from another language or patient cannot replace the visible version", () => {
  const translate = vi.fn();
  useTranslatePatientHistorySnapshot.mockReturnValue({ mutate: translate });
  usePatientHistory.mockImplementation((id) => ({
    data: historyWithSnapshot(baseSnapshot({ fullname: id === "patient-1" ? "First patient" : "Second patient" })),
  }));
  const modal = (id) => <PatientHistoryModal variant="doctor" patientId={id} onClose={vi.fn()} />;
  const { rerender } = render(modal("patient-1"));
  fireEvent.click(screen.getByRole("button", { name: /view/i }));
  fireEvent.click(screen.getByRole("button", { name: "Translate" }));
  const callback = translate.mock.calls[0][1];
  locale.language = "es";
  try {
    rerender(modal("patient-1"));
    act(() => callback.onSuccess({ approvedSnapshot: { set: { fullname: "Stale translation" } } }));
    expect(screen.getByText("First patient")).toBeInTheDocument();
    expect(screen.queryByText("Stale translation")).not.toBeInTheDocument();
    rerender(modal("patient-2"));
    fireEvent.click(screen.getByRole("button", { name: /view/i }));
    expect(screen.getByText("Second patient")).toBeInTheDocument();
    expect(screen.queryByText("First patient")).not.toBeInTheDocument();
  } finally {
    locale.language = "en";
  }
});

test("does not expose cached minor history while current access is checked or after revocation", () => {
  const data = historyWithSnapshot(baseSnapshot({ fullname: "Cached child history" }));
  const modal = <PatientHistoryModal variant="child" patientId="child-1" onClose={vi.fn()} />;
  useChildHistory.mockReturnValue({ data, isFetching: true });
  const { rerender } = render(modal);
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(screen.queryByText("Cached child history")).not.toBeInTheDocument();
  useChildHistory.mockReturnValue({ data, isError: true });
  rerender(<PatientHistoryModal variant="child" patientId="child-1" onClose={vi.fn()} />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("Cached child history")).not.toBeInTheDocument();
});

describe("PatientHistoryModal accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChildHistory.mockReturnValue({ data: [], isLoading: false });
    useMyHistory.mockReturnValue({ data: [], isLoading: false });
    usePatientHistory.mockReturnValue({ data: [], isLoading: false });
    useTranslatePatientHistorySnapshot.mockReturnValue({ mutate: vi.fn() });
  });

  const renderA11yModal = ({ onClose = vi.fn(), variant = "doctor", patientId = "patient-1" } = {}) => {
    usePatientHistory.mockReturnValue({ data: historyWithSnapshot(baseSnapshot()), isLoading: false });
    useChildHistory.mockReturnValue({ data: [], isLoading: false });
    useMyHistory.mockReturnValue({ data: [], isLoading: false });
    render(<PatientHistoryModal variant={variant} patientId={patientId} onClose={onClose} />);
    return { onClose };
  };

  test("renders with role dialog and aria-modal", () => {
    renderA11yModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "patient-history-title");
    expect(screen.getByText("Patient History")).toBeInTheDocument();
  });

  test("close X button calls onClose", () => {
    const onClose = vi.fn();
    renderA11yModal({ onClose });
    const closeButtons = screen.getAllByRole("button", { name: /^Close$/i });
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("footer Close button calls onClose", () => {
    const onClose = vi.fn();
    renderA11yModal({ onClose });
    const closeButtons = screen.getAllByRole("button", { name: /^Close$/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Escape calls onClose", () => {
    const onClose = vi.fn();
    renderA11yModal({ onClose });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Tab on last focusable cycles to first and Shift+Tab on first cycles to last", () => {
    renderA11yModal();
    const dialog = screen.getByRole("dialog");
    const buttons = within(dialog).getAllByRole("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  test("backdrop click calls onClose", () => {
    const onClose = vi.fn();
    renderA11yModal({ onClose });
    const overlay = screen.getByRole("dialog").parentElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("inside click does not close", () => {
    const onClose = vi.fn();
    renderA11yModal({ onClose });
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("expand and collapse history item", () => {
    renderA11yModal();
    expect(screen.getByText("Ana Martinez")).toBeInTheDocument();
    expect(screen.queryByText("Age:")).not.toBeInTheDocument();
    const expandButton = screen.getByText(/Edited by/).closest("button");
    fireEvent.click(expandButton);
    expect(screen.getByText("Age:")).toBeInTheDocument();
    fireEvent.click(expandButton);
    expect(screen.queryByText("Age:")).not.toBeInTheDocument();
  });

  test("translate payload remains variant patientId historyId lang", () => {
    const mutate = vi.fn((_payload, options) => options?.onSuccess?.({ approvedSnapshot: { set: baseSnapshot() } }));
    useTranslatePatientHistorySnapshot.mockReturnValue({ mutate });
    renderA11yModal({ variant: "doctor", patientId: "patient-1" });
    fireEvent.click(screen.getByText(/Edited by/).closest("button"));
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(mutate).toHaveBeenCalledWith(
      { variant: "doctor", patientId: "patient-1", historyId: "history-1", lang: "en" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
