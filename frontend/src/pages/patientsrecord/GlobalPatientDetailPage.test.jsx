import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import GlobalPatientDetailPage from "./GlobalPatientDetailPage.jsx";
import { useGlobalPatient, useImportPatient } from "../../features/patients/phooks.js";
import { localizeCountryName } from "../../utilsfront/geoLabels.js";

const { navigate } = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, whileHover, whileTap, ...props }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ id: "global-patient-id" }),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key) =>
      ({
        "common.back": "Back",
        "common.loading": "Loading",
        "patients.card.age": "Age",
        "patients.card.country": "Country",
        "patients.detail.email": "Email",
        "patients.detail.notFoundText": "Patient not found",
        "patients.detail.phone": "Phone",
        "patients.global.alreadyOwned": "You already have this patient.",
        "patients.global.goToDetail": "Go to Patient Detail",
        "patients.global.importBtn": "Import Patient",
        "patients.global.importing": "Importing...",
        "patients.global.previewDesc": "Import this patient to your list.",
        "patients.global.previewMode": "Global Preview",
      }[key] ?? key),
  }),
}));

vi.mock("../../features/patients/phooks.js", () => ({
  useGlobalPatient: vi.fn(),
  useImportPatient: vi.fn(),
}));

vi.mock("../../utilsfront/geoLabels.js", () => ({
  localizeCountryName: vi.fn((country) => `Localized ${country}`),
}));

const globalPatient = (overrides = {}) => ({
  _id: "patient-id",
  fullname: "Global Patient",
  email: "global@example.com",
  phone: "+12025550123",
  country: "Mexico",
  age: 42,
  amIOwner: false,
  birthCountry: "Private birthplace",
  diagnoses: "Private diagnosis",
  medicalHistory: "Private history",
  parentEmail: "guardian@example.com",
  ...overrides,
});

const importMutate = vi.fn();

const renderGlobalPatientDetail = (patient = globalPatient(), queryState = {}) => {
  useGlobalPatient.mockReturnValue({
    data: patient,
    isLoading: false,
    isError: false,
    ...queryState,
  });

  return render(
    <MemoryRouter>
      <GlobalPatientDetailPage />
    </MemoryRouter>,
  );
};

describe("GlobalPatientDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useImportPatient.mockReturnValue({
      mutate: importMutate,
      isPending: false,
    });
  });

  test("renders loading state while the global patient is loading", () => {
    renderGlobalPatientDetail(undefined, {
      data: undefined,
      isLoading: true,
    });

    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(useGlobalPatient).toHaveBeenCalledWith("global-patient-id");
  });

  test("renders not-found state with recovery action when the global patient cannot be loaded", () => {
    renderGlobalPatientDetail(undefined, {
      data: undefined,
      isError: true,
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Patient not found");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(navigate).toHaveBeenCalledWith("/patients/search");
  });

  test("shows already-owned state with a link to the local patient detail", () => {
    renderGlobalPatientDetail(globalPatient({ amIOwner: true }));

    expect(screen.getByText("You already have this patient.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Patient Detail" })).toHaveAttribute(
      "href",
      "/patients/patient-id",
    );
  });

  test("renders global preview fields with localized country", () => {
    renderGlobalPatientDetail();

    expect(screen.getAllByText("Global Preview").length).toBeGreaterThan(0);
    expect(screen.getByText("Import this patient to your list.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Global Patient" })).toBeInTheDocument();
    expect(screen.getAllByRole("term")).toHaveLength(4);
    expect(screen.getAllByRole("definition")).toHaveLength(4);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("global@example.com")).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("+12025550123")).toBeInTheDocument();
    expect(screen.getByText("Country")).toBeInTheDocument();
    expect(screen.getByText("Localized Mexico")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.queryByText("Private birthplace")).not.toBeInTheDocument();
    expect(screen.queryByText("Private diagnosis")).not.toBeInTheDocument();
    expect(screen.queryByText("Private history")).not.toBeInTheDocument();
    expect(screen.queryByText("guardian@example.com")).not.toBeInTheDocument();
    expect(localizeCountryName).toHaveBeenCalledWith("Mexico", "en");
  });

  test("back button navigates to global patient search", () => {
    renderGlobalPatientDetail();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(navigate).toHaveBeenCalledWith("/patients/search");
  });

  test("imports the global patient and navigates back to patients on success", () => {
    importMutate.mockImplementation((_patientId, options) => {
      options.onSuccess();
    });
    renderGlobalPatientDetail();

    fireEvent.click(screen.getByRole("button", { name: "Import Patient" }));

    expect(importMutate).toHaveBeenCalledWith(
      "patient-id",
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(navigate).toHaveBeenCalledWith("/patients");
  });

  test("shows pending import state and disables the import button", () => {
    useImportPatient.mockReturnValue({
      mutate: importMutate,
      isPending: true,
    });
    renderGlobalPatientDetail();

    expect(screen.getByRole("button", { name: "Importing..." })).toBeDisabled();
  });

  test("keeps decorative icons out of button accessible names", () => {
    renderGlobalPatientDetail();

    expect(screen.getByRole("button", { name: "Import Patient" })).toHaveAccessibleDescription(
      "Import this patient to your list.",
    );
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
  });
});
