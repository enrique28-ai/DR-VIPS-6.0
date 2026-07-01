import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import DiagnosisEditPage from "./DiagnosisEditPage.jsx";
import { useDiagnosis, useUpdateDiagnosis } from "../../features/diagnostics/dhooks.js";
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
  useNavigate: () => navigate,
  useParams: () => ({ patientId: "patient-1", diagnosisId: "diagnosis-1" }),
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
    t: (key) =>
      ({
        "common.loading": "Loading",
        "diagnoses.detail.backToList": "Back to list",
        "diagnoses.detail.notFoundTitle": "Diagnosis not found",
        "diagnoses.edit.back": "Back",
        "diagnoses.edit.cancel": "Cancel",
        "diagnoses.edit.save": "Save",
        "diagnoses.edit.saving": "Saving",
        "diagnoses.edit.title": "Edit diagnosis",
        "diagnoses.form.descriptionLabel": "Description",
        "diagnoses.form.descriptionPlaceholder": "Description",
        "diagnoses.form.errors.descriptionRequired": "diagnoses.form.errors.descriptionRequired",
        "diagnoses.form.errors.medsRequired": "diagnoses.form.errors.medsRequired",
        "diagnoses.form.errors.opsRequired": "diagnoses.form.errors.opsRequired",
        "diagnoses.form.errors.titleRequired": "diagnoses.form.errors.titleRequired",
        "diagnoses.form.errors.txRequired": "diagnoses.form.errors.txRequired",
        "diagnoses.form.medsLabel": "Medicines",
        "diagnoses.form.medsPlaceholder": "Medicines",
        "diagnoses.form.no": "No",
        "diagnoses.form.opsLabel": "Operations",
        "diagnoses.form.opsPlaceholder": "Operations",
        "diagnoses.form.requiresMeds": "Requires medicines",
        "diagnoses.form.requiresOps": "Requires operations",
        "diagnoses.form.requiresTx": "Requires treatments",
        "diagnoses.form.titleLabel": "Title",
        "diagnoses.form.titlePlaceholder": "Title",
        "diagnoses.form.txLabel": "Treatments",
        "diagnoses.form.txPlaceholder": "Treatments",
        "diagnoses.form.yes": "Yes",
      }[key] ?? key),
  }),
}));

vi.mock("../../features/diagnostics/dhooks.js", () => ({
  useDiagnosis: vi.fn(),
  useUpdateDiagnosis: vi.fn(),
}));

const baseDiagnosis = (overrides = {}) => ({
  _id: "diagnosis-1",
  title: "Flu diagnosis",
  description: "Fever and cough",
  medicine: [],
  treatment: [],
  operation: [],
  ...overrides,
});

const renderEditPage = (diagnosis = baseDiagnosis(), queryState = {}) => {
  useDiagnosis.mockReturnValue({
    data: diagnosis,
    isLoading: false,
    isError: false,
    ...queryState,
  });

  return render(<DiagnosisEditPage />);
};

const saveButton = () => screen.getByRole("button", { name: "Save" });
const submitForm = () => fireEvent.submit(saveButton().closest("form"));

const fillTitle = (value = "Updated diagnosis") => {
  fireEvent.change(screen.getByPlaceholderText("Title"), {
    target: { value },
  });
};

const fillDescription = (value = "Updated description") => {
  fireEvent.change(screen.getByPlaceholderText("Description"), {
    target: { value },
  });
};

const selectYesFor = (groupName) => {
  fireEvent.click(
    within(screen.getByRole("group", { name: groupName })).getByRole("button", {
      name: "Yes",
    }),
  );
};

const waitForDiagnosisForm = async (title = "Flu diagnosis") => {
  await waitFor(() => {
    expect(screen.getByDisplayValue(title)).toBeInTheDocument();
  });
};

