import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { createInstance } from "i18next";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import api from "../../lib/axios.js";
import en from "../../locals/en/common.json";
import es from "../../locals/es/common.json";
import MyChildHealthState from "./MyChildHealthState.jsx";

const family = vi.hoisted(() => [
  { snapshot: { fullname: "Alpha", fullnameWrapper: { value: "Alpha" }, sources: [{ id: "child-a" }] } },
  { snapshot: { fullname: "Beta", fullnameWrapper: { value: "Beta" }, sources: [{ id: "child-b" }] } },
]);
vi.mock("../../features/patients/phooks.js", () => ({ useMyChildrenHealthInfo: () => ({ data: family }) }));
vi.mock("../../lib/axios.js", () => ({ default: { get: vi.fn() } }));
vi.mock("react-hot-toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("../../components/forms/LocalizedDatePicker.jsx", () => ({ default: () => <span>Date control</span> }));

const clients = [];
const diagnosisList = (title) => ({
  items: [{ _id: title, title, medicine: ["Synthetic medicine"], createdBy: { name: "Synthetic Doctor" } }],
  page: 1, pages: 1,
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
function NextChild() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/children/child-b")}>Next child</button>;
}
async function renderPage(language = "en") {
  const instance = createInstance();
  await instance.use(initReactI18next).init({
    lng: language, fallbackLng: "en", resources: { en: { translation: en }, es: { translation: es } },
    interpolation: { escapeValue: false },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: Infinity } } });
  clients.push(client);
  render(
    <I18nextProvider i18n={instance}><QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/children/child-a"]}>
        <NextChild /><Routes><Route path="/children/:childId" element={<MyChildHealthState />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider></I18nextProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); });

describe("child search with the real React Query hook", () => {
  test("typing after a failed search retains focus and still accepts a later successful result", async () => {
    const requests = [];
    api.get.mockImplementation((_url, options) => {
      const gate = deferred();
      requests.push({ ...options, gate });
      if (!options.params.q) gate.resolve({ data: diagnosisList("Flu initial") });
      return gate.promise;
    });
    await renderPage();
    const input = await screen.findByRole("textbox");
    input.focus();
    fireEvent.change(input, { target: { value: "F" } });
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => requests[1].gate.reject(new Error("synthetic search failure")));
    await waitFor(() => expect(screen.queryByText("Flu initial")).not.toBeInTheDocument());
    fireEvent.change(input, { target: { value: "Flu" } });
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input).toHaveFocus();
    await act(async () => requests[2].gate.resolve({ data: diagnosisList("Flu recovered") }));
    await screen.findByText("Flu recovered");
  });

  test("rapid typing retains the input and focus, cancels obsolete work and ignores late responses", async () => {
    const requests = [];
    api.get.mockImplementation((url, options) => {
      const gate = deferred();
      requests.push({ url, ...options, gate });
      if (!options.params.q && !options.params.hasMedicines) gate.resolve({ data: diagnosisList("Flu initial") });
      return gate.promise;
    });
    await renderPage();
    const input = await screen.findByRole("textbox", { name: en.myHealthState.list.searchPlaceholder });
    input.focus();
    for (const value of ["F", "Fl", "Flu"]) {
      fireEvent.change(input, { target: { value } });
      await waitFor(() => expect(requests.some((request) => request.params.q === value)).toBe(true));
      expect(screen.getByRole("textbox", { name: en.myHealthState.list.searchPlaceholder })).toBe(input);
      expect(input).toHaveFocus();
      expect(input).toHaveValue(value);
    }
    expect(requests.map((request) => request.params.q)).toEqual([undefined, "F", "Fl", "Flu"]);
    expect(requests[1].signal.aborted).toBe(true);
    expect(requests[2].signal.aborted).toBe(true);
    await act(async () => requests[3].gate.resolve({ data: diagnosisList("Flu newest") }));
    await screen.findByText("Flu newest");
    await act(async () => {
      requests[1].gate.resolve({ data: diagnosisList("Flu stale") });
      requests[2].gate.resolve({ data: diagnosisList("Flu stale middle") });
    });
    expect(screen.queryByText("Flu stale")).not.toBeInTheDocument();
    expect(screen.getByText("Flu newest")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(requests).toHaveLength(4);
    fireEvent.click(within(screen.getByRole("group", { name: "Medicines" })).getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(requests).toHaveLength(5));
    expect(requests[4].params).toMatchObject({ q: undefined, page: 1, hasMedicines: true });
    expect(screen.getByRole("textbox", { name: en.myHealthState.list.searchPlaceholder })).toBe(input);
    await act(async () => requests[4].gate.resolve({ data: diagnosisList("Filtered result") }));
    await screen.findByText("Filtered result");
  });

  test.each([["en", "Beta's Health State"], ["es", "Estado de salud de Beta"]])(
    "switching child in %s never displays the previous child's pending or cached records", async (language, title) => {
      const requests = [];
      api.get.mockImplementation((url, options) => {
        const gate = deferred();
        requests.push({ url, ...options, gate });
        if (url.includes("child-a") && !options.params.q) gate.resolve({ data: diagnosisList("Flu Alpha record") });
        return gate.promise;
      });
      await renderPage(language);
      await screen.findByText("Flu Alpha record");
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "Flu" } });
      await waitFor(() => expect(requests).toHaveLength(2));
      fireEvent.click(screen.getByRole("button", { name: "Next child" }));
      await waitFor(() => expect(requests.some((request) => request.url.includes("child-b"))).toBe(true));
      expect(screen.queryByText("Flu Alpha record")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      await act(async () => requests[1].gate.resolve({ data: diagnosisList("Flu stale Alpha") }));
      expect(screen.queryByText("Flu stale Alpha")).not.toBeInTheDocument();
      const current = requests.find((request) => request.url.includes("child-b"));
      await act(async () => current.gate.resolve({ data: diagnosisList("Flu Beta record") }));
      await screen.findByText("Flu Beta record");
      expect(screen.queryByText("Flu Alpha record")).not.toBeInTheDocument();
    },
  );
});
