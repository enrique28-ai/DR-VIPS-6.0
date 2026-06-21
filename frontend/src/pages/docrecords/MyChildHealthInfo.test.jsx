import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MyChildHealthInfo from "./MyChildHealthInfo.jsx";
import {
  useApproveChildProfile,
  useMyChildrenHealthInfo,
  useRejectChildProfile,
  useTranslateMyChildrenHealthInfo,
} from "../../features/patients/phooks.js";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ childId: "child-profile-id" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key, options = {}) =>
      ({
        "myHealthInfo.common.notSpecified": "Not specified",
        "myHealthInfo.common.unknownDate": "Unknown date",
        "myHealthInfo.history.systemUnknown": "Unknown",
        "myHealthInfo.sections.basic.title": "Basic",
        "myHealthInfo.sections.basic.phone": "Phone",
        "myHealthInfo.sections.basic.location": "Location",
        "myChildren.healthInfo": "Child health info",
        "myChildren.upToDate": "Up to date",
        "myChildren.tutorEmail": "Tutor email",
        "patients.create.phoneCountry": "Phone country",
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
  default: () => null,
}));

const inertMutation = { mutate: vi.fn(), isPending: false };

const baseSnapshot = (overrides = {}) => ({
  fullnameWrapper: { value: "Minor Patient" },
  age: { value: 10 },
  gender: { value: "female" },
  bloodtype: { value: "O+" },
  country: { value: "Mexico" },
  state: { value: "Jalisco" },
  city: { value: "Guadalajara" },
  birthDate: "2016-01-01T12:00:00.000Z",
  measurementSystem: "metric",
  heightM: 1.35,
  weightKg: 32,
  diseases: [],
  allergies: [],
  medications: [],
  sources: [{ id: "child-profile-id", doctorName: "Dr. Smith", updatedAt: "2026-01-01T12:00:00.000Z" }],
  ...overrides,
});

const renderChildHealthInfo = (snapshot) => {
  useMyChildrenHealthInfo.mockReturnValue({
    data: [
      {
        profileId: "child-profile-id",
        hasRecords: true,
        pendingDecision: false,
        parentEmail: "parent@example.com",
        snapshot,
      },
    ],
    isLoading: false,
  });

  render(<MyChildHealthInfo />);
};

beforeEach(() => {
  vi.clearAllMocks();
  useApproveChildProfile.mockReturnValue(inertMutation);
  useRejectChildProfile.mockReturnValue(inertMutation);
  useTranslateMyChildrenHealthInfo.mockReturnValue(inertMutation);
});

describe("MyChildHealthInfo phone country display", () => {
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