describe("DiagnosisEditPage", () => {
  let mutate;

  beforeEach(() => {
    mutate = vi.fn((_payload, options) => options?.onSuccess?.());
    vi.clearAllMocks();
    locationState = {};
    useUpdateDiagnosis.mockReturnValue({ mutate, isPending: false });
  });

  test("renders a loading state while the diagnosis is loading without cached data", () => {
    renderEditPage(undefined, {
      data: undefined,
      isLoading: true,
      isError: false,
    });

    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(useDiagnosis).toHaveBeenCalledWith("diagnosis-1");
    expect(useUpdateDiagnosis).toHaveBeenCalledWith("diagnosis-1", "patient-1");
  });

  test("renders the not-found state and navigates back to the patient diagnosis list", () => {
    renderEditPage(null, {
      data: null,
      isLoading: false,
      isError: true,
    });

    expect(screen.getByRole("heading", { name: "Diagnosis not found" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));

    expect(navigate).toHaveBeenCalledWith("/diagnosis/patient/patient-1");
  });

  test("initializes form fields from existing diagnosis arrays", async () => {
    renderEditPage(
      baseDiagnosis({
        medicine: ["Ibuprofen", "Acetaminophen"],
        treatment: ["Rest", "Hydration"],
        operation: ["Procedure A"],
      }),
    );

    await waitForDiagnosisForm();

    expect(screen.getByDisplayValue("Fever and cough")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Medicines")).toHaveValue(
      "Ibuprofen, Acetaminophen",
    );
    expect(screen.getByPlaceholderText("Treatments")).toHaveValue("Rest, Hydration");
    expect(screen.getByPlaceholderText("Operations")).toHaveValue("Procedure A");
  });

  test("falls back to the legacy Diagnostic field when title is missing", async () => {
    renderEditPage(
      baseDiagnosis({
        title: undefined,
        Diagnostic: "Legacy diagnosis title",
      }),
    );

    await waitForDiagnosisForm("Legacy diagnosis title");

    expect(screen.getByPlaceholderText("Title")).toHaveValue("Legacy diagnosis title");
  });

  test("blocks missing title with a clear validation toast", async () => {
    renderEditPage();

    await waitForDiagnosisForm();
    fillTitle("");
    submitForm();

    expect(toast.error).toHaveBeenCalledWith("diagnoses.form.errors.titleRequired");
    expect(mutate).not.toHaveBeenCalled();
  });

  test("blocks missing description with a clear validation toast", async () => {
    renderEditPage();

    await waitForDiagnosisForm();
    fillDescription("");
    submitForm();

    expect(toast.error).toHaveBeenCalledWith(
      "diagnoses.form.errors.descriptionRequired",
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  test.each([
    ["Requires medicines", "Medicines", "diagnoses.form.errors.medsRequired"],
    ["Requires treatments", "Treatments", "diagnoses.form.errors.txRequired"],
    ["Requires operations", "Operations", "diagnoses.form.errors.opsRequired"],
  ])(
    "blocks blank optional details when %s is selected",
    async (groupName, placeholder, toastKey) => {
      renderEditPage();

      await waitForDiagnosisForm();
      selectYesFor(groupName);
      fireEvent.change(screen.getByPlaceholderText(placeholder), {
        target: { value: "" },
      });
      submitForm();

      expect(toast.error).toHaveBeenCalledWith(toastKey);
      expect(mutate).not.toHaveBeenCalled();
    },
  );

  test("submits trimmed text and parsed comma-separated arrays", async () => {
    renderEditPage(
      baseDiagnosis({
        medicine: ["Old medicine"],
        treatment: ["Old treatment"],
        operation: ["Old operation"],
      }),
    );

    await waitForDiagnosisForm();
    fillTitle("  Updated diagnosis  ");
    fillDescription("  Updated description  ");
    fireEvent.change(screen.getByPlaceholderText("Medicines"), {
      target: { value: "Ibuprofen,  Acetaminophen, " },
    });
    fireEvent.change(screen.getByPlaceholderText("Treatments"), {
      target: { value: "Rest, Hydration" },
    });
    fireEvent.change(screen.getByPlaceholderText("Operations"), {
      target: { value: "Procedure A, Procedure B" },
    });

    submitForm();

    expect(useUpdateDiagnosis).toHaveBeenCalledWith("diagnosis-1", "patient-1");
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      {
        title: "Updated diagnosis",
        description: "Updated description",
        medicine: ["Ibuprofen", "Acetaminophen"],
        treatment: ["Rest", "Hydration"],
        operation: ["Procedure A", "Procedure B"],
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );
  });

  test("navigates to the patient diagnosis list when update succeeds without browser history", async () => {
    renderEditPage();

    await waitForDiagnosisForm();
    submitForm();

    expect(navigate).toHaveBeenCalledWith("/diagnosis/patient/patient-1", {
      replace: true,
    });
  });
});
