import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Boxes, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/app-layout";
import { AuthProvider, useAuth } from "@/lib/auth";
import Dashboard from "@/pages/Dashboard";
import Purchases from "@/pages/Purchases";
import Orders from "@/pages/Orders";
import Ledger from "@/pages/Ledger";
import Stock from "@/pages/Stock";
import DeliveryBoys from "@/pages/DeliveryBoys";
import Account from "@/pages/Account";

// Sign-in happens on the main site; this app only shows its pages to a signed-in distributor.
function Gate({ children }) {
  const { ready, error, notDistributor, logout } = useAuth();

  if (notDistributor || error) {
    return (
      <div className="grid min-h-svh place-items-center bg-background p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-6" />
          </div>
          <h1 className="text-lg font-semibold">{notDistributor ? "This portal is for distributors" : "Can't open the portal"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {notDistributor ? "You are signed in with an account that is not a distributor. Sign in with your distributor Login ID to continue." : error}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            {notDistributor && (
              <Button variant="outline" onClick={() => window.location.assign("/")}>
                Go to main site
              </Button>
            )}
            <Button onClick={logout}>Sign in again</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="grid min-h-svh place-items-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Boxes className="size-6" />
          </div>
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <AuthProvider>
        <TooltipProvider>
          <Gate>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="orders" element={<Orders />} />
                <Route path="purchases" element={<Purchases />} />
                <Route path="ledger" element={<Ledger />} />
                <Route path="stock" element={<Stock />} />
                <Route path="delivery-boys" element={<DeliveryBoys />} />
                <Route path="account" element={<Account />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Gate>
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
