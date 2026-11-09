import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import api from "../../lib/axios.js";
import PatientAccessRequestsPage from "./PatientAccessRequestsPage.jsx";
import {
  useApprovePatientAccessRequest,
  useMyPatientAccessRequests,
  useRejectPatientAccessRequest,
} from "../../features/patients/phooks.js";

vi.mock("../../features/patients/phooks.js", () => ({
  useMyPatientAccessRequests: vi.fn(),
  useApprovePatientAccessRequest: vi.fn(),
  useRejectPatientAccessRequest: vi.fn(),
}));

vi.mock("../../lib/axios.js", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const translations = {
  "navbar.accessRequests": "Access Requests",
  "accessRequests.title": "Access Requests",
  "accessRequests.description":
    "Review requests from doctors who want access to a medical record you are authorized to manage.",
  "accessRequests.pendingRequests": "Pending access requests",
  "accessRequests.loading": "Loading access requests...",
  "accessRequests.pending": "Pending",
  "accessRequests.doctor": "Doctor",
  "accessRequests.medicalRecord": "Medical record",
  "accessRequests.approvalConsequence":
    "Approving gives this doctor access to the named medical record.",
  "accessRequests.requestedAt": "Requested",
  "accessRequests.approve": "Approve",
  "accessRequests.reject": "Reject",
  "accessRequests.approving": "Approving...",
  "accessRequests.rejecting": "Rejecting...",
  "accessRequests.emptyTitle": "No pending access requests",
  "accessRequests.emptyDescription":
    "You do not have any doctor access requests to review.",
  "accessRequests.loadFailed": "Access requests could not be loaded",
  "accessRequests.loadFailedDescription": "Try again to check for pending requests.",
  "accessRequests.retry": "Try again",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => translations[key] ?? key,
    i18n: { language: "en-US" },
  }),
}));

const requestOne = {
  _id: "request-1",
  patient: {
    _id: "patient-1",
    fullname: "Pedro Pérez",
    email: "patient-private@example.com",
    birthDate: "2010-01-01",
    parentEmail: "guardian-private@example.com",
    owners: ["owner-private"],
  },
  doctor: {
    _id: "doctor-1",
    name: "Dr. Jane Smith",
    email: "jane@example.com",
  },
  createdBy: "created-by-private",
  status: "pending",
  createdAt: "2026-08-11T12:00:00.000Z",
};

const requestTwo = {
  _id: "request-2",
  patient: { _id: "patient-2", fullname: "Alex Rivera" },
  doctor: {
    _id: "doctor-2",
    name: "Dr. Morgan Lee",
    email: "morgan@example.com",
  },
  status: "pending",
  createdAt: "2026-08-10T12:00:00.000Z",
};

const approve = { mutateAsync: vi.fn(() => new Promise(() => {})) };
const reject = { mutateAsync: vi.fn(() => new Promise(() => {})) };
const refetch = vi.fn();

function setQueryState(overrides = {}) {
  useMyPatientAccessRequests.mockReturnValue({
    data: { accessRequests: [] },
    isLoading: false,
    isError: false,
    refetch,
    isFetching: false,
    ...overrides,
  });
}

describe("PatientAccessRequestsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useApprovePatientAccessRequest.mockReturnValue(approve);
    useRejectPatientAccessRequest.mockReturnValue(reject);
    setQueryState();
  });

  test("renders an accessible loading state", () => {
    setQueryState({ data: undefined, isLoading: true });

    render(<PatientAccessRequestsPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading access requests...");
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  });

  test("renders the empty state without treating it as an error", () => {
    render(<PatientAccessRequestsPage />);

    expect(screen.getByRole("heading", { name: "No pending access requests" })).toBeInTheDocument();
    expect(
      screen.getByText("You do not have any doctor access requests to review."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("renders a safe error state and retries without showing an empty inbox", () => {
    setQueryState({ data: undefined, isError: true });

    render(<PatientAccessRequestsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Access requests could not be loaded",
    );
    expect(screen.queryByText("No pending access requests")).not.toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test("disables retry while the failed inbox is refetching", () => {
    setQueryState({ data: undefined, isError: true, isFetching: true });

    render(<PatientAccessRequestsPage />);

    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
  });

  test("renders only the allowed pending request details", () => {
    setQueryState({ data: { accessRequests: [requestOne] } });

    render(<PatientAccessRequestsPage />);

    const card = screen.getByRole("article", { name: "Dr. Jane Smith" });
    expect(within(card).getByText("jane@example.com")).toBeInTheDocument();
    expect(within(card).getByText("Pedro Pérez")).toBeInTheDocument();
    expect(within(card).getByText("Medical record")).toBeInTheDocument();
    expect(
      within(card).getByText("Approving gives this doctor access to the named medical record."),
    ).toBeInTheDocument();
    expect(within(card).getByText("Pending")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  test("Approve sends exactly the selected request id", () => {
    setQueryState({ data: { accessRequests: [requestOne] } });
    render(<PatientAccessRequestsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(approve.mutateAsync).toHaveBeenCalledTimes(1);
    expect(approve.mutateAsync.mock.calls[0][0]).toBe("request-1");
  });

  test("Reject sends exactly the selected request id", () => {
    setQueryState({ data: { accessRequests: [requestOne] } });
    render(<PatientAccessRequestsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(reject.mutateAsync).toHaveBeenCalledTimes(1);
    expect(reject.mutateAsync.mock.calls[0][0]).toBe("request-1");
  });

  test("a pending decision disables both buttons only for that request", () => {
    setQueryState({ data: { accessRequests: [requestOne, requestTwo] } });
    render(<PatientAccessRequestsPage />);

    const firstCard = screen.getByRole("article", { name: "Dr. Jane Smith" });
    const secondCard = screen.getByRole("article", { name: "Dr. Morgan Lee" });
    fireEvent.click(within(firstCard).getByRole("button", { name: "Approve" }));

    expect(within(firstCard).getByRole("button", { name: "Approving..." })).toBeDisabled();
    expect(within(firstCard).getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(within(secondCard).getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(within(secondCard).getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  test("multiple requests remain independently identifiable", () => {
    setQueryState({ data: { accessRequests: [requestOne, requestTwo] } });
    render(<PatientAccessRequestsPage />);

    expect(screen.getByRole("article", { name: "Dr. Jane Smith" })).toHaveTextContent(
      "Pedro Pérez",
    );
    expect(screen.getByRole("article", { name: "Dr. Morgan Lee" })).toHaveTextContent(
      "Alex Rivera",
    );
  });

  test("does not expose hidden authorization or medical fields or call doctor APIs", () => {
    setQueryState({ data: { accessRequests: [requestOne] } });
    render(<PatientAccessRequestsPage />);

    for (const hiddenValue of [
      "patient-private@example.com",
      "guardian-private@example.com",
      "owner-private",
      "created-by-private",
      "2010-01-01",
    ]) {
      expect(screen.queryByText(hiddenValue)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/your child/i)).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
