import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MyChildrenHome from "./MyChildrenHome.jsx";
import { useMyChildrenHealthInfo } from "../../features/patients/phooks.js";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key, options = {}) =>
      ({
        "common.loading": "Loading",
        "myChildren.ageYears": `${options.age} years`,
        "myChildren.empty": "No children found",
        "myChildren.healthInfo": "Health info",
        "myChildren.healthState": "Health state",
        "myChildren.pending": "Pending approval",
        "myChildren.subtitle": "Review your children's medical records.",
        "myChildren.title": "My children",
        "myChildren.unknownChild": "Unknown child",
        "myChildren.upToDate": "Up to date",
      }[key] ?? key),
  }),
}));

vi.mock("../../features/patients/phooks.js", () => ({
  useMyChildrenHealthInfo: vi.fn(),
}));

vi.mock("../../i18n", () => ({
  default: {
    t: (key, fallback) => fallback ?? key,
  },
}));

const childRecord = (overrides = {}) => ({
  childKey: "child-key",
  pendingDecision: false,
  snapshot: {
    fullname: "Minor Patient",
    fullnameWrapper: {
      value: "Minor Patient",
      conflict: false,
      alternatives: ["Minor Patient"],
    },
    age: { value: 10 },
    sources: [{ id: "child-profile-id" }],
  },
  ...overrides,
});

const renderChildrenHome = (hookState = {}) => {
  useMyChildrenHealthInfo.mockReturnValue({
    data: [childRecord()],
    isLoading: false,
    ...hookState,
  });

  return render(
    <MemoryRouter>
      <MyChildrenHome />
    </MemoryRouter>,
  );
};

describe("MyChildrenHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders loading state and requests child health info in the active language", () => {
    renderChildrenHome({
      data: undefined,
      isLoading: true,
    });

    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(useMyChildrenHealthInfo).toHaveBeenCalledWith("en");
  });

  test("renders empty state when there are no children", () => {
    renderChildrenHome({ data: [] });

    expect(screen.getByRole("heading", { name: "My children" })).toBeInTheDocument();
    expect(screen.getByText("No children found")).toBeInTheDocument();
  });

  test("renders empty state when hook data is missing or not an array", () => {
    const { rerender } = renderChildrenHome({ data: undefined });

    expect(screen.getByText("No children found")).toBeInTheDocument();

    useMyChildrenHealthInfo.mockReturnValue({
      data: { unexpected: true },
      isLoading: false,
    });

    rerender(
      <MemoryRouter>
        <MyChildrenHome />
      </MemoryRouter>,
    );

    expect(screen.getByText("No children found")).toBeInTheDocument();
  });

  test("renders normal child card details and up-to-date state", () => {
    renderChildrenHome();

    expect(screen.getByRole("heading", { name: "My children" })).toBeInTheDocument();
    expect(screen.getByText("Review your children's medical records.")).toBeInTheDocument();
    expect(screen.getByText("Minor Patient")).toBeInTheDocument();
    expect(screen.getByText("10 years")).toBeInTheDocument();
    expect(screen.getByText("Up to date")).toBeInTheDocument();
  });

  test("prefers fullnameWrapper.value when it exists", () => {
    renderChildrenHome({
      data: [
        childRecord({
          snapshot: {
            fullname: "Raw snapshot name",
            fullnameWrapper: {
              value: "Wrapped child name",
              conflict: false,
              alternatives: ["Wrapped child name"],
            },
            age: { value: 10 },
            sources: [{ id: "child-profile-id" }],
          },
        }),
      ],
    });

    expect(screen.getByRole("heading", { name: "Wrapped child name" })).toBeInTheDocument();
    expect(screen.queryByText("Raw snapshot name")).not.toBeInTheDocument();
  });

  test("falls back to snapshot fullname string when fullnameWrapper.value is unavailable", () => {
    renderChildrenHome({
      data: [
        childRecord({
          snapshot: {
            fullname: "Fallback Minor",
            fullnameWrapper: { conflict: false, alternatives: [] },
            age: { value: 10 },
            sources: [{ id: "child-profile-id" }],
          },
        }),
      ],
    });

    expect(screen.getByRole("heading", { name: "Fallback Minor" })).toBeInTheDocument();
  });

  test("renders pending state for children awaiting decision", () => {
    renderChildrenHome({
      data: [childRecord({ pendingDecision: true })],
    });

    expect(screen.getByText("Pending approval")).toBeInTheDocument();
    expect(screen.queryByText("Up to date")).not.toBeInTheDocument();
  });

  test("falls back to unknown child only when fullnameWrapper and fullname are missing", () => {
    renderChildrenHome({
      data: [
        childRecord({
          snapshot: {
            age: { value: 9 },
            sources: [{ id: "child-profile-id" }],
          },
        }),
      ],
    });

    expect(screen.getByText("Unknown child")).toBeInTheDocument();
  });

  test("keeps two children with different names clearly differentiated", () => {
    renderChildrenHome({
      data: [
        childRecord({
          childKey: "first-child",
          snapshot: {
            fullname: "First Minor",
            fullnameWrapper: {
              value: "First Minor",
              conflict: false,
              alternatives: ["First Minor"],
            },
            age: { value: 10 },
            sources: [{ id: "first-child-id" }],
          },
        }),
        childRecord({
          childKey: "second-child",
          snapshot: {
            fullname: "Second Minor",
            fullnameWrapper: {
              value: "Second Minor",
              conflict: false,
              alternatives: ["Second Minor"],
            },
            age: { value: 8 },
            sources: [{ id: "second-child-id" }],
          },
        }),
      ],
    });

    expect(screen.getByRole("heading", { name: "First Minor" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Second Minor" })).toBeInTheDocument();
    expect(screen.queryByText("Unknown child")).not.toBeInTheDocument();
  });

  test("renders active child health links from the first source id", () => {
    renderChildrenHome();

    expect(screen.getByRole("link", { name: "Health info" })).toHaveAttribute(
      "href",
      "/docrecords/mychildren/child-profile-id/health-info",
    );
    expect(screen.getByRole("link", { name: "Health state" })).toHaveAttribute(
      "href",
      "/docrecords/mychildren/child-profile-id/health-state",
    );
  });

  test("renders disabled non-navigating child actions when no source id exists", () => {
    renderChildrenHome({
      data: [
        childRecord({
          snapshot: {
            fullname: "Unlinked Minor",
            fullnameWrapper: {
              value: "Unlinked Minor",
              conflict: false,
              alternatives: ["Unlinked Minor"],
            },
            age: { value: 8 },
            sources: [],
          },
        }),
      ],
    });

    const card = screen.getByText("Unlinked Minor").closest("article");
    const healthInfoAction = within(card).getByRole("button", { name: "Health info" });
    const healthStateAction = within(card).getByRole("button", { name: "Health state" });

    expect(within(card).queryByRole("link", { name: "Health info" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("link", { name: "Health state" })).not.toBeInTheDocument();
    expect(healthInfoAction).toBeDisabled();
    expect(healthInfoAction).toHaveAttribute("aria-disabled", "true");
    expect(healthStateAction).toBeDisabled();
    expect(healthStateAction).toHaveAttribute("aria-disabled", "true");
  });
});
