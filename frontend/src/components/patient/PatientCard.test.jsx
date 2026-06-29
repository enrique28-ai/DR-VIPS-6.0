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
        "patients.create.placeOfResidence": "Place of Residence",
      }[key] ?? key),
  }),
}));

vi.mock("../../utilsfront/geoLabels.js", () => ({
  localizeCityName: ({ cityName }) => cityName || "",
  localizeCountryName: (countryName) => countryName || "",
  localizeStateName: ({ stateName }) => stateName || "",
}));

const renderCard = (patient) =>
  render(
    <MemoryRouter>
      <PatientCard patient={patient} />
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
});
