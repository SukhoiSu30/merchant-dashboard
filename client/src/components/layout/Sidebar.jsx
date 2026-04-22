import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, ShoppingCart, ArrowLeftRight, RotateCcw, Users,
  Settings, Shield, Bell, FileText, CreditCard, Webhook, ChevronDown,
  ChevronRight, Zap, AlertTriangle
} from 'lucide-react';
import { useState } from 'react';

const navGroups = [
  {
    label: 'Overview',
    items: [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', module: 'dashboard' },
    ],
  },
  {
    label: 'Payments',
    items: [
      { path: '/orders', icon: ShoppingCart, label: 'Orders', module: 'orders' },
      { path: '/transactions', icon: ArrowLeftRight, label: 'Transactions', module: 'orders' },
      { path: '/refunds', icon: RotateCcw, label: 'Refunds', module: 'refunds' },
      { path: '/chargebacks', icon: AlertTriangle, label: 'Chargebacks', module: 'chargebacks' },
      { path: '/mandates', icon: CreditCard, label: 'Mandates', module: 'mandates' },
    ],
  },
  {
    label: 'PG Control',
    items: [
      { path: '/gateways', icon: Zap, label: 'Gateways', module: 'gateways' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { path: '/alerts', icon: Bell, label: 'Alerts', module: 'monitoring' },
      { path: '/reports', icon: FileText, label: 'Reports', module: 'monitoring' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { path: '/users', icon: Users, label: 'Users', module: 'users' },
      { path: '/settings', icon: Settings, label: 'Settings', module: 'settings' },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState(
    navGroups.reduce((acc, g) => ({ ...acc, [g.label]: true }), {})
  );

  const toggleGroup = (label) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside className={`fixed left-0 top-0 h-full bg-sidebar-bg text-white z-30 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'} flex flex-col`}>
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center font-bold text-sm">JP</div>
            <span className="font-semibold text-lg">JusPay</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center font-bold text-sm mx-auto">JP</div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(item => hasPermission(item.module));
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} className="mb-2">
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300"
                >
                  {group.label}
                  {expandedGroups[group.label] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              )}
              {(collapsed || expandedGroups[group.label]) && (
                <div className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'bg-sidebar-active text-white font-medium'
                            : 'text-gray-300 hover:bg-sidebar-hover hover:text-white'
                        } ${collapsed ? 'justify-center' : ''}`
                      }
                      title={collapsed ? item.label : undefined}
                    >
                      <item.icon size={18} />
                      {!collapsed && <span>{item.label}</span>}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="h-12 flex items-center justify-center border-t border-white/10 text-gray-400 hover:text-white transition-colors"
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} className="rotate-90" />}
      </button>
    </aside>
  );
}
