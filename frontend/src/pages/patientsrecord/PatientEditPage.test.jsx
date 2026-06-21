import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import PatientEditPage from "./PatientEditPage.jsx";
import { usePatient, useUpdatePatient } from "../../features/patients/phooks.js";
import { toast } from "react-hot-toast";

const navigate = vi.fn();
let locationState = {};

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, whileHover, whileTap, ...props }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "patient-id" }),
  useNavigate: () => navigate,
  useLocation: () => ({ state: locationState }),
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
        "patients.edit.back": "Back",
        "patients.edit.backToPatients": "Back to patients",
        "patients.edit.cancel": "Cancel",
        "patients.edit.save": "Save",
        "patients.edit.saving": "Saving",
        "patients.edit.status": "Status",
        "patients.edit.alive": "Alive",
        "patients.edit.deceased": "Deceased",
        "patients.edit.emailImmutable": "Email cannot be changed",
        "patients.edit.invalidEmail": "Invalid email",
        "patients.edit.countryRequired": "Country required",
        "patients.edit.ageOutOfRange": "Age out of range",
        "patients.edit.heightWeightPositive": "Height and weight must be positive",
        "patients.edit.heightWeightTooHigh": "Height or weight too high",
        "patients.edit.childrenNamesImmutable": "Existing child names cannot be changed",
        "patients.edit.childrenNamesDuplicate": "Child names must be unique",
        "patients.edit.causeRequired": "Cause of death required",
        "patients.create.fullname": "Full name",
        "patients.create.email": "Email",
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
        "patients.create.childrenNamesRequired": "Children names required",
        "patients.create.parentEmailRequired": "Parent email required",
        "patients.create.diseasesRequired": "Diseases required",
        "patients.create.allergiesRequired": "Allergies required",
        "patients.create.medicationsRequired": "Medications required",
        "patients.create.countryRequired": "Country required",
        "patients.create.stateRequired": "State required",
        "patients.create.cityRequired": "City required",
        "patients.detail.diseases": "Diseases",
        "patients.detail.allergies": "Allergies",
        "patients.detail.medications": "Medications",
        "patients.errors.birthDateRequired": "Birth date required",
        "patients.errors.dateOfDeathRequired": "Date of death required",
        "patients.errors.dateOfDeathInFuture": "Date of death cannot be in the future",
        "patients.errors.dateOfDeathBeforeBirthDate": "Date of death cannot be before birth date",
      }[key] ?? options.defaultValue ?? key),
  }),
}));

vi.mock("../../features/patients/phooks.js", () => ({
  usePatient: vi.fn(),
  useUpdatePatient: vi.fn(),
}));

