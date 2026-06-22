import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import PatientsPage from "./PatientsPage.jsx";
import { usePatients } from "../../features/patients/phooks.js";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key, options = {}) => {
      const labels = {
        "patients.empty.cta": "Search global patients",
        "patients.empty.title": "No patients yet",
        "patients.list.ageCategories.adult": "Adult",
        "patients.list.ageCategories.child": "Child",
        "patients.list.ageCategories.senior": "Senior",
        "patients.list.ageCategories.teenager": "Teenager",
        "patients.list.filters.ageCategory": "Age category",
        "patients.list.filters.allergies": "Allergies",
        "patients.list.filters.bloodDonor": "Blood donor",
        "patients.list.filters.bloodType": "Blood type",
        "patients.list.filters.clear": "Clear",
        "patients.list.filters.country": "Country",
        "patients.list.filters.diseases": "Diseases",
        "patients.list.filters.gender": "Gender",
        "patients.list.filters.medications": "Medications",
        "patients.list.filters.more": "More",
        "patients.list.filters.options.alive": "Alive",
        "patients.list.filters.options.all": "All",
        "patients.list.filters.options.deceased": "Deceased",
        "patients.list.filters.options.female": "Female",
        "patients.list.filters.options.healthy": "Healthy",
        "patients.list.filters.options.male": "Male",
        "patients.list.filters.options.no": "No",
        "patients.list.filters.options.overweight": "Overweight",
        "patients.list.filters.options.underweight": "Underweight",
        "patients.list.filters.options.yes": "Yes",
        "patients.list.filters.organDonor": "Organ donor",
        "patients.list.filters.status": "Status",
        "patients.list.filters.weight": "Weight",
        "patients.list.noMatch.clear": "Clear filters",
        "patients.list.noMatch.description": "Try adjusting your filters",
        "patients.list.noMatch.title": "No matching patients",
        "patients.list.pagination.next": "Next",
        "patients.list.pagination.prev": "Previous",
        "patients.list.searchPlaceholder": "Search patients",
        "patients.title": "Patients",
      };
      if (key === "patients.list.subtitleDefault") {
        return `Showing ${options.count} patients page ${options.page} of ${options.pages}`;
      }
      if (key === "patients.list.subtitleFilters") {
        return `${options.summary} - ${options.count} matches page ${options.page} of ${options.pages}`;
      }
      if (key === "patients.list.pagination.label") {
        return `Page ${options.page} of ${options.pages}`;
      }
      return labels[key] ?? key;
    },
  }),
}));

vi.mock("../../features/patients/phooks.js", async () => {
  const actual = await vi.importActual("../../features/patients/phooks.js");
  return {
    ...actual,
    usePatients: vi.fn(),
  };
});

vi.mock("../../i18n", () => ({
  default: {
    t: (key, fallback) => fallback ?? key,
  },
}));

vi.mock("react-hot-toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../utilsfront/geoLabels.js", () => ({
  getLocalizedCountries: vi.fn(() => [
    { name: "Mexico", label: "Mexico" },
    { name: "United States", label: "United States" },
  ]),
  localizeCountryName: vi.fn((name) => name),
}));

vi.mock("../../components/patient/PatientCard.jsx", () => ({
  default: ({ patient }) => (
    <article data-testid="patient-card">
      <h2>{patient.fullname}</h2>
      <p>Patient id: {patient._id}</p>
    </article>
  ),
}));

vi.mock("../../components/patient/EmptyPatients.jsx", () => ({
  default: () => <section data-testid="empty-patients">Empty patients</section>,
}));

const anaPatient = {
  _id: "patient-1",
  fullname: "Ana Martinez",
  email: "ana@example.com",
  phone: "+1 202-555-0123",
  country: "Mexico",
  isDeceased: false,
  medications: ["Metformin"],
  diseases: ["Diabetes"],
  allergies: [],
};

const luisPatient = {
  _id: "patient-2",
  fullname: "Luis Garcia",
  email: "luis@example.com",
  phone: "+52 55 1234 5678",
  country: "United States",
  isDeceased: true,
  medications: [],
  diseases: [],
  allergies: ["Pollen"],
};

const listData = (items = [anaPatient, luisPatient], overrides = {}) => ({
  items,
  total: items.length,
  page: 1,
  pages: 1,
  ...overrides,
});

const renderPatientsPage = (data = listData(), queryState = {}) => {
  usePatients.mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    ...queryState,
  });

  return render(
    <MemoryRouter>
      <PatientsPage />
    </MemoryRouter>,
  );
};

const lastHookCall = () => usePatients.mock.calls[usePatients.mock.calls.length - 1];

const expectLastParams = (expected) => {
  expect(lastHookCall()).toEqual([expect.objectContaining(expected)]);
};

const openAdvancedFilters = () => {
  fireEvent.click(screen.getByRole("button", { name: /More/i }));
};

const filterByText = (label) => screen.getByText(label).closest("div");

