import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import DiagnosesByPatientPage from "./DiagnosesByPatientPage.jsx";
import { useDiagnosesByPatient } from "../../features/diagnostics/dhooks.js";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ patientId: "patient-1" }),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key, options = {}) => {
      const labels = {
        "common.loading": "Loading",
        "diagnoses.create.cta": "Create diagnosis",
        "diagnoses.empty.title": "No diagnoses",
        "diagnoses.list.filters.backToPatient": "Back to patient",
        "diagnoses.list.filters.clear": "Clear",
        "diagnoses.list.filters.date": "Date",
        "diagnoses.list.filters.medicines": "Medicines",
        "diagnoses.list.filters.more": "More",
        "diagnoses.list.filters.operations": "Operations",
        "diagnoses.list.filters.options.all": "All",
        "diagnoses.list.filters.options.no": "No",
        "diagnoses.list.filters.options.yes": "Yes",
        "diagnoses.list.filters.today": "Today",
        "diagnoses.list.filters.treatments": "Treatments",
        "diagnoses.list.noMatch.clear": "Clear filters",
        "diagnoses.list.noMatch.description": "Try adjusting your filters",
        "diagnoses.list.noMatch.title": "No matching diagnoses",
        "diagnoses.list.pagination.next": "Next",
        "diagnoses.list.pagination.prev": "Previous",
        "diagnoses.list.searchPlaceholder": "Search diagnoses",
        "diagnoses.list.title": "Diagnoses",
      };
      if (key === "diagnoses.list.subtitleDefault") {
        return `Showing ${options.count} diagnoses page ${options.page} of ${options.pages}`;
      }
      if (key === "diagnoses.list.subtitleFilters") {
        return `${options.summary} - ${options.count} matches page ${options.page} of ${options.pages}`;
      }
      if (key === "diagnoses.list.pagination.label") {
        return `Page ${options.page} of ${options.pages}`;
      }
      return labels[key] ?? key;
    },
  }),
}));

vi.mock("../../features/diagnostics/dhooks.js", async () => {
  const actual = await vi.importActual("../../features/diagnostics/dhooks.js");
  return {
    ...actual,
    useDiagnosesByPatient: vi.fn(),
  };
});

vi.mock("../../i18n", () => ({
  default: {
    t: (key, fallback) => fallback ?? key,
  },
}));

vi.mock("../../components/diagnostic/DiagnosisCard.jsx", () => ({
  default: ({ diagnosis, patientId }) => (
    <article data-testid="diagnosis-card">
      <h2>{diagnosis.title ?? diagnosis.Diagnostic ?? diagnosis.diagnosis}</h2>
      <p>Patient: {patientId}</p>
      <p>Diagnosis id: {diagnosis._id}</p>
    </article>
  ),
}));

vi.mock("../../components/diagnostic/EmptyDiagnoses.jsx", () => ({
  default: ({ patientId }) => (
    <section data-testid="empty-diagnoses">Empty diagnoses for {patientId}</section>
  ),
}));

