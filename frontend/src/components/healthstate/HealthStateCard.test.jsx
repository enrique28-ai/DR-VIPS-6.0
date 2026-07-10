import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import HealthStateCard from "./HealthStateCard.jsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en-US" },
    t: (key) =>
      ({
        "diagnoses.card.updated": "Updated",
        "diagnoses.detail.untitled": "Untitled diagnosis",
        "myHealthState.detail.createdBy": "Created by",
        "myHealthState.detail.unknownDoctor": "Unknown doctor",
      })[key] ?? key,
  }),
}));

vi.mock("../../features/diagnostics/dhooks.js", () => ({
  useTranslateMyDiagnosis: () => ({ mutate: vi.fn(), isPending: false }),
}));

const renderCard = (diagnosis) =>
  render(
    <MemoryRouter>
      <HealthStateCard diagnosis={diagnosis} />
    </MemoryRouter>,
  );

describe("HealthStateCard", () => {
  test("renders diagnosis title as the only detail link route", () => {
    renderCard({
      _id: "diagnosis-1",
      title: "Flu diagnosis",
      description: "Fever and cough",
    });

    const link = screen.getByRole("link", { name: "Flu diagnosis" });
    expect(link).toHaveAttribute("href", "/docrecords/myhealthstate/diagnosis-1");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  test("uses the title fallback order", () => {
    renderCard({
      _id: "diagnosis-1",
      name: "Fallback name diagnosis",
      Diagnostic: "Diagnostic field",
      diagnosis: "diagnosis field",
    });

    expect(
      screen.getByRole("link", { name: "Fallback name diagnosis" }),
    ).toBeInTheDocument();
  });

  test("uses the translated untitled fallback when no title fields exist", () => {
    renderCard({ _id: "diagnosis-1" });

    expect(
      screen.getByRole("link", { name: "Untitled diagnosis" }),
    ).toBeInTheDocument();
  });

  test("does not render the diagnosis description preview", () => {
    renderCard({
      _id: "diagnosis-1",
      title: "Respiratory note",
      symptoms: "Persistent cough",
    });

    expect(screen.queryByText("Persistent cough")).not.toBeInTheDocument();
  });

  test("renders fallback preview and date when missing", () => {
    renderCard({
      _id: "diagnosis-1",
      title: "Minimal record",
    });

    expect(screen.getAllByText("-")).toHaveLength(1);
  });

  test("renders doctor name and email fallback together", () => {
    renderCard({
      _id: "diagnosis-1",
      title: "Flu diagnosis",
      createdBy: {
        name: "Dr. Smith",
        email: "smith@example.com",
      },
    });

    expect(screen.getByText("Dr. Smith (smith@example.com)")).toBeInTheDocument();
  });

  test("renders unknown doctor fallback when creator is missing", () => {
    renderCard({
      _id: "diagnosis-1",
      title: "Flu diagnosis",
    });

    expect(screen.getByText("Unknown doctor")).toBeInTheDocument();
  });

  test("renders formatted updated date when present", () => {
    renderCard({
      _id: "diagnosis-1",
      title: "Flu diagnosis",
      updatedAt: "2026-06-22T12:30:00.000Z",
    });

    expect(screen.getByText((content) => content.includes("2026"))).toBeInTheDocument();
  });

  test("renders long doctor email without truncating the text", () => {
    const email = "very.long.doctor.email.address.for.testing@example-medical-domain.test";
    renderCard({
      _id: "diagnosis-1",
      title: "Flu diagnosis",
      createdBy: {
        email,
      },
    });

    expect(screen.getByText(email)).toBeInTheDocument();
  });
});
