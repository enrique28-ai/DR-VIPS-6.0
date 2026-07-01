import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MyHealthInfo from "./MyHealthInfo.jsx";
import {
  useApprovePatientProfile,
  useMyHealthInfo,
  useRejectPatientProfile,
  useTranslateMyHealthInfo,
} from "../../features/patients/phooks.js";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key, options = {}) => {
      if (key === "myHealthInfo.sections.basic.ageWithYears") {
        return `${options.age} years`;
      }

      return (
        {
          "common.loading": "Loading...",
          "common.translate": "Translate",
          "myHealthInfo.actions.approve": "Approve",
          "myHealthInfo.actions.approveIntro": "Review these pending changes.",
          "myHealthInfo.actions.approving": "Approving...",
          "myHealthInfo.actions.clearTranslation": "Clear translation",
          "myHealthInfo.actions.reject": "Reject",
          "myHealthInfo.actions.rejecting": "Rejecting...",
          "myHealthInfo.changes.previouslyApproved": "Previously approved",
          "myHealthInfo.changes.thisWasAdded": "This was added",
          "myHealthInfo.changes.thisWasRemoved": "This was removed",
          "myHealthInfo.common.no": "No",
          "myHealthInfo.common.notCalculated": "Not calculated",
          "myHealthInfo.common.notSpecified": "Not specified",
          "myHealthInfo.common.previouslyRecordedBirthplaces": "Previously recorded birthplaces",
          "myHealthInfo.common.previouslyRecordedLocations": "Previously recorded locations",
          "myHealthInfo.common.unknownDate": "Unknown date",
          "myHealthInfo.common.yes": "Yes",
          "myHealthInfo.empty.backToState": "Back to health state",
          "myHealthInfo.empty.description": "No health info available.",
          "myHealthInfo.empty.title": "No health info",
          "myHealthInfo.header.allUpToDate": "All up to date",
          "myHealthInfo.header.pendingReview": "Pending review",
          "myHealthInfo.history.button": "History",
          "myHealthInfo.history.systemUnknown": "Unknown",
          "myHealthInfo.sections.anthropometrics.bmi": "BMI",
          "myHealthInfo.sections.anthropometrics.height": "Height",
          "myHealthInfo.sections.anthropometrics.title": "Anthropometrics",
          "myHealthInfo.sections.anthropometrics.weight": "Weight",
          "myHealthInfo.sections.basic.age": "Age",
          "myHealthInfo.sections.basic.bloodDonor": "Blood donor",
          "myHealthInfo.sections.basic.bloodType": "Blood type",
          "myHealthInfo.sections.basic.causeOfDeath": "Cause of death",
          "myHealthInfo.sections.basic.fullname": "Full name",
          "myHealthInfo.sections.basic.gender": "Gender",
          "myHealthInfo.sections.basic.location": "Place of Residence",
          "myHealthInfo.sections.basic.organDonor": "Organ donor",
          "myHealthInfo.sections.basic.phone": "Phone",
          "myHealthInfo.sections.basic.title": "Basic",
          "myHealthInfo.sections.conditions.allergies": "Allergies",
          "myHealthInfo.sections.conditions.diseases": "Diseases",
          "myHealthInfo.sections.conditions.medications": "Medications",
          "myHealthInfo.sections.conditions.title": "Conditions",
          "navbar.myHealthInfo": "My Health Info",
          "patients.card.genderFemale": "Female",
          "patients.card.genderMale": "Male",
          "patients.create.birthDate": "Birth date",
          "patients.create.phoneCountry": "Phone country",
          "patients.create.placeOfBirth": "Place of Birth",
          "patients.edit.dateOfDeath": "Date of death",
        }[key] ?? options.defaultValue ?? key
      );
    },
  }),
}));

vi.mock("../../features/patients/phooks.js", () => ({
  useMyHealthInfo: vi.fn(),
  useApprovePatientProfile: vi.fn(),
  useRejectPatientProfile: vi.fn(),
  useTranslateMyHealthInfo: vi.fn(),
}));

vi.mock("../../components/patient/PatientHistoryModal.jsx", () => ({
  default: ({ onClose }) => (
    <div role="dialog" aria-label="Patient history modal">
      <button type="button" onClick={onClose}>
        Close history
      </button>
    </div>
  ),
}));

const inertMutation = { mutate: vi.fn(), isPending: false };

const baseSnapshot = (overrides = {}) => ({
  fullnameWrapper: { value: "Adult Patient" },
  age: { value: 36 },
  gender: { value: "female" },
  bloodtype: { value: "O+" },
  country: { value: "Mexico" },
  state: { value: "Jalisco" },
  city: { value: "Guadalajara" },
  birthCountry: { value: "Mexico" },
  birthState: { value: "Baja California" },
  birthCity: { value: "Mexicali" },
  birthDate: "1990-01-01T12:00:00.000Z",
  organDonor: { value: false },
  bloodDonor: { value: true },
  measurementSystem: "metric",
  heightM: 1.7,
  weightKg: 70,
  diseases: [],
  allergies: [],
  medications: [],
  sources: [{ id: "adult-profile-id", doctorName: "Dr. Smith", updatedAt: "2026-01-01T12:00:00.000Z" }],
  ...overrides,
});