vi.mock("../../components/forms/LocalizedDatePicker.jsx", () => ({
  default: ({ value, onChange }) => (
    <input
      aria-label="Date filter"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const diagnosisOne = {
  _id: "diagnosis-1",
  title: "Flu diagnosis",
  description: "Fever and cough",
  medicine: ["Ibuprofen"],
  treatment: ["Rest"],
  operation: [],
};

const diagnosisTwo = {
  _id: "diagnosis-2",
  title: "Sprained ankle",
  description: "Sports injury",
  medicine: [],
  treatment: ["Compression"],
  operation: [],
};

const listData = (items = [diagnosisOne, diagnosisTwo], overrides = {}) => ({
  items,
  total: items.length,
  page: 1,
  pages: 1,
  ...overrides,
});

const renderListPage = (data = listData(), queryState = {}) => {
  useDiagnosesByPatient.mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    ...queryState,
  });

  return render(
    <MemoryRouter>
      <DiagnosesByPatientPage />
    </MemoryRouter>,
  );
};

const lastHookCall = () =>
  useDiagnosesByPatient.mock.calls[useDiagnosesByPatient.mock.calls.length - 1];

const expectLastParams = (expected) => {
  expect(lastHookCall()).toEqual([
    "patient-1",
    expect.objectContaining(expected),
  ]);
};

describe("DiagnosesByPatientPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders a loading state while diagnoses are loading without cached data", () => {
    renderListPage(undefined, {
      data: undefined,
      isLoading: true,
    });

    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Diagnoses" })).toBeInTheDocument();
    expectLastParams({
      q: undefined,
      date: undefined,
      hasMedicines: undefined,
      hasTreatments: undefined,
      hasOperations: undefined,
      page: 1,
    });
  });

  test("renders list header, route links, and diagnosis cards for the patient", () => {
    renderListPage();

    expect(screen.getByRole("heading", { name: "Diagnoses" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to patient/i })).toHaveAttribute(
      "href",
      "/patients/patient-1",
    );
    expect(screen.getByRole("link", { name: "Create diagnosis" })).toHaveAttribute(
      "href",
      "/diagnosis/patient/patient-1/new",
    );
    expect(screen.getByText("Flu diagnosis")).toBeInTheDocument();
    expect(screen.getByText("Sprained ankle")).toBeInTheDocument();
    expect(screen.getAllByText("Patient: patient-1")).toHaveLength(2);
    expectLastParams({
      q: undefined,
      date: undefined,
      hasMedicines: undefined,
      hasTreatments: undefined,
      hasOperations: undefined,
      page: 1,
    });
  });

  test("renders empty diagnoses when there are no diagnoses and no filters", () => {
    renderListPage(listData([]));

    expect(screen.getByTestId("empty-diagnoses")).toHaveTextContent(
      "Empty diagnoses for patient-1",
    );
  });

  test("trims search params and locally filters displayed cards by title prefix", () => {
    renderListPage();

    fireEvent.change(screen.getByPlaceholderText("Search diagnoses"), {
      target: { value: "  flu  " },
    });

    expectLastParams({ q: "flu", page: 1 });
    expect(screen.getByText("Flu diagnosis")).toBeInTheDocument();
    expect(screen.queryByText("Sprained ankle")).not.toBeInTheDocument();
  });

  test("shows no-match state for a search with no local match", async () => {
    renderListPage();

    fireEvent.change(screen.getByPlaceholderText("Search diagnoses"), {
      target: { value: "cardiology" },
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "No matching diagnoses" })).toBeInTheDocument();
    });
    expect(screen.getByText("Try adjusting your filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  test("opens advanced filters and applies the medicines yes filter", () => {
    renderListPage();

    fireEvent.click(screen.getByRole("button", { name: /More/i }));
    const medicinesFilter = screen.getByText("Medicines").closest("div");
    fireEvent.click(within(medicinesFilter).getByRole("button", { name: "Yes" }));

    expectLastParams({ hasMedicines: true, page: 1 });
    expect(screen.getByRole("button", { name: /More1/i })).toBeInTheDocument();
    expect(screen.getByText("Flu diagnosis")).toBeInTheDocument();
    expect(screen.queryByText("Sprained ankle")).not.toBeInTheDocument();
  });

  test("forwards date filter changes into diagnosis params", () => {
    renderListPage();

    fireEvent.click(screen.getByRole("button", { name: /More/i }));
    fireEvent.change(screen.getByLabelText("Date filter"), {
      target: { value: "2026-06-22" },
    });

    expectLastParams({ date: "2026-06-22", page: 1 });
  });

  test("updates page params when pagination controls are clicked", () => {
    useDiagnosesByPatient.mockImplementation((_patientId, params) => ({
      data: listData([diagnosisOne], {
        page: params.page,
        pages: 3,
        total: 3,
      }),
      isLoading: false,
      isFetching: false,
    }));

    render(
      <MemoryRouter>
        <DiagnosesByPatientPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expectLastParams({ page: 2 });

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    expectLastParams({ page: 1 });
  });

  test("clear filters resets query, date, and advanced filters to default params", () => {
    renderListPage();

    fireEvent.change(screen.getByPlaceholderText("Search diagnoses"), {
      target: { value: "flu" },
    });
    fireEvent.click(screen.getByRole("button", { name: /More/i }));
    const medicinesFilter = screen.getByText("Medicines").closest("div");
    fireEvent.click(within(medicinesFilter).getByRole("button", { name: "Yes" }));
    fireEvent.change(screen.getByLabelText("Date filter"), {
      target: { value: "2026-06-22" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByPlaceholderText("Search diagnoses")).toHaveValue("");
    expectLastParams({
      q: undefined,
      date: undefined,
      hasMedicines: undefined,
      hasTreatments: undefined,
      hasOperations: undefined,
      page: 1,
    });
  });
});
