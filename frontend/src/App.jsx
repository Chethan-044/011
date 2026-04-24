import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import { ExtensionStreamProvider } from './context/ExtensionStreamContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import AnalysisPage from './pages/AnalysisPage.jsx';
import TrendsPage from './pages/TrendsPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import AdminLoginPage from './pages/AdminLoginPage.jsx';
import AdminRegisterPage from './pages/AdminRegisterPage.jsx';
import AdminDashboardPage from './pages/AdminDashboardPage.jsx';

function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar />
      <main className="pt-16 max-w-7xl mx-auto px-4 pb-12">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <ExtensionStreamProvider>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppShell>
                <DashboardPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <AppShell>
                <UploadPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/analysis/:batchId"
          element={
            <ProtectedRoute>
              <AppShell>
                <AnalysisPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/trends"
          element={
            <ProtectedRoute>
              <AppShell>
                <TrendsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <AppShell>
                <ReportsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        {/* Admin Dashboard with separate auth */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/register" element={<AdminRegisterPage />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AppShell>
                <AdminDashboardPage />
              </AppShell>
            </AdminRoute>
          }
        />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ExtensionStreamProvider>
  );
}

