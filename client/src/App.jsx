import { Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import RefundsPage from './pages/RefundsPage';
import TransactionsPage from './pages/TransactionsPage';
import ChargebacksPage from './pages/ChargebacksPage';
import MandatesPage from './pages/MandatesPage';
import GatewaysPage from './pages/GatewaysPage';
import UsersPage from './pages/UsersPage';
import PlaceholderPage from './pages/PlaceholderPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className={`transition-all duration-300 ${collapsed ? 'ml-16' : 'ml-64'}`}>
        <Header />
        <main className="p-6">
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/refunds" element={<RefundsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/chargebacks" element={<ChargebacksPage />} />
            <Route path="/mandates" element={<MandatesPage />} />
            <Route path="/gateways" element={<GatewaysPage />} />
            <Route path="/alerts" element={<PlaceholderPage title="Monitoring Alerts" description="Alert configuration coming in Phase 6" />} />
            <Route path="/reports" element={<PlaceholderPage title="Reports" description="Report generation coming in Phase 6" />} />
            <Route path="/settings" element={<PlaceholderPage title="Settings" description="General settings coming in Phase 5" />} />
            <Route path="/security" element={<PlaceholderPage title="Security" description="Security settings coming in Phase 5" />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
