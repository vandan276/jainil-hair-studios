import React, { useState, useEffect } from "react";
import { useLocation, BrowserRouter, Routes, Route } from "react-router-dom";
import "@/App.css";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { LanguageProvider } from "@/context/LanguageContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProtectedRoute from "@/components/ProtectedRoute";
import FloatingActions from "@/components/FloatingActions";
import api from "@/lib/api";

import Landing from "@/pages/Landing";
import Book from "@/pages/Book";
import Shop from "@/pages/Shop";
import ProductDetail from "@/pages/ProductDetail";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Admin from "@/pages/Admin";
import Men from "@/pages/Men";
import SalesPanel from "@/pages/SalesPanel";
import Consultancy from "@/pages/Consultancy";
import AttendanceVerify from "@/pages/AttendanceVerify";
import ServicePanel from "@/pages/ServicePanel";
import ReceptionistPanel from "@/pages/ReceptionistPanel";
import Maintenance from "@/pages/Maintenance";
import Billing from "@/pages/Billing";

function Layout({ children }) {
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const isStaffArea = location.pathname.startsWith("/admin") || 
                      location.pathname.startsWith("/sales-panel") || 
                      location.pathname.startsWith("/receptionist-panel") || 
                      location.pathname.startsWith("/service-panel") ||
                      location.pathname.startsWith("/billing");

  return (
    <>
      <Navbar />
      <main className={`${isLanding ? "pt-0" : "pt-20"} min-h-screen bg-section-pattern`}>
        {children}
      </main>
      <Footer />
      {!isStaffArea && <FloatingActions />}
    </>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Force instant scroll to top on every route change
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.body.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

function AppContent() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [checkingMaintenance, setCheckingMaintenance] = useState(true);

  useEffect(() => {
    api.get("/maintenance")
      .then(res => {
        setMaintenanceEnabled(!!res.data?.enabled);
      })
      .catch(() => {})
      .finally(() => setCheckingMaintenance(false));
  }, []);

  if (checkingMaintenance || loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-eminence-gold border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isStaff = user && ["admin", "receptionist", "sales", "service", "employee"].includes(user.role);
  const isBypassPath = location.pathname === "/login" || 
                       location.pathname.startsWith("/admin") || 
                       location.pathname.startsWith("/sales-panel") || 
                       location.pathname.startsWith("/receptionist-panel") || 
                       location.pathname.startsWith("/service-panel") ||
                       location.pathname.startsWith("/billing");

  if (maintenanceEnabled && !isStaff && !isBypassPath) {
    return <Maintenance />;
  }

  return (
    <Routes location={location} key={location.pathname}>
      <Route path="/" element={<Layout><Men /></Layout>} />
      <Route path="/landing" element={<Layout><Landing /></Layout>} />
      <Route path="/men" element={<Layout><Men /></Layout>} />
      <Route path="/book" element={<Layout><ProtectedRoute><Book /></ProtectedRoute></Layout>} />
      <Route path="/shop" element={<Layout><Shop /></Layout>} />
      <Route path="/shop/:id" element={<Layout><ProductDetail /></Layout>} />
      <Route path="/cart" element={<Layout><Cart /></Layout>} />
      <Route path="/checkout" element={<Layout><ProtectedRoute><Checkout /></ProtectedRoute></Layout>} />
      <Route path="/login" element={<Layout><Login /></Layout>} />
      <Route path="/register" element={<Layout><Register /></Layout>} />
      <Route path="/dashboard" element={<Layout><ProtectedRoute><Dashboard /></ProtectedRoute></Layout>} />
      <Route path="/admin/*" element={<Layout><ProtectedRoute adminOnly><Admin /></ProtectedRoute></Layout>} />
      <Route path="/sales-panel" element={<Layout><ProtectedRoute><SalesPanel /></ProtectedRoute></Layout>} />
      <Route path="/service-panel" element={<Layout><ProtectedRoute serviceOnly><ServicePanel /></ProtectedRoute></Layout>} />
      <Route path="/receptionist-panel" element={<Layout><ProtectedRoute receptionistOnly><ReceptionistPanel /></ProtectedRoute></Layout>} />
      <Route path="/billing" element={<Layout><ProtectedRoute><Billing /></ProtectedRoute></Layout>} />
      <Route path="/consultancy" element={<Layout><ProtectedRoute><Consultancy /></ProtectedRoute></Layout>} />
      <Route path="/attendance-verify" element={<Layout><ProtectedRoute><AttendanceVerify /></ProtectedRoute></Layout>} />
    </Routes>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Toaster position="top-right" theme="light" toastOptions={{ style: { background: "#FFFFFF", color: "#1A1A1A", border: "1px solid #E5DED3" } }} />
            <AppContent />
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
