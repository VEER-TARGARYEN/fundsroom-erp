import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from '@/features/auth/LoginPage'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth, RequireRole, NotFound } from '@/components/guards'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { CustomersPage } from '@/features/customers/CustomersPage'
import { ProductsPage } from '@/features/products/ProductsPage'
import { InventoryPage } from '@/features/inventory/InventoryPage'
import { ChallansPage } from '@/features/challans/ChallansPage'
import { AIPage } from '@/features/ai/AIPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />

          <Route
            path="customers"
            element={
              <RequireRole roles={['ADMIN', 'SALES', 'ACCOUNTS']}>
                <CustomersPage />
              </RequireRole>
            }
          />
          <Route
            path="products"
            element={
              <RequireRole roles={['ADMIN', 'SALES', 'WAREHOUSE']}>
                <ProductsPage />
              </RequireRole>
            }
          />
          <Route
            path="inventory"
            element={
              <RequireRole roles={['ADMIN', 'WAREHOUSE']}>
                <InventoryPage />
              </RequireRole>
            }
          />
          <Route
            path="challans"
            element={
              <RequireRole roles={['ADMIN', 'SALES', 'ACCOUNTS']}>
                <ChallansPage />
              </RequireRole>
            }
          />

          {/* AI copilot — grounded in live ERP data (WAREHOUSE excluded: surfaces CRM/financials) */}
          <Route
            path="ai"
            element={
              <RequireRole roles={['ADMIN', 'SALES', 'ACCOUNTS']}>
                <AIPage />
              </RequireRole>
            }
          />

          {/* Reports — analytics available to any role that can see the underlying data */}
          <Route path="reports" element={<ReportsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
