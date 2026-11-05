import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MyHealthStateDetail from "./MyHealthStateDetail.jsx";
import { useMyDiagnosis, useTranslateMyDiagnosis } from "../../features/diagnostics/dhooks.js";

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, whileHover, whileTap, ...props }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key) =>
      ({
        "common.loading": "Loading",
        "common.translate": "Translate",
        "diagnoses.detail.created": "Created",
        "diagnoses.detail.description": "Description",
        "diagnoses.detail.history": "History",
        "diagnoses.detail.medicines": "Medicines",
        "diagnoses.detail.notFoundTitle": "Diagnosis not found",
        "diagnoses.detail.operations": "Operations",
        "diagnoses.detail.treatments": "Treatments",
        "diagnoses.detail.untitled": "Untitled diagnosis",
        "diagnoses.detail.updated": "Updated",
        "myHealthState.detail.backToState": "Back to health state",
        "myHealthState.detail.createdBy": "Created by",
        "myHealthState.detail.unknownDoctor": "Unknown doctor",
        "myHealthInfo.actions.clearTranslation": "Clear translation",
      }[key] ?? key),
  }),
}));

vi.mock("../../features/diagnostics/dhooks.js", async () => {
  const actual = await vi.importActual("../../features/diagnostics/dhooks.js");
  return {
    ...actual,
    useMyDiagnosis: vi.fn(),
    useTranslateMyDiagnosis: vi.fn(),
  };
});

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

vi.mock("../../i18n", () => ({
  default: {
    t: (key, fallback) => fallback ?? key,
  },
}));

const baseDiagnosis = (overrides = {}) => ({
  _id: "diagnosis-1",
  title: "Flu diagnosis",
  description: "Fever and cough",
  medicine: ["Ibuprofen", "Acetaminophen"],
  treatment: ["Rest", "Hydration"],
  operation: ["Procedure A"],
  createdBy: {
    name: "Dr. Smith",
    email: "smith@example.com",
  },
  createdAt: "2026-06-21T12:00:00.000Z",
  updatedAt: "2026-06-22T12:00:00.000Z",
  ...overrides,
});

const renderDetail = (diagnosis = baseDiagnosis(), queryState = {}) => {
  useMyDiagnosis.mockReturnValue({
    data: diagnosis,
    isLoading: false,
    isError: false,
    ...queryState,
  });

  return render(
    <MemoryRouter initialEntries={["/docrecords/myhealthstate/diagnosis-1"]}>
      <Routes>
        <Route path="/docrecords/myhealthstate/:id" element={<MyHealthStateDetail />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe("MyHealthStateDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTranslateMyDiagnosis.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  test("renders a loading state while the diagnosis is loading without cached data", () => {
    renderDetail(undefined, {
      data: undefined,
      isLoading: true,
      isError: false,
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(useMyDiagnosis).toHaveBeenCalledWith("diagnosis-1");
  });

  test("renders not-found state with a back link", () => {
    renderDetail(null, {
      data: null,
      isLoading: false,
      isError: true,
    });

    expect(screen.getByRole("heading", { name: "Diagnosis not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to health state" })).toHaveAttribute(
      "href",
      "/docrecords/myhealthstate",
    );
  });

  test("renders stable diagnosis detail content and back link", () => {
    renderDetail();

    expect(screen.getByRole("heading", { name: "Flu diagnosis" })).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Fever and cough")).toBeInTheDocument();
    expect(screen.getByText("Dr. Smith (smith@example.com)")).toBeInTheDocument();
    expect(screen.getByText(/Created:/)).toBeInTheDocument();
    expect(screen.getByText(/Updated:/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to health state/i })).toHaveAttribute(
      "href",
      "/docrecords/myhealthstate",
    );
  });

  test("falls back to legacy title fields and then the untitled label", () => {
    renderDetail(baseDiagnosis({ title: undefined, Diagnostic: "Legacy title" }));

    expect(screen.getByRole("heading", { name: "Legacy title" })).toBeInTheDocument();

    renderDetail(
      baseDiagnosis({
        title: undefined,
        Diagnostic: undefined,
        diagnosis: "Diagnosis field title",
      }),
    );

    expect(screen.getByRole("heading", { name: "Diagnosis field title" })).toBeInTheDocument();

    renderDetail(
      baseDiagnosis({
        title: undefined,
        Diagnostic: undefined,
        diagnosis: undefined,
      }),
    );

    expect(screen.getByRole("heading", { name: "Untitled diagnosis" })).toBeInTheDocument();
  });

  test("falls back to unknown doctor when creator metadata is missing", () => {
    renderDetail(baseDiagnosis({ createdBy: undefined }));

    expect(screen.getByText("Created by")).toBeInTheDocument();
    expect(screen.getByText("Unknown doctor")).toBeInTheDocument();
  });

  test("renders medicines, treatments, and operations when arrays have values", () => {
    renderDetail();

    expect(screen.getByText("Medicines")).toBeInTheDocument();
    expect(screen.getByText("Treatments")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByText("Ibuprofen")).toBeInTheDocument();
    expect(screen.getByText("Acetaminophen")).toBeInTheDocument();
    expect(screen.getByText("Rest")).toBeInTheDocument();
    expect(screen.getByText("Hydration")).toBeInTheDocument();
    expect(screen.getByText("Procedure A")).toBeInTheDocument();
  });

  test("hides optional sections when arrays are empty or missing", () => {
    renderDetail(
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

  test("translates the diagnosis and clears translated content without another request", () => {
    const translate = vi.fn((_payload, options) => {
      options.onSuccess({
        ...baseDiagnosis(),
        title: "Translated diagnosis",
        description: "Translated description",
        medicine: ["Translated medicine"],
      });
    });
    useTranslateMyDiagnosis.mockReturnValue({ mutate: translate, isPending: false });
    renderDetail();

    expect(screen.queryByRole("button", { name: "Clear translation" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    expect(translate).toHaveBeenCalledWith(
      { id: "diagnosis-1", lang: "en" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.getByRole("heading", { name: "Translated diagnosis" })).toBeInTheDocument();
    expect(screen.getByText("Translated description")).toBeInTheDocument();
    expect(screen.getByText("Translated medicine")).toBeInTheDocument();
    expect(screen.getAllByText("Translate")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Clear translation" }));

    expect(screen.getByRole("heading", { name: "Flu diagnosis" })).toBeInTheDocument();
    expect(screen.getByText("Fever and cough")).toBeInTheDocument();
    expect(screen.getByText("Ibuprofen")).toBeInTheDocument();
    expect(screen.queryByText("Translated description")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear translation" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Translate")).toHaveLength(1);
    expect(translate).toHaveBeenCalledTimes(1);
  });

  test("opens and closes the diagnosis history modal with the route diagnosis id", () => {
    renderDetail();

    expect(screen.queryByRole("dialog", { name: "Diagnosis history modal" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "History" }));

    const modal = screen.getByRole("dialog", { name: "Diagnosis history modal" });
    expect(within(modal).getByText("History modal for diagnosis-1")).toBeInTheDocument();

    fireEvent.click(within(modal).getByRole("button", { name: "Close history" }));

    expect(screen.queryByRole("dialog", { name: "Diagnosis history modal" })).not.toBeInTheDocument();
  });
});
