import React, { useState, useEffect, useRef } from 'react';
import { useNotification, Notification } from '../src/contexts/NotificationContext.tsx';
import { BellIcon, CheckCircleIcon, XCircleIcon, InformationCircleIcon, CloseIcon, TrashIcon } from './IconComponents.tsx';

const Toast: React.FC<{ notification: Notification; onDismiss: () => void }> = ({ notification, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Set a timer to automatically dismiss the toast
    timeoutRef.current = setTimeout(() => {
      setIsExiting(true);
      // After the exit animation, call the actual dismiss function
      setTimeout(onDismiss, 500); 
    }, 5000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [onDismiss]);
  
  const handleManualDismiss = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setIsExiting(true);
      setTimeout(onDismiss, 500);
  }

  const typeClasses = {
    success: 'bg-green-100 dark:bg-green-900/50 border-green-500 dark:border-green-600',
    error: 'bg-red-100 dark:bg-red-900/50 border-red-500 dark:border-red-600',
    info: 'bg-blue-100 dark:bg-blue-900/50 border-blue-500 dark:border-blue-600',
  };

  const iconClasses = {
    success: 'text-green-500',
    error: 'text-red-500',
    info: 'text-blue-500',
  }

  const Icon = {
    success: CheckCircleIcon,
    error: XCircleIcon,
    info: InformationCircleIcon,
  }[notification.type];

  return (
    <div
      className={`relative w-full max-w-sm p-4 my-2 overflow-hidden rounded-lg shadow-2xl border-l-4 ${typeClasses[notification.type]} ${isExiting ? 'toast-out' : 'toast-in'}`}
      role="alert"
    >
      <div className="flex items-start">
        <div className={`flex-shrink-0 ${iconClasses[notification.type]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="ml-3 w-0 flex-1 pt-0.5">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{notification.message}</p>
        </div>
        <div className="ml-4 flex-shrink-0 flex">
          <button onClick={handleManualDismiss} className="inline-flex rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            <span className="sr-only">Close</span>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

const NotificationSystem: React.FC = () => {
  const { notifications, setNotifications } = useNotification();
  const [activeToasts, setActiveToasts] = useState<Notification[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isRinging, setIsRinging] = useState(false);
  const prevNotificationsRef = useRef<Notification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    // Check if new notifications have been added
    if (notifications.length > prevNotificationsRef.current.length) {
      const newNotifications = notifications.slice(0, notifications.length - prevNotificationsRef.current.length);
      newNotifications.forEach(n => {
          setActiveToasts(prev => [...prev, n]);
          if (!isPanelOpen) {
              setUnreadCount(prev => prev + 1);
          }
      });
      // Trigger bell animation
      setIsRinging(true);
      setTimeout(() => setIsRinging(false), 1000);
    }
    prevNotificationsRef.current = notifications;
  }, [notifications, isPanelOpen]);

  // Click outside handler for the panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsPanelOpen(false);
      }
    };
    if (isPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPanelOpen]);


  const dismissToast = (id: number) => {
    setActiveToasts(prev => prev.filter(toast => toast.id !== id));
  };
  
  const togglePanel = () => {
    setIsPanelOpen(prev => !prev);
    if (!isPanelOpen) { // If we are opening it
        setUnreadCount(0);
    }
  };
  
  const clearAllNotifications = () => {
      setNotifications([]);
      setActiveToasts([]);
      setUnreadCount(0);
      setIsPanelOpen(false);
  }

  return (
    <>
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[100] w-full max-w-sm space-y-2">
        {activeToasts.map(toast => (
          <Toast key={toast.id} notification={toast} onDismiss={() => dismissToast(toast.id)} />
        ))}
      </div>

      {/* Bell Icon */}
      <div className="fixed top-6 right-6 z-[90]">
        <button
          onClick={togglePanel}
          className={`relative p-3 rounded-full bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-900 focus:ring-primary transition-colors ${isRinging ? 'animate-ring' : ''}`}
          aria-label="Open notifications"
        >
          <BellIcon className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notification Panel */}
      {isPanelOpen && (
        <>
            <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-[95] backdrop-blur-sm" style={{animation: 'fade-in 0.3s ease-out'}}></div>
            <div
                ref={panelRef}
                className="fixed top-20 right-6 z-[100] w-full max-w-md bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
                style={{ transformOrigin: 'top right', animation: 'unfurl 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-semibold text-lg text-gray-800 dark:text-white">Notifications</h3>
                    <div className="flex items-center gap-2">
                         {notifications.length > 0 && (
                             <button onClick={clearAllNotifications} className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Clear all notifications">
                                <TrashIcon className="w-5 h-5" />
                            </button>
                         )}
                         <button onClick={() => setIsPanelOpen(false)} className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Close panel">
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="flex-grow overflow-y-auto max-h-[60vh] scrollbar-thin">
                    {notifications.length === 0 ? (
                        <p className="p-8 text-center text-gray-500 dark:text-gray-400">No notifications yet.</p>
                    ) : (
                        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                            {notifications.map(n => (
                                <li key={n.id} className="p-4 flex items-start gap-3">
                                    <div className={`flex-shrink-0 mt-0.5 ${ {success: 'text-green-500', error: 'text-red-500', info: 'text-blue-500'}[n.type]}`}>
                                        {{
                                            success: <CheckCircleIcon className="w-5 h-5"/>,
                                            error: <XCircleIcon className="w-5 h-5"/>,
                                            info: <InformationCircleIcon className="w-5 h-5"/>
                                        }[n.type]}
                                    </div>
                                    <p className="text-sm text-gray-700 dark:text-gray-300">{n.message}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </>
      )}
    </>
  );
};

export default NotificationSystem;