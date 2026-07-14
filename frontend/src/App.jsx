// src/App.jsx
import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "./stores/authStore.js";

// Guards
import AuthOnlyRoute from "./components/auth/AuthOnlyRoute.jsx";
import PrivateRoute from "./components/auth/PrivateRoute.jsx";
import RequireVerified from "./components/auth/RequireVerified.jsx";

// UI
import Navbar from "./components/Navbar.jsx";
import Sidebar from "./components/layout/Sidebar.jsx";

// Public pages
import Home from "./pages/Home.jsx";
import LoginPage from "./pages/registration/LoginPage.jsx";
import SignUpPage from "./pages/registration/SignUpPage.jsx";
import ForgotPasswordPage from "./pages/registration/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/registration/ResetPasswordPage.jsx";
import EmailVerificationPage from "./pages/registration/EmailVerificationPage.jsx";
import EligibilityInfoPage from "./pages/registration/EligibilityInfoPage.jsx";
import ProfilePage from "./pages/registration/ProfilePage.jsx";

// Patients (privadas)
import PatientsPage from "./pages/patientsrecord/PatientsPage.jsx";
import PatientCreatePage from "./pages/patientsrecord/PatientCreatePage.jsx";
import PatientDetailPage from "./pages/patientsrecord/PatientDetailPage.jsx";
import PatientEditPage from "./pages/patientsrecord/PatientEditPage.jsx";
import SearchGlobalPatient from "./pages/patientsrecord/SearchGlobalPatient.jsx";
import GlobalPatientDetailPage from "./pages/patientsrecord/GlobalPatientDetailPage.jsx";

// Diagnósticos (privadas)
import DiagnosesByPatientPage from "./pages/diagnosisrecord/DiagnosesByPatientPage.jsx";
import DiagnosisCreatePage   from "./pages/diagnosisrecord/DiagnosisCreatePage.jsx";
import DiagnosisDetailPage   from "./pages/diagnosisrecord/DiagnosisDetailPage.jsx";
import DiagnosisEditPage     from "./pages/diagnosisrecord/DiagnosisEditPage.jsx";

import RequireRole from "./components/auth/RequireRole.jsx";
import MyHealthState from "./pages/docrecords/MyHealthState.jsx";
import MyHealthStateDetail from "./pages/docrecords/MyHealthStateDetail.jsx";
import ChooseRole from "./pages/registration/ChooseRole.jsx";
import MyHealthInfo from "./pages/docrecords/MyHealthInfo.jsx";

import MyChildrenHome from "./pages/docrecords/MyChildrenHome.jsx";
import MyChildHealthInfo from "./pages/docrecords/MyChildHealthInfo.jsx";
import MyChildHealthState from "./pages/docrecords/MyChildHealthState.jsx";
import MyChildHealthStateDetail from "./pages/docrecords/MyChildHealthStateDetail.jsx";


import CalendarPage from "./pages/calendar/CalendarPage.jsx";



const WithNav = () => {
  const { user, isAuthenticated, isCheckingAuth, logout } = useAuthStore();

  const [initialAuthResolved, setInitialAuthResolved] = useState(
    () => !isCheckingAuth,
  );

  useEffect(() => {
    if (!isCheckingAuth) setInitialAuthResolved(true);
  }, [isCheckingAuth]);

  const showDesktopSidebar =
    initialAuthResolved &&
    isAuthenticated &&
    user?.isVerified &&
    (user?.role === "doctor" || user?.role === "patient");

  return (
    <>
      <Navbar />
      <div
        className={
          showDesktopSidebar ? "min-h-[calc(100vh-4rem)] lg:flex" : ""
        }
      >
        <Sidebar
          role={showDesktopSidebar ? user.role : undefined}
          user={showDesktopSidebar ? user : undefined}
          logout={logout}
        />
        <div className={showDesktopSidebar ? "min-w-0 flex-1" : ""}>
          <Outlet />
        </div>
      </div>
    </>
  );
};
const NoNav = () => <Outlet />;

export default function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Auth re-checks on pageshow/visibilitychange removed to avoid
  // guest /auth/me spam. PrivateRoute handles its own revalidation.

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
        <Route path="/calendar" element={<CalendarPage />} />
      </Route>

          {/* Paciente: portal read-only */}
      <Route element={<RequireRole allowed={["patient"]}><Outlet /></RequireRole>}>
        <Route path="/docrecords/myhealthstate" element={<MyHealthState />} />
        <Route path="/docrecords/myhealthstate/:id" element={<MyHealthStateDetail />} />
        <Route path="/docrecords/myhealthinfo" element={<MyHealthInfo />} />
        <Route path="/docrecords/mychildren" element={<MyChildrenHome />} />
        <Route path="/docrecords/mychildren/:childId/health-info" element={<MyChildHealthInfo />} />
        <Route path="/docrecords/mychildren/:childId/health-state" element={<MyChildHealthState />} />
        <Route path="/docrecords/mychildren/:childId/health-state/:id" element={<MyChildHealthStateDetail />} />

      </Route>
          <Route path="/profile" element={<ProfilePage />} />
      <Route element={<RequireRole allowed={["doctor"]}><Outlet /></RequireRole>}>
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/patients/new" element={<PatientCreatePage />} />
          <Route path="/patients/:id" element={<PatientDetailPage />} />
          <Route path="/patients/:id/edit" element={<PatientEditPage />} />
          <Route path="/diagnosis/patient/:patientId" element={<DiagnosesByPatientPage />} />
          <Route path="/diagnosis/patient/:patientId/new" element={<DiagnosisCreatePage />} />
          <Route path="/diagnosis/patient/:patientId/:diagnosisId" element={<DiagnosisDetailPage />} />
          <Route path="/diagnosis/patient/:patientId/:diagnosisId/edit" element={<DiagnosisEditPage />} />
          <Route path="/patients/search" element={<SearchGlobalPatient />} />
          <Route path="/patients/global/:id" element={<GlobalPatientDetailPage />} />
      </Route>
  </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
