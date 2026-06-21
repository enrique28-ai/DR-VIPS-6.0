import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import PatientCreatePage from "./PatientCreatePage.jsx";
import { useCreatePatient } from "../../features/patients/phooks.js";
import { toast } from "react-hot-toast";

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, whileHover, whileTap, ...props }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock("react-hot-toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key, options = {}) =>
      ({
        "patients.create.back": "Back",
        "patients.create.title": "Create patient",
        "patients.create.fullname": "Full name",
        "patients.create.fullnamePlaceholder": "Full name",
        "patients.create.email": "Email",
        "patients.create.emailExample": "adult@example.com",
        "patients.create.phoneCountry": "Phone Country",
        "patients.create.selectPhoneCountryOption": "Select phone country",
        "patients.create.phone": "Phone",
        "patients.create.phoneAreaDigitsPlaceholder": "Phone digits",
        "patients.create.phoneDigitsCounter": "Digits",
        "patients.create.phoneCountryAndNumberRequired": "patients.create.phoneCountryAndNumberRequired",
        "patients.create.phoneSelectCountryToValidate": "patients.create.phoneSelectCountryToValidate",
        "patients.create.phoneRequiredAdult": "patients.create.phoneRequiredAdult",
        "patients.create.phoneInvalidAdult": "patients.create.phoneInvalidAdult",
        "patients.create.phoneInvalidMinor": "patients.create.phoneInvalidMinor",
        "patients.create.birthDate": "Birth date",
        "patients.create.birthDatePlaceholder": "Birth date",
        "patients.create.computedAge": "Age",
        "patients.create.parentEmail": "Parent email",
        "patients.create.parentEmailPlaceholder": "parent@example.com",
        "patients.create.hasChildren": "Has children",
        "patients.create.childrenCount": "Children count",
        "patients.create.childName": "Child name",
        "patients.create.childNamePlaceholder": "Child name",
        "patients.create.no": "No",
        "patients.create.yes": "Yes",
        "patients.create.bloodType": "Blood type",
        "patients.create.country": "Residence Country",
        "patients.create.selectCountryOption": "Select residence country",
        "patients.create.state": "State",
        "patients.create.selectStateOption": "Select state",
        "patients.create.city": "City",
        "patients.create.selectCityOption": "Select city",
        "patients.create.hasDiseases": "Has diseases",
        "patients.create.hasAllergies": "Has allergies",
        "patients.create.hasMedications": "Has medications",
        "patients.create.gender": "Gender",
        "patients.card.genderMale": "Male",
        "patients.card.genderFemale": "Female",
        "patients.create.organDonor": "Organ donor",
        "patients.create.bloodDonor": "Blood donor",
        "patients.create.measurementSystem": "Measurement system",
        "patients.create.systemMetric": "Metric",
        "patients.create.systemImperial": "Imperial",
        "patients.create.heightLabel": "Height",
        "patients.create.weightLabel": "Weight",
        "patients.create.submit": "Submit",
        "patients.create.submitting": "Submitting",
        "patients.create.invalidEmail": "Invalid email",
        "patients.create.parentEmailRequired": "Parent email required",
        "patients.create.childrenCountRequired": "Children count required",
        "patients.create.childrenNamesRequired": "Children names required",
        "patients.create.diseasesRequired": "Diseases required",
        "patients.create.allergiesRequired": "Allergies required",
        "patients.create.medicationsRequired": "Medications required",
        "patients.create.countryRequired": "Country required",
        "patients.create.stateRequired": "State required",
        "patients.create.cityRequired": "City required",
        "patients.create.ageOutOfRange": "Age out of range",
        "patients.create.heightWeightTooHigh": "Height or weight too high",
        "patients.errors.birthDateRequired": "Birth date required",
      }[key] ?? options.defaultValue ?? key),
  }),
}));

vi.mock("../../features/patients/phooks.js", () => ({
  useCreatePatient: vi.fn(),
}));

