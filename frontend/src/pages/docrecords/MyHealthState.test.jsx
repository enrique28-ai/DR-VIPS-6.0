import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MyHealthState from "./MyHealthState.jsx";
import { useMyDiagnoses } from "../../features/diagnostics/dhooks.js";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key, options = {}) => {
      const labels = {
        "diagnoses.empty.title": "No health state records",
        "common.loading": "Loading...",
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
        "diagnoses.list.noMatch.title": "No matching health records",
        "diagnoses.list.pagination.next": "Next",
        "diagnoses.list.pagination.prev": "Previous",
        "myHealthState.list.empty.description": "No health state records yet",
        "myHealthState.list.searchPlaceholder": "Search health state",
        "navbar.myHealthInfo": "My Health Info",
        "navbar.myHealthState": "My Health State",
      };
      if (key === "diagnoses.list.subtitleDefault") {
        return `Showing ${options.count} records page ${options.page} of ${options.pages}`;
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
    useMyDiagnoses: vi.fn(),
  };
});

vi.mock("../../i18n", () => ({
  default: {
    t: (key, fallback) => fallback ?? key,
  },
}));

vi.mock("../../components/healthstate/HealthStateCard.jsx", () => ({
  default: ({ diagnosis }) => (
    <article data-testid="health-state-card">
      <h2>{diagnosis.title ?? diagnosis.Diagnostic ?? diagnosis.diagnosis}</h2>
      <p>Diagnosis id: {diagnosis._id}</p>
    </article>
  ),
}));

