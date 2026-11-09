import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { describe, expect, test, vi } from "vitest";
import en from "../locals/en/common.json";
import es from "../locals/es/common.json";
import PatientsPage from "./patientsrecord/PatientsPage.jsx";
import DiagnosesByPatientPage from "./diagnosisrecord/DiagnosesByPatientPage.jsx";
import MyHealthState from "./docrecords/MyHealthState.jsx";
import MyChildHealthState from "./docrecords/MyChildHealthState.jsx";

const fixtures = vi.hoisted(() => {
  const patient = { _id: "synthetic-patient", fullname: "Synthetic Patient", gender: "Female", country: "Mexico" };
  const diagnosis = { _id: "synthetic-diagnosis", title: "Synthetic diagnosis", medicine: ["Synthetic medicine"] };
  return {
    patients: { data: { items: [patient], page: 1, pages: 1 }, isLoading: false, isFetching: false },
    diagnoses: { data: { patientName: patient.fullname, items: [diagnosis], page: 1, pages: 1 }, isLoading: false, isFetching: false },
    children: { data: [{ snapshot: { fullname: "Synthetic Child", sources: [{ id: "synthetic-child" }] } }] },
  };
});

vi.mock("../features/patients/phooks.js", () => ({
  buildPatientParams: (params) => params,
  usePatients: () => fixtures.patients,
  useMyChildrenHealthInfo: () => fixtures.children,
}));
vi.mock("../features/diagnostics/dhooks.js", () => ({
  buildDiagnosisParams: (params) => params,
  useDiagnosesByPatient: () => fixtures.diagnoses,
  useMyDiagnoses: () => fixtures.diagnoses,
  useMyChildDiagnoses: () => fixtures.diagnoses,
  useTranslateMyChildDiagnosis: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../utilsfront/geoLabels.js", () => ({
  getLocalizedCountries: () => [{ name: "Mexico", label: "Mexico" }],
  localizeCountryName: (name) => name,
}));
vi.mock("../components/patient/PatientCard.jsx", () => ({ default: () => <p>Synthetic patient card</p> }));
vi.mock("../components/diagnostic/DiagnosisCard.jsx", () => ({ default: () => <p>Synthetic diagnosis card</p> }));
vi.mock("../components/healthstate/HealthStateCard.jsx", () => ({ default: () => <p>Synthetic health card</p> }));
vi.mock("../components/forms/LocalizedDatePicker.jsx", () => ({ default: () => <span>Date control</span> }));

describe("list subtitles with real English and Spanish catalogs", () => {
  test.each([
    ["patients", PatientsPage, "/patients", "/patients", true],
    ["doctor diagnoses", DiagnosesByPatientPage, "/patients/:patientId/diagnoses", "/patients/synthetic-patient/diagnoses", false],
    ["patient diagnoses", MyHealthState, "/docrecords/myhealthstate", "/docrecords/myhealthstate", false],
    ["child diagnoses", MyChildHealthState, "/children/:childId", "/children/synthetic-child", false],
  ])("%s preserves selected filters while its subtitle changes language", async (_label, component, route, path, patients) => {
    const Page = component;
    const language = createInstance();
    await language.use(initReactI18next).init({
      lng: "en", fallbackLng: "en", resources: { en: { translation: en }, es: { translation: es } },
      interpolation: { escapeValue: false },
    });
    render(
      <I18nextProvider i18n={language}>
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route path={route} element={<Page />} /></Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
    if (patients) {
      fireEvent.click(screen.getByRole("button", { name: /More filters/ }));
      const country = screen.getByRole("combobox", { name: "Country of Residence" });
      fireEvent.change(country, { target: { value: "Mexico" } });
      expect(country).toHaveValue("Mexico");
      expect(en.patients.list.filters.country).toBe("Country");
    }
    const group = screen.getByText(patients ? "Gender" : "Medicines").closest("div");
    fireEvent.click(within(group).getByRole("button", { name: patients ? "Female" : "Yes" }));
    expect(screen.getByText(patients ? /Gender: Female/ : /Medicines: Yes/)).toBeInTheDocument();

    await act(async () => language.changeLanguage("es"));
    if (patients) {
      expect(screen.getByRole("combobox", { name: "País de residencia" })).toHaveValue("Mexico");
      expect(es.patients.list.filters.country).toBe("País");
      expect(screen.getByText(/País de residencia: Mexico/)).toBeInTheDocument();
    }
    expect(screen.getByText(patients ? /Género: Mujer/ : /Medicinas: Sí/)).toBeInTheDocument();
    const translatedGroup = screen.getByText(patients ? "Género" : "Medicinas").closest("div");
    expect(within(translatedGroup).getByRole("button", { name: patients ? "Mujer" : "Sí", pressed: true })).toBeInTheDocument();
    if (component === DiagnosesByPatientPage) {
      expect(screen.getByRole("heading", { name: "Diagnósticos de Synthetic Patient" })).toBeInTheDocument();
    }
  });
});
