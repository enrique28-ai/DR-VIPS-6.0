import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SearchGlobalPatient from "./SearchGlobalPatient.jsx";
import { useSearchGlobalPatients } from "../../features/patients/phooks.js";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) =>
      ({
        "patients.detail.back": "Back to Patients",
        "patients.searchGlobal.createNew": "Create new patient",
        "patients.searchGlobal.error": "Error searching patients.",
        "patients.searchGlobal.minChars": "Type at least 3 characters to search.",
        "patients.searchGlobal.noResults": "No results",
        "patients.searchGlobal.notFound": "Not found?",
        "patients.searchGlobal.placeholder": "Search global patients",
        "patients.searchGlobal.resultsTitle": "Results",
        "patients.searchGlobal.searching": "Searching...",
        "patients.searchGlobal.subtitle": "Search globally to import an existing patient.",
        "patients.searchGlobal.title": "Add Patient",
      }[key] ?? key),
  }),
}));

vi.mock("../../features/patients/phooks.js", () => ({
  useSearchGlobalPatients: vi.fn(),
}));

vi.mock("../../components/patient/PatientCard.jsx", () => ({
  default: ({ patient, isGlobal }) => (
    <article data-testid="patient-card">
      <h2>{patient.fullname}</h2>
      <p>Patient id: {patient._id}</p>
      <p>Global: {String(isGlobal)}</p>
    </article>
  ),
}));

const anaPatient = {
  _id: "patient-1",
  fullname: "Ana Martinez",
};

const luisPatient = {
  _id: "patient-2",
  fullname: "Luis Garcia",
};

let queryState;

const renderSearchGlobalPatient = () =>
  render(
    <MemoryRouter>
      <SearchGlobalPatient />
    </MemoryRouter>,
  );

const searchInput = () => screen.getByPlaceholderText("Search global patients");

const advanceDebounce = () => {
  act(() => {
    vi.advanceTimersByTime(350);
  });
};

const lastHookCall = () =>
  useSearchGlobalPatients.mock.calls[useSearchGlobalPatients.mock.calls.length - 1];

describe("SearchGlobalPatient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    queryState = {
      data: [],
      isFetching: false,
      isError: false,
    };
    useSearchGlobalPatients.mockImplementation(() => queryState);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test("renders header, links, search input, and initial min-character message", () => {
    renderSearchGlobalPatient();

    expect(screen.getByRole("heading", { name: "Add Patient" })).toBeInTheDocument();
    expect(screen.getByText("Search globally to import an existing patient.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Patients" })).toHaveAttribute(
      "href",
      "/patients",
    );
    expect(screen.getByRole("link", { name: "Create new patient" })).toHaveAttribute(
      "href",
      "/patients/new",
    );
    expect(searchInput()).toBeInTheDocument();
    expect(screen.getByText("Type at least 3 characters to search.")).toBeInTheDocument();
    expect(lastHookCall()).toEqual(["", { enabled: false }]);
  });

  test("keeps search disabled for trimmed terms shorter than three characters after debounce", () => {
    renderSearchGlobalPatient();

    fireEvent.change(searchInput(), { target: { value: "  ab  " } });
    advanceDebounce();

    expect(lastHookCall()).toEqual(["ab", { enabled: false }]);
    expect(screen.getByText("Type at least 3 characters to search.")).toBeInTheDocument();
  });

  test("debounces and trims a three-character term before enabling search", () => {
    renderSearchGlobalPatient();

    fireEvent.change(searchInput(), { target: { value: "  ana  " } });

    expect(lastHookCall()).toEqual(["", { enabled: false }]);

    advanceDebounce();

    expect(lastHookCall()).toEqual(["ana", { enabled: true }]);
  });

  test("shows loading state when enabled search is fetching", () => {
    queryState = {
      data: [],
      isFetching: true,
      isError: false,
    };
    renderSearchGlobalPatient();

    fireEvent.change(searchInput(), { target: { value: "ana" } });
    advanceDebounce();

    expect(screen.getByText("Searching...")).toBeInTheDocument();
  });

  test("shows error state when enabled search fails", () => {
    queryState = {
      data: [],
      isFetching: false,
      isError: true,
    };
    renderSearchGlobalPatient();

    fireEvent.change(searchInput(), { target: { value: "ana" } });
    advanceDebounce();

    expect(screen.getByText("Error searching patients.")).toBeInTheDocument();
  });

  test("shows no-results state when enabled search returns an empty array", () => {
    renderSearchGlobalPatient();

    fireEvent.change(searchInput(), { target: { value: "ana" } });
    advanceDebounce();

    expect(screen.getByRole("heading", { name: "No results" })).toBeInTheDocument();
    expect(screen.queryByTestId("patient-card")).not.toBeInTheDocument();
  });

  test("renders global patient cards for search results", () => {
    queryState = {
      data: [anaPatient, luisPatient],
      isFetching: false,
      isError: false,
    };
    renderSearchGlobalPatient();

    fireEvent.change(searchInput(), { target: { value: "ana" } });
    advanceDebounce();

    expect(screen.getByRole("heading", { name: "Results" })).toBeInTheDocument();
    const cards = screen.getAllByTestId("patient-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("Ana Martinez")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Patient id: patient-1")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Global: true")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Luis Garcia")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Patient id: patient-2")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Global: true")).toBeInTheDocument();
  });
});
