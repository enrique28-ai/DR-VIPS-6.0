import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MyChildHealthInfo from "./MyChildHealthInfo.jsx";
import {
  useApproveChildProfile,
  useMyChildrenHealthInfo,
  useRejectChildProfile,
  useTranslateMyChildrenHealthInfo,
} from "../../features/patients/phooks.js";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ childId: "child-profile-id" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key, options = {}) =>
      ({
        "myHealthInfo.common.notSpecified": "Not specified",
        "myHealthInfo.common.no": "No",
        "myHealthInfo.common.unknownDate": "Unknown date",
        "myHealthInfo.common.yes": "Yes",
        "myHealthInfo.history.systemUnknown": "Unknown",
        "myHealthInfo.sections.basic.title": "Basic information",
        "myHealthInfo.sections.basic.age": "Age",
        "myHealthInfo.sections.basic.ageWithYears": `${options.age} years`,
        "myHealthInfo.sections.basic.gender": "Gender",
        "myHealthInfo.sections.basic.bloodType": "Blood type",
        "myHealthInfo.sections.basic.bloodDonor": "Blood donor",
        "myHealthInfo.sections.basic.location": "Place of Residence",
        "myHealthInfo.sections.basic.organDonor": "Organ donor",
        "myHealthInfo.sections.basic.phone": "Phone",
        "myChildren.childNotFound": "Child not found or no longer accessible.",
        "myChildren.healthInfo": "Health Info",
        "myChildren.upToDate": "Up to date.",
        "myChildren.pending": "Pending changes require your approval.",
        "myChildren.tutorEmail": "Tutor email",
        "myChildren.back": "Back",
        "myChildren.unknownChild": "Unknown child",
        "patients.card.genderMale": "Male",
        "patients.card.genderFemale": "Female",
        "patients.create.birthDate": "Birth date",
        "patients.create.phoneCountry": "Phone country",
        "patients.create.placeOfBirth": "Place of Birth",
        "myHealthInfo.history.button": "History",
        "myHealthInfo.actions.approveIntro": "Review pending changes before applying them.",
        "myHealthInfo.actions.approve": "Approve",
        "myHealthInfo.actions.reject": "Reject",
        "myHealthInfo.actions.approving": "Approving...",
        "myHealthInfo.actions.rejecting": "Rejecting...",
        "myHealthInfo.actions.clearTranslation": "Clear translation",
        "common.translate": "Translate",
        "common.loading": "Loading",
      }[key] ?? options.defaultValue ?? key),
  }),
}));

vi.mock("../../features/patients/phooks.js", () => ({
  useMyChildrenHealthInfo: vi.fn(),
  useApproveChildProfile: vi.fn(),
  useRejectChildProfile: vi.fn(),
  useTranslateMyChildrenHealthInfo: vi.fn(),
}));

vi.mock("../../components/patient/PatientHistoryModal.jsx", () => ({
  default: ({ variant, patientId }) => (
    <div role="dialog" aria-label="Child history modal">
      <p>History modal variant {variant}</p>
      <p>History modal patient {patientId}</p>
    </div>
  ),
}));

const inertMutation = { mutate: vi.fn(), isPending: false };

const baseSnapshot = (overrides = {}) => ({
  fullnameWrapper: { value: "Minor Patient" },
  fullname: { value: "Minor Patient" },
  age: { value: 10 },
  gender: { value: "female" },
  bloodtype: { value: "O+" },
  country: { value: "Mexico" },
  state: { value: "Jalisco" },
  city: { value: "Guadalajara" },
  birthCountry: { value: "Mexico" },
  birthState: { value: "Baja California" },
  birthCity: { value: "Mexicali" },
  birthDate: "2016-01-01T12:00:00.000Z",
  organDonor: { value: true },
  bloodDonor: { value: false },
  measurementSystem: "metric",
  heightM: 1.35,
  weightKg: 32,
  diseases: [],
  allergies: [],
  medications: [],
  sources: [{ id: "child-profile-id", doctorName: "Dr. Smith", updatedAt: "2026-01-01T12:00:00.000Z" }],
  ...overrides,
});

const baseChild = (overrides = {}) => ({
  profileId: "child-profile-id",
  hasRecords: true,
  pendingDecision: false,
  parentEmail: "parent@example.com",
  snapshot: baseSnapshot(),
  ...overrides,
});

