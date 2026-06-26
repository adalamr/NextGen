import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { RootState } from '../../store';
import { removeNotification } from '../../store/slices/ui.slice';

const ICONS = {
  success: <CheckCircle className="text-green-500" size={18} />,
  error: <XCircle className="text-red-500" size={18} />,
  warning: <AlertCircle className="text-yellow-500" size={18} />,
  info: <Info className="text-blue-500" size={18} />,
};

export default function NotificationToast() {
  const dispatch = useDispatch();
  const notifications = useSelector((state: RootState) => state.ui.notifications);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {notifications.map((notif) => (
        <AutoDismissToast key={notif.id} notif={notif} onDismiss={() => dispatch(removeNotification(notif.id))} />
      ))}
    </div>
  );
}

function AutoDismissToast({
  notif,
  onDismiss,
}: {
  notif: { id: string; type: 'success' | 'error' | 'warning' | 'info'; message: string };
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="flex items-center gap-3 bg-white rounded-lg shadow-lg border border-gray-200 px-4 py-3 min-w-64 max-w-sm">
      {ICONS[notif.type]}
      <p className="text-sm text-gray-700 flex-1">{notif.message}</p>
      <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600">
        <X size={16} />
      </button>
    </div>
  );
}
