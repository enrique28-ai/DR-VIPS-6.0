import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import PatientDetailPage from "./PatientDetailPage.jsx";
import {
  usePatient,
  useReassignGuardian,
  useTranslatePatient,
} from "../../features/patients/phooks.js";

const { navigate } = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, whileHover, whileTap, ...props }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "patient-id" }),
    useNavigate: () => navigate,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key, options = {}) => {
      const labels = {
        "common.close": "Close",
        "common.translate": "Translate",
        "patients.card.age": "Age",
        "patients.card.blood": "Blood",
        "patients.card.country": "Country",
        "patients.card.gender": "Gender",
        "patients.card.genderFemale": "Female",
        "patients.card.genderMale": "Male",
        "patients.create.residence": "Residence",
        "patients.create.placeOfBirth": "Place of Birth",
        "patients.create.childrenCount": "Children count",
        "patients.detail.allergies": "Allergies",
        "patients.detail.back": "Back",
        "patients.detail.backButton": "Back to patients",
        "patients.detail.bmi": "BMI",
        "patients.detail.bmiCategories.normal": "Healthy",
        "patients.detail.category": "Category",
        "patients.detail.causeOfDeath": "Cause of death",
        "patients.detail.created": "Created",
        "patients.detail.diseases": "Diseases",
        "patients.detail.edit": "Edit",
        "patients.detail.email": "Email",
        "patients.detail.height": "Height",
        "patients.detail.history": "History",
        "patients.detail.loading": "Loading patient",
        "patients.detail.medications": "Medications",
        "patients.detail.newGuardianEmail": "New guardian email",
        "patients.detail.newGuardianEmailPlaceholder": "new.parent@example.com",
        "patients.detail.notSpecified": "Not specified",
        "patients.detail.notFoundText": "The patient could not be loaded",
        "patients.detail.notFoundTitle": "Patient not found",
        "patients.detail.pendingApproval": "Pending approval",
        "patients.detail.phone": "Phone",
        "patients.detail.reassignGuardian": "Reassign guardian",
        "patients.detail.updated": "Updated",
        "patients.detail.viewDiagnoses": "View diagnoses",
        "patients.detail.weight": "Weight",
        "patients.edit.cancel": "Cancel",
        "patients.list.ageCategories.adult": "Adult",
        "patients.list.ageCategories.child": "Child",
        "patients.list.ageCategories.senior": "Senior",
        "patients.list.ageCategories.teenager": "Teenager",
        "patients.list.filters.bloodDonor": "Blood donor",
        "patients.list.filters.options.alive": "Alive",
        "patients.list.filters.options.deceased": "Deceased",
        "patients.list.filters.options.no": "No",
        "patients.list.filters.options.yes": "Yes",
        "patients.list.filters.organDonor": "Organ donor",
      };
      if (key === "patients.detail.bmiCategoryParen") {
        return `(${options.category})`;
      }
      return labels[key] ?? key;
    },
  }),
}));

vi.mock("../../features/patients/phooks.js", () => ({
  usePatient: vi.fn(),
  useReassignGuardian: vi.fn(),
  useTranslatePatient: vi.fn(),
}));

vi.mock("../../components/patient/PatientHistoryModal.jsx", () => ({
  default: ({ variant, patientId, onClose }) => (
    <section data-testid="patient-history-modal">
      <p>History variant: {variant}</p>
      <p>History patient: {patientId}</p>
      <button type="button" onClick={onClose}>
        Close history
      </button>
    </section>
  ),
}));

vi.mock("../../utilsfront/geoLabels.js", () => ({
  localizeCountryName: vi.fn((name) => name),
}));

const adultPatient = (overrides = {}) => ({
  _id: "patient-id",
  fullname: "Ana Martinez",
  email: "ana@example.com",
  phone: "+12025550123",
  age: 34,
  ageCategory: "18-59",
  bloodtype: "O+",
  childrenCount: 2,
  country: "Mexico",
  state: "Jalisco",
  city: "Guadalajara",
  birthCountry: "Mexico",
  birthState: "Baja California",
  birthCity: "Mexicali",
  gender: "female",
  isDeceased: false,
  organDonor: true,
  bloodDonor: false,
  measurementSystem: "metric",
  heightM: 1.7,
  weightKg: 65,
  bmi: 22.49,
  bmiCategory: "Normal",
  diseases: ["Diabetes"],
  allergies: ["Penicillin"],
  medications: ["Metformin"],
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-02-01T12:00:00.000Z",
  ...overrides,
});