const renderChildHealthInfo = (snapshot, hookState = {}) => {
  const resolvedSnapshot = snapshot ?? baseSnapshot();
  useMyChildrenHealthInfo.mockReturnValue({
    data: hookState.data ?? [
      {
        profileId: "child-profile-id",
        hasRecords: true,
        pendingDecision: false,
        parentEmail: "parent@example.com",
        snapshot: resolvedSnapshot,
      },
    ],
    isLoading: hookState.isLoading ?? false,
  });

  return render(<MyChildHealthInfo />);
};

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
  useApproveChildProfile.mockReturnValue(inertMutation);
  useRejectChildProfile.mockReturnValue(inertMutation);
  useTranslateMyChildrenHealthInfo.mockReturnValue(inertMutation);
});

describe("MyChildHealthInfo", () => {
  test("renders loading state with role=status while child health info is loading", () => {
    renderChildHealthInfo(undefined, {
      data: undefined,
      isLoading: true,
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  test("renders child-not-found state when the children list is empty", () => {
    renderChildHealthInfo(undefined, { data: [], isLoading: false });

    expect(
      screen.getByRole("heading", {
        name: "Child not found or no longer accessible.",
      }),
    ).toBeInTheDocument();
  });

  test("renders child-not-found state when the matched child has no records", () => {
    renderChildHealthInfo(undefined, {
      data: [{ ...baseChild(), hasRecords: false }],
      isLoading: false,
    });

    expect(
      screen.getByRole("heading", {
        name: "Child not found or no longer accessible.",
      }),
    ).toBeInTheDocument();
  });

  test("back button navigates to the children home page", () => {
    renderChildHealthInfo(undefined, { data: [], isLoading: false });

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(navigateMock).toHaveBeenCalledWith("/docrecords/mychildren");
  });

  test("renders the selected child health info details", () => {
    renderChildHealthInfo();

    expect(screen.getByRole("heading", { name: "Minor Patient" })).toBeInTheDocument();
    expect(screen.getByText("Health Info")).toBeInTheDocument();
    expect(screen.getByText("Basic information")).toBeInTheDocument();
    expect(screen.getByText("10 years")).toBeInTheDocument();
    expect(screen.getByText("Female")).toBeInTheDocument();
    expect(screen.getByText("O+")).toBeInTheDocument();
    expect(screen.getByText("Mexico, Jalisco, Guadalajara")).toBeInTheDocument();
    expect(screen.getByText("parent@example.com")).toBeInTheDocument();
  });

  test("renders child donor fields as yes and no values", () => {
    renderChildHealthInfo(
      baseSnapshot({
        organDonor: { value: true },
        bloodDonor: { value: false },
      }),
    );

    const organDonorCard = screen.getByText("Organ donor").closest("div");
    const bloodDonorCard = screen.getByText("Blood donor").closest("div");

    expect(within(organDonorCard).getByText("Yes")).toBeInTheDocument();
    expect(within(bloodDonorCard).getByText("No")).toBeInTheDocument();
    expect(screen.getByText("parent@example.com")).toBeInTheDocument();
  });

  test("renders child donor fields as not specified only when values are missing", () => {
    renderChildHealthInfo(
      baseSnapshot({
        organDonor: undefined,
        bloodDonor: { value: null },
      }),
    );

    const organDonorCard = screen.getByText("Organ donor").closest("div");
    const bloodDonorCard = screen.getByText("Blood donor").closest("div");

    expect(within(organDonorCard).getByText("Not specified")).toBeInTheDocument();
    expect(within(bloodDonorCard).getByText("Not specified")).toBeInTheDocument();
  });

  test("renders the up-to-date banner when no decision is pending", () => {
    renderChildHealthInfo(undefined, { data: [baseChild({ pendingDecision: false })] });

    expect(screen.getByText("Up to date.")).toBeInTheDocument();
  });

  test("renders the pending banner with doctor name", () => {
    renderChildHealthInfo(undefined, { data: [baseChild({ pendingDecision: true })] });

    expect(screen.getByText("Pending changes require your approval.")).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Smith/)).toBeInTheDocument();
  });
});

describe("MyChildHealthInfo actions", () => {
  test("opens the child history modal when the History button is clicked", () => {
    renderChildHealthInfo();

    expect(
      screen.queryByRole("dialog", { name: "Child history modal" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "History" }));

    const modal = screen.getByRole("dialog", { name: "Child history modal" });
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveTextContent("History modal variant child");
    expect(modal).toHaveTextContent("History modal patient child-profile-id");
  });

  test("approve button calls approve.mutate with the child profile id", () => {
    const approveMutate = vi.fn();
    useApproveChildProfile.mockReturnValue({
      mutate: approveMutate,
      isPending: false,
    });

    renderChildHealthInfo(undefined, {
      data: [baseChild({ pendingDecision: true })],
    });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(approveMutate).toHaveBeenCalledTimes(1);
    expect(approveMutate).toHaveBeenCalledWith("child-profile-id");
  });

  test("reject button calls reject.mutate with the child profile id", () => {
    const rejectMutate = vi.fn();
    useRejectChildProfile.mockReturnValue({
      mutate: rejectMutate,
      isPending: false,
    });

    renderChildHealthInfo(undefined, {
      data: [baseChild({ pendingDecision: true })],
    });

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(rejectMutate).toHaveBeenCalledTimes(1);
    expect(rejectMutate).toHaveBeenCalledWith("child-profile-id");
  });

  test("hides approve and reject actions when no decision is pending", () => {
    renderChildHealthInfo();

    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(
      screen.queryByText("Review pending changes before applying them."),
    ).not.toBeInTheDocument();
  });

  test("disables approve and reject buttons while approve mutation is pending", () => {
    useApproveChildProfile.mockReturnValue({ mutate: vi.fn(), isPending: true });
    useRejectChildProfile.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderChildHealthInfo(undefined, {
      data: [baseChild({ pendingDecision: true })],
    });

    expect(screen.getByRole("button", { name: "Approving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  test("disables approve and reject buttons while reject mutation is pending", () => {
    useApproveChildProfile.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useRejectChildProfile.mockReturnValue({ mutate: vi.fn(), isPending: true });

    renderChildHealthInfo(undefined, {
      data: [baseChild({ pendingDecision: true })],
    });

    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rejecting..." })).toBeDisabled();
  });
});

describe("MyChildHealthInfo translation", () => {
  test("translate button calls mutation with current language", () => {
    const translateMutate = vi.fn();
    useTranslateMyChildrenHealthInfo.mockReturnValue({
      mutate: translateMutate,
      isPending: false,
    });

    renderChildHealthInfo();

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    expect(translateMutate).toHaveBeenCalledTimes(1);
    expect(translateMutate).toHaveBeenCalledWith(
      { lang: "en" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test("successful translation renders translated child name", () => {
    const translateMutate = vi.fn();
    useTranslateMyChildrenHealthInfo.mockReturnValue({
      mutate: translateMutate,
      isPending: false,
    });

    renderChildHealthInfo();

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    const [, options] = translateMutate.mock.calls[0];
    act(() => {
      options.onSuccess([
        baseChild({
          snapshot: baseSnapshot({
            fullnameWrapper: { value: "Translated Minor Patient" },
            fullname: { value: "Translated Minor Patient" },
          }),
        }),
      ]);
    });

    expect(
      screen.getByRole("heading", { name: "Translated Minor Patient" }),
    ).toBeInTheDocument();
  });

  test("clear translation button appears after successful translation", () => {
    const translateMutate = vi.fn();
    useTranslateMyChildrenHealthInfo.mockReturnValue({
      mutate: translateMutate,
      isPending: false,
    });

    renderChildHealthInfo();

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    const [, options] = translateMutate.mock.calls[0];
    act(() => {
      options.onSuccess([
        baseChild({
          snapshot: baseSnapshot({
            fullnameWrapper: { value: "Translated Minor Patient" },
            fullname: { value: "Translated Minor Patient" },
          }),
        }),
      ]);
    });

    expect(screen.getByRole("button", { name: "Clear translation" })).toBeInTheDocument();
  });

  test("clicking clear translation restores original child data", () => {
    const translateMutate = vi.fn();
    useTranslateMyChildrenHealthInfo.mockReturnValue({
      mutate: translateMutate,
      isPending: false,
    });

    renderChildHealthInfo();

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    const [, options] = translateMutate.mock.calls[0];
    act(() => {
      options.onSuccess([
        baseChild({
          snapshot: baseSnapshot({
            fullnameWrapper: { value: "Translated Minor Patient" },
            fullname: { value: "Translated Minor Patient" },
          }),
        }),
      ]);
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear translation" }));

    expect(screen.getByRole("heading", { name: "Minor Patient" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Translated Minor Patient" }),
    ).not.toBeInTheDocument();
  });

  test("translate button shows loading state and is disabled while pending", () => {
    useTranslateMyChildrenHealthInfo.mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    });

    renderChildHealthInfo();

    const button = screen.getByRole("button", { name: "Loading" });
    expect(button).toBeDisabled();
  });
});

describe("MyChildHealthInfo phone country display", () => {
  test("shows birthplace from child snapshot when present", () => {
    renderChildHealthInfo();

    expect(screen.getByText("Place of Residence")).toBeInTheDocument();
    expect(screen.getByText("Mexico, Jalisco, Guadalajara")).toBeInTheDocument();
    expect(screen.getByText("Place of Birth")).toBeInTheDocument();
    expect(screen.getByText("Mexico, Baja California, Mexicali")).toBeInTheDocument();
  });

  test("shows not specified when child birthplace is missing", () => {
    renderChildHealthInfo(
      baseSnapshot({
        birthCountry: undefined,
        birthState: undefined,
        birthCity: undefined,
      }),
    );

    expect(screen.getByText("Place of Birth")).toBeInTheDocument();
    expect(screen.getAllByText("Not specified").length).toBeGreaterThan(0);
  });

  test("shows phone country metadata when child phone and phone country ISO exist", () => {
    renderChildHealthInfo(
      baseSnapshot({
        phone: { value: "+442079460056" },
        phoneCountry: { value: "United Kingdom" },
        phoneCountryIso: { value: "GB" },
      }),
    );

    expect(screen.getByText("+442079460056")).toBeInTheDocument();
    expect(screen.getByText("Phone country: United Kingdom +44")).toBeInTheDocument();
  });

  test("hides stale phone country metadata when child phone is missing", () => {
    renderChildHealthInfo(
      baseSnapshot({
        phoneCountry: { value: "United Kingdom" },
        phoneCountryIso: { value: "GB" },
      }),
    );

    expect(screen.queryByText("Phone country: United Kingdom +44")).not.toBeInTheDocument();
  });

  test("uses phoneCountryIso for dial code without changing residence display", () => {
    renderChildHealthInfo(
      baseSnapshot({
        country: { value: "Mexico" },
        state: { value: "Jalisco" },
        city: { value: "Guadalajara" },
        phone: { value: "+442079460056" },
        phoneCountry: { value: "United Kingdom" },
        phoneCountryIso: { value: "GB" },
      }),
    );

    expect(screen.getByText("Phone country: United Kingdom +44")).toBeInTheDocument();
    expect(screen.queryByText("Phone country: United Kingdom +52")).not.toBeInTheDocument();
    expect(screen.getByText("Mexico, Jalisco, Guadalajara")).toBeInTheDocument();
  });
});

describe("MyChildHealthInfo imperial height display", () => {
  test("displays imperial height as '5 ft 10 in', not '5.83 ft'", () => {
    renderChildHealthInfo(
      baseSnapshot({
        measurementSystem: "imperial",
        heightFeet: { value: 5 },
        heightInches: { value: 10 },
        heightM: 1.778,
        weightKg: 81.6466,
      }),
    );

    expect(screen.getByText("5 ft 10 in")).toBeInTheDocument();
    expect(screen.queryByText(/5\.83/)).not.toBeInTheDocument();
  });

  test("displays imperial height from heightWrapper when direct heightM is absent", () => {
    renderChildHealthInfo(
      baseSnapshot({
        measurementSystem: "imperial",
        heightM: undefined,
        heightWrapper: { value: 1.778 },
        weightKg: 81.6466,
        phone: { value: "+16195550101" },
        phoneCountry: { value: "United States" },
        phoneCountryIso: { value: "US" },
      }),
    );

    expect(screen.getByText("5 ft 10 in")).toBeInTheDocument();
    expect(screen.queryByText(/5\.83/)).not.toBeInTheDocument();
    expect(screen.queryByText("Not specified")).not.toBeInTheDocument();
  });
});