describe("PatientsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders null while patients are loading without cached data", () => {
    usePatients.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: false,
    });

    const { container } = render(
      <MemoryRouter>
        <PatientsPage />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
    expectLastParams({
      q: undefined,
      category: undefined,
      bloodtype: undefined,
      country: undefined,
      hasMedications: undefined,
      page: 1,
    });
  });

  test("renders list header, search link, and patient cards", () => {
    renderPatientsPage();

    expect(screen.getByRole("heading", { name: "Patients" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search global patients" })).toHaveAttribute(
      "href",
      "/patients/search",
    );
    expect(screen.getByText("Ana Martinez")).toBeInTheDocument();
    expect(screen.getByText("Luis Garcia")).toBeInTheDocument();
    expect(screen.getByText("Patient id: patient-1")).toBeInTheDocument();
    expectLastParams({
      q: undefined,
      category: undefined,
      bloodtype: undefined,
      country: undefined,
      hasMedications: undefined,
      page: 1,
    });
  });

  test("renders empty patients when there are no patients and no filters", () => {
    renderPatientsPage(listData([]));

    expect(screen.getByTestId("empty-patients")).toHaveTextContent("Empty patients");
  });

  test("trims search params and locally filters displayed cards by fullname prefix", () => {
    renderPatientsPage();

    fireEvent.change(screen.getByPlaceholderText("Search patients"), {
      target: { value: "  ana  " },
    });

    expectLastParams({ q: "ana", page: 1 });
    expect(screen.getByText("Ana Martinez")).toBeInTheDocument();
    expect(screen.queryByText("Luis Garcia")).not.toBeInTheDocument();
  });

  test("locally matches email and phone digit search queries", () => {
    renderPatientsPage();

    fireEvent.change(screen.getByPlaceholderText("Search patients"), {
      target: { value: "luis@example.com" },
    });

    expectLastParams({ q: "luis@example.com", page: 1 });
    expect(screen.getByText("Luis Garcia")).toBeInTheDocument();
    expect(screen.queryByText("Ana Martinez")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search patients"), {
      target: { value: "2025550123" },
    });

    expectLastParams({ q: "2025550123", page: 1 });
    expect(screen.getByText("Ana Martinez")).toBeInTheDocument();
    expect(screen.queryByText("Luis Garcia")).not.toBeInTheDocument();
  });

  test("shows no-match state for a search with no local match", async () => {
    renderPatientsPage();

    fireEvent.change(screen.getByPlaceholderText("Search patients"), {
      target: { value: "cardiology" },
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "No matching patients" })).toBeInTheDocument();
    });
    expect(screen.getByText("Try adjusting your filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  test("opens advanced filters and applies the country filter from localized country options", () => {
    renderPatientsPage();

    openAdvancedFilters();
    const countryFilter = filterByText("Country");
    const countrySelect = within(countryFilter).getByRole("combobox");

    expect(within(countryFilter).getByRole("option", { name: "Mexico" })).toBeInTheDocument();
    expect(
      within(countryFilter).getByRole("option", { name: "United States" }),
    ).toBeInTheDocument();

    fireEvent.change(countrySelect, { target: { value: "Mexico" } });

    expectLastParams({ country: "Mexico", page: 1 });
    expect(screen.getByText("Ana Martinez")).toBeInTheDocument();
    expect(screen.queryByText("Luis Garcia")).not.toBeInTheDocument();
  });

  test("applies the medications yes filter and shows active filter count", () => {
    renderPatientsPage();

    openAdvancedFilters();
    const medicationsFilter = filterByText("Medications");
    fireEvent.click(within(medicationsFilter).getByRole("button", { name: "Yes" }));

    expectLastParams({ hasMedications: true, page: 1 });
    expect(screen.getByRole("button", { name: /More1/i })).toBeInTheDocument();
    expect(screen.getByText("Ana Martinez")).toBeInTheDocument();
    expect(screen.queryByText("Luis Garcia")).not.toBeInTheDocument();
  });

  test("updates page params when pagination controls are clicked", async () => {
    usePatients.mockImplementation((params) => ({
      data: listData([anaPatient], {
        page: params.page,
        pages: 3,
        total: 3,
      }),
      isLoading: false,
      isFetching: false,
    }));

    render(
      <MemoryRouter>
        <PatientsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expectLastParams({ page: 2 });
    await waitFor(() => {
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    expectLastParams({ page: 1 });
  });

  test("clear filters resets search, country, medications, and page params", () => {
    renderPatientsPage();

    fireEvent.change(screen.getByPlaceholderText("Search patients"), {
      target: { value: "ana" },
    });
    openAdvancedFilters();
    const countryFilter = filterByText("Country");
    fireEvent.change(within(countryFilter).getByRole("combobox"), {
      target: { value: "Mexico" },
    });
    const medicationsFilter = filterByText("Medications");
    fireEvent.click(within(medicationsFilter).getByRole("button", { name: "Yes" }));

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByPlaceholderText("Search patients")).toHaveValue("");
    expectLastParams({
      q: undefined,
      country: undefined,
      hasMedications: undefined,
      page: 1,
    });
  });
});
