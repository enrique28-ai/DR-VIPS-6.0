// src/App.jsx
import { useEffect } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "./stores/authStore.js";

// Guards
import AuthOnlyRoute from "./components/auth/AuthOnlyRoute.jsx";
import PrivateRoute from "./components/auth/PrivateRoute.jsx";
import RequireVerified from "./components/auth/RequireVerified.jsx";

// UI
import Navbar from "./components/Navbar.jsx";

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


const WithNav = () => (
  <>
    <Navbar />
    <Outlet />
  </>
);
const NoNav = () => <Outlet />;

export default function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 1) Si el usuario vuelve con la flecha atrás (bfcache), vuelve a consultar /me
  useEffect(() => {
    const onShow = (e) => {
      if (e.persisted) {
        // forzamos una verificación real de sesión
        useAuthStore.getState().checkAuth();
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // 2) Cuando la pestaña vuelve a estar visible, re-verifica también
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        useAuthStore.getState().checkAuth();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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
          {/* Paciente: portal read-only */}
   <Route element={<RequireRole allowed={["patient"]}><Outlet /></RequireRole>}>
     <Route path="/docrecords/myhealthstate" element={<MyHealthState />} />
     <Route path="/docrecords/myhealthstate/:id" element={<MyHealthStateDetail />} />
     <Route path="/docrecords/myhealthinfo" element={<MyHealthInfo />} />
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
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