const minorPatient = (overrides = {}) =>
  adultPatient({
    fullname: "Minor Patient",
    email: "",
    phone: "",
    age: 12,
    ageCategory: "0-12",
    childrenCount: 0,
    parentEmail: "old.parent@example.com",
    ...overrides,
  });

const reassignMutate = vi.fn();
const translateMutate = vi.fn();

const renderDetailPage = (patient = adultPatient(), queryState = {}) => {
  usePatient.mockReturnValue({
    data: patient,
    isLoading: false,
    isError: false,
    ...queryState,
  });

  return render(
    <MemoryRouter>
      <PatientDetailPage />
    </MemoryRouter>,
  );
};

const setupLoadingPatient = () => {
  usePatient.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
  });
};

describe("PatientDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useReassignGuardian.mockReturnValue({
      mutate: reassignMutate,
      isPending: false,
    });
    useTranslatePatient.mockReturnValue({
      mutate: translateMutate,
      isPending: false,
    });
  });

  test("renders loading state while patient is loading", () => {
    setupLoadingPatient();

    render(
      <MemoryRouter>
        <PatientDetailPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Loading patient")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  test("renders not-found state and navigates back to patients", () => {
    renderDetailPage(undefined, {
      data: undefined,
      isError: true,
    });

    expect(screen.getByRole("heading", { name: "Patient not found" })).toBeInTheDocument();
    expect(screen.getByText("The patient could not be loaded")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to patients" }));

    expect(navigate).toHaveBeenCalledWith("/patients");
  });

  test("renders stable patient details and calls patient hooks with route id", () => {
    renderDetailPage();

    expect(usePatient).toHaveBeenCalledWith("patient-id");
    expect(useReassignGuardian).toHaveBeenCalledWith("patient-id");
    expect(screen.getByRole("heading", { name: "Ana Martinez" })).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.getByText("+12025550123")).toBeInTheDocument();
    expect(screen.getByText("34")).toBeInTheDocument();
    expect(screen.getByText("Adult")).toBeInTheDocument();
    expect(screen.getByText("O+")).toBeInTheDocument();
    expect(screen.getAllByText("Mexico, Jalisco, Guadalajara").length).toBeGreaterThan(0);
    expect(screen.getByText("Mexico, Baja California, Mexicali")).toBeInTheDocument();
    expect(screen.getByText("Female")).toBeInTheDocument();
    expect(screen.getByText("Alive")).toBeInTheDocument();
    expect(screen.getByText("1.70 m")).toBeInTheDocument();
    expect(screen.getByText("65.00 kg")).toBeInTheDocument();
    expect(screen.getByText("22.49")).toBeInTheDocument();
    expect(screen.getByText("(Healthy)")).toBeInTheDocument();
    expect(screen.getByText("Diabetes")).toBeInTheDocument();
    expect(screen.getByText("Penicillin")).toBeInTheDocument();
    expect(screen.getByText("Metformin")).toBeInTheDocument();
  });

  test("renders stable links and navigation actions", () => {
    renderDetailPage();

    expect(screen.getByRole("link", { name: /Back/i })).toHaveAttribute("href", "/patients");
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/patients/patient-id/edit",
    );

    fireEvent.click(screen.getByRole("button", { name: "View diagnoses" }));
    expect(navigate).toHaveBeenCalledWith("/diagnosis/patient/patient-id");
  });

  test("translates patient details and replaces displayed data on success", async () => {
    translateMutate.mockImplementation((_variables, options) => {
      options.onSuccess(
        adultPatient({
          fullname: "Ana Traducida",
          email: "translated@example.com",
          phone: "+525512345678",
          country: "United States",
          state: "California",
          city: "Los Angeles",
          diseases: ["Translated disease"],
          allergies: ["Translated allergy"],
          medications: ["Translated medication"],
        }),
      );
    });
    renderDetailPage();

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    expect(translateMutate).toHaveBeenCalledWith(
      { id: "patient-id", lang: "en" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Ana Traducida" })).toBeInTheDocument();
    });
    expect(screen.getByText("translated@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("United States, California, Los Angeles").length).toBeGreaterThan(0);
    expect(screen.getByText("Translated disease")).toBeInTheDocument();
    expect(screen.queryByText("Ana Martinez")).not.toBeInTheDocument();
  });

  test("opens and closes the patient history modal", () => {
    renderDetailPage();

    fireEvent.click(screen.getByRole("button", { name: "History" }));

    expect(screen.getByTestId("patient-history-modal")).toBeInTheDocument();
    expect(screen.getByText("History variant: doctor")).toBeInTheDocument();
    expect(screen.getByText("History patient: patient-id")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close history" }));

    expect(screen.queryByTestId("patient-history-modal")).not.toBeInTheDocument();
  });

  test("shows guardian reassignment for living linked minors and submits normalized email", async () => {
    reassignMutate.mockImplementation((_payload, options) => {
      options.onSuccess();
    });
    renderDetailPage(minorPatient());

    fireEvent.click(screen.getByRole("button", { name: "Reassign guardian" }));

    const emailInput = screen.getByPlaceholderText("new.parent@example.com");
    const form = emailInput.closest("form");
    const submitButton = within(form).getByRole("button", {
      name: "Reassign guardian",
    });

    expect(submitButton).toBeDisabled();

    fireEvent.change(emailInput, { target: { value: "  NEW.Parent@Example.COM  " } });
    fireEvent.blur(emailInput);
    expect(emailInput).toHaveValue("new.parent@example.com");

    fireEvent.click(submitButton);

    expect(reassignMutate).toHaveBeenCalledWith(
      { newParentEmail: "new.parent@example.com" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("new.parent@example.com")).not.toBeInTheDocument();
    });
  });

  test("hides guardian reassignment for deceased patients and unrelated adults", () => {
    renderDetailPage(adultPatient({ isDeceased: true, parentEmail: "old.parent@example.com" }));

    expect(screen.queryByRole("button", { name: "Reassign guardian" })).not.toBeInTheDocument();

    renderDetailPage(adultPatient());

    expect(screen.queryByRole("button", { name: "Reassign guardian" })).not.toBeInTheDocument();
  });

  test("guardian modal renders with role dialog and aria-modal", () => {
    renderDetailPage(minorPatient());
    fireEvent.click(screen.getByRole("button", { name: "Reassign guardian" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "guardian-modal-title");
  });

  test("guardian modal close X closes the modal", () => {
    renderDetailPage(minorPatient());
    fireEvent.click(screen.getByRole("button", { name: "Reassign guardian" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("Escape closes guardian modal", () => {
    renderDetailPage(minorPatient());
    fireEvent.click(screen.getByRole("button", { name: "Reassign guardian" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("guardian modal traps Tab and Shift+Tab inside the dialog", () => {
    renderDetailPage(minorPatient());
    fireEvent.click(screen.getByRole("button", { name: "Reassign guardian" }));
    const dialog = screen.getByRole("dialog");
    const closeButton = within(dialog).getByRole("button", { name: "Close" });
    const cancelButton = within(dialog).getByRole("button", { name: "Cancel" });

    cancelButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    closeButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancelButton);
  });

  test("backdrop click closes guardian modal", () => {
    renderDetailPage(minorPatient());
    fireEvent.click(screen.getByRole("button", { name: "Reassign guardian" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.parentElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("inside modal click does not close guardian modal", () => {
    renderDetailPage(minorPatient());
    fireEvent.click(screen.getByRole("button", { name: "Reassign guardian" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("PatientDetailPage imperial height display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useReassignGuardian.mockReturnValue({
      mutate: reassignMutate,
      isPending: false,
    });
    useTranslatePatient.mockReturnValue({
      mutate: translateMutate,
      isPending: false,
    });
  });

  test("displays imperial height as '5 ft 10 in', not '5.83 ft'", () => {
    renderDetailPage(
      adultPatient({
        measurementSystem: "imperial",
        heightFeet: 5,
        heightInches: 10,
        heightM: 1.778,
        weightKg: 81.6466,
        weightDisplay: 180,
      }),
    );

    expect(screen.getByText("5 ft 10 in")).toBeInTheDocument();
    expect(screen.queryByText(/5\.83/)).not.toBeInTheDocument();
    expect(screen.getByText("180.00 lb")).toBeInTheDocument();
  });

  test("derives imperial display from heightM when feet/inches absent", () => {
    renderDetailPage(
      adultPatient({
        measurementSystem: "imperial",
        heightM: 1.78,
      }),
    );

    expect(screen.getByText("5 ft 10 in")).toBeInTheDocument();
  });
});
