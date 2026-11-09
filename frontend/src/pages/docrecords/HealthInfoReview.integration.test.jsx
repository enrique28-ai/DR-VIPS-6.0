import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { toast } from "react-hot-toast";
import api from "../../lib/axios.js";
import { invalidateIdentity } from "../../lib/authSession.js";
import { useAuthStore } from "../../stores/authStore.js";
import { createQueryWrapper, createTestQueryClient } from "../../test/queryClient.jsx";
import en from "../../locals/en/common.json";
import es from "../../locals/es/common.json";
import MyHealthInfo from "./MyHealthInfo.jsx";
import MyChildHealthInfo from "./MyChildHealthInfo.jsx";

vi.mock("../../lib/axios.js", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../i18n", () => ({ default: { t: (key) => key } }));
vi.mock("react-hot-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const adultUrl = "/patients/me/health-info";
const childUrl = "/patients/me/children/health-info";
const { pendingReview, allUpToDate } = en.myHealthInfo.header;
const actions = en.myHealthInfo.actions;
const heading = (name) => screen.getByRole("heading", { name, level: 1 });
const button = (name) => screen.getByRole("button", { name });
const noRecords = { hasRecords: false, pendingDecision: false, snapshot: null };
const absentTitle = (minor) => minor ? en.myChildren.childNotFound : en.myHealthInfo.empty.title;

function record(name, profileId, pendingDecision = true) {
  return {
    hasRecords: true,
    pendingDecision,
    profileId,
    snapshot: {
      fullnameWrapper: { value: name },
      sources: [{ id: profileId, doctorName: "Synthetic Doctor", updatedAt: "2026-01-01T00:00:00Z" }],
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  invalidateIdentity();
  useAuthStore.setState({
    user: { _id: "synthetic-patient", role: "patient", isVerified: true },
    isAuthenticated: true,
    isCheckingAuth: false,
  });
});

async function renderPortal(minor, { childrenReview, unresolvedAtDeath = false } = {}) {
  const url = minor ? childUrl : adultUrl;
  const profileId = minor ? "child-1" : "adult-1";
  const sibling = record("Sibling record", "child-2", false);
  const siblingTranslation = record("Translated sibling", "child-2", false);
  const pending = record("Pending profile", profileId);
  const translated = record("Translated pending profile", profileId);
  if (!minor) {
    delete pending.profileId;
    delete translated.profileId;
  }
  if (childrenReview) {
    pending.snapshot.childrenReview = childrenReview;
    translated.snapshot.childrenReview = { approvedCount: 99, proposedCount: 100 };
  }
  if (unresolvedAtDeath) {
    pending.pendingDecision = false;
    pending.unresolvedAtDeath = true;
  }
  const queryKey = minor ? ["my-children-health-info", undefined] : ["myHealthInfo"];
  const client = createTestQueryClient();
  const Provider = createQueryWrapper(client);
  const i18n = createInstance();
  await i18n.init({
    lng: "en", fallbackLng: "en",
    resources: { en: { translation: en }, es: { translation: es } },
  });
  const fixture = {
    canonical: minor ? [pending, sibling] : pending,
    translation: minor ? [siblingTranslation, translated] : translated,
    url, profileId, sibling, pending, translated, queryKey, client, i18n,
  };
  api.get.mockImplementation(async (path, options) => {
    if (path !== url) throw new Error("Unexpected health info request");
    return { data: await (options?.params?.lang ? fixture.translation : fixture.canonical) };
  });
  render(
    <Provider>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[minor ? "/children/child-1" : "/adult"]}>
          <Link to="/children/child-1">First child</Link>
          <Link to="/children/child-2">Second child</Link>
          <Routes>
            <Route path="/adult" element={<MyHealthInfo />} />
            <Route path="/children/:childId" element={<MyChildHealthInfo />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </Provider>,
  );
  await screen.findByRole("heading", { name: "Pending profile", level: 1 });
  return fixture;
}

test("a deceased patient's unresolved proposal stays read-only on reload and after a stale translation", async () => {
  const fixture = await renderPortal(false, { childrenReview: { approvedCount: 2, proposedCount: 3 }, unresolvedAtDeath: true });
  expect(screen.getByText(en.myHealthInfo.header.unresolvedAtDeath)).toBeInTheDocument();
  expect(screen.getByText("Proposed change: 2 → 3")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: actions.approve })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: actions.reject })).not.toBeInTheDocument();
  await act(async () => fixture.i18n.changeLanguage("es"));
  fireEvent.click(button(es.common.translate));
  await screen.findByRole("heading", { name: "Translated pending profile", level: 1 });
  expect(screen.getByText("Cambio propuesto: 2 → 3")).toBeInTheDocument();
  expect(screen.getByText(es.myHealthInfo.header.unresolvedAtDeath)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: es.myHealthInfo.actions.approve })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: es.myHealthInfo.actions.reject })).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test.each([["approve", 1], ["reject", 0]])("shows the approved children total before and after translated %s", async (decision, confirmed) => {
  const fixture = await renderPortal(false, { childrenReview: { approvedCount: 0, proposedCount: 1 } });
  const card = () => within(screen.getByText(fixture.i18n.t("myHealthInfo.sections.basic.approvedChildrenCount")).parentElement);
  expect(card().getByText("0", { exact: true })).toBeInTheDocument();
  expect(card().getByText("Proposed change: 0 → 1")).toBeInTheDocument();

  await act(async () => fixture.i18n.changeLanguage("es"));
  expect(card().getByText("Cambio propuesto: 0 → 1")).toBeInTheDocument();
  fireEvent.click(button(es.common.translate));
  await screen.findByRole("heading", { name: "Translated pending profile", level: 1 });
  expect(card().getByText("0", { exact: true })).toBeInTheDocument();
  expect(card().getByText("Cambio propuesto: 0 → 1")).toBeInTheDocument();
  expect(card().queryByText("99", { exact: true })).not.toBeInTheDocument();

  const updated = record("Confirmed profile", fixture.profileId, false);
  updated.snapshot.childrenReview = { approvedCount: confirmed, proposedCount: confirmed };
  api.post.mockImplementationOnce(async () => {
    fixture.canonical = updated;
    return { data: updated };
  });
  fireEvent.click(button(es.myHealthInfo.actions[decision]));
  await screen.findByText(es.myHealthInfo.header.allUpToDate);
  expect(card().getByText(String(confirmed), { exact: true })).toBeInTheDocument();
  expect(card().queryByText(/Cambio propuesto/)).not.toBeInTheDocument();
});