vi.mock("../../components/forms/LocalizedDatePicker.jsx", () => ({
  default: ({ value, onChange, placeholder, maxDate, ...props }) => (
    <input
      {...props}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const renderCreatePage = () => {
  render(
    <MemoryRouter>
      <PatientCreatePage />
    </MemoryRouter>,
  );
};

const comboboxes = () => screen.getAllByRole("combobox");
const phoneCountrySelect = () => comboboxes()[0];
const residenceCountrySelect = () => comboboxes()[2];
const stateSelect = () => comboboxes()[3];
const citySelect = () => comboboxes()[4];
const submitButton = () => screen.getByRole("button", { name: "Submit" });
const submitForm = () => fireEvent.submit(submitButton().closest("form"));

const fillSharedRequiredFields = () => {
  fireEvent.change(screen.getByPlaceholderText("Full name"), {
    target: { value: "Patient Example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Male" }));
  screen.getAllByRole("button", { name: "No" }).forEach((button) => {
    fireEvent.click(button);
  });
  fireEvent.change(screen.getByPlaceholderText("e.g. 1.73"), {
    target: { value: "1.73" },
  });
  fireEvent.change(screen.getByPlaceholderText("e.g. 68"), {
    target: { value: "68" },
  });
  selectMexicoResidence();
};

const selectMexicoResidence = () => {
  fireEvent.change(residenceCountrySelect(), { target: { value: "MX" } });
  fireEvent.change(stateSelect(), { target: { value: "JAL" } });
  fireEvent.change(citySelect(), { target: { value: "Guadalajara" } });
};

const fillValidAdultBaseline = ({ withPhoneCountry = true, phone = "2025550123" } = {}) => {
  fillSharedRequiredFields();
  fireEvent.change(screen.getByPlaceholderText("adult@example.com"), {
    target: { value: "adult@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("Birth date"), {
    target: { value: "1990-01-01" },
  });
  if (withPhoneCountry) {
    fireEvent.change(phoneCountrySelect(), { target: { value: "US" } });
  }
  fireEvent.change(screen.getByPlaceholderText("Phone digits"), {
    target: { value: phone },
  });
};

const fillValidMinorBaseline = ({ phone = "" } = {}) => {
  fireEvent.change(screen.getByPlaceholderText("Birth date"), {
    target: { value: "2016-01-01" },
  });
  fillSharedRequiredFields();
  fireEvent.change(screen.getByPlaceholderText("parent@example.com"), {
    target: { value: "parent@example.com" },
  });
  if (phone) {
    fireEvent.change(screen.getByPlaceholderText("Phone digits"), {
      target: { value: phone },
    });
  }
};

describe("PatientCreatePage phone country behavior", () => {
  let mutate;

  beforeEach(() => {
    mutate = vi.fn();
    vi.clearAllMocks();
    useCreatePatient.mockReturnValue({ mutate, isPending: false });
  });

  test("submits phone country separately from residence country for a valid adult", () => {
    renderCreatePage();

    fillValidAdultBaseline();
    submitForm();

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({
        phone: "2025550123",
        phoneCountry: "United States",
        phoneCountryIso: "US",
        country: "Mexico",
        state: "Jalisco",
        city: "Guadalajara",
      }),
    );
  });

  test("changing residence country does not change the phone country dial code", () => {
    renderCreatePage();

    fireEvent.change(phoneCountrySelect(), { target: { value: "GB" } });
    expect(screen.getByPlaceholderText("+CC")).toHaveValue("+44");

    fireEvent.change(residenceCountrySelect(), { target: { value: "MX" } });

    expect(screen.getByPlaceholderText("+CC")).toHaveValue("+44");
  });

  test("changing phone country updates the dial code", () => {
    renderCreatePage();

    fireEvent.change(phoneCountrySelect(), { target: { value: "GB" } });
    expect(screen.getByPlaceholderText("+CC")).toHaveValue("+44");

    fireEvent.change(phoneCountrySelect(), { target: { value: "MX" } });
    expect(screen.getByPlaceholderText("+CC")).toHaveValue("+52");
  });

  test("blocks an adult phone when phone country is missing", () => {
    renderCreatePage();

    fillValidAdultBaseline({ withPhoneCountry: false });
    submitForm();

    expect(toast.error).toHaveBeenCalledWith("patients.create.phoneSelectCountryToValidate");
    expect(mutate).not.toHaveBeenCalled();
  });

  test("allows a minor without phone fields", () => {
    renderCreatePage();

    fillValidMinorBaseline();
    submitForm();

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    expect(payload).not.toHaveProperty("phone");
    expect(payload).not.toHaveProperty("phoneCountry");
    expect(payload).not.toHaveProperty("phoneCountryIso");
  });

  test("blocks a minor phone when phone country is missing", () => {
    renderCreatePage();

    fillValidMinorBaseline({ phone: "2025550123" });
    submitForm();

    expect(toast.error).toHaveBeenCalledWith("patients.create.phoneSelectCountryToValidate");
    expect(mutate).not.toHaveBeenCalled();
  });

  test("submits valid phone fields without replacing residence fields", () => {
    renderCreatePage();

    fillValidAdultBaseline();
    submitForm();

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({
        phone: "2025550123",
        phoneCountry: "United States",
        phoneCountryIso: "US",
        country: "Mexico",
        state: "Jalisco",
        city: "Guadalajara",
      }),
    );
    expect(payload.phoneCountry).not.toBe(payload.country);
    expect(payload.phoneCountryIso).not.toBe("MX");
  });
});