vi.mock("../../components/forms/LocalizedDatePicker.jsx", () => ({
  default: ({ value, onChange, maxDate, ...props }) => (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const renderEditPage = (patient) => {
  usePatient.mockReturnValue({
    data: patient,
    isLoading: false,
    isError: false,
  });

  render(<PatientEditPage />);
};

const baseAdultPatient = (overrides = {}) => ({
  _id: "patient-id",
  fullname: "Adult Patient",
  email: "adult@example.com",
  phone: "+12025550123",
  phoneDigits: "12025550123",
  phoneCountry: "United States",
  phoneCountryIso: "US",
  birthDate: "1990-01-01T12:00:00.000Z",
  diseases: [],
  allergies: [],
  medications: [],
  bloodtype: "O+",
  gender: "male",
  country: "Mexico",
  state: "Jalisco",
  city: "Guadalajara",
  organDonor: false,
  bloodDonor: false,
  measurementSystem: "metric",
  heightM: 1.73,
  weightKg: 68,
  children: [],
  childrenCount: 0,
  isDeceased: false,
  ...overrides,
});

const baseMinorPatient = (overrides = {}) => ({
  _id: "patient-id",
  fullname: "Minor Patient",
  email: "",
  phone: "",
  phoneDigits: "",
  birthDate: "2016-01-01T12:00:00.000Z",
  parentEmail: "parent@example.com",
  diseases: [],
  allergies: [],
  medications: [],
  bloodtype: "O+",
  gender: "female",
  country: "Mexico",
  state: "Jalisco",
  city: "Guadalajara",
  organDonor: false,
  bloodDonor: false,
  measurementSystem: "metric",
  heightM: 1.35,
  weightKg: 32,
  children: [],
  childrenCount: 0,
  isDeceased: false,
  ...overrides,
});

const phoneCountrySelect = () => screen.getByRole("combobox", { name: /Phone Country/i });
const residenceCountrySelect = () => screen.getByRole("combobox", { name: /Residence Country/i });
const stateSelect = () => screen.getByRole("combobox", { name: /^State/i });
const citySelect = () => screen.getByRole("combobox", { name: /^City/i });
const phoneInput = () => screen.getByPlaceholderText("Phone digits");
const dialInput = () => screen.getByPlaceholderText("+CC");
const saveButton = () => screen.getByRole("button", { name: "Save" });
const submitForm = () => fireEvent.submit(saveButton().closest("form"));

const waitForPatientForm = async () => {
  await waitFor(() => {
    expect(screen.getByDisplayValue("Adult Patient")).toBeInTheDocument();
  });
};

const waitForMinorForm = async () => {
  await waitFor(() => {
    expect(screen.getByDisplayValue("Minor Patient")).toBeInTheDocument();
  });
};

describe("PatientEditPage phone country behavior", () => {
  let mutate;

  beforeEach(() => {
    mutate = vi.fn();
    vi.clearAllMocks();
    locationState = {};
    useUpdatePatient.mockReturnValue({ mutate, isPending: false });
  });

  test("initializes existing phone country independently from residence", async () => {
    renderEditPage(baseAdultPatient());

    await waitForPatientForm();

    expect(phoneCountrySelect()).toHaveValue("US");
    expect(dialInput()).toHaveValue("+1");
    expect(residenceCountrySelect()).toHaveValue("MX");
    expect(stateSelect()).toHaveValue("JAL");
    expect(citySelect()).toHaveValue("Guadalajara");
  });

  test("changing residence country does not change the phone country dial code", async () => {
    renderEditPage(
      baseAdultPatient({
        phone: "+442079460056",
        phoneDigits: "442079460056",
        phoneCountry: "United Kingdom",
        phoneCountryIso: "GB",
      }),
    );

    await waitFor(() => {
      expect(dialInput()).toHaveValue("+44");
    });

    fireEvent.change(residenceCountrySelect(), { target: { value: "MX" } });

    expect(dialInput()).toHaveValue("+44");
  });

  test("changing phone country updates the dial code", async () => {
    renderEditPage(
      baseAdultPatient({
        phone: "+442079460056",
        phoneDigits: "442079460056",
        phoneCountry: "United Kingdom",
        phoneCountryIso: "GB",
      }),
    );

    await waitFor(() => {
      expect(dialInput()).toHaveValue("+44");
    });

    fireEvent.change(phoneCountrySelect(), { target: { value: "MX" } });

    expect(dialInput()).toHaveValue("+52");
  });

  test("submits valid adult phone fields separately from residence", async () => {
    renderEditPage(baseAdultPatient());

    await waitForPatientForm();
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

  test("blocks an adult phone when phone country is missing", async () => {
    renderEditPage(baseAdultPatient());

    await waitForPatientForm();
    fireEvent.change(phoneCountrySelect(), { target: { value: "" } });
    submitForm();

    expect(toast.error).toHaveBeenCalledWith("patients.create.phoneSelectCountryToValidate");
    expect(mutate).not.toHaveBeenCalled();
  });

  test("allows a minor without phone fields", async () => {
    renderEditPage(baseMinorPatient());

    await waitForMinorForm();
    submitForm();

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    expect(payload).not.toHaveProperty("phone");
    expect(payload).not.toHaveProperty("phoneCountry");
    expect(payload).not.toHaveProperty("phoneCountryIso");
  });

  test("clears existing minor phone without stale phone country metadata", async () => {
    renderEditPage(
      baseMinorPatient({
        phone: "+12025550123",
        phoneDigits: "12025550123",
        phoneCountry: "United States",
        phoneCountryIso: "US",
      }),
    );

    await waitForMinorForm();
    fireEvent.change(phoneInput(), { target: { value: "" } });
    submitForm();

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    expect(payload).toEqual(expect.objectContaining({ phone: "" }));
    expect(payload).not.toHaveProperty("phoneCountry");
    expect(payload).not.toHaveProperty("phoneCountryIso");
  });
});
