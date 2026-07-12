import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Sidebar from "./Sidebar.jsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) =>
      ({
        "navbar.home": "Home",
        "navbar.patients": "Patients",
        "navbar.myHealthState": "My health state",
        "navbar.myHealthInfo": "My health info",
        "navbar.myChildren": "My children",
        "navbar.profile": "Profile",
        "navbar.mainNavigation": "Main navigation",
        "calendar.menu": "Calendar",
      })[key] ?? key,
  }),
}));

const renderSidebar = (role, initialPath = "/") =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="*" element={<Sidebar role={role} />} />
      </Routes>
    </MemoryRouter>,
  );

const getLink = (name) => screen.getByRole("link", { name });

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("doctor navigation shows Home, Patients, Calendar, Profile and omits patient-only links", () => {
    renderSidebar("doctor");

    expect(getLink("Home")).toBeInTheDocument();
    expect(getLink("Patients")).toBeInTheDocument();
    expect(getLink("Calendar")).toBeInTheDocument();
    expect(getLink("Profile")).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: "My health state" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My health info" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My children" })).not.toBeInTheDocument();
  });

  test("patient navigation shows Home, My Health State, My Health Info, My Children, Calendar, Profile and omits Patients", () => {
    renderSidebar("patient");

    expect(getLink("Home")).toBeInTheDocument();
    expect(getLink("My health state")).toBeInTheDocument();
    expect(getLink("My health info")).toBeInTheDocument();
    expect(getLink("My children")).toBeInTheDocument();
    expect(getLink("Calendar")).toBeInTheDocument();
    expect(getLink("Profile")).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: "Patients" })).not.toBeInTheDocument();
  });

  test('Home is active only when pathname is exactly "/"', () => {
    renderSidebar("doctor", "/");

    const home = getLink("Home");
    expect(home).toHaveAttribute("aria-current", "page");
  });

  test('"/patients" does not mark Home active', () => {
    renderSidebar("doctor", "/patients");

    const home = getLink("Home");
    expect(home).not.toHaveAttribute("aria-current", "page");

    const patients = getLink("Patients");
    expect(patients).toHaveAttribute("aria-current", "page");
  });

  test('"/patients/123/edit" marks Patients active', () => {
    renderSidebar("doctor", "/patients/123/edit");

    const patients = getLink("Patients");
    expect(patients).toHaveAttribute("aria-current", "page");
  });

  test('"/diagnosis/patient/123/456" marks Patients active', () => {
    renderSidebar("doctor", "/diagnosis/patient/123/456");

    const patients = getLink("Patients");
    expect(patients).toHaveAttribute("aria-current", "page");
  });

  test('"/docrecords/myhealthstate/diagnosis-id" marks My Health State active for patient', () => {
    renderSidebar("patient", "/docrecords/myhealthstate/diagnosis-id");

    const healthState = getLink("My health state");
    expect(healthState).toHaveAttribute("aria-current", "page");
  });

  test('nested My Children route marks My Children active for patient', () => {
    renderSidebar(
      "patient",
      "/docrecords/mychildren/child-id/health-state/diagnosis-id",
    );

    const myChildren = getLink("My children");
    expect(myChildren).toHaveAttribute("aria-current", "page");
  });

  test("unsupported role renders no sidebar navigation", () => {
    renderSidebar("admin");

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  test("nav has accessible aria-label", () => {
    renderSidebar("doctor");

    const nav = screen.getByRole("navigation");
    expect(nav).toHaveAccessibleName("Main navigation");
  });
});
