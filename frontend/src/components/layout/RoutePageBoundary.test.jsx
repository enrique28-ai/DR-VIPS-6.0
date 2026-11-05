import { Component, lazy } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "../../i18n.js";
import RoutePageBoundary, { loadRoutePage } from "./RoutePageBoundary.jsx";

afterEach(() => vi.restoreAllMocks());

describe("RoutePageBoundary", () => {
  test.each([
    ["en", "Loading..."],
    ["es", "Cargando..."],
  ])("announces loading in %s without moving focus", async (language, text) => {
    await i18n.changeLanguage(language);
    let resolvePage;
    const Page = lazy(() => loadRoutePage(new Promise((resolve) => { resolvePage = resolve; })));
    render(<><button>Navigation</button><RoutePageBoundary><Page /></RoutePageBoundary></>);
    screen.getByRole("button").focus();
    expect(screen.getByRole("status")).toHaveTextContent(text);
    expect(screen.getByRole("button")).toHaveFocus();
    await act(async () => resolvePage({ default: () => <h1>Loaded page</h1> }));
    expect(screen.getByRole("heading")).toHaveTextContent("Loaded page");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveFocus();
  });

  test.each([
    ["en", "This page could not be loaded. Reload the page to try again.", "Reload page"],
    ["es", "No se pudo cargar esta página. Recarga la página para intentarlo de nuevo.", "Recargar página"],
  ])("offers only user-initiated recovery in %s without exposing errors", async (language, message, label) => {
    await i18n.changeLanguage(language);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    const Page = lazy(() => loadRoutePage(Promise.reject(new Error("PRIVATE_IMPORT_DETAILS"))));
    render(<RoutePageBoundary onReload={reload}><Page /></RoutePageBoundary>);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText(/PRIVATE_IMPORT_DETAILS/)).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("ordinary page render errors propagate to the surrounding error handler", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Page render failure");
    const caught = vi.fn();
    class OuterBoundary extends Component {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      componentDidCatch(value) { caught(value); }
      render() { return this.state.failed ? <p>Outer error handler</p> : this.props.children; }
    }
    function BrokenPage() { throw error; }
    render(<OuterBoundary><RoutePageBoundary><BrokenPage /></RoutePageBoundary></OuterBoundary>);
    expect(screen.getByText("Outer error handler")).toBeInTheDocument();
    expect(caught).toHaveBeenCalledWith(error);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
