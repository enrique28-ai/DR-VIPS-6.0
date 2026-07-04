import { fireEvent, render, screen, within } from "@testing-library/react";
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
        "patients.create.residence": "Residence",
        "patients.create.residenceCountry": "Residence Country",
        "patients.create.residenceState": "Residence State",
        "patients.create.residenceCity": "Residence City",
        "patients.create.placeOfBirth": "Place of Birth",
        "patients.create.birthCountry": "Birth Country",
        "patients.create.birthState": "Birth State",
        "patients.create.birthCity": "Birth City",
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
        "patients.create.heightFeetLabel": "Feet",
        "patients.create.heightInchesLabel": "Inches",
        "patients.create.heightFeetInchesInvalid": "Enter height as whole feet and inches from 0 to 11.",
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
        "patients.create.birthplaceRequired": "Birthplace required",
        "patients.create.birthplaceCompleteRequired": "Birthplace complete required",
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

const selectById = (id) => {
  const element = document.getElementById(id);
  expect(element).toBeInTheDocument();
  return element;
};

const phoneCountrySelect = () => selectById("patient-create-phone-country");
const residenceCountrySelect = () => selectById("patient-create-residence-country");
const stateSelect = () => selectById("patient-create-residence-state");
const citySelect = () => selectById("patient-create-residence-city");
const birthCountrySelect = () => selectById("patient-create-birth-country");
const birthStateSelect = () => selectById("patient-create-birth-state");
const birthCitySelect = () => selectById("patient-create-birth-city");
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

const selectMexicoBirthplace = () => {
  fireEvent.change(birthCountrySelect(), { target: { value: "MX" } });
  fireEvent.change(birthStateSelect(), { target: { value: "BCN" } });
  fireEvent.change(birthCitySelect(), { target: { value: "Mexicali" } });
};

const fillValidAdultBaseline = ({
  withPhoneCountry = true,
  phone = "2025550123",
  withBirthplace = true,
} = {}) => {
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
  if (withBirthplace) {
    selectMexicoBirthplace();
  }
};