const healthInfoData = (snapshot = baseSnapshot(), overrides = {}) => ({
  hasRecords: true,
  pendingDecision: false,
  profileId: "adult-profile-id",
  snapshot,
  ...overrides,
});

const renderHealthInfo = (snapshot = baseSnapshot(), hookState = {}) => {
  useMyHealthInfo.mockReturnValue({
    data:
      hookState.data === undefined
        ? healthInfoData(snapshot, {
            pendingDecision: hookState.pendingDecision ?? false,
          })
        : hookState.data,
    isLoading: hookState.isLoading ?? false,
    isError: hookState.isError ?? false,
  });

  render(<MyHealthInfo />);
};

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
  useApprovePatientProfile.mockReturnValue(inertMutation);
  useRejectPatientProfile.mockReturnValue(inertMutation);
  useTranslateMyHealthInfo.mockReturnValue(inertMutation);
});

describe("MyHealthInfo layout states and actions", () => {
  test("renders visible loading state", () => {
    renderHealthInfo(baseSnapshot(), { data: undefined, isLoading: true });

    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });

  test("keeps empty state back action routed to health state", () => {
    renderHealthInfo(baseSnapshot(), { data: null, isError: true });

    fireEvent.click(screen.getByRole("button", { name: "Back to health state" }));

    expect(navigateMock).toHaveBeenCalledWith("/docrecords/myhealthstate");
  });

  test("shows pending review context and approve/reject controls", () => {
    renderHealthInfo(baseSnapshot(), { pendingDecision: true });

    expect(screen.getAllByText("Pending review").length).toBeGreaterThan(0);
    expect(screen.getByText(/Dr\. Smith/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  test("disables approve and reject controls while approval is pending", () => {
    useApprovePatientProfile.mockReturnValue({ mutate: vi.fn(), isPending: true });

    renderHealthInfo(baseSnapshot(), { pendingDecision: true });

    expect(screen.getByRole("button", { name: "Approving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  test("keeps history and translate actions available", () => {
    renderHealthInfo(baseSnapshot());

    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Translate" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "History" }));

    expect(screen.getByRole("dialog", { name: "Patient history modal" })).toBeInTheDocument();
  });

  test("shows clear translation action after translated data is active", () => {
    const translateMutate = vi.fn();
    useTranslateMyHealthInfo.mockReturnValue({ mutate: translateMutate, isPending: false });
    renderHealthInfo(baseSnapshot());

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    const successCallback = translateMutate.mock.calls[0][1].onSuccess;
    act(() => {
      successCallback(
        healthInfoData(
          baseSnapshot({
            fullnameWrapper: { value: "Translated Adult" },
          }),
        ),
      );
    });

    expect(screen.getByRole("button", { name: "Clear translation" })).toBeInTheDocument();
    expect(screen.getByText("Translated Adult")).toBeInTheDocument();
  });
});

describe("MyHealthInfo phone country display", () => {
  test("shows birthplace from snapshot when present", () => {
    renderHealthInfo(baseSnapshot());

    expect(screen.getByText("Place of Residence")).toBeInTheDocument();
    expect(screen.getByText("Mexico, Jalisco, Guadalajara")).toBeInTheDocument();
    expect(screen.getByText("Place of Birth")).toBeInTheDocument();
    expect(screen.getByText("Mexico, Baja California, Mexicali")).toBeInTheDocument();
  });

  test("shows not specified when birthplace is missing", () => {
    renderHealthInfo(
      baseSnapshot({
        birthCountry: undefined,
        birthState: undefined,
        birthCity: undefined,
      }),
    );

    expect(screen.getByText("Place of Birth")).toBeInTheDocument();
    expect(screen.getAllByText("Not specified").length).toBeGreaterThan(0);
  });

  test("shows donor yes/no values", () => {
    renderHealthInfo(baseSnapshot());

    const organDonorCard = screen.getByText("Organ donor").closest("div");
    const bloodDonorCard = screen.getByText("Blood donor").closest("div");

    expect(within(organDonorCard).getByText("No")).toBeInTheDocument();
    expect(within(bloodDonorCard).getByText("Yes")).toBeInTheDocument();
  });

  test("shows phone country metadata when phone and phone country ISO exist", () => {
    renderHealthInfo(
      baseSnapshot({
        phone: { value: "+442079460056" },
        phoneCountry: { value: "United Kingdom" },
        phoneCountryIso: { value: "GB" },
      }),
    );

    expect(screen.getByText("+442079460056")).toBeInTheDocument();
    expect(screen.getByText("Phone country: United Kingdom +44")).toBeInTheDocument();
  });

  test("hides stale phone country metadata when phone is missing", () => {
    renderHealthInfo(
      baseSnapshot({
        phoneCountry: { value: "United Kingdom" },
        phoneCountryIso: { value: "GB" },
      }),
    );

    expect(screen.queryByText("Phone country: United Kingdom +44")).not.toBeInTheDocument();
  });

  test("uses phoneCountryIso for dial code without changing residence display", () => {
    renderHealthInfo(
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

describe("MyHealthInfo imperial height display", () => {
  test("displays imperial height as '5 ft 10 in', not '5.83 ft'", () => {
    renderHealthInfo(
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
    renderHealthInfo(
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
