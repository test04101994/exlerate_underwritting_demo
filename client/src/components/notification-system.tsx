import { useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
}

interface NotificationSystemProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

export function NotificationSystem({ notifications, onDismiss }: NotificationSystemProps) {
  useEffect(() => {
    // Auto-dismiss notifications after 5 seconds
    const timers = notifications.map(notification => {
      const timer = setTimeout(() => {
        onDismiss(notification.id);
      }, 5000);
      
      return { id: notification.id, timer };
    });

    return () => {
      timers.forEach(({ timer }) => clearTimeout(timer));
    };
  }, [notifications.length, onDismiss]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return 'fas fa-check-circle';
      case 'error':
        return 'fas fa-exclamation-circle';
      case 'warning':
        return 'fas fa-exclamation-triangle';
      case 'info':
        return 'fas fa-info-circle';
      default:
        return 'fas fa-bell';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-success text-white';
      case 'error':
        return 'bg-error text-white';
      case 'warning':
        return 'bg-warning text-white';
      case 'info':
        return 'bg-primary text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  return (
    <div className="fixed top-4 right-4 space-y-2 z-50">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`${getNotificationColor(notification.type)} rounded-lg p-3 shadow-lg animate-slide-in-right max-w-sm`}
        >
          <div className="flex items-start space-x-2">
            <i className={`${getNotificationIcon(notification.type)} mt-0.5`}></i>
            <div className="flex-1">
              <p className="text-sm font-medium">{notification.title}</p>
              <p className="text-xs opacity-90">{notification.message}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDismiss(notification.id)}
              className="text-white hover:text-gray-200 p-1 h-auto"
            >
              <i className="fas fa-times text-xs"></i>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
