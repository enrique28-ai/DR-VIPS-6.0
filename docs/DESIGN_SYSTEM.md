# Existing design system

This describes established UI conventions, not a redesign or rigid token specification. `frontend/src/index.css` imports Tailwind CSS; styling is primarily component utilities. Reuse relevant nearby components before introducing a competing pattern.

## Visual language

Evidence spans Home, Navbar, shared forms, patient lists/portal, diagnosis detail and calendar pages under `frontend/src/`.

| Element | Observed convention and limits |
| --- | --- |
| Canvas/surface | Slate-50 backgrounds, white cards, slate-200 borders and slate-100 dividers |
| Text | Slate-950/900 headings, slate-600 support, slate-500 metadata |
| Home accent | Cyan badge/link/focus treatments; slate-950 primary CTA |
| Shared action/navigation | Blue-600 primary buttons, blue-700 hover, blue-500 focus, blue-50 active/hover surfaces |
| Status | Amber pending, emerald accepted/success, red destructive/error, with labels |
| Shape | rounded-lg Home/calendar; rounded-xl forms/navigation; rounded-2xl/3xl on some record/portal cards |
| Elevation | Mostly shadow-sm; larger auth-surface/dialog/drawer shadows |

Cyan and blue serve different contexts. Do not impose one accent, radius or shadow universally. No custom semantic typography/spacing token system is established here; follow nearby utilities and container widths unless an approved improvement justifies a change.

Representative sources: `pages/Home.jsx`, `pages/patientsrecord/PatientsPage.jsx`, `pages/docrecords/MyHealthInfo.jsx`, `pages/diagnosisrecord/DiagnosisDetailPage.jsx`, `pages/calendar/CalendarPage.jsx`, `components/forms/AuthShell.jsx`.

## Controls and feedback

`components/forms/Button.jsx` defines primary/secondary/ghost/danger variants, defaults to full width, supports full=false, and combines loading with native disabled state, aria-busy, spinner and focus-visible rings. It uses Framer Motion hover/tap feedback.

`components/forms/Input.jsx` provides label support using the caller's id/name, icon spacing, blue focus and disabled/read-only surfaces. Supplying a label alone does not guarantee an association if the caller omits id/name; preserve explicit relationships and validation feedback.

Home's main CTA and shared Button/Input use min-h-11 (44px at default Tailwind scale). Navbar includes 40px controls and other components vary; no universal 44px minimum has been established.

Loading patterns include disabled busy controls and pulse skeletons. `PatientAccessRequestsPage.jsx` separates accessible loading, empty and retryable error states and request-specific pending actions. `PatientsPage.jsx` distinguishes no records from no filter matches. Preserve these distinctions and localized feedback rather than reporting an empty collection as an error.

## Navigation and responsiveness

`components/Navbar.jsx` is a sticky white/translucent bar with border/shadow. `App.jsx` places the desktop Sidebar after content, on the right; `lg` separates desktop from mobile drawer presentation. `components/layout/navigationConfig.js` supplies role destinations and active matching to both Sidebar and MobileNavigationDrawer.

Layouts use sm/md/lg utilities rather than custom breakpoints. Home becomes multi-column at md; page shells commonly use responsive padding and constrained widths. Preserve logical reading order, wrapping and overflow handling.

Visible focus rings, labeled toggles, aria-expanded/controls and aria-current links are established patterns. Appointment/history dialogs implement focus handling; the mobile navigation drawer is non-modal and must not be described as having the same focus trap. Preserve the behavior of each overlay.

User-facing copy generally uses useTranslation with English/Spanish catalogs under `frontend/src/locals/`. Keep labels/statuses understandable without color alone.

## Limits and future work

Animations exist, but comprehensive reduced-motion handling is not established. This document is not an accessibility certification or proof of all-screen contrast, labels or target sizes. Verify affected viewports and keyboard/states following [Testing](TESTING.md). Future approved work may improve inconsistencies with explicit rationale; this foundation authorizes no redesign. [Security model](SECURITY_MODEL.md) owns authorization.
