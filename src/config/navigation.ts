import type { Role } from '@/types/api'

export interface NavItem {
  label: string
  path: string
  icon: string
  roles: Role[]
  section: 'main' | 'ai' | 'system'
  /** No backend yet — routes to a "Backend Pending" stub. */
  stub?: boolean
}

const ALL: Role[] = ['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS']

export const NAV: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: 'grid_view', roles: ALL, section: 'main' },
  { label: 'Customers', path: '/customers', icon: 'groups', roles: ['ADMIN', 'SALES', 'ACCOUNTS'], section: 'main' },
  { label: 'Products', path: '/products', icon: 'inventory_2', roles: ['ADMIN', 'SALES', 'WAREHOUSE'], section: 'main' },
  { label: 'Inventory', path: '/inventory', icon: 'swap_vert', roles: ['ADMIN', 'WAREHOUSE'], section: 'main' },
  { label: 'Sales Challans', path: '/challans', icon: 'receipt_long', roles: ['ADMIN', 'SALES', 'ACCOUNTS'], section: 'main' },

  { label: 'AI Assistant', path: '/ai', icon: 'auto_awesome', roles: ['ADMIN', 'SALES', 'ACCOUNTS'], section: 'ai' },

  { label: 'Reports', path: '/reports', icon: 'monitoring', roles: ['ADMIN', 'ACCOUNTS'], section: 'system', stub: true },
  { label: 'Notifications', path: '/notifications', icon: 'notifications', roles: ALL, section: 'system', stub: true },
  { label: 'Settings', path: '/settings', icon: 'settings', roles: ALL, section: 'system', stub: true },
]

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role))
}