describe.each([["Adult", false], ["Minor", true]])("%s HealthInfo decisions", (_label, minor) => {
  test.each(["approve", "reject"])("updates the authoritative view after Translate → %s", async (decision) => {
    const fixture = await renderPortal(minor);
    fireEvent.click(button(en.common.translate));
    await screen.findByRole("heading", { name: "Translated pending profile", level: 1 });

    const updated = record(decision === "approve" ? "Approved profile" : "Restored profile", fixture.profileId, false);
    api.post.mockImplementationOnce(async () => {
      fixture.canonical = minor ? [updated, fixture.sibling] : updated;
      return { data: updated };
    });
    fireEvent.click(button(actions[decision]));

    await screen.findByText(allUpToDate);
    expect(heading(updated.snapshot.fullnameWrapper.value)).toBeInTheDocument();
    expect(screen.queryByText(pendingReview)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: actions.clearTranslation })).not.toBeInTheDocument();
    const path = `${fixture.url}/${decision}/${fixture.profileId}`;
    const version = { expectedUpdatedAt: fixture.pending.snapshot.sources[0].updatedAt };
    expect(api.post).toHaveBeenCalledExactlyOnceWith(path, version);
    expect(fixture.client.getQueryData(fixture.queryKey)).toEqual(fixture.canonical);

    await act(async () => { await fixture.i18n.changeLanguage("es"); });
    expect(screen.getByText(es.myHealthInfo.header.allUpToDate)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: es.myHealthInfo.actions.clearTranslation })).not.toBeInTheDocument();
    await act(async () => { await fixture.i18n.changeLanguage("en"); });
    expect(heading(updated.snapshot.fullnameWrapper.value)).toBeInTheDocument();
  });

  test.each([
    ["approve", false],
    ["reject", false],
    ["approve", true],
    ["reject", true],
  ])("%s applies the server result (delayed translation: %s)", async (decision, delayedTranslation) => {
    const fixture = await renderPortal(minor);
    const translation = Promise.withResolvers();
    const pendingTranslation = fixture.translation;
    if (delayedTranslation) {
      fixture.translation = translation.promise;
      fireEvent.click(button(en.common.translate));
      await waitFor(() => expect(api.get).toHaveBeenCalledWith(fixture.url, { params: { lang: "en" } }));
    }

    const updated = record("Updated profile", fixture.profileId, false);
    api.post.mockImplementationOnce(async () => {
      fixture.canonical = minor ? [updated, fixture.sibling] : updated;
      return { data: updated };
    });
    fireEvent.click(button(actions[decision]));
    await screen.findByText(allUpToDate);

    if (delayedTranslation) {
      await act(async () => translation.resolve(pendingTranslation));
      await waitFor(() => expect(button(en.common.translate)).toBeEnabled());
    }
    expect(heading("Updated profile")).toBeInTheDocument();
    expect(screen.queryByText(pendingReview)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: actions.clearTranslation })).not.toBeInTheDocument();
  });

  test.each([
    ["approve", "approving", "approveHealthInfoFailed", "approveFail"],
    ["reject", "rejecting", "rejectHealthInfoFailed", "rejectFail"],
  ])("blocks conflicting submissions and preserves the view after a failed %s", async (decision, progress, adultError, minorError) => {
    const fixture = await renderPortal(minor);
    fireEvent.click(button(en.common.translate));
    await screen.findByRole("heading", { name: "Translated pending profile", level: 1 });
    const response = Promise.withResolvers();
    api.post.mockReturnValueOnce(response.promise);

    const action = button(actions[decision]);
    const other = button(actions[decision === "approve" ? "reject" : "approve"]);
    act(() => {
      fireEvent.click(action);
      fireEvent.click(action);
      fireEvent.click(other);
    });
    expect(await screen.findByRole("button", { name: actions[progress] })).toBeDisabled();
    expect(other).toBeDisabled();
    expect(screen.getAllByText(pendingReview)).not.toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => response.reject(new Error("Synthetic write failure")));

    await waitFor(() => expect(button(actions[decision])).toBeEnabled());
    const path = `${fixture.url}/${decision}/${fixture.profileId}`;
    const version = { expectedUpdatedAt: fixture.pending.snapshot.sources[0].updatedAt };
    expect(api.post).toHaveBeenCalledExactlyOnceWith(path, version);
    expect(toast.error).toHaveBeenCalledWith(minor ? `myChildren.toasts.${minorError}` : `patients.toasts.${adultError}`);
    expect(heading("Translated pending profile")).toBeInTheDocument();
    expect(fixture.client.getQueryData(fixture.queryKey)).toEqual(fixture.canonical);
  });

  test("clears a translation and keeps the current source", async () => {
    await renderPortal(minor);
    fireEvent.click(button(en.common.translate));
    await screen.findByRole("heading", { name: "Translated pending profile", level: 1 });
    fireEvent.click(button(actions.clearTranslation));
    expect(heading("Pending profile")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: actions.clearTranslation })).not.toBeInTheDocument();
  });

  test("shows the empty state when rejection removes the last profile", async () => {
    const fixture = await renderPortal(minor);
    fireEvent.click(button(en.common.translate));
    await screen.findByRole("heading", { name: "Translated pending profile", level: 1 });
    const localizedKey = ["my-children-health-info", "es"];
    const childHistoryKey = ["child-history", "child-1"];
    const siblingHistoryKey = ["child-history", "child-2"];
    if (minor) {
      fixture.client.setQueryData(localizedKey, [fixture.pending, fixture.sibling]);
      fixture.client.setQueryData(childHistoryKey, ["First child history"]);
      fixture.client.setQueryData(siblingHistoryKey, ["Sibling history"]);
    }
    api.post.mockImplementationOnce(async () => {
      fixture.canonical = minor ? [fixture.sibling] : noRecords;
      return { data: noRecords };
    });
    fireEvent.click(button(actions.reject));
    await screen.findByRole("heading", { name: absentTitle(minor), level: 1 });
    expect(screen.queryByText("Translated pending profile")).not.toBeInTheDocument();
    expect(fixture.client.getQueryData(fixture.queryKey)).toEqual(fixture.canonical);
    if (minor) {
      expect(fixture.client.getQueryData(localizedKey)).toEqual([fixture.sibling]);
      expect(fixture.client.getQueryData(childHistoryKey)).toBeUndefined();
      expect(fixture.client.getQueryData(siblingHistoryKey)).toEqual(["Sibling history"]);
    }
  });
});

