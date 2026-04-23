import { Inbox, Search, FileText, AlertTriangle, Shield, CreditCard } from 'lucide-react';

const icons = {
  default: Inbox,
  search: Search,
  file: FileText,
  alert: AlertTriangle,
  security: Shield,
  payment: CreditCard,
};

export default function EmptyState({
  icon = 'default',
  title = 'No data found',
  description = '',
  action,
  actionLabel,
}) {
  const Icon = icons[icon] || icons.default;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
        <Icon size={28} className="text-gray-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 text-center max-w-sm">{description}</p>}
      {action && actionLabel && (
        <button
          onClick={action}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
