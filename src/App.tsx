import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from '@/features/auth/LoginPage'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth, RequireRole, NotFound } from '@/components/guards'

/**
 * Feature pages are split into their own chunks so the first paint only ships
 * the shell, the login screen and whichever page was actually requested. On the
 * free tier this matters twice over: less to download, and less to parse on a
 * cold, throttled connection.
 *
 * Each page is a named export, hence the `.then` re-map to a default export.
 * `AppShell` wraps its <Outlet /> in Suspense, so the sidebar and header stay on
 * screen while a page chunk streams in.
 */
const lazyPage = <T extends Record<string, React.ComponentType<unknown>>>(
  loader: () => Promise<T>,
  name: keyof T,
) => lazy(() => loader().then((m) => ({ default: m[name] })))

const DashboardPage = lazyPage(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage')
const CustomersPage = lazyPage(() => import('@/features/customers/CustomersPage'), 'CustomersPage')
const ProductsPage = lazyPage(() => import('@/features/products/ProductsPage'), 'ProductsPage')
const InventoryPage = lazyPage(() => import('@/features/inventory/InventoryPage'), 'InventoryPage')
const ChallansPage = lazyPage(() => import('@/features/challans/ChallansPage'), 'ChallansPage')
const AIPage = lazyPage(() => import('@/features/ai/AIPage'), 'AIPage')
const ReportsPage = lazyPage(() => import('@/features/reports/ReportsPage'), 'ReportsPage')
const NotificationsPage = lazyPage(
  () => import('@/features/notifications/NotificationsPage'),
  'NotificationsPage',
)
const SettingsPage = lazyPage(() => import('@/features/settings/SettingsPage'), 'SettingsPage')

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
