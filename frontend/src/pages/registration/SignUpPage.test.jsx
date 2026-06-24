import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "react-hot-toast";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SignUpPage from "./SignUpPage.jsx";
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

vi.mock("react-google-recaptcha", () => ({
  default: () => <div data-testid="recaptcha-stub">recaptcha</div>,
}));

vi.mock("react-hot-toast", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key) =>
      ({
        "auth.signup.button": "Sign up",
        "auth.signup.divider": "or",
        "auth.signup.emailLabel": "Email",
        "auth.signup.emailPlaceholder": "you@example.com",
        "auth.signup.errors.captcha": "Please complete the captcha",
        "auth.signup.errors.weakPassword": "Password is too weak",
        "auth.signup.google": "Continue with Google",
        "auth.signup.haveAccount": "Already have an account?",
        "auth.signup.loginLink": "Log in",
        "auth.signup.passwordHint": "Use a strong password.",
        "auth.signup.passwordLabel": "Password",
        "auth.signup.roleDoctor": "Doctor",
        "auth.signup.rolePatient": "Patient",
        "auth.signup.roleQuestion": "What role do you need?",
        "auth.signup.title": "Create account",
        "auth.signup.usernameLabel": "Name",
        "auth.signup.usernamePlaceholder": "Dr Person",
        "password.levels.fair": "Fair",
        "password.levels.good": "Good",
        "password.levels.strong": "Strong",
        "password.levels.veryWeak": "Very weak",
        "password.levels.weak": "Weak",
        "password.rules.hasCase": "Uppercase and lowercase letters",
        "password.rules.hasNumber": "A number",
        "password.rules.hasSpecial": "A special character",
        "password.rules.minLen": "At least 6 characters",
        "password.strengthLabel": "Password strength",
      }[key] ?? key),
  }),
}));

vi.mock("../../stores/authStore.js", () => ({
  useAuthStore: vi.fn(),
}));

const renderSignUpPage = ({
  isLoading = false,
  signup = vi.fn().mockResolvedValue({ role: "doctor" }),
  googleStart = vi.fn().mockResolvedValue(undefined),
} = {}) => {
  useAuthStore.mockReturnValue({
    isLoading,
    signup,
    googleStart,
  });

  const view = render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>,
  );

  return {
    ...view,
    emailInput: () => screen.getByPlaceholderText("you@example.com"),
    form: () => view.container.querySelector("form"),
    googleStart,
    nameInput: () => screen.getByPlaceholderText("Dr Person"),
    passwordInput: () => view.container.querySelector('input[type="password"]'),
    roleInput: (role) => view.container.querySelector(`input[name="role"][value="${role}"]`),
    signup,
  };
};

const fillSignUpForm = (
  view,
  {
    name = "Dr Person",
    email = "doctor@example.com",
    password = "Abcdef1!",
  } = {},
) => {
  fireEvent.change(view.nameInput(), { target: { value: name } });
  fireEvent.change(view.emailInput(), { target: { value: email } });
  fireEvent.change(view.passwordInput(), { target: { value: password } });
};

describe("SignUpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback();
      return 1;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders the signup form, role options, auth links, and Google button", () => {
    const view = renderSignUpPage();

    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    expect(view.nameInput()).toHaveValue("");
    expect(view.emailInput()).toHaveValue("");
    expect(view.passwordInput()).toHaveValue("");
    expect(screen.getByText("Use a strong password.")).toBeInTheDocument();
    expect(screen.getByText("Password strength")).toBeInTheDocument();
    expect(view.roleInput("doctor")).toBeInTheDocument();
    expect(view.roleInput("patient")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  test("typing username, email, and password updates all inputs", () => {
    const view = renderSignUpPage();

    fillSignUpForm(view);

    expect(view.nameInput()).toHaveValue("Dr Person");
    expect(view.emailInput()).toHaveValue("doctor@example.com");
    expect(view.passwordInput()).toHaveValue("Abcdef1!");
  });

  test("doctor role is selected by default and patient selection changes the checked role", () => {
    const view = renderSignUpPage();

    expect(view.roleInput("doctor")).toBeChecked();
    expect(view.roleInput("patient")).not.toBeChecked();

    fireEvent.click(view.roleInput("patient"));

    expect(view.roleInput("doctor")).not.toBeChecked();
    expect(view.roleInput("patient")).toBeChecked();
  });

  test("weak password keeps the signup button disabled", () => {
    const view = renderSignUpPage();

    fillSignUpForm(view, { password: "abcdef" });

    expect(screen.getByRole("button", { name: "Sign up" })).toBeDisabled();
  });

  test("weak password direct submit shows an error and does not sign up", () => {
    const view = renderSignUpPage();

    fillSignUpForm(view, { password: "abcdef" });
    fireEvent.submit(view.form());

    expect(toast.error).toHaveBeenCalledWith("Password is too weak");
    expect(view.signup).not.toHaveBeenCalled();
  });

  test("valid default-doctor submit calls signup with the default captcha-disabled payload", async () => {
    const signup = vi.fn().mockResolvedValue({ role: "doctor" });
    const view = renderSignUpPage({ signup });

    fillSignUpForm(view);
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(signup).toHaveBeenCalledWith(
        "Dr Person",
        "doctor@example.com",
        "Abcdef1!",
        undefined,
        "doctor",
      );
    });
  });

  test("valid patient-role submit calls signup with patient role", async () => {
    const signup = vi.fn().mockResolvedValue({ role: "patient" });
    const view = renderSignUpPage({ signup });

    fillSignUpForm(view);
    fireEvent.click(view.roleInput("patient"));
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(signup).toHaveBeenCalledWith(
        "Dr Person",
        "doctor@example.com",
        "Abcdef1!",
        undefined,
        "patient",
      );
    });
  });

  test("successful signup navigates to email verification", async () => {
    const signup = vi.fn().mockResolvedValue({ role: "doctor" });
    const view = renderSignUpPage({ signup });

    fillSignUpForm(view);
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/verify-email");
    });
  });

  test("failed signup does not navigate or render a local error", async () => {
    const signup = vi.fn().mockRejectedValue(new Error("signup failed"));
    const view = renderSignUpPage({ signup });

    fillSignUpForm(view);
    fireEvent.submit(view.form());

    await waitFor(() => {
      expect(signup).toHaveBeenCalled();
    });
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.queryByText("signup failed")).not.toBeInTheDocument();
  });

  test("loading state marks the signup button busy and disabled", () => {
    renderSignUpPage({ isLoading: true });

    const submitButton = screen.getByRole("button", { name: "Sign up" });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute("aria-busy", "true");
  });

  test("Google button calls googleStart with no captcha token by default", async () => {
    const googleStart = vi.fn().mockResolvedValue(undefined);
    renderSignUpPage({ googleStart });

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(googleStart).toHaveBeenCalledWith(undefined);
    });
  });

  test("does not render ReCAPTCHA in the default captcha-disabled environment", () => {
    renderSignUpPage();

    expect(screen.queryByTestId("recaptcha-stub")).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalledWith("Please complete the captcha");
  });
});
