import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import EligibilityInfoPage from "./EligibilityInfoPage.jsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) =>
      ({
        "auth.eligibility.title": "Eligibility",
        "auth.eligibility.p1": "First eligibility paragraph",
        "auth.eligibility.p2": "Second eligibility paragraph",
      })[key] ?? key,
  }),
}));

describe("EligibilityInfoPage", () => {
  test("renders the eligibility title as a level-1 heading", () => {
    render(<EligibilityInfoPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Eligibility" }),
    ).toBeInTheDocument();
  });

  test("renders the first eligibility paragraph", () => {
    render(<EligibilityInfoPage />);
    expect(
      screen.getByText("First eligibility paragraph"),
    ).toBeInTheDocument();
  });

  test("renders the second eligibility paragraph", () => {
    render(<EligibilityInfoPage />);
    expect(
      screen.getByText("Second eligibility paragraph"),
    ).toBeInTheDocument();
  });

  test("renders through the real AuthShell", () => {
    const { container } = render(<EligibilityInfoPage />);
    const heading = screen.getByRole("heading", { level: 1 });
    const firstParagraph = screen.getByText("First eligibility paragraph");
    const secondParagraph = screen.getByText("Second eligibility paragraph");
    expect(container).toContainElement(heading);
    expect(container).toContainElement(firstParagraph);
    expect(container).toContainElement(secondParagraph);
  });
});
