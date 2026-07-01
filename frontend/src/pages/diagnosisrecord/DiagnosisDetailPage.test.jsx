import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import DiagnosisDetailPage from "./DiagnosisDetailPage.jsx";
import { useDiagnosis, useTranslateDiagnosis } from "../../features/diagnostics/dhooks.js";

const navigate = vi.fn();

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
    useParams: () => ({ patientId: "patient-1", diagnosisId: "diagnosis-1" }),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key) =>
      ({
        "common.loading": "Loading",
        "common.translate": "Translate",
        "diagnoses.detail.back": "Back",
        "diagnoses.detail.backToList": "Back to list",
        "diagnoses.detail.created": "Created",
        "diagnoses.detail.description": "Description",
        "diagnoses.detail.edit": "Edit",
        "diagnoses.detail.history": "History",
        "diagnoses.detail.medicines": "Medicines",
        "diagnoses.detail.notFoundTitle": "Diagnosis not found",
        "diagnoses.detail.operations": "Operations",
        "diagnoses.detail.treatments": "Treatments",
        "diagnoses.detail.untitled": "Untitled diagnosis",
        "diagnoses.detail.updated": "Updated",
      }[key] ?? key),
  }),
}));

vi.mock("../../features/diagnostics/dhooks.js", () => ({
  useDiagnosis: vi.fn(),
  useTranslateDiagnosis: vi.fn(),
}));

vi.mock("../../components/diagnostic/DiagnosisHistoryModal.jsx", () => ({
  default: ({ diagnosisId, onClose }) => (
    <div role="dialog" aria-label="Diagnosis history modal">
      <p>History modal for {diagnosisId}</p>
      <button type="button" onClick={onClose}>
        Close history
      </button>
    </div>
  ),
}));

const baseDiagnosis = (overrides = {}) => ({
  _id: "diagnosis-1",
  title: "Flu diagnosis",
  description: "Fever and cough",
  medicine: ["Ibuprofen", "Acetaminophen"],
  treatment: ["Rest", "Hydration"],
  operation: ["Procedure A"],
  createdAt: "2026-06-21T12:00:00.000Z",
  updatedAt: "2026-06-22T12:00:00.000Z",
  ...overrides,
});

const renderDetailPage = (diagnosis = baseDiagnosis(), queryState = {}) => {
  useDiagnosis.mockReturnValue({
    data: diagnosis,
    isLoading: false,
    isError: false,
    ...queryState,
  });

  return render(
    <MemoryRouter>
      <DiagnosisDetailPage />
    </MemoryRouter>,
  );
};

describe("DiagnosisDetailPage", () => {
  let translate;

  beforeEach(() => {
    translate = vi.fn();
    vi.clearAllMocks();
    useTranslateDiagnosis.mockReturnValue({ mutate: translate, isPending: false });
  });

  test("renders a loading state while the diagnosis is loading without cached data", () => {
    renderDetailPage(undefined, {
      data: undefined,
      isLoading: true,
      isError: false,
    });

    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(useDiagnosis).toHaveBeenCalledWith("diagnosis-1");
  });

  test("renders the not-found state and navigates back to the patient diagnosis list", () => {
    renderDetailPage(null, {
      data: null,
      isLoading: false,
      isError: true,
    });

    expect(screen.getByRole("heading", { name: "Diagnosis not found" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));

    expect(navigate).toHaveBeenCalledWith("/diagnosis/patient/patient-1");
  });

  test("renders stable diagnosis detail content and route links", () => {
    renderDetailPage();

    expect(screen.getByRole("heading", { name: "Flu diagnosis" })).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Fever and cough")).toBeInTheDocument();
    expect(screen.getByText("Medicines")).toBeInTheDocument();
    expect(screen.getByText("Treatments")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByText("Ibuprofen")).toBeInTheDocument();
    expect(screen.getByText("Acetaminophen")).toBeInTheDocument();
    expect(screen.getByText("Rest")).toBeInTheDocument();
    expect(screen.getByText("Hydration")).toBeInTheDocument();
    expect(screen.getByText("Procedure A")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to list/i })).toHaveAttribute(
      "href",
      "/diagnosis/patient/patient-1",
    );
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/diagnosis/patient/patient-1/diagnosis-1/edit",
    );
  });

  test("falls back to the legacy Diagnostic field when title is missing", () => {
    renderDetailPage(
      baseDiagnosis({
        title: undefined,
        Diagnostic: "Legacy diagnosis title",
      }),
    );

    expect(screen.getByRole("heading", { name: "Legacy diagnosis title" })).toBeInTheDocument();
  });

  test("falls back to the untitled label when title fields are missing", () => {
    renderDetailPage(
      baseDiagnosis({
        title: undefined,
        Diagnostic: undefined,
      }),
    );

    expect(screen.getByRole("heading", { name: "Untitled diagnosis" })).toBeInTheDocument();
  });

  test("hides optional detail sections when arrays are missing or empty", () => {
    renderDetailPage(
      baseDiagnosis({
        medicine: [],
        treatment: undefined,
        operation: [],
      }),
    );

    expect(screen.queryByText("Medicines")).not.toBeInTheDocument();
    expect(screen.queryByText("Treatments")).not.toBeInTheDocument();
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
  });

  test("calls translate and replaces original detail with translated data on success", () => {
    translate = vi.fn((_payload, options) => {
      options.onSuccess({
        title: "Diagnostico traducido",
        description: "Descripcion traducida",
        medicine: ["Medicina traducida"],
        treatment: ["Tratamiento traducido"],
        operation: ["Operacion traducida"],
      });
    });
    useTranslateDiagnosis.mockReturnValue({ mutate: translate, isPending: false });
    renderDetailPage();

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    expect(translate).toHaveBeenCalledWith(
      { id: "diagnosis-1", lang: "en" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.getByRole("heading", { name: "Diagnostico traducido" })).toBeInTheDocument();
    expect(screen.getByText("Descripcion traducida")).toBeInTheDocument();
    expect(screen.getByText("Medicina traducida")).toBeInTheDocument();
    expect(screen.getByText("Tratamiento traducido")).toBeInTheDocument();
    expect(screen.getByText("Operacion traducida")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Flu diagnosis" })).not.toBeInTheDocument();
  });

  test("opens and closes the diagnosis history modal", () => {
    renderDetailPage();

    fireEvent.click(screen.getByRole("button", { name: "History" }));

    const modal = screen.getByRole("dialog", { name: "Diagnosis history modal" });
    expect(within(modal).getByText("History modal for diagnosis-1")).toBeInTheDocument();

    fireEvent.click(within(modal).getByRole("button", { name: "Close history" }));

    expect(screen.queryByRole("dialog", { name: "Diagnosis history modal" })).not.toBeInTheDocument();
  });
});