vi.mock("../../components/healthstate/EmptyHealthStateCard.jsx", () => ({
  default: () => <section data-testid="empty-health-state">Empty health state</section>,
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

const fluDiagnosis = {
  _id: "diagnosis-1",
  title: "Flu diagnosis",
  description: "Fever and cough",
  medicine: ["Ibuprofen"],
  treatment: ["Rest"],
  operation: [],
  createdBy: {
    name: "Dr. Smith",
    email: "smith@example.com",
  },
};

const ankleDiagnosis = {
  _id: "diagnosis-2",
  title: "Sprained ankle",
  description: "Sports injury",
  medicine: [],
  treatment: ["Compression"],
  operation: [],
  createdBy: {
    name: "Dr. Rivera",
    email: "rivera@example.com",
  },
};

const listData = (items = [fluDiagnosis, ankleDiagnosis], overrides = {}) => ({
  items,
  total: items.length,
  page: 1,
  pages: 1,
  ...overrides,
});

const renderMyHealthState = (data = listData(), queryState = {}) => {
  useMyDiagnoses.mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    ...queryState,
  });

  return render(
    <MemoryRouter>
      <MyHealthState />
    </MemoryRouter>,
  );
};

const lastHookCall = () =>
  useMyDiagnoses.mock.calls[useMyDiagnoses.mock.calls.length - 1];

const expectLastParams = (expected) => {
  expect(lastHookCall()).toEqual([expect.objectContaining(expected)]);
};

const openAdvancedFilters = () => {
  fireEvent.click(screen.getByRole("button", { name: /More/i }));
};

const filterByText = (label) => screen.getByText(label).closest("div");

describe("MyHealthState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders a visible loading state while health state records are loading without cached data", () => {
    renderMyHealthState(undefined, {
      data: undefined,
      isLoading: true,
    });

    expect(screen.getByRole("heading", { name: "My Health State" })).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expectLastParams({
      q: undefined,
      date: undefined,
      hasMedicines: undefined,
      hasTreatments: undefined,
      hasOperations: undefined,
      page: 1,
    });
  });

  test("renders list header, health info link, and diagnosis cards", () => {
    renderMyHealthState();

    expect(screen.getByRole("heading", { name: "My Health State" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Health Info" })).toHaveAttribute(
      "href",
      "/docrecords/myhealthinfo",
    );
    expect(screen.getByText("Flu diagnosis")).toBeInTheDocument();
    expect(screen.getByText("Sprained ankle")).toBeInTheDocument();
    expect(screen.getByText("Diagnosis id: diagnosis-1")).toBeInTheDocument();
    expectLastParams({
      q: undefined,
      date: undefined,
      hasMedicines: undefined,
      hasTreatments: undefined,
      hasOperations: undefined,
      page: 1,
    });
  });

  test("renders empty health state when there are no diagnoses and no filters", () => {
    renderMyHealthState(listData([]));

    expect(screen.getByTestId("empty-health-state")).toHaveTextContent("Empty health state");
    expect(screen.queryByPlaceholderText("Search health state")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /More/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(screen.queryByText("Date")).not.toBeInTheDocument();
    expect(screen.queryByText("Medicines")).not.toBeInTheDocument();
    expect(screen.queryByText("Treatments")).not.toBeInTheDocument();
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
  });

  test("trims search params and locally filters displayed cards by title", () => {
    renderMyHealthState();

    fireEvent.change(screen.getByPlaceholderText("Search health state"), {
      target: { value: "  flu  " },
    });

    expectLastParams({ q: "flu", page: 1 });
    expect(screen.getByText("Flu diagnosis")).toBeInTheDocument();
    expect(screen.queryByText("Sprained ankle")).not.toBeInTheDocument();
  });

  test("locally matches doctor name and email search queries", () => {
    renderMyHealthState();

    fireEvent.change(screen.getByPlaceholderText("Search health state"), {
      target: { value: "smith" },
    });

    expectLastParams({ q: "smith", page: 1 });
    expect(screen.getByText("Flu diagnosis")).toBeInTheDocument();
    expect(screen.queryByText("Sprained ankle")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search health state"), {
      target: { value: "rivera@example.com" },
    });

    expectLastParams({ q: "rivera@example.com", page: 1 });
    expect(screen.queryByText("Flu diagnosis")).not.toBeInTheDocument();
    expect(screen.getByText("Sprained ankle")).toBeInTheDocument();
  });

  test("shows no-match state for a search with no local match", async () => {
    renderMyHealthState();

    fireEvent.change(screen.getByPlaceholderText("Search health state"), {
      target: { value: "cardiology" },
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "No matching health records" })).toBeInTheDocument();
    });
    expect(screen.getByText("Try adjusting your filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search health state")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /More/i })).toBeInTheDocument();
  });

  test("opens advanced filters from More", () => {
    renderMyHealthState();

    const moreButton = screen.getByRole("button", { name: /More/i });
    expect(moreButton).toHaveAttribute("aria-expanded", "false");
    expect(moreButton).toHaveAttribute("aria-controls", "my-health-state-advanced-filters");

    openAdvancedFilters();
    expect(moreButton).toHaveAttribute("aria-expanded", "true");

    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Medicines")).toBeInTheDocument();
    expect(screen.getByText("Treatments")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Date" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Medicines" })).toBeInTheDocument();
  });

  test("applies the medicines yes filter and shows active filter count", () => {
    renderMyHealthState();

    openAdvancedFilters();
    const medicinesFilter = filterByText("Medicines");
    const yesButton = within(medicinesFilter).getByRole("button", { name: "Yes" });
    expect(yesButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(yesButton);

    expectLastParams({ hasMedicines: true, page: 1 });
    expect(yesButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /More/i })).toHaveTextContent("1");
    expect(screen.getByText("Flu diagnosis")).toBeInTheDocument();
    expect(screen.queryByText("Sprained ankle")).not.toBeInTheDocument();
  });

  test("forwards date filter changes into diagnosis params", () => {
    renderMyHealthState();

    openAdvancedFilters();
    fireEvent.change(screen.getByLabelText("Date filter"), {
      target: { value: "2026-06-22" },
    });

    expectLastParams({ date: "2026-06-22", page: 1 });
  });

  test("updates page params when pagination controls are clicked", () => {
    useMyDiagnoses.mockImplementation((params) => ({
      data: listData([fluDiagnosis], {
        page: params.page,
        pages: 3,
        total: 3,
      }),
      isLoading: false,
      isFetching: false,
    }));

    render(
      <MemoryRouter>
        <MyHealthState />
      </MemoryRouter>,
    );

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expectLastParams({ page: 2 });

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    expectLastParams({ page: 1 });
  });

  test("clear filters resets search, date, and advanced filters to default params", () => {
    renderMyHealthState();

    fireEvent.change(screen.getByPlaceholderText("Search health state"), {
      target: { value: "flu" },
    });
    openAdvancedFilters();
    const medicinesFilter = filterByText("Medicines");
    fireEvent.click(within(medicinesFilter).getByRole("button", { name: "Yes" }));
    fireEvent.change(screen.getByLabelText("Date filter"), {
      target: { value: "2026-06-22" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByPlaceholderText("Search health state")).toHaveValue("");
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
