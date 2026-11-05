import {
  House,
  Users,
  HeartPulse,
  ClipboardList,
  UsersRound,
  CalendarDays,
  UserRound,
  ShieldCheck,
} from "lucide-react";

const isActive = (pathname, rule) => {
  if (rule.exact) return pathname === rule.exact;
  if (rule.startsWith) return pathname.startsWith(rule.startsWith);
  if (rule.matchPrefixes) return rule.matchPrefixes.some((p) => pathname.startsWith(p));
  return false;
};

export const doctorNav = [
  {
    labelKey: "navbar.home",
    to: "/",
    icon: House,
    active: { exact: "/" },
  },
  {
    labelKey: "navbar.patients",
    to: "/patients",
    icon: Users,
    active: {
      matchPrefixes: [
        "/patients",
        "/diagnosis/patient",
      ],
    },
  },
  {
    labelKey: "calendar.menu",
    to: "/calendar",
    icon: CalendarDays,
    active: { exact: "/calendar" },
  },
  {
    labelKey: "navbar.profile",
    to: "/profile",
    icon: UserRound,
    active: { exact: "/profile" },
  },
];

export const patientNav = [
  {
    labelKey: "navbar.home",
    to: "/",
    icon: House,
    active: { exact: "/" },
  },
  {
    labelKey: "navbar.myHealthState",
    to: "/docrecords/myhealthstate",
    icon: HeartPulse,
    active: {
      matchPrefixes: ["/docrecords/myhealthstate"],
    },
  },
  {
    labelKey: "navbar.myHealthInfo",
    to: "/docrecords/myhealthinfo",
    icon: ClipboardList,
    active: { exact: "/docrecords/myhealthinfo" },
  },
  {
    labelKey: "navbar.myChildren",
    to: "/docrecords/mychildren",
    icon: UsersRound,
    active: { startsWith: "/docrecords/mychildren" },
  },
  {
    labelKey: "navbar.accessRequests",
    to: "/docrecords/access-requests",
    icon: ShieldCheck,
    active: { exact: "/docrecords/access-requests" },
  },
  {
    labelKey: "calendar.menu",
    to: "/calendar",
    icon: CalendarDays,
    active: { exact: "/calendar" },
  },
  {
    labelKey: "navbar.profile",
    to: "/profile",
    icon: UserRound,
    active: { exact: "/profile" },
  },
];

export function getNavigation(role) {
  if (role === "doctor") return doctorNav;
  if (role === "patient") return patientNav;
  return [];
}

export { isActive };
