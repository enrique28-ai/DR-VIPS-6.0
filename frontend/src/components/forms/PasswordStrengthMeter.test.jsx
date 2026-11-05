import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import PasswordStrengthMeter from "./PasswordStrengthMeter.jsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) =>
      ({
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
      })[key] ?? key,
  }),
}));

describe("PasswordStrengthMeter", () => {
  test("renders the strength heading and all password rule labels", () => {
    render(<PasswordStrengthMeter password="" />);

    expect(screen.getByText("Password strength")).toBeInTheDocument();
    expect(screen.getByText("At least 6 characters")).toBeInTheDocument();
    expect(screen.getByText("Uppercase and lowercase letters")).toBeInTheDocument();
    expect(screen.getByText("A number")).toBeInTheDocument();
    expect(screen.getByText("A special character")).toBeInTheDocument();
  });

  test.each([
    ["", "Very weak"],
    ["abcdef", "Weak"],
    ["abcdefA", "Fair"],
    ["abcdefA1", "Good"],
    ["abcdefA1!", "Strong"],
  ])("renders %s as %s", (password, label) => {
    render(<PasswordStrengthMeter password={password} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
