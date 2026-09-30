import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Header from "./header";
import About from "./frnt_about";
import ModelsPage from "./frnt_select_model";
import ProfilePage from "./frnt_user";

// Model-scoped layout + pages
import ModelLayout from "./pages/ModelLayout";
import OverviewPage from "./pages/OverViewPage";
import DataPage from "./pages/DataPage";
import ConfigPage from "./pages/ConfigPage";
import RunPage from "./pages/RunPage";
import ResultsPage from "./pages/ResultsPage";
import VizPage from "./pages/VizPage";

// ✅ NEW auth/admin pages + guards
import Login from "./login/Login";
import Register from "./login/Register";
import VerifyEmail from "./login/VerifyEmail";
import ForgotPassword from "./login/ForgotPassword";
import ResetPassword from "./login/ResetPassword";
import DeleteAccountConfirm from "./login/DeleteAccountConfirm";
import PendingApproval from "./login/PendingApproval";
import AdminUsers from "./login/AdminUsers";
import ProtectedRoute from "./components/ProtectedRoute";
import RequireAdmin from "./components/RequireAdmin";
import Footer from "./components/Footer";

import "./App.css";
import "./index.css";

export default function App() {
  return (
    <Router>
      <Header />
      <main className="min-h-screen bg-gray-50 text-gray-800">
        <Routes>
          {/* ✅ Public routes */}
          <Route path="/" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email/:token" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/delete-account/:token" element={<DeleteAccountConfirm />} />
          <Route path="/pending-approval" element={<PendingApproval />} />

          {/* ✅ Models list can be public OR protected.
              If you want it protected, move it inside <ProtectedRoute /> below. */}
          <Route path="/models" element={<ModelsPage />} />

          {/* ✅ Admin route */}
          <Route
            path="/admin/users"
            element={
              <RequireAdmin>
                <AdminUsers />
              </RequireAdmin>
            }
          />

          {/* ✅ Protected (auth required) */}
          <Route element={<ProtectedRoute />}>
          <Route path="profile" element={<ProfilePage />} />
            {/* All model-specific routes live under :modelId */}
            <Route path="/:modelId" element={<ModelLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<OverviewPage />} />
              <Route path="data" element={<DataPage />} />
              <Route path="config" element={<ConfigPage />} />
              <Route path="run" element={<RunPage />} />
              <Route path="results" element={<ResultsPage />} />
              <Route path="viz" element={<VizPage />} />

            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </Router>
  );
}
