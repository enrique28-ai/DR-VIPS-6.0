import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import DiagnosisCreatePage from "./DiagnosisCreatePage.jsx";
import { useCreateDiagnosis } from "../../features/diagnostics/dhooks.js";
import { toast } from "react-hot-toast";

const navigate = vi.fn();

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
    useNavigate: () => navigate,
    useParams: () => ({ patientId: "patient-1" }),
  };
});

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
        "diagnoses.create.back": "Back",
        "diagnoses.create.creating": "Creating",
        "diagnoses.create.submit": "Create diagnosis",
        "diagnoses.create.title": "Create diagnosis",
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
  useCreateDiagnosis: vi.fn(),
}));

const renderCreatePage = () => {
  render(
    <MemoryRouter>
      <DiagnosisCreatePage />
    </MemoryRouter>,
  );
};

const submitButton = () => screen.getByRole("button", { name: "Create diagnosis" });
const submitForm = () => fireEvent.submit(submitButton().closest("form"));

const fillTitle = (value = "Flu") => {
  fireEvent.change(screen.getByPlaceholderText("Title"), {
    target: { value },
  });
};

const fillDescription = (value = "Fever and cough") => {
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

describe("DiagnosisCreatePage", () => {
  let mutate;

  beforeEach(() => {
    mutate = vi.fn((_payload, options) => options?.onSuccess?.());
    vi.clearAllMocks();
    useCreateDiagnosis.mockReturnValue({ mutate, isPending: false });
  });

  test("renders the create form for the patient route param", () => {
    renderCreatePage();

    expect(useCreateDiagnosis).toHaveBeenCalledWith("patient-1");
    expect(screen.getByRole("heading", { name: "Create diagnosis" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back/i })).toHaveAttribute(
      "href",
      "/diagnosis/patient/patient-1",
    );
  });

  test("blocks missing title with a clear validation toast", () => {
    renderCreatePage();

    fillDescription();
    submitForm();

    expect(toast.error).toHaveBeenCalledWith("diagnoses.form.errors.titleRequired");
    expect(mutate).not.toHaveBeenCalled();
  });

  test("blocks missing description with a clear validation toast", () => {
    renderCreatePage();

    fillTitle();
    submitForm();

    expect(toast.error).toHaveBeenCalledWith("diagnoses.form.errors.descriptionRequired");
    expect(mutate).not.toHaveBeenCalled();
  });

  test.each([
    ["Requires medicines", "diagnoses.form.errors.medsRequired"],
    ["Requires treatments", "diagnoses.form.errors.txRequired"],
    ["Requires operations", "diagnoses.form.errors.opsRequired"],
  ])("blocks blank optional details when %s is selected", (groupName, toastKey) => {
    renderCreatePage();

    fillTitle();
    fillDescription();
    selectYesFor(groupName);
    submitForm();

    expect(toast.error).toHaveBeenCalledWith(toastKey);
    expect(mutate).not.toHaveBeenCalled();
  });

  test("submits trimmed text and parsed comma-separated arrays", () => {
    renderCreatePage();

    fillTitle("  Flu diagnosis  ");
    fillDescription("  Persistent fever  ");
    selectYesFor("Requires medicines");
    fireEvent.change(screen.getByPlaceholderText("Medicines"), {
      target: { value: "Ibuprofen,  Acetaminophen, " },
    });
    selectYesFor("Requires treatments");
    fireEvent.change(screen.getByPlaceholderText("Treatments"), {
      target: { value: "Rest, Hydration" },
    });
    selectYesFor("Requires operations");
    fireEvent.change(screen.getByPlaceholderText("Operations"), {
      target: { value: "Procedure A, Procedure B" },
    });

    submitForm();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      {
        title: "Flu diagnosis",
        description: "Persistent fever",
        medicine: ["Ibuprofen", "Acetaminophen"],
        treatment: ["Rest", "Hydration"],
        operation: ["Procedure A", "Procedure B"],
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );
  });

  test("navigates back to the patient diagnosis list when create succeeds", () => {
    renderCreatePage();

    fillTitle();
    fillDescription();
    submitForm();

    expect(navigate).toHaveBeenCalledWith("/diagnosis/patient/patient-1", {
      replace: true,
    });
  });
});
