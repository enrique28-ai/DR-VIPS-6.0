import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";

const i18nState = vi.hoisted(() => ({
  language: "en",
  changeLanguage: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => (key === "common.selectLanguage" ? "Select language" : key),
    i18n: i18nState,
  }),
}));

const renderLanguageSwitcher = () => render(<LanguageSwitcher />);

const getSelect = () =>
  screen.getByRole("combobox", { name: "Select language" });

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    i18nState.language = "en";
    i18nState.changeLanguage.mockReset();
  });

  test("renders the select with accessible label", () => {
    renderLanguageSwitcher();
    expect(getSelect()).toBeInTheDocument();
  });

  test("renders EN and ES options", () => {
    renderLanguageSwitcher();
    expect(screen.getByRole("option", { name: "EN" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ES" })).toBeInTheDocument();
  });

  test("select value follows i18n.language when language is en", () => {
    i18nState.language = "en";
    renderLanguageSwitcher();
    expect(getSelect()).toHaveValue("en");
  });

  test("select value follows i18n.language when language is es", () => {
    i18nState.language = "es";
    renderLanguageSwitcher();
    expect(getSelect()).toHaveValue("es");
  });

  test("changing to es calls i18n.changeLanguage with es", () => {
    renderLanguageSwitcher();
    fireEvent.change(getSelect(), { target: { value: "es" } });
    expect(i18nState.changeLanguage).toHaveBeenCalledWith("es");
  });

  test("changing to es writes lang=es in localStorage", () => {
    renderLanguageSwitcher();
    fireEvent.change(getSelect(), { target: { value: "es" } });
    expect(localStorage.getItem("lang")).toBe("es");
  });

  test("changing to en calls changeLanguage with en and stores en", () => {
    i18nState.language = "es";
    renderLanguageSwitcher();
    fireEvent.change(getSelect(), { target: { value: "en" } });
    expect(i18nState.changeLanguage).toHaveBeenCalledWith("en");
    expect(localStorage.getItem("lang")).toBe("en");
  });
});
