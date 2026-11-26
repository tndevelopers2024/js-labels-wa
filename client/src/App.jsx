import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ConfirmDialogProvider } from './context/ConfirmContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleGuard from './components/RoleGuard';
import AppLayout from './components/layout/AppLayout';
import ErrorBoundary from './components/ErrorBoundary';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import FollowUpDetails from './pages/FollowUpDetails';
import Customers from './pages/Customers';
import CustomerDetails from './pages/CustomerDetails';
import Orders from './pages/Orders';
import StatusOrders from './pages/StatusOrders';
import LostOrders from './pages/LostOrders';
import LostLeads from './pages/LostLeads';
import Products from './pages/Products';
import UniqueDimensions from './pages/UniqueDimensions';
import ProductIndustries from './pages/ProductIndustries';
import Production from './pages/Production';
import ProductionDimensionDetails from './pages/ProductionDimensionDetails';
import FollowUps from './pages/FollowUps';
import Reminders from './pages/Reminders';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Settings from './pages/Settings';

// Global error handlers to log unhandled errors & promise rejections cleanly in browser console
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[Global JS Error]:', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Global Unhandled Rejection]:', event.reason);
  });
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <NotificationProvider>
          <ConfirmDialogProvider>
            <BrowserRouter>
            <Routes>
              {/* Public Route */}
              <Route path="/login" element={<Login />} />

              {/* Protected Workspace Layout */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                
                <Route
                  path="/dashboard"
                  element={
                    <RoleGuard module="dashboard">
                      <Dashboard />
                    </RoleGuard>
                  }
                />

                <Route
                  path="/leads"
                  element={
                    <RoleGuard module="leads">
                      <Leads />
                    </RoleGuard>
                  }
                />

                <Route
                  path="/leads/lost"
                  element={
                    <RoleGuard module="leads">
                      <LostLeads />
                    </RoleGuard>
                  }
                />

                <Route
                  path="/lost-leads"
                  element={<Navigate to="/leads/lost" replace />}
                />

                <Route
                  path="/leads/:id/followup"
                  element={
                    <RoleGuard module="leads">
                      <FollowUpDetails />
                    </RoleGuard>
                  }
                />

                <Route
                  path="/customers"
                  element={
                    <RoleGuard module="customers">
                      <Customers />
                    </RoleGuard>
                  }
                />

                <Route
                  path="/customers/:id"
                  element={
                    <RoleGuard module="customers">
                      <CustomerDetails />
                    </RoleGuard>
                  }
                />

                <Route
                  path="/orders"
                  element={
                    <RoleGuard module="orders">
                      <Orders />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/orders/confirmed"
                  element={
                    <RoleGuard module="orders">
                      <StatusOrders status="confirmed" />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/orders/delivered"
                  element={
                    <RoleGuard module="orders">
                      <StatusOrders status="delivered" />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/orders/pending"
                  element={
                    <RoleGuard module="orders">
                      <StatusOrders status="pending" />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/orders/cancelled"
                  element={
                    <RoleGuard module="orders">
                      <StatusOrders status="cancelled" />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/orders/status/:status"
                  element={
                    <RoleGuard module="orders">
                      <StatusOrders />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/orders/lost"
                  element={<Navigate to="/leads/lost" replace />}
                />
                <Route
                  path="/lost-orders"
                  element={<Navigate to="/leads/lost" replace />}
                />
                <Route
                  path="/products"
                  element={
                    <RoleGuard module="products">
                      <Products />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/products/dimensions"
                  element={
                    <RoleGuard module="products">
                      <UniqueDimensions />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/products/industries"
                  element={
                    <RoleGuard module="products">
                      <ProductIndustries />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/unique-dimensions"
                  element={<Navigate to="/products/dimensions" replace />}
                />
                <Route
                  path="/industries"
                  element={<Navigate to="/products/industries" replace />}
                />
                <Route
                  path="/production"
                  element={
                    <RoleGuard module="production">
                      <Production />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/production/dimension/:dimensionKey"
                  element={
                    <RoleGuard module="production">
                      <ProductionDimensionDetails />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/production/dimensions/:dimensionKey"
                  element={
                    <RoleGuard module="production">
                      <ProductionDimensionDetails />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/followups"
                  element={
                    <RoleGuard module="followups">
                      <FollowUps />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/followups/:id"
                  element={
                    <RoleGuard module="followups">
                      <FollowUpDetails />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/reminders"
                  element={
                    <RoleGuard module="reminders">
                      <Reminders />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <RoleGuard module="reports">
                      <Reports />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <RoleGuard module="users">
                      <Users />
                    </RoleGuard>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <RoleGuard module="settings">
                      <Settings />
                    </RoleGuard>
                  }
                />
              </Route>

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </ConfirmDialogProvider>
      </NotificationProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
