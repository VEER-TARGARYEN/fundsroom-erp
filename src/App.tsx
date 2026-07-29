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
import { StubPage } from '@/components/StubPage'

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

          {/* Stitch screens whose backend is not built yet */}
          <Route
            path="reports"
            element={
              <StubPage
                title="Reports & Analytics"
                subtitle="Sales, customer and inventory analytics."
                icon="monitoring"
                planned={['Sales & inventory trend charts', 'Date-range comparisons', 'CSV / PDF export', 'AI-generated insights']}
              />
            }
          />
          <Route
            path="notifications"
            element={
              <StubPage
                title="Notifications"
                subtitle="Operational alerts and activity."
                icon="notifications"
                planned={['Unread inbox + grouping', 'Mark as read / mark all', 'Low-stock & challan alerts', 'Realtime push over WebSocket']}
              />
            }
          />
          <Route
            path="settings"
            element={
              <StubPage
                title="Settings"
                subtitle="Profile, security and workspace."
                icon="settings"
                planned={['Profile & appearance', 'Security & sessions', 'Workspace & team', 'AI preferences']}
              />
            }
          />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
