import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "../../locals/en/common.json";
import es from "../../locals/es/common.json";
import SearchGlobalPatient from "./SearchGlobalPatient.jsx";
import { useRequestPatientAccess } from "../../features/patients/phooks.js";

const language = vi.hoisted(() => ({ current: "en" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key.split(".").reduce((value, part) => value?.[part], language.current === "es" ? es : en) ?? key,
  }),
}));
vi.mock("../../features/patients/phooks.js", () => ({ useRequestPatientAccess: vi.fn() }));
vi.mock("framer-motion", () => ({
  motion: { button: ({ children, ...props }) => {
    const domProps = { ...props };
    delete domProps.whileHover;
    delete domProps.whileTap;
    return <button {...domProps}>{children}</button>;
  } },
}));

let requestState;
const renderPage = () => render(<MemoryRouter><SearchGlobalPatient /></MemoryRouter>);
const fillAdult = () => {
  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Synthetic Patient" } });
  fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "patient@example.com" } });
};
const submit = () => fireEvent.submit(screen.getByRole("button", { name: "Request Access" }).closest("form"));

describe("patient identification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    language.current = "en";
    requestState = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isSuccess: false, isError: false };
    useRequestPatientAccess.mockImplementation(() => requestState);
  });

  test("renders a required identification form without result cards, previews or record identifiers", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Find Existing Patient" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full Name")).toBeRequired();
    expect(screen.getByLabelText("Email Address")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Email Address")).toBeRequired();
    expect(screen.getByRole("radio", { name: "Adult patient" })).toBeChecked();
    expect(screen.getByRole("link", { name: "Create new patient" })).toHaveAttribute("href", "/patients/new");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(/Record reference/i)).not.toBeInTheDocument();
  });

  test("typing performs no lookup and only explicit submission sends the supplied identity", () => {
    renderPage();
    fillAdult();
    expect(requestState.mutate).not.toHaveBeenCalled();
    submit();
    expect(requestState.mutate).toHaveBeenCalledExactlyOnceWith({
      mode: "adult", fullname: "Synthetic Patient", email: "patient@example.com",
    });
  });

  test("minor mode explicitly uses the current guardian email", () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Minor patient" }));
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Synthetic Minor" } });
    fireEvent.change(screen.getByLabelText("Current Parent or Guardian Email Address"), { target: { value: "guardian@example.com" } });
    submit();
    expect(requestState.mutate).toHaveBeenCalledExactlyOnceWith({
      mode: "minor", fullname: "Synthetic Minor", email: "guardian@example.com",
    });
  });

  test("missing or malformed fields show validation and focus the invalid field without submitting", () => {
    renderPage();
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent(en.patients.identification.validationError);
    expect(screen.getByLabelText("Full Name")).toHaveFocus();
    fillAdult();
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "invalid" } });
    submit();
    expect(requestState.mutate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email Address")).toHaveFocus();
  });

  test("submission disables controls and exposes a busy state", () => {
    requestState.isPending = true;
    renderPage();
    expect(screen.getByRole("button", { name: "Sending Request..." })).toBeDisabled();
    expect(screen.getByLabelText("Full Name")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Minor patient" })).toBeDisabled();
  });

  test("success shows only neutral localized confirmation even if an old response contains patient data", () => {
    requestState.isSuccess = true;
    requestState.data = { accessRequest: { patient: { _id: "private-id", fullname: "Private Name", email: "private@example.com" } } };
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent(en.patients.identification.confirmation);
    for (const value of ["private-id", "Private Name", "private@example.com"]) {
      expect(screen.queryByText(value)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/patient found/i)).not.toBeInTheDocument();
  });

  test("server failures are localized and never display the raw error", () => {
    requestState.isError = true;
    requestState.error = { response: { status: 500, data: { error: "private@example.com" } } };
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(en.patients.identification.error);
    expect(screen.queryByText("private@example.com")).not.toBeInTheDocument();
  });

  test.each(["en", "es"])("keeps adult and guardian labels, actions and neutral confirmation localized in %s", (lang) => {
    language.current = lang;
    const catalog = lang === "es" ? es : en;
    requestState.isSuccess = true;
    renderPage();
    expect(screen.getByRole("heading", { name: catalog.patients.identification.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: catalog.patients.identification.submit })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(catalog.patients.identification.confirmation);
    fireEvent.click(screen.getByRole("radio", { name: catalog.patients.identification.minor }));
    expect(screen.getByLabelText(catalog.patients.identification.guardianEmail)).toBeInTheDocument();
    expect(requestState.reset).toHaveBeenCalled();
  });
});
