import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import toast from "react-hot-toast";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ProfilePage from "./ProfilePage.jsx";
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

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key) =>
      ({
        "auth.profile.title": "Profile",
        "auth.profile.emailLabel": "Email",
        "auth.profile.nameLabel": "Name",
        "auth.profile.photoLabel": "Profile photo",
        "auth.profile.changePhoto": "Change photo",
        "auth.profile.useLink": "Use link",
        "auth.profile.useFile": "Use file",
        "auth.profile.remove": "Remove",
        "auth.profile.avatarUrlLabel": "Avatar URL",
        "auth.profile.saveButton": "Save profile",
        "auth.profile.dangerTitle": "Danger zone",
        "auth.profile.dangerPatient":
          "Deleting your patient account will remove your access to personal health records.",
        "auth.profile.dangerDoctor":
          "Deleting your doctor account will remove access to assigned patients.",
        "auth.profile.confirmPlaceholder": "Type DELETE to confirm",
        "auth.profile.deleteButton": "Delete account",
        "auth.profile.deleteConfirmValue": "DELETE",
        "auth.profile.errors.confirmDelete":
          "Type DELETE to confirm account deletion.",
        "auth.profile.errors.maxSize": "Image must be 2 MB or less.",
      }[key] ?? key),
  }),
}));

const authState = vi.hoisted(() => ({
  user: null,
  updateProfile: vi.fn().mockResolvedValue({}),
  deleteMe: vi.fn().mockResolvedValue({}),
  uploadAvatar: vi.fn().mockResolvedValue({}),
  importAvatarByUrl: vi.fn().mockResolvedValue({}),
  isLoading: false,
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: (selector) =>
    selector
      ? selector(authState)
      : {
          user: authState.user,
          updateProfile: authState.updateProfile,
          deleteMe: authState.deleteMe,
          uploadAvatar: authState.uploadAvatar,
          importAvatarByUrl: authState.importAvatarByUrl,
          isLoading: authState.isLoading,
        },
}));

const doctorUser = {
  _id: "doc-1",
  email: "doctor@example.com",
  name: "Dr. Smith",
  role: "doctor",
  avatar: "",
};

const patientUser = {
  _id: "patient-1",
  email: "patient@example.com",
  name: "Patient Smith",
  role: "patient",
  avatar: "",
};

const renderProfilePage = () =>
  render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );

const resetAuth = () => {
  authState.user = null;
  authState.isLoading = false;
  authState.updateProfile = vi.fn().mockResolvedValue({});
  authState.deleteMe = vi.fn().mockResolvedValue({});
  authState.uploadAvatar = vi.fn().mockResolvedValue({});
  authState.importAvatarByUrl = vi.fn().mockResolvedValue({});
};

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    resetAuth();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns null when there is no user", () => {
    authState.user = null;
    const { container } = renderProfilePage();

    expect(container.firstChild).toBeNull();
  });

  test("renders profile form for a doctor", () => {
    authState.user = doctorUser;
    renderProfilePage();

    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();

    const emailInput = screen.getByDisplayValue("doctor@example.com");
    expect(emailInput).toBeDisabled();

    expect(screen.getByDisplayValue("Dr. Smith")).toBeInTheDocument();

    const avatar = screen.getByAltText("avatar preview");
    expect(avatar).toHaveAttribute("src", expect.stringContaining("default-avatar.png"));

    expect(screen.getByRole("button", { name: "Change photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Danger zone" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Deleting your doctor account will remove access to assigned patients.",
      ),
    ).toBeInTheDocument();
  });

  test("renders patient danger text for patient users", () => {
    authState.user = patientUser;
    renderProfilePage();

    expect(
      screen.getByText(
        "Deleting your patient account will remove your access to personal health records.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Deleting your doctor account will remove access to assigned patients.",
      ),
    ).not.toBeInTheDocument();
  });

  test("saving unchanged doctor profile skips updateProfile and navigates to patients", async () => {
    authState.user = doctorUser;
    renderProfilePage();

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/patients", { replace: true });
    });
    expect(authState.updateProfile).not.toHaveBeenCalled();
  });

  test("saving changed doctor name updates profile and navigates to patients", async () => {
    authState.user = doctorUser;
    renderProfilePage();

    fireEvent.change(screen.getByDisplayValue("Dr. Smith"), { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(authState.updateProfile).toHaveBeenCalledWith({ name: "New Name" });
    });
    expect(navigateMock).toHaveBeenCalledWith("/patients", { replace: true });
  });

  test("saving changed patient name updates profile and navigates to my health state", async () => {
    authState.user = patientUser;
    renderProfilePage();

    fireEvent.change(screen.getByDisplayValue("Patient Smith"), {
      target: { value: "New Patient Name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(authState.updateProfile).toHaveBeenCalledWith({
        name: "New Patient Name",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/docrecords/myhealthstate", {
      replace: true,
    });
  });

  test("save button reflects loading state", () => {
    authState.user = doctorUser;
    authState.isLoading = true;
    const { container } = renderProfilePage();

    const form = container.querySelector("form");
    expect(form).toHaveAttribute("aria-busy", "true");

    const saveButton = screen.getByRole("button", { name: "Save profile" });
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveAttribute("aria-busy", "true");
  });
});