const fillValidMinorBaseline = ({ phone = "", withBirthplace = true } = {}) => {
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
  if (withBirthplace) {
    selectMexicoBirthplace();
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

  test("submits residence and birthplace separately for a valid adult", () => {
    renderCreatePage();

    fillValidAdultBaseline();
    selectMexicoBirthplace();
    submitForm();

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({
        country: "Mexico",
        state: "Jalisco",
        city: "Guadalajara",
        birthCountry: "Mexico",
        birthState: "Baja California",
        birthCity: "Mexicali",
      }),
    );
  });

  test("blocks create when birthplace is empty", () => {
    renderCreatePage();

    fillValidAdultBaseline({ withBirthplace: false });
    submitForm();

    expect(toast.error).toHaveBeenCalledWith("Birthplace required");
    expect(mutate).not.toHaveBeenCalled();
  });

  test("blocks create when birthplace is partial", () => {
    renderCreatePage();

    fillValidAdultBaseline({ withBirthplace: false });
    fireEvent.change(birthCountrySelect(), { target: { value: "MX" } });
    submitForm();

    expect(toast.error).toHaveBeenCalledWith("Birthplace complete required");
    expect(mutate).not.toHaveBeenCalled();
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

describe("PatientCreatePage imperial height submission", () => {
  let mutate;

  const selectImperial = () =>
    fireEvent.click(screen.getByRole("button", { name: "Imperial" }));
  const feetInput = () => screen.getByPlaceholderText("5");
  const inchesInput = () => screen.getByPlaceholderText("10");
  const imperialWeightInput = () => screen.getByPlaceholderText("e.g. 150");

  const fillImperialAdultBaseline = ({ feet = "5", inches = "10", weight = "150" } = {}) => {
    fireEvent.change(screen.getByPlaceholderText("Full name"), {
      target: { value: "Patient Example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Male" }));
    screen.getAllByRole("button", { name: "No" }).forEach((button) => {
      fireEvent.click(button);
    });
    selectImperial();
    fireEvent.change(feetInput(), { target: { value: feet } });
    fireEvent.change(inchesInput(), { target: { value: inches } });
    fireEvent.change(imperialWeightInput(), { target: { value: weight } });
    selectMexicoResidence();
    fireEvent.change(screen.getByPlaceholderText("adult@example.com"), {
      target: { value: "adult@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Birth date"), {
      target: { value: "1990-01-01" },
    });
    fireEvent.change(phoneCountrySelect(), { target: { value: "US" } });
    fireEvent.change(screen.getByPlaceholderText("Phone digits"), {
      target: { value: "2025550123" },
    });
    selectMexicoBirthplace();
  };

  const assertInvalidHeightBlocked = () => {
    submitForm();
    expect(toast.error).toHaveBeenCalledWith(
      "Enter height as whole feet and inches from 0 to 11.",
    );
    expect(mutate).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    mutate = vi.fn();
    vi.clearAllMocks();
    useCreatePatient.mockReturnValue({ mutate, isPending: false });
  });

  test("submits imperial payload with feet, inches, decimal feet, and weight", () => {
    renderCreatePage();

    fillImperialAdultBaseline();
    submitForm();

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({
        measurementSystem: "imperial",
        heightFeet: 5,
        heightInches: 10,
        weight: 150,
      }),
    );
    expect(payload.height).toBeCloseTo(5 + 10 / 12, 4);
    expect(payload.height).not.toBe(5.1);
  });

  test("inches equal to 12 blocks submit with validation toast", () => {
    renderCreatePage();

    fillImperialAdultBaseline({ inches: "12" });
    assertInvalidHeightBlocked();
  });

  test("negative inches blocks submit with validation toast", () => {
    renderCreatePage();

    fillImperialAdultBaseline({ inches: "-1" });
    assertInvalidHeightBlocked();
  });

  test("fractional feet blocks submit with validation toast", () => {
    renderCreatePage();

    fillImperialAdultBaseline({ feet: "5.5" });
    assertInvalidHeightBlocked();
  });

  test("fractional inches blocks submit with validation toast", () => {
    renderCreatePage();

    fillImperialAdultBaseline({ inches: "10.5" });
    assertInvalidHeightBlocked();
  });

  test("missing feet blocks submit with validation toast", () => {
    renderCreatePage();

    fillImperialAdultBaseline({ feet: "" });
    assertInvalidHeightBlocked();
  });

  test("missing inches blocks submit with validation toast", () => {
    renderCreatePage();

    fillImperialAdultBaseline({ inches: "" });
    assertInvalidHeightBlocked();
  });
});

describe("PatientCreatePage weight conversion round-trip", () => {
  let mutate;

  beforeEach(() => {
    mutate = vi.fn();
    vi.clearAllMocks();
    useCreatePatient.mockReturnValue({ mutate, isPending: false });
  });

  test("imperial 87 lb survives metric round-trip without drifting to 86.99", () => {
    renderCreatePage();

    fireEvent.click(screen.getByRole("button", { name: "Male" }));
    screen.getAllByRole("button", { name: "No" }).forEach((button) => {
      fireEvent.click(button);
    });
    fireEvent.click(screen.getByRole("button", { name: "Imperial" }));

    const imperialWeightInput = screen.getByPlaceholderText("e.g. 150");
    fireEvent.change(imperialWeightInput, { target: { value: "87" } });
    expect(Number(imperialWeightInput.value)).toBeCloseTo(87, 2);

    // imperial -> metric: 87 lb -> 39.4625 kg (4 decimals preserves precision)
    fireEvent.click(screen.getByRole("button", { name: "Metric" }));
    const metricWeightInput = screen.getByPlaceholderText("e.g. 68");
    expect(Number(metricWeightInput.value)).toBeCloseTo(39.4625, 4);

    // metric -> imperial: 39.4625 kg -> 87 lb
    fireEvent.click(screen.getByRole("button", { name: "Imperial" }));
    const backToImperialWeightInput = screen.getByPlaceholderText("e.g. 150");
    expect(Number(backToImperialWeightInput.value)).toBeCloseTo(87, 2);
    expect(backToImperialWeightInput.value).not.toBe("86.99");
  });
});

describe("PatientCreatePage accessibility", () => {
  let mutate;

  beforeEach(() => {
    mutate = vi.fn();
    vi.clearAllMocks();
    useCreatePatient.mockReturnValue({ mutate, isPending: false });
  });

  test("yes/no toggles expose aria-pressed", () => {
    renderCreatePage();
    const noButtons = screen.getAllByRole("button", { name: "No" });
    noButtons.forEach((btn) => {
      fireEvent.click(btn);
      expect(btn).toHaveAttribute("aria-pressed", "true");
    });
  });

  test("hasChildren No clears child name fields", () => {
    renderCreatePage();
    fireEvent.change(screen.getByPlaceholderText("Birth date"), { target: { value: "1990-01-01" } });
    const hasChildrenGroup = screen.getByRole("group", { name: "Has children" });
    const yesButton = within(hasChildrenGroup).getByRole("button", { name: "Yes" });
    fireEvent.click(yesButton);
    expect(screen.getByPlaceholderText("Child name")).toBeInTheDocument();
    const noButton = within(hasChildrenGroup).getByRole("button", { name: "No" });
    fireEvent.click(noButton);
    expect(screen.queryByPlaceholderText("Child name")).not.toBeInTheDocument();
  });

  test("hasChildren Yes creates at least one child name field", () => {
    renderCreatePage();
    fireEvent.change(screen.getByPlaceholderText("Birth date"), { target: { value: "1990-01-01" } });
    const hasChildrenGroup = screen.getByRole("group", { name: "Has children" });
    const yesButton = within(hasChildrenGroup).getByRole("button", { name: "Yes" });
    fireEvent.click(yesButton);
    expect(screen.getByPlaceholderText("Child name")).toBeInTheDocument();
  });

  test("email input is associated with its label by htmlFor", () => {
    renderCreatePage();
    fireEvent.change(screen.getByPlaceholderText("Birth date"), { target: { value: "1990-01-01" } });
    const emailInput = document.getElementById("patient-create-email");
    expect(emailInput).toBeInTheDocument();
    const label = document.querySelector('label[for="patient-create-email"]');
    expect(label).toBeInTheDocument();
  });

  test("birth date input is associated with its visible label", () => {
    renderCreatePage();
    expect(screen.getByLabelText(/Birth date/i)).toBeInTheDocument();
  });

  test("blood type select has an accessible label", () => {
    renderCreatePage();
    expect(screen.getByRole("combobox", { name: /Blood type/i })).toBeInTheDocument();
  });
});
