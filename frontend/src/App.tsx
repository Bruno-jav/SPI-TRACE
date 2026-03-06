import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ScanProvider } from "@/contexts/ScanContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthGuard } from "@/components/guards/AuthGuard";
import { Spider } from "@/components/Spider";
import { useAuth } from "@/contexts/AuthContext";

function SpiderWrapper() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const showOnLanding = location.pathname === '/';
  return !isAuthenticated || showOnLanding ? <Spider /> : null;
}

// Pages
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import AdminSignIn from "./pages/admin/AdminSignIn";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Settings from "./pages/Settings";
import About from "./pages/About";
import SessionHistory from "./pages/SessionHistory";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminLinks from "./pages/admin/AdminLinks";
import AdminHistory from "./pages/admin/AdminHistory";
import AdminScanSettings from "./pages/admin/AdminScanSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ScanProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
            <SpiderWrapper />
            <Routes>
              {/* Landing page */}
              <Route path="/" element={<Landing />} />
              
              {/* Public Auth Routes */}
              <Route path="/signin" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/about" element={<About />} />
              <Route path="/session-history" element={<SessionHistory />} />
              
              {/* Admin Sign In - No guard, public route but admin only */}
              <Route path="/admin/signin" element={<AdminSignIn />} />
              
              {/* Client protected routes */}
              <Route
                path="/dashboard"
                element={
                  <AuthGuard allowedRoles={['client']}>
                    <Dashboard />
                  </AuthGuard>
                }
              />
              <Route
                path="/history"
                element={
                  <AuthGuard allowedRoles={['client']}>
                    <History />
                  </AuthGuard>
                }
              />
              <Route
                path="/settings"
                element={
                  <AuthGuard allowedRoles={['client']}>
                    <Settings />
                  </AuthGuard>
                }
              />
              <Route
                path="/admin"
                element={
                  <AuthGuard allowedRoles={['admin']}>
                    <AdminDashboard />
                  </AuthGuard>
                }
              />
              <Route
                path="/admin/links"
                element={
                  <AuthGuard allowedRoles={['admin']}>
                    <AdminLinks />
                  </AuthGuard>
                }
              />
              <Route
                path="/admin/history"
                element={
                  <AuthGuard allowedRoles={['admin']}>
                    <AdminHistory />
                  </AuthGuard>
                }
              />
              <Route
                path="/admin/scan-settings"
                element={
                  <AuthGuard allowedRoles={['admin']}>
                    <AdminScanSettings />
                  </AuthGuard>
                }
              />
              
              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ScanProvider>
      </AuthProvider>
    </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
