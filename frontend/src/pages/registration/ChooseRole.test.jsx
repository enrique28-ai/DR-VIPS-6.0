import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ChooseRole from "./ChooseRole.jsx";
import { useAuthStore } from "../../stores/authStore.js";

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
    t: (key) =>
      ({
        "auth.chooseRole.continueDoctor": "Continue as doctor",
        "auth.chooseRole.continuePatient": "Continue as patient",
        "auth.chooseRole.doctorNotAllowed": "Doctor sign-up is not allowed for this account.",
        "auth.chooseRole.genericError": "Could not choose role",
        "auth.chooseRole.newAccount": "New account",
        "auth.chooseRole.title": "Choose your role",
      }[key] ?? key),
  }),
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: vi.fn(),
}));

const pendingAccount = (overrides = {}) => ({
  email: "person@example.com",
  name: "Pending Person",
  picture: "https://example.com/avatar.png",
  allowDoctor: true,
  ...overrides,
});

const renderChooseRole = ({
  getGooglePending = vi.fn().mockResolvedValue(pendingAccount()),
  finalizeGoogleRole = vi.fn().mockResolvedValue({}),
} = {}) => {
  useAuthStore.mockReturnValue({
    getGooglePending,
    finalizeGoogleRole,
  });

  const view = render(
    <MemoryRouter>
      <ChooseRole />
    </MemoryRouter>,
  );

  return {
    ...view,
    getGooglePending,
    finalizeGoogleRole,
  };
};

describe("ChooseRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  test("renders null while pending Google account data is unresolved", () => {
    const getGooglePending = vi.fn(() => new Promise(() => {}));

    const { container } = renderChooseRole({ getGooglePending });

    expect(container).toBeEmptyDOMElement();
    expect(getGooglePending).toHaveBeenCalledTimes(1);
  });

  test("redirects to login when no pending Google account exists", async () => {
    renderChooseRole({
      getGooglePending: vi.fn().mockResolvedValue(null),
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/login", { replace: true });
    });
  });

  test("redirects to login when loading pending Google account fails", async () => {
    renderChooseRole({
      getGooglePending: vi.fn().mockRejectedValue(new Error("pending failed")),
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/login", { replace: true });
    });
  });

  test("renders pending Google account details and role choices", async () => {
    renderChooseRole();

    expect(await screen.findByRole("heading", { name: "Choose your role" })).toBeInTheDocument();
    expect(screen.getByText("New account:")).toBeInTheDocument();
    expect(screen.getByText("person@example.com")).toBeInTheDocument();
    expect(document.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/avatar.png",
    );
    expect(screen.getByRole("button", { name: "Continue as patient" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Continue as doctor" })).toBeEnabled();
  });

  test("finalizes patient role and redirects to patient health state", async () => {
    const finalizeGoogleRole = vi.fn().mockResolvedValue({});
    renderChooseRole({ finalizeGoogleRole });

    fireEvent.click(await screen.findByRole("button", { name: "Continue as patient" }));

    await waitFor(() => {
      expect(finalizeGoogleRole).toHaveBeenCalledWith("patient");
      expect(navigateMock).toHaveBeenCalledWith("/docrecords/myhealthstate", { replace: true });
    });
  });

  test("finalizes doctor role and redirects to patients when doctor role is allowed", async () => {
    const finalizeGoogleRole = vi.fn().mockResolvedValue({});
    renderChooseRole({ finalizeGoogleRole });

    fireEvent.click(await screen.findByRole("button", { name: "Continue as doctor" }));

    await waitFor(() => {
      expect(finalizeGoogleRole).toHaveBeenCalledWith("doctor");
      expect(navigateMock).toHaveBeenCalledWith("/patients", { replace: true });
    });
  });

  test("disables doctor role when not allowed", async () => {
    const finalizeGoogleRole = vi.fn().mockResolvedValue({});
    renderChooseRole({
      getGooglePending: vi.fn().mockResolvedValue(pendingAccount({ allowDoctor: false })),
      finalizeGoogleRole,
    });

    const doctorButton = await screen.findByRole("button", { name: "Continue as doctor" });
    expect(doctorButton).toBeDisabled();
    expect(doctorButton).toHaveClass("opacity-60");
    expect(screen.getByText("Doctor sign-up is not allowed for this account.")).toBeInTheDocument();

    fireEvent.click(doctorButton);

    expect(finalizeGoogleRole).not.toHaveBeenCalled();
  });

  test("shows backend error when patient role finalization fails", async () => {
    renderChooseRole({
      finalizeGoogleRole: vi.fn().mockRejectedValue({
        response: { data: { error: "Pending Google session expired" } },
      }),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Continue as patient" }));

    expect(await screen.findByText("Pending Google session expired")).toBeInTheDocument();
  });

  test("shows generic translated error when doctor role finalization fails without backend error", async () => {
    renderChooseRole({
      finalizeGoogleRole: vi.fn().mockRejectedValue(new Error("finalize failed")),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Continue as doctor" }));

    expect(await screen.findByText("Could not choose role")).toBeInTheDocument();
  });
});
