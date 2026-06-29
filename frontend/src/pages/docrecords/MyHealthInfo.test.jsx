import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MyHealthInfo from "./MyHealthInfo.jsx";
import {
  useApprovePatientProfile,
  useMyHealthInfo,
  useRejectPatientProfile,
  useTranslateMyHealthInfo,
} from "../../features/patients/phooks.js";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key, options = {}) =>
      ({
        "myHealthInfo.common.notSpecified": "Not specified",
        "myHealthInfo.common.unknownDate": "Unknown date",
        "myHealthInfo.history.systemUnknown": "Unknown",
        "myHealthInfo.header.allUpToDate": "All up to date",
        "myHealthInfo.sections.basic.fullname": "Full name",
        "myHealthInfo.sections.basic.title": "Basic",
        "myHealthInfo.sections.basic.phone": "Phone",
        "myHealthInfo.sections.basic.location": "Place of Residence",
        "patients.create.phoneCountry": "Phone country",
        "patients.create.placeOfBirth": "Place of Birth",
      }[key] ?? options.defaultValue ?? key),
  }),
}));

vi.mock("../../features/patients/phooks.js", () => ({
  useMyHealthInfo: vi.fn(),
  useApprovePatientProfile: vi.fn(),
  useRejectPatientProfile: vi.fn(),
  useTranslateMyHealthInfo: vi.fn(),
}));

vi.mock("../../components/patient/PatientHistoryModal.jsx", () => ({
  default: () => null,
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

const renderHealthInfo = (snapshot) => {
  useMyHealthInfo.mockReturnValue({
    data: {
      hasRecords: true,
      pendingDecision: false,
      profileId: "adult-profile-id",
      snapshot,
    },
    isLoading: false,
    isError: false,
  });

  render(<MyHealthInfo />);
};

beforeEach(() => {
  vi.clearAllMocks();
  useApprovePatientProfile.mockReturnValue(inertMutation);
  useRejectPatientProfile.mockReturnValue(inertMutation);
  useTranslateMyHealthInfo.mockReturnValue(inertMutation);
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
