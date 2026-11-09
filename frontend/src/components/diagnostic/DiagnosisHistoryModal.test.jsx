import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import DiagnosisHistoryModal from "./DiagnosisHistoryModal.jsx";
import en from "../../locals/en/common.json";
import es from "../../locals/es/common.json";
import {
  useDiagnosisHistory,
  useMyChildDiagnosisHistory,
  useTranslateChildDiagnosisHistorySnapshot,
  useTranslateDiagnosisHistorySnapshot,
} from "../../features/diagnostics/dhooks.js";

const scope = vi.hoisted(() => ({ language: "en", accountId: "synthetic-account" }));

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, ...props }) => {
      const domProps = { ...props };
      delete domProps.whileHover;
      delete domProps.whileTap;
      return <button {...domProps}>{children}</button>;
    },
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
    i18n: scope,
    t: (key) =>
      (scope.language === "en" ? {
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
      }[key] : undefined) ?? key.split(".").reduce((value, part) => value?.[part], scope.language === "es" ? es : en) ?? key,
  }),
}));

vi.mock("../../features/diagnostics/dhooks.js", () => ({
  useDiagnosisHistory: vi.fn(),
  useMyChildDiagnosisHistory: vi.fn(),
  useTranslateDiagnosisHistorySnapshot: vi.fn(),
  useTranslateChildDiagnosisHistorySnapshot: vi.fn(),
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: (select) => select({ user: { _id: scope.accountId } }),
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
  scope.language = "en";
  scope.accountId = "synthetic-account";
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

  test("Tab on last focusable cycles to first and Shift+Tab on first cycles to last", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    const buttons = screen.getAllByRole("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
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

  test("renders the historical dates, actual contents and empty versus missing fields", () => {
    const createdAt = "2026-01-01T12:00:00Z";
    const updatedAt = "2026-01-02T10:00:00Z";
    useDiagnosisHistory.mockReturnValue({ data: [
      {
        ...historyItem,
        _id: "history-2",
        changeType: "updated",
        snapshot: { Diagnostic: "Legacy title", medicine: [], operation: ["Recorded procedure"], createdAt, updatedAt },
      },
      historyItem,
    ] });
    renderModal();
    const updated = screen.getByRole("button", { name: /^Updated/i });
    const created = screen.getByRole("button", { name: /^Created/i });
    expect(within(created).getByText(/Created by: Dr\. QA/)).toBeInTheDocument();
    expect(within(updated).getByText(/Edited by: Dr\. QA/)).toBeInTheDocument();
    expect(updated.compareDocumentPosition(created) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(updated);
    expect(updated).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Legacy title")).toBeInTheDocument();
    expect(screen.getByText("Diagnosis created:").parentElement).toHaveTextContent(new Date(createdAt).toLocaleString("en"));
    expect(screen.getByText("Diagnosis last updated:").parentElement).toHaveTextContent(new Date(updatedAt).toLocaleString("en"));
    expect(screen.getByText("Description:").parentElement).toHaveTextContent("Not recorded");
    expect(screen.getByText("Medicines:").parentElement).toHaveTextContent("Cleared in this version");
    expect(screen.getByText("Treatments:").parentElement).toHaveTextContent("Not recorded");
    expect(screen.getByText("Recorded procedure")).toBeInTheDocument();
    fireEvent.click(created);
    expect(screen.getByText("Ibuprofen")).toBeInTheDocument();
    expect(screen.getByText("Rest")).toBeInTheDocument();
    expect(screen.getByText("Operations:").parentElement).toHaveTextContent("None");
  });

  test("a delayed translation stays in its requested language and original diagnosis scope", () => {
    const modal = (diagnosisId) => (
      <DiagnosisHistoryModal diagnosisId={diagnosisId} onClose={onClose} />
    );
    useDiagnosisHistory.mockImplementation((id) => ({
      data: [{ ...historyItem, snapshot: { ...historyItem.snapshot, title: `Source ${id}` } }],
    }));
    scope.language = "es";
    const { rerender } = render(modal("first"));
    expect(screen.getByRole("heading", { name: es.diagnoses.history.title })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`^Creado · ${new Date(historyItem.createdAt).toLocaleDateString("es")}`))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(es.common.view, "i") }));
    fireEvent.click(screen.getByRole("button", { name: es.common.translate }));
    const [payload, callbacks] = selfMutate.mock.calls[0];
    expect(payload.lang).toBe("es");
    scope.language = "en";
    rerender(modal("first"));
    act(() => callbacks.onSuccess({ snapshot: { ...historyItem.snapshot, title: "Spanish translation" } }));
    expect(screen.getByText("Source first")).toBeInTheDocument();
    expect(screen.queryByText("Spanish translation")).not.toBeInTheDocument();
    scope.language = "es";
    rerender(modal("first"));
    expect(screen.getByText("Spanish translation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Traducido" })).toBeDisabled();
    rerender(modal("second"));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(es.common.view, "i") }));
    expect(screen.getByText("Source second")).toBeInTheDocument();
    expect(screen.queryByText("Spanish translation")).not.toBeInTheDocument();
  });

  test("shows a localized error and retry instead of stale versions or an empty result", () => {
    const refetch = vi.fn();
    useDiagnosisHistory.mockReturnValue({ data: [historyItem], isError: true, refetch });
    renderModal();
    expect(screen.getByRole("alert")).toHaveTextContent(en.diagnoses.toasts.loadHistoryFailed);
    expect(screen.queryByRole("button", { name: /View/i })).not.toBeInTheDocument();
    expect(screen.queryByText(en.diagnoses.history.empty)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.diagnoses.history.retry }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
