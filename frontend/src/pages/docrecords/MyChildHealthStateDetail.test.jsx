import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MyChildHealthStateDetail from "./MyChildHealthStateDetail.jsx";
import {
  useMyChildDiagnosis,
  useTranslateChildDiagnosisHistorySnapshot,
} from "../../features/diagnostics/dhooks.js";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

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
        "common.back": "Back",
        "common.loading": "Loading",
        "common.translate": "Translate",
        "diagnoses.detail.notFound": "Diagnosis not found",
        "diagnoses.history.title": "History",
      }[key] ?? key),
  }),
}));

vi.mock("../../features/diagnostics/dhooks.js", async () => {
  const actual = await vi.importActual("../../features/diagnostics/dhooks.js");
  return {
    ...actual,
    useMyChildDiagnosis: vi.fn(),
    useTranslateChildDiagnosisHistorySnapshot: vi.fn(),
  };
});

vi.mock("../../components/diagnostic/DiagnosisHistoryModal.jsx", () => ({
  default: ({ variant, childId, diagnosisId, onClose }) => (
    <div role="dialog" aria-label="Child diagnosis history modal">
      <p>History modal variant {variant}</p>
      <p>History modal child {childId}</p>
      <p>History modal diagnosis {diagnosisId}</p>
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
  symptoms: ["fever"],
  ...overrides,
});

const renderDetail = (diagnosis = baseDiagnosis(), queryState = {}) => {
  useMyChildDiagnosis.mockReturnValue({
    data: diagnosis,
    isLoading: false,
    isError: false,
    ...queryState,
  });

  return render(
    <MemoryRouter
      initialEntries={["/docrecords/mychildren/child-profile-id/health-state/diagnosis-1"]}
    >
      <Routes>
        <Route
          path="/docrecords/mychildren/:childId/health-state/:id"
          element={<MyChildHealthStateDetail />}
        />
      </Routes>
    </MemoryRouter>,
  );
};

describe("MyChildHealthStateDetail", () => {
  let translateMutateAsync;

  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    translateMutateAsync = vi.fn().mockResolvedValue({});
    useTranslateChildDiagnosisHistorySnapshot.mockReturnValue({
      isPending: false,
      mutateAsync: translateMutateAsync,
    });
  });

  test("renders loading state while the child diagnosis is loading", () => {
    renderDetail(undefined, {
      data: undefined,
      isLoading: true,
      isError: false,
    });

    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(useMyChildDiagnosis).toHaveBeenCalledWith("child-profile-id", "diagnosis-1");
  });

  test("renders not-found state when child diagnosis data is missing", () => {
    renderDetail(null, {
      data: null,
      isLoading: false,
      isError: true,
    });

    expect(screen.getByText("Diagnosis not found")).toBeInTheDocument();
  });

  test("renders diagnosis title and description", () => {
    renderDetail();

    expect(screen.getByRole("heading", { name: "Flu diagnosis" })).toBeInTheDocument();
    expect(screen.getByText("Fever and cough")).toBeInTheDocument();
  });

  test("back button navigates to the previous page", () => {
    renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  test("does not apply a title fallback when the current component receives no title", () => {
    renderDetail(baseDiagnosis({ title: undefined, description: "Description only" }));

    expect(screen.getByRole("heading", { level: 1 })).toBeEmptyDOMElement();
    expect(screen.getByText("Description only")).toBeInTheDocument();
  });

  test("shows translate only when diagnosis text is available", () => {
    const { unmount } = renderDetail();

    expect(screen.getByRole("button", { name: "Translate" })).toBeInTheDocument();

    unmount();
    renderDetail(baseDiagnosis({ title: "", description: "", symptoms: [] }));

    expect(screen.queryByRole("button", { name: "Translate" })).not.toBeInTheDocument();
  });

  test("translate button calls the child diagnosis translation mutation with route params", async () => {
    renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    await waitFor(() => {
      expect(translateMutateAsync).toHaveBeenCalledWith({
        childId: "child-profile-id",
        diagnosisId: "diagnosis-1",
        lang: "en",
      });
    });
  });

  test("opens and closes the child diagnosis history modal with route params", () => {
    renderDetail();

    expect(
      screen.queryByRole("dialog", { name: "Child diagnosis history modal" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "History" }));

    const modal = screen.getByRole("dialog", { name: "Child diagnosis history modal" });
    expect(within(modal).getByText("History modal variant child")).toBeInTheDocument();
    expect(within(modal).getByText("History modal child child-profile-id")).toBeInTheDocument();
    expect(within(modal).getByText("History modal diagnosis diagnosis-1")).toBeInTheDocument();

    fireEvent.click(within(modal).getByRole("button", { name: "Close history" }));

    expect(
      screen.queryByRole("dialog", { name: "Child diagnosis history modal" }),
    ).not.toBeInTheDocument();
  });
});
