import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PlatformAuthProvider } from "@/contexts/PlatformAuthContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { BotProvider } from "@/modules/bot/BotProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import { SoundOnOperationProvider } from "@/contexts/SoundOnOperationContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import LoginPage from "./pages/Login";
import DashboardPage from "./pages/Dashboard";
import BotConfigPage from "./pages/BotConfig";
import CreateStrategyPage from "./pages/CreateStrategy";
import AdminUsersPage from "./pages/admin/AdminUsers";
import WebhookAdminPage from "./pages/admin/WebhookAdmin";
import PlansAdminPage from "./pages/admin/PlansAdmin";
import UserRankingPage from "./pages/admin/UserRanking";
import AdminGeminiPromptPage from "./pages/admin/AdminGeminiPrompt";
import AdminPwaNotificationsPage from "./pages/admin/AdminPwaNotifications";
import AdminEmailPage from "./pages/admin/AdminEmail";
import AdminLinksPage from "./pages/admin/AdminLinks";
import NotificationsPage from "./pages/Notifications";
import RankingPage from "./pages/Ranking";
import MyProfilePage from "./pages/MyProfile";
import NotFound from "./pages/NotFound";
import PlansLanding from "./pages/PlansLanding";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformAuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/planos" element={<PlansLanding />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AuthProvider>
                    <BotProvider>
                      <SoundOnOperationProvider>
                        <AppLayout>
                          <Routes>
                            <Route path="/" element={<DashboardPage />} />
                            <Route path="/bot-config" element={<BotConfigPage />} />
                            <Route path="/criar-estrategia" element={<CreateStrategyPage />} />
                            <Route path="/notificacoes" element={<NotificationsPage />} />
                            <Route path="/ranking" element={<RankingPage />} />
                            <Route path="/meu-perfil" element={<MyProfilePage />} />
                            <Route path="/admin/usuarios" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
                            <Route path="/admin/ranking" element={<AdminRoute><UserRankingPage /></AdminRoute>} />
                            <Route path="/admin/planos" element={<AdminRoute><PlansAdminPage /></AdminRoute>} />
                            <Route path="/admin/webhooks" element={<AdminRoute><WebhookAdminPage /></AdminRoute>} />
                            <Route path="/admin/gemini-prompt" element={<AdminRoute><AdminGeminiPromptPage /></AdminRoute>} />
                            <Route path="/admin/notificacoes-pwa" element={<AdminRoute><AdminPwaNotificationsPage /></AdminRoute>} />
                            <Route path="/admin/email" element={<AdminRoute><AdminEmailPage /></AdminRoute>} />
                            <Route path="/admin/links" element={<AdminRoute><AdminLinksPage /></AdminRoute>} />
                            <Route path="/admin" element={<AdminRoute><Navigate to="/admin/usuarios" replace /></AdminRoute>} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </AppLayout>
                      </SoundOnOperationProvider>
                    </BotProvider>
                  </AuthProvider>
                </ProtectedRoute>
              }
            />
          </Routes>
        </PlatformAuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
