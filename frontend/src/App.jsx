// src/App.jsx
import { lazy, useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "./stores/authStore.js";
import { ownsValidation } from "./lib/authSession.js";
import { announceInitialSession, observeSessionChanges } from "./lib/sessionSync.js";

// Guards
import AuthOnlyRoute from "./components/auth/AuthOnlyRoute.jsx";
import PrivateRoute from "./components/auth/PrivateRoute.jsx";
import RequireVerified from "./components/auth/RequireVerified.jsx";

// UI
import Navbar from "./components/Navbar.jsx";
import Sidebar from "./components/layout/Sidebar.jsx";
import RoutePageBoundary from "./components/layout/RoutePageBoundary.jsx";
import { loadRoutePage } from "./lib/routePageLoader.js";

// Public pages
import Home from "./pages/Home.jsx";
import LoginPage from "./pages/registration/LoginPage.jsx";
import SignUpPage from "./pages/registration/SignUpPage.jsx";
import ForgotPasswordPage from "./pages/registration/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/registration/ResetPasswordPage.jsx";
import EmailVerificationPage from "./pages/registration/EmailVerificationPage.jsx";
import EligibilityInfoPage from "./pages/registration/EligibilityInfoPage.jsx";
const ProfilePage = lazy(() => loadRoutePage(import("./pages/registration/ProfilePage.jsx")));

// Patients (privadas)
const PatientsPage = lazy(() => loadRoutePage(import("./pages/patientsrecord/PatientsPage.jsx")));
const PatientCreatePage = lazy(() => loadRoutePage(import("./pages/patientsrecord/PatientCreatePage.jsx")));
const PatientDetailPage = lazy(() => loadRoutePage(import("./pages/patientsrecord/PatientDetailPage.jsx")));
const PatientEditPage = lazy(() => loadRoutePage(import("./pages/patientsrecord/PatientEditPage.jsx")));
const SearchGlobalPatient = lazy(() => loadRoutePage(import("./pages/patientsrecord/SearchGlobalPatient.jsx")));

// Diagnósticos (privadas)
const DiagnosesByPatientPage = lazy(() => loadRoutePage(import("./pages/diagnosisrecord/DiagnosesByPatientPage.jsx")));
const DiagnosisCreatePage = lazy(() => loadRoutePage(import("./pages/diagnosisrecord/DiagnosisCreatePage.jsx")));
const DiagnosisDetailPage = lazy(() => loadRoutePage(import("./pages/diagnosisrecord/DiagnosisDetailPage.jsx")));
const DiagnosisEditPage = lazy(() => loadRoutePage(import("./pages/diagnosisrecord/DiagnosisEditPage.jsx")));

import RequireRole from "./components/auth/RequireRole.jsx";
const MyHealthState = lazy(() => loadRoutePage(import("./pages/docrecords/MyHealthState.jsx")));
const MyHealthStateDetail = lazy(() => loadRoutePage(import("./pages/docrecords/MyHealthStateDetail.jsx")));
import ChooseRole from "./pages/registration/ChooseRole.jsx";
const MyHealthInfo = lazy(() => loadRoutePage(import("./pages/docrecords/MyHealthInfo.jsx")));

const MyChildrenHome = lazy(() => loadRoutePage(import("./pages/docrecords/MyChildrenHome.jsx")));
const PatientAccessRequestsPage = lazy(() => loadRoutePage(import("./pages/docrecords/PatientAccessRequestsPage.jsx")));
const MyChildHealthInfo = lazy(() => loadRoutePage(import("./pages/docrecords/MyChildHealthInfo.jsx")));
const MyChildHealthState = lazy(() => loadRoutePage(import("./pages/docrecords/MyChildHealthState.jsx")));
const MyChildHealthStateDetail = lazy(() => loadRoutePage(import("./pages/docrecords/MyChildHealthStateDetail.jsx")));


const CalendarPage = lazy(() => loadRoutePage(import("./pages/calendar/CalendarPage.jsx")));



const WithNav = () => {
  const { user, isAuthenticated, isCheckingAuth, logout } = useAuthStore();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationTriggerRef = useRef(null);
  const toggleNavigation = useCallback(
    () => setNavigationOpen((open) => !open),
    [],
  );
  const closeNavigation = useCallback(() => setNavigationOpen(false), []);

  const [initialAuthResolved, setInitialAuthResolved] = useState(
    () => !isCheckingAuth,
  );

  useEffect(() => {
    if (!isCheckingAuth) setInitialAuthResolved(true);
  }, [isCheckingAuth]);

  const hasRoleNavigation =
    initialAuthResolved &&
    isAuthenticated &&
    user?.isVerified &&
    (user?.role === "doctor" || user?.role === "patient");

  useEffect(() => {
    if (!hasRoleNavigation) setNavigationOpen(false);
  }, [hasRoleNavigation]);

  const showDesktopSidebar = hasRoleNavigation && navigationOpen;

  return (
    <>
      <Navbar
        navigationOpen={hasRoleNavigation && navigationOpen}
        onToggleNavigation={toggleNavigation}
        onCloseNavigation={closeNavigation}
        navigationTriggerRef={navigationTriggerRef}
      />
      <div
        className={
          hasRoleNavigation ? "min-h-[calc(100vh-4rem)] lg:flex" : ""
        }
      >
        <div className={hasRoleNavigation ? "min-w-0 flex-1" : ""}>
          <Outlet />
        </div>
        <Sidebar
          open={showDesktopSidebar}
          role={hasRoleNavigation ? user.role : undefined}
          user={hasRoleNavigation ? user : undefined}
          logout={logout}
        />
      </div>
    </>
  );
};
const NoNav = () => <Outlet />;

export default function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    let alive = true;
    const stop = observeSessionChanges((event) => useAuthStore.getState().syncSession({ event }));
    void Promise.resolve(checkAuth()).then((result) => {
      if (alive && result?.status === "authenticated" && !result.synchronized && ownsValidation(result.record)) {
        announceInitialSession();
      }
    }).catch(() => {});
    return () => { alive = false; stop(); };
  }, [checkAuth]);

  return (
    <Routes>
      {/* Rutas sin navbar */}
      <Route element={<NoNav />}>
        {/* /verify-email: requiere sesión; permite SOLO a no verificados */}
        <Route
          path="/verify-email"
          element={
            <PrivateRoute>
              <EmailVerificationPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/reset-password/:token"
          element={
            <AuthOnlyRoute>
              <ResetPasswordPage />
            </AuthOnlyRoute>
          }
        />
      </Route>

      {/* Rutas con navbar */}
      <Route element={<WithNav />}>
        {/* Públicas */}
        <Route path="/" element={<Home />} />
        <Route path="/eligibility" element={<EligibilityInfoPage />} />
        <Route path="/choose-role" element={<ChooseRole />} />
        <Route
          path="/login"
          element={
            <AuthOnlyRoute>
              <LoginPage />
            </AuthOnlyRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <AuthOnlyRoute>
              <SignUpPage />
            </AuthOnlyRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <AuthOnlyRoute>
              <ForgotPasswordPage />
            </AuthOnlyRoute>
          }
        />

        {/* Privadas: requieren login + verificación */}
    <Route
          element={
            <PrivateRoute>
              <RequireVerified>
                <Outlet />
              </RequireVerified>
            </PrivateRoute>
          }
        >

      <Route element={ <RequireRole allowed={["doctor", "patient"]}><Outlet /></RequireRole>}>
        <Route path="/calendar" element={<RoutePageBoundary key="CalendarPage"><CalendarPage /></RoutePageBoundary>} />
      </Route>

          {/* Paciente: portal read-only */}
      <Route element={<RequireRole allowed={["patient"]}><Outlet /></RequireRole>}>
        <Route path="/docrecords/myhealthstate" element={<RoutePageBoundary key="MyHealthState"><MyHealthState /></RoutePageBoundary>} />
        <Route path="/docrecords/myhealthstate/:id" element={<RoutePageBoundary key="MyHealthStateDetail"><MyHealthStateDetail /></RoutePageBoundary>} />
        <Route path="/docrecords/myhealthinfo" element={<RoutePageBoundary key="MyHealthInfo"><MyHealthInfo /></RoutePageBoundary>} />
        <Route path="/docrecords/access-requests" element={<RoutePageBoundary key="PatientAccessRequestsPage"><PatientAccessRequestsPage /></RoutePageBoundary>} />
        <Route path="/docrecords/mychildren" element={<RoutePageBoundary key="MyChildrenHome"><MyChildrenHome /></RoutePageBoundary>} />
        <Route path="/docrecords/mychildren/:childId/health-info" element={<RoutePageBoundary key="MyChildHealthInfo"><MyChildHealthInfo /></RoutePageBoundary>} />
        <Route path="/docrecords/mychildren/:childId/health-state" element={<RoutePageBoundary key="MyChildHealthState"><MyChildHealthState /></RoutePageBoundary>} />
        <Route path="/docrecords/mychildren/:childId/health-state/:id" element={<RoutePageBoundary key="MyChildHealthStateDetail"><MyChildHealthStateDetail /></RoutePageBoundary>} />

      </Route>
          <Route path="/profile" element={<RoutePageBoundary key="ProfilePage"><ProfilePage /></RoutePageBoundary>} />
      <Route element={<RequireRole allowed={["doctor"]}><Outlet /></RequireRole>}>
          <Route path="/patients" element={<RoutePageBoundary key="PatientsPage"><PatientsPage /></RoutePageBoundary>} />
          <Route path="/patients/new" element={<RoutePageBoundary key="PatientCreatePage"><PatientCreatePage /></RoutePageBoundary>} />
          <Route path="/patients/:id" element={<RoutePageBoundary key="PatientDetailPage"><PatientDetailPage /></RoutePageBoundary>} />
          <Route path="/patients/:id/edit" element={<RoutePageBoundary key="PatientEditPage"><PatientEditPage /></RoutePageBoundary>} />
          <Route path="/diagnosis/patient/:patientId" element={<RoutePageBoundary key="DiagnosesByPatientPage"><DiagnosesByPatientPage /></RoutePageBoundary>} />
          <Route path="/diagnosis/patient/:patientId/new" element={<RoutePageBoundary key="DiagnosisCreatePage"><DiagnosisCreatePage /></RoutePageBoundary>} />
          <Route path="/diagnosis/patient/:patientId/:diagnosisId" element={<RoutePageBoundary key="DiagnosisDetailPage"><DiagnosisDetailPage /></RoutePageBoundary>} />
          <Route path="/diagnosis/patient/:patientId/:diagnosisId/edit" element={<RoutePageBoundary key="DiagnosisEditPage"><DiagnosisEditPage /></RoutePageBoundary>} />
          <Route path="/patients/search" element={<RoutePageBoundary key="SearchGlobalPatient"><SearchGlobalPatient /></RoutePageBoundary>} />
          <Route path="/patients/global/:id" element={<Navigate to="/patients/search" replace />} />
      </Route>
  </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
