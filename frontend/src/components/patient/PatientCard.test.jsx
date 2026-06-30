import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import PatientCard from "./PatientCard.jsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key) =>
      ({
        "patients.card.age": "Age",
        "patients.card.blood": "Blood",
        "patients.card.email": "Email",
        "patients.card.phone": "Phone",
        "patients.card.gender": "Gender",
        "patients.card.genderMale": "Male",
        "patients.card.genderFemale": "Female",
        "patients.card.status": "Status",
        "patients.card.statusDeceased": "Deceased",
        "patients.card.causeOfDeath": "Cause of death",
        "patients.card.viewDiagnoses": "View diagnoses",
        "patients.card.edit": "Edit",
        "patients.card.pending": "Pending Approval",
        "patients.card.pendingHint": "Changes require patient approval",
        "patients.create.placeOfResidence": "Place of Residence",
        "patients.create.placeOfBirth": "Place of Birth",
        "patients.create.parentEmail": "Parent/tutor email",
        "patients.global.viewToImport": "View & Import",
      }[key] ?? key),
  }),
}));

vi.mock("../../utilsfront/geoLabels.js", () => ({
  localizeCityName: ({ cityName }) => cityName || "",
  localizeCountryName: (countryName) => countryName || "",
  localizeStateName: ({ stateName }) => stateName || "",
}));

const renderCard = (patient, props = {}) =>
  render(
    <MemoryRouter>
      <PatientCard patient={patient} {...props} />
    </MemoryRouter>,
  );

describe("PatientCard residence display", () => {
  test("shows full place of residence instead of country only", () => {
    renderCard({
      _id: "patient-1",
      fullname: "Ana Patient",
      country: "Germany",
      state: "Bavaria",
      city: "Aidenbach",
    });

    expect(
      screen.getByText("Place of Residence: Germany, Bavaria, Aidenbach"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Country:/)).not.toBeInTheDocument();
  });

  test("falls back to country when only country exists", () => {
    renderCard({
      _id: "patient-1",
      fullname: "Ana Patient",
      country: "Germany",
    });

    expect(screen.getByText("Place of Residence: Germany")).toBeInTheDocument();
  });

  test("shows full place of birth separately from residence", () => {
    renderCard({
      _id: "patient-1",
      fullname: "Ana Patient",
      country: "Germany",
      state: "Bavaria",
      city: "Aidenbach",
      birthCountry: "Mexico",
      birthState: "Baja California",
      birthCity: "Mexicali",
    });

    expect(
      screen.getByText("Place of Residence: Germany, Bavaria, Aidenbach"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Place of Birth: Mexico, Baja California, Mexicali"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Place of Residence: Mexico, Baja California, Mexicali"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Place of Birth: Germany, Bavaria, Aidenbach"),
    ).not.toBeInTheDocument();
  });

  test("does not show place of birth when birthplace fields are missing", () => {
    renderCard({
      _id: "patient-1",
      fullname: "Ana Patient",
      country: "Germany",
      state: "Bavaria",
      city: "Aidenbach",
    });

    expect(screen.queryByText(/^Place of Birth:/)).not.toBeInTheDocument();
  });

  test("shows parent tutor email for minors without replacing patient email", () => {
    renderCard({
      _id: "patient-1",
      fullname: "Ana Patient",
      age: 17,
      email: "minor@example.com",
      parentEmail: "parent@example.com",
    });

    expect(screen.getByText("Email: minor@example.com")).toBeInTheDocument();
    expect(screen.getByText("Parent/tutor email: parent@example.com")).toBeInTheDocument();
  });

  test("does not show parent tutor email for adults", () => {
    renderCard({
      _id: "patient-1",
      fullname: "Ana Patient",
      age: 18,
      parentEmail: "parent@example.com",
    });

    expect(screen.queryByText(/^Parent\/tutor email:/)).not.toBeInTheDocument();
  });

  test("keeps pending badge and global import action behavior", () => {
    renderCard(
      {
        _id: "patient-1",
        fullname: "Ana Patient",
        isPendingApproval: true,
      },
      { isGlobal: true },
    );

    expect(screen.getByText("Pending Approval")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View & Import/i })).toHaveAttribute(
      "href",
      "/patients/global/patient-1",
    );
  });
});