describe("ProfilePage account actions and avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    resetAuth();
  });

  test("wrong delete confirmation shows toast error and does not call deleteMe", () => {
    authState.user = doctorUser;
    renderProfilePage();

    fireEvent.change(screen.getByPlaceholderText("Type DELETE to confirm"), {
      target: { value: "WRONG" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(toast.error).toHaveBeenCalledWith("Type DELETE to confirm account deletion.");
    expect(authState.deleteMe).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalledWith("/login", { replace: true });
  });

  test("correct delete confirmation calls deleteMe and navigates to login", async () => {
    authState.user = doctorUser;
    renderProfilePage();

    fireEvent.change(screen.getByPlaceholderText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    await waitFor(() => {
      expect(authState.deleteMe).toHaveBeenCalledTimes(1);
    });
    expect(navigateMock).toHaveBeenCalledWith("/login", { replace: true });
  });

  test("Use link toggles URL mode", () => {
    authState.user = doctorUser;
    renderProfilePage();

    fireEvent.click(screen.getByRole("button", { name: "Use link" }));

    expect(screen.getByPlaceholderText("https://...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use file" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use file" }));

    expect(screen.queryByPlaceholderText("https://...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use link" })).toBeInTheDocument();
  });

  test("saving avatar by URL calls importAvatarByUrl and navigates", async () => {
    authState.user = doctorUser;
    renderProfilePage();

    fireEvent.click(screen.getByRole("button", { name: "Use link" }));
    fireEvent.change(screen.getByPlaceholderText("https://..."), {
      target: { value: "https://example.com/avatar.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(authState.importAvatarByUrl).toHaveBeenCalledWith(
        "https://example.com/avatar.png",
      );
    });
    expect(authState.updateProfile).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/patients", { replace: true });
  });

  test("remove avatar flow calls updateProfile({ avatar: '' }) on save", async () => {
    authState.user = { ...doctorUser, avatar: "/uploads/avatar.png" };
    renderProfilePage();

    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(authState.updateProfile).toHaveBeenCalledWith({ avatar: "" });
    });
    expect(navigateMock).toHaveBeenCalledWith("/patients", { replace: true });
  });

  test("valid file selection uploads avatar on save", async () => {
    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:avatar-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    authState.user = doctorUser;
    const { container } = renderProfilePage();

    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(authState.uploadAvatar).toHaveBeenCalledWith(file);
    });
    expect(navigateMock).toHaveBeenCalledWith("/patients", { replace: true });

    createObjectURLSpy.mockRestore();
  });

  test("oversized file selection shows max-size toast and does not upload", () => {
    authState.user = doctorUser;
    const { container } = renderProfilePage();

    const bigFile = new File(
      [new Uint8Array(2 * 1024 * 1024 + 1)],
      "large.png",
      { type: "image/png" },
    );
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [bigFile] },
    });

    expect(toast.error).toHaveBeenCalledWith("Image must be 2 MB or less.");

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(authState.uploadAvatar).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/patients", { replace: true });
  });
});
