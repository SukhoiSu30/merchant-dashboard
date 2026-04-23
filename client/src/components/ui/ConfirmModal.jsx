import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'primary'
  loading = false,
}) {
  if (!open) return null;

  const variants = {
    danger: {
      icon: 'bg-danger-50 text-danger-600',
      button: 'bg-danger-600 hover:bg-danger-700 text-white',
    },
    warning: {
      icon: 'bg-warning-50 text-warning-600',
      button: 'bg-warning-600 hover:bg-warning-700 text-white',
    },
    primary: {
      icon: 'bg-primary-50 text-primary-600',
      button: 'bg-primary-600 hover:bg-primary-700 text-white',
    },
  };

  const v = variants[variant] || variants.danger;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 modal-backdrop bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className={`w-12 h-12 rounded-full ${v.icon} flex items-center justify-center mx-auto mb-4`}>
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-gray-500">{message}</p>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${v.button}`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
