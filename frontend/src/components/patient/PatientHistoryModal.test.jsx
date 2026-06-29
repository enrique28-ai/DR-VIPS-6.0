import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import PatientHistoryModal from "./PatientHistoryModal.jsx";
import {
  useChildHistory,
  useMyHistory,
  usePatientHistory,
  useTranslatePatientHistorySnapshot,
} from "../../features/patients/phooks.js";

vi.mock("lucide-react", () => ({
  History: () => <span data-testid="history-icon" />,
  Languages: () => <span data-testid="languages-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
  X: () => <span data-testid="close-icon" />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key) =>
      ({
        "patients.history.title": "Patient History",
        "patients.history.empty": "No history versions found.",
        "patients.history.editedBy": "Edited by",
        "patients.history.systemUnknown": "System/Unknown",
        "patients.history.location": "Location",
        "patients.history.deceasedLabel": "Deceased",
        "patients.history.none": "None",
        "patients.card.age": "Age",
        "patients.card.gender": "Gender",
        "patients.card.genderMale": "Male",
        "patients.card.genderFemale": "Female",
        "patients.card.blood": "Blood",
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
      }[key] ?? key),
  }),
}));

vi.mock("../../features/patients/phooks.js", () => ({
  useChildHistory: vi.fn(),
  useMyHistory: vi.fn(),
  usePatientHistory: vi.fn(),
  useTranslatePatientHistorySnapshot: vi.fn(),
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

    const locationLabel = screen.getByText("Location:");
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
    expect(within(snapshotPanel).getByText("Location:").parentElement).toHaveTextContent(
      "United States, California, San Diego",
    );
    expect(within(snapshotPanel).getByText("Place of Birth:").parentElement).toHaveTextContent(
      "Not specified",
    );
  });
});
