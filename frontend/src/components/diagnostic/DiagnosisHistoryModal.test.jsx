import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import DiagnosisHistoryModal from "./DiagnosisHistoryModal.jsx";
import {
  useDiagnosisHistory,
  useMyChildDiagnosisHistory,
  useTranslateChildDiagnosisHistorySnapshot,
  useTranslateDiagnosisHistorySnapshot,
} from "../../features/diagnostics/dhooks.js";

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, whileHover, whileTap, ...props }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

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
        "diagnoses.history.title": "Diagnosis History",
        "diagnoses.history.empty": "No history versions found.",
        "diagnoses.history.none": "None",
        "diagnoses.history.editedBy": "Edited by",
        "diagnoses.history.systemUnknown": "System/Unknown",
        "diagnoses.history.created": "Created",
        "diagnoses.history.updated": "Updated",
        "diagnoses.detail.untitled": "Untitled",
        "diagnoses.detail.description": "Description",
        "diagnoses.detail.medicines": "Medicines",
        "diagnoses.detail.treatments": "Treatments",
        "diagnoses.detail.operations": "Operations",
        "common.loading": "Loading...",
        "common.close": "Close",
        "common.view": "View",
      }[key] ?? key),
  }),
}));

vi.mock("../../features/diagnostics/dhooks.js", () => ({
  useDiagnosisHistory: vi.fn(),
  useMyChildDiagnosisHistory: vi.fn(),
  useTranslateDiagnosisHistorySnapshot: vi.fn(),
  useTranslateChildDiagnosisHistorySnapshot: vi.fn(),
}));

const historyItem = {
  _id: "history-1",
  createdAt: "2026-01-02T12:00:00.000Z",
  changeType: "created",
  editedBy: { name: "Dr. QA", email: "qa@example.com" },
  snapshot: {
    title: "Flu diagnosis",
    description: "Fever and cough",
    medicine: ["Ibuprofen"],
    treatment: ["Rest"],
    operation: [],
  },
};

let onClose;
let selfMutate;
let childMutate;

beforeEach(() => {
  vi.clearAllMocks();
  onClose = vi.fn();
  selfMutate = vi.fn();
  childMutate = vi.fn();
  useDiagnosisHistory.mockReturnValue({ data: [historyItem], isLoading: false });
  useMyChildDiagnosisHistory.mockReturnValue({ data: [historyItem], isLoading: false });
  useTranslateDiagnosisHistorySnapshot.mockReturnValue({ mutate: selfMutate });
  useTranslateChildDiagnosisHistorySnapshot.mockReturnValue({ mutate: childMutate });
});

const renderModal = (props = {}) => {
  return render(
    <DiagnosisHistoryModal diagnosisId="diagnosis-1" onClose={onClose} {...props} />,
  );
};

describe("DiagnosisHistoryModal", () => {
  test("renders with role dialog and aria-modal", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "diagnosis-history-title");
    expect(screen.getByText("Diagnosis History")).toBeInTheDocument();
  });

  test("close button calls onClose", () => {
    renderModal();
    const closeButtons = screen.getAllByRole("button", { name: /^Close$/i });
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Escape calls onClose", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("backdrop click calls onClose but inside click does not", () => {
    renderModal();
    const overlay = screen.getByRole("dialog").parentElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("footer Close button calls onClose", () => {
    renderModal();
    const closeButtons = screen.getAllByRole("button", { name: /^Close$/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("self variant translate payload", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /View/i }));
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(selfMutate).toHaveBeenCalledWith(
      { diagnosisId: "diagnosis-1", historyId: "history-1", lang: "en" },
      expect.any(Object),
    );
  });

  test("child variant translate payload", () => {
    renderModal({ variant: "child", childId: "child-1" });
    fireEvent.click(screen.getByRole("button", { name: /View/i }));
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(childMutate).toHaveBeenCalledWith(
      { childId: "child-1", diagnosisId: "diagnosis-1", historyId: "history-1", lang: "en" },
      expect.any(Object),
    );
  });

  test("expand and collapse history item", () => {
    renderModal();
    expect(screen.queryByText("Fever and cough")).not.toBeInTheDocument();
    const expandButton = screen.getByRole("button", { name: /Created/i });
    fireEvent.click(expandButton);
    expect(screen.getByText("Fever and cough")).toBeInTheDocument();
    const collapseButton = screen.getByRole("button", { name: /Created/i });
    fireEvent.click(collapseButton);
    expect(screen.queryByText("Fever and cough")).not.toBeInTheDocument();
  });
});