test("a pre-decision adult refetch cannot overwrite a confirmed approval", async () => {
  const fixture = await renderPortal(false);
  const oldRead = Promise.withResolvers();
  fixture.canonical = oldRead.promise;
  const refresh = fixture.client.refetchQueries({ queryKey: fixture.queryKey });
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  const confirmed = record("Approved profile", fixture.profileId, false);
  api.post.mockResolvedValueOnce({ data: confirmed });

  fireEvent.click(button(actions.approve));
  await screen.findByText(allUpToDate);
  await act(async () => {
    oldRead.resolve(fixture.pending);
    await refresh;
  });
  expect(heading("Approved profile")).toBeInTheDocument();
  expect(fixture.client.getQueryData(fixture.queryKey)).toEqual(confirmed);
});

describe("Guardian HealthInfo isolation", () => {
  test("switching children drops the prior translation and ignores its pending replacement", async () => {
    const fixture = await renderPortal(true);
    fireEvent.click(button(en.common.translate));
    await screen.findByRole("heading", { name: "Translated pending profile", level: 1 });

    const translation = Promise.withResolvers();
    const response = fixture.translation;
    fixture.translation = translation.promise;
    fireEvent.click(button(en.common.translate));
    await waitFor(() => expect(api.get.mock.calls.filter(([, options]) => options?.params?.lang)).toHaveLength(2));
    fireEvent.click(screen.getByRole("link", { name: "Second child" }));
    expect(heading("Sibling record")).toBeInTheDocument();
    expect(screen.queryByText("Translated pending profile")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "First child" }));
    await act(async () => translation.resolve(response));
    await waitFor(() => expect(button(en.common.translate)).toBeEnabled());
    expect(heading("Pending profile")).toBeInTheDocument();
    expect(screen.queryByText("Translated pending profile")).not.toBeInTheDocument();
  });

  test("a denied decision hides the old record and refreshes authorized children", async () => {
    const fixture = await renderPortal(true);
    fireEvent.click(button(en.common.translate));
    await screen.findByRole("heading", { name: "Translated pending profile", level: 1 });
    api.post.mockImplementationOnce(async () => {
      fixture.canonical = [fixture.sibling];
      throw Object.assign(new Error("Revoked guardian access"), { response: { status: 404 } });
    });
    fireEvent.click(button(actions.approve));
    await screen.findByRole("heading", { name: absentTitle(true), level: 1 });
    expect(screen.queryByText("Translated pending profile")).not.toBeInTheDocument();
    expect(fixture.client.getQueryData(fixture.queryKey)).toEqual([fixture.sibling]);
    expect(toast.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Second child" }));
    expect(heading("Sibling record")).toBeInTheDocument();
  });

  test("a translation read that loses access evicts only the affected child", async () => {
    const fixture = await renderPortal(true);
    const localizedKey = ["my-children-health-info", "es"];
    fixture.client.setQueryData(localizedKey, [fixture.pending, fixture.sibling]);
    fixture.canonical = [fixture.sibling];
    fixture.translation = [fixture.sibling];

    fireEvent.click(button(en.common.translate));
    await screen.findByRole("heading", { name: absentTitle(true), level: 1 });
    expect(fixture.client.getQueryData(fixture.queryKey)).toEqual([fixture.sibling]);
    expect(fixture.client.getQueryData(localizedKey)).toEqual([fixture.sibling]);
    fireEvent.click(screen.getByRole("link", { name: "Second child" }));
    expect(heading("Sibling record")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "First child" }));
    expect(heading(absentTitle(true))).toBeInTheDocument();
  });

  test("drops the confirmed child record during refresh and ignores a translation from before the decision", async () => {
    const fixture = await renderPortal(true);
    const translation = Promise.withResolvers();
    const refreshedRead = Promise.withResolvers();
    const pendingTranslation = fixture.translation;
    fixture.translation = translation.promise;
    fireEvent.click(button(en.common.translate));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(childUrl, { params: { lang: "en" } }));

    const restored = record("Restored profile", fixture.profileId, false);
    api.post.mockImplementationOnce(async () => {
      fixture.canonical = refreshedRead.promise;
      return { data: restored };
    });
    fireEvent.click(button(actions.reject));
    await screen.findByRole("status");
    expect(fixture.client.getQueryData(fixture.queryKey)).toEqual([fixture.sibling]);
    await act(async () => translation.resolve(pendingTranslation));
    expect(screen.queryByText("Translated pending profile")).not.toBeInTheDocument();
    expect(screen.queryByText(pendingReview)).not.toBeInTheDocument();
    await act(async () => refreshedRead.resolve([restored, fixture.sibling]));
    await screen.findByRole("heading", { name: "Restored profile", level: 1 });
    expect(fixture.client.getQueryData(fixture.queryKey)).toEqual([restored, fixture.sibling]);
  });

  test("a completed decision from a replaced session cannot rewrite the new session cache", async () => {
    const fixture = await renderPortal(true);
    const oldDecision = Promise.withResolvers();
    api.post.mockReturnValueOnce(oldDecision.promise);
    fireEvent.click(button(actions.approve));
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce());

    await act(async () => {
      invalidateIdentity();
      useAuthStore.setState({ user: { _id: "new-patient", role: "patient", isVerified: true } });
      fixture.client.clear();
      fixture.client.setQueryData(fixture.queryKey, [fixture.sibling]);
      oldDecision.resolve({ data: record("Old session result", fixture.profileId, false) });
    });
    expect(fixture.client.getQueryData(fixture.queryKey)).toEqual([fixture.sibling]);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
