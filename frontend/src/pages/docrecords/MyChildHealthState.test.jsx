import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MyChildHealthState from "./MyChildHealthState.jsx";
import { buildDiagnosisParams, useMyChildDiagnoses } from "../../features/diagnostics/dhooks.js";
import { useMyChildrenHealthInfo } from "../../features/patients/phooks.js";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key) =>
      ({
        "common.loading": "Loading",
        "myChildren.back": "Back to children",
        "myChildren.healthState": "Child health state",
        "myChildren.noDiagnoses": "No child diagnoses",
        "myChildren.unknownChild": "Unknown child",
      }[key] ?? key),
  }),
}));

vi.mock("../../features/diagnostics/dhooks.js", async () => {
  const actual = await vi.importActual("../../features/diagnostics/dhooks.js");
  return {
    ...actual,
    useMyChildDiagnoses: vi.fn(),
  };
});

vi.mock("../../features/patients/phooks.js", () => ({
  useMyChildrenHealthInfo: vi.fn(),
}));

vi.mock("../../i18n", () => ({
  default: {
    t: (key, fallback) => fallback ?? key,
  },
}));

const childHealthInfo = (overrides = {}) => ({
  childKey: "child-key",
  snapshot: {
    fullname: { value: "Minor Patient" },
    sources: [{ id: "child-profile-id" }],
  },
  ...overrides,
});

const diagnosis = (overrides = {}) => ({
  _id: "diagnosis-1",
  title: "Flu diagnosis",
  description: "Fever and cough",
  createdAt: "2026-06-21T12:00:00.000Z",
  ...overrides,
});

const diagnosisList = (items = [diagnosis()], overrides = {}) => ({
  items,
  total: items.length,
  page: 1,
  pages: 1,
  ...overrides,
});

const renderChildHealthState = ({
  childrenData = [childHealthInfo()],
  diagnosesData = diagnosisList(),
  queryState = {},
} = {}) => {
  useMyChildrenHealthInfo.mockReturnValue({
    data: childrenData,
    isLoading: false,
  });

  useMyChildDiagnoses.mockReturnValue({
    data: diagnosesData,
    isLoading: false,
    ...queryState,
  });

  return render(
    <MemoryRouter initialEntries={["/docrecords/mychildren/child-profile-id/health-state"]}>
      <Routes>
        <Route
          path="/docrecords/mychildren/:childId/health-state"
          element={<MyChildHealthState />}
        />
      </Routes>
    </MemoryRouter>,
  );
};

describe("MyChildHealthState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders loading state while child diagnoses are loading", () => {
    renderChildHealthState({
      diagnosesData: undefined,
      queryState: {
        data: undefined,
        isLoading: true,
      },
    });

    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(useMyChildrenHealthInfo).toHaveBeenCalledWith("en");
    expect(useMyChildDiagnoses).toHaveBeenCalledWith(
      "child-profile-id",
      buildDiagnosisParams({}),
    );
  });

  test("resolves child name from child health info source id", () => {
    renderChildHealthState();

    expect(screen.getByRole("heading", { name: "Minor Patient" })).toBeInTheDocument();
    expect(screen.getByText("Child health state")).toBeInTheDocument();
  });

  test("falls back to unknown child when no child source matches the route id", () => {
    renderChildHealthState({
      childrenData: [
        childHealthInfo({
          snapshot: {
            fullname: { value: "Other Minor" },
            sources: [{ id: "other-child-id" }],
          },
        }),
      ],
    });

    expect(screen.getByRole("heading", { name: "Unknown child" })).toBeInTheDocument();
  });

  test("renders empty diagnosis state when the child has no diagnoses", () => {
    renderChildHealthState({
      diagnosesData: diagnosisList([]),
    });

    expect(screen.getByText("No child diagnoses")).toBeInTheDocument();
  });

  test("renders diagnosis cards and links to child diagnosis detail", () => {
    renderChildHealthState();

    expect(screen.getByText("Flu diagnosis")).toBeInTheDocument();
    expect(screen.getByText("Fever and cough")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Flu diagnosis/i })).toHaveAttribute(
      "href",
      "/docrecords/mychildren/child-profile-id/health-state/diagnosis-1",
    );
  });

  test("renders back link to children home", () => {
    renderChildHealthState();

    expect(screen.getByRole("link", { name: "Back to children" })).toHaveAttribute(
      "href",
      "/docrecords/mychildren",
    );
  });
});
