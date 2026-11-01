import { Fragment, lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { PageLoading } from "./components/ui";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { AppLayout } from "./layouts/AppLayout";
import { GuestOnly, HomeRedirect, RequireAuth } from "./routes/guards";

// pages load on demand to keep the first download small
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const VerifyEmailPage = lazy(() => import("./pages/auth/VerifyEmailPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const OpportunitiesPage = lazy(() => import("./pages/OpportunitiesPage"));
const OpportunityDetailPage = lazy(() => import("./pages/OpportunityDetailPage"));
const ApplicationsPage = lazy(() => import("./pages/ApplicationsPage"));
const TeamsPage = lazy(() => import("./pages/TeamsPage"));
const TeamDetailPage = lazy(() => import("./pages/TeamDetailPage"));
const CareerPage = lazy(() => import("./pages/CareerPage"));
const AssistantPage = lazy(() => import("./pages/AssistantPage"));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage"));
const AdminOpportunitiesPage = lazy(() => import("./pages/admin/AdminOpportunitiesPage"));
const AdminApplicationsPage = lazy(() => import("./pages/admin/AdminApplicationsPage"));
const AdminStudentsPage = lazy(() => import("./pages/admin/AdminStudentsPage"));
const AdminTeamsPage = lazy(() => import("./pages/admin/AdminTeamsPage"));
const AdminActivityPage = lazy(() => import("./pages/admin/AdminActivityPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

/**
 * Everything inside is rebuilt from scratch whenever the signed-in account changes (login,
 * logout, or a switch made in another tab), so no page, form, chat or notification list
 * from the previous account can survive on screen.
 */
function SessionBoundary({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <Fragment key={user?.id ?? "signed-out"}>{children}</Fragment>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SessionBoundary>
            <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/" element={<HomeRedirect />} />

                {/* public */}
                <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
                <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
                <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />

                {/* mandatory onboarding for new students */}
                <Route path="/onboarding" element={<RequireAuth role="STUDENT" onboarding="pending"><OnboardingPage /></RequireAuth>} />

                {/* student area */}
                <Route element={<RequireAuth role="STUDENT"><AppLayout /></RequireAuth>}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/opportunities" element={<OpportunitiesPage />} />
                  <Route path="/opportunities/:id" element={<OpportunityDetailPage />} />
                  <Route path="/applications" element={<ApplicationsPage />} />
                  <Route path="/teams" element={<TeamsPage />} />
                  <Route path="/teams/:id" element={<TeamDetailPage />} />
                  <Route path="/career" element={<CareerPage />} />
                  <Route path="/assistant" element={<AssistantPage />} />
                </Route>

                {/* administrator area */}
                <Route element={<RequireAuth role="ADMIN"><AppLayout /></RequireAuth>}>
                  <Route path="/admin" element={<AdminDashboardPage />} />
                  <Route path="/admin/opportunities" element={<AdminOpportunitiesPage />} />
                  <Route path="/admin/applications" element={<AdminApplicationsPage />} />
                  <Route path="/admin/students" element={<AdminStudentsPage />} />
                  <Route path="/admin/teams" element={<AdminTeamsPage />} />
                  <Route path="/admin/activity" element={<AdminActivityPage />} />
                </Route>

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </SessionBoundary>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
