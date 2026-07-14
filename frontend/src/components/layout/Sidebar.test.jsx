import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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
        "navbar.logout": "Logout",
        "calendar.menu": "Calendar",
      })[key] ?? key,
  }),
}));

const defaultUser = {
  name: "Doctor Person",
  email: "doctor@example.com",
  avatar: "https://example.com/doctor.png",
};

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

const renderSidebar = (
  role,
  initialPath = "/",
  {
    open = true,
    user = defaultUser,
    logout = vi.fn().mockResolvedValue(undefined),
  } = {},
) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <Sidebar open={open} role={role} user={user} logout={logout} />
              <LocationProbe />
            </>
          }
        />
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

  test("open=false renders no desktop Sidebar", () => {
    const { container } = renderSidebar("doctor", "/", { open: false });

    expect(container.querySelector("aside")).toBeNull();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
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

  test("renders the verified account footer at the bottom with identity and Logout", () => {
    const { container } = renderSidebar("doctor");
    const aside = container.querySelector("aside");
    const nav = within(aside).getByRole("navigation");

    expect(aside).toHaveClass("flex-col", "lg:flex");
    expect(aside).toHaveAttribute("id", "desktop-navigation-sidebar");
    expect(aside).toHaveClass("sticky", "top-16", "h-[calc(100vh-4rem)]");
    expect(nav).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    expect(
      within(aside).getByRole("img", { name: "Doctor Person avatar" }),
    ).toHaveAttribute("src", defaultUser.avatar);
    expect(within(aside).getByText("Doctor Person")).toBeInTheDocument();
    expect(within(aside).getByText("doctor@example.com")).toBeInTheDocument();
    expect(within(aside).getByRole("button", { name: "Logout" })).toBeInTheDocument();
    expect(within(nav).getAllByRole("link", { name: "Profile" })).toHaveLength(1);
    expect(aside.lastElementChild).toContainElement(
      within(aside).getByRole("button", { name: "Logout" }),
    );
  });

  test("selecting a route keeps the controlled Sidebar rendered", () => {
    const { container } = renderSidebar("patient");

    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/calendar");
    expect(container.querySelector("#desktop-navigation-sidebar")).not.toBeNull();
  });

  test("Logout from the desktop Sidebar awaits logout and navigates to login", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    renderSidebar("patient", "/profile", { logout });

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/login"),
    );
  });
});
