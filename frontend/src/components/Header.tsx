import React, { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  Bell,
  User,
  Menu,
  LogOut,
  Settings,
  Shield,
  ChevronDown,
  UserCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { shiftChatConversationTitle } from '@/lib/shiftChatConversation';

const Header: React.FC<{
  onOpenNavigation: () => void;
  navigationOpen: boolean;
}> = ({ onOpenNavigation, navigationOpen }) => {
  const {
    currentPage,
    notifications,
    markNotificationRead,
    isDbConnected,
    realtimeConnected,
    isLoading,
    setCurrentPage,
    schedulerDateNav,
    workOrders,
    getProjectById,
  } = useAppContext();
  const { user, logout, hasPermission } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const unreadNotifications = notifications.filter((n) => !n.read);

  const notificationTitle = (notification: (typeof notifications)[number]) => {
    if (notification.type !== 'shift_chat_message') return notification.title;
    const workOrder = notification.workOrderId
      ? workOrders.find((item) => item.id === notification.workOrderId)
      : workOrders.find((item) =>
          item.shifts.some((shift) => shift.id === notification.shiftId),
        );
    const shift = workOrder?.shifts.find(
      (item) => item.id === notification.shiftId,
    );
    if (!workOrder || !shift) return notification.title;
    const project = workOrder.projectId
      ? getProjectById(workOrder.projectId)
      : undefined;
    return shiftChatConversationTitle(project, workOrder, shift);
  };

  const openNotification = (notification: (typeof notifications)[number]) => {
    markNotificationRead(notification.id);
    if (notification.type !== 'shift_chat_message' || !notification.shiftId)
      return;

    const detail = {
      shiftId: notification.shiftId,
      workOrderId: notification.workOrderId || undefined,
    };
    try {
      sessionStorage.setItem('pending_shift_chat', JSON.stringify(detail));
    } catch {}
    setCurrentPage('scheduler');
    setShowNotifications(false);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open-shift-chat', { detail }));
    }, 50);
  };

  const pageTitle: Record<string, string> = {
    systemErrors: 'System errors',
    dashboard: 'Dashboard',
    projects: 'Projects',
    materials: 'Materials',
    availability: 'Availability',
    scheduler: 'Schedule',
    shifts: 'Shifts',
    workorders: 'Assignments',
    workOrdersModule: 'Work Orders',
    readyToBill: 'Ready To Bill',
    itemsCatalog: 'Items Catalog',
    workers: 'Workers',
    equipment: 'Equipment',
    clients: 'Clients',
    timesheets: 'Timesheets',
    forms: 'Forms & Field Data',
    incidents: 'Incidents',
    reports: 'Reports & Analytics',
    settings: 'Settings',
    profile: 'My Profile',
  };

  const roleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-700';
      case 'manager':
        return 'bg-blue-100 text-blue-700';
      case 'scheduler':
        return 'bg-green-100 text-green-700';
      case 'viewer':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const scheduleLayout = currentPage === 'scheduler';

  const dateNavigation = schedulerDateNav ? (
    <div className="flex w-full min-w-0 items-center gap-1 sm:gap-2">
      <button
        type="button"
        onClick={schedulerDateNav.onPrev}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-800 transition-colors hover:bg-gray-100"
        aria-label="Previous period"
      >
        <ChevronLeft size={18} strokeWidth={2} className="text-gray-700" />
      </button>
      <h1 className="min-w-0 flex-1 sm:flex-none sm:max-w-none text-sm font-bold tracking-tight text-gray-900 sm:text-base whitespace-nowrap truncate px-0.5">
        {schedulerDateNav.dateLabel}
      </h1>
      <button
        type="button"
        onClick={schedulerDateNav.onNext}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-800 transition-colors hover:bg-gray-100"
        aria-label="Next period"
      >
        <ChevronRight size={18} strokeWidth={2} className="text-gray-700" />
      </button>
      <button
        type="button"
        onClick={schedulerDateNav.onToday}
        className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs sm:text-sm font-semibold text-blue-600 transition-colors hover:bg-gray-100 hover:text-blue-700 shrink-0"
      >
        Today
      </button>
    </div>
  ) : null;

  return (
    <header
      className={`min-h-16 bg-white border-b border-gray-200 flex flex-wrap items-center sticky top-0 z-40 gap-x-2 gap-y-0 ${
        scheduleLayout
          ? 'px-3 sm:px-5 lg:px-8 justify-between'
          : 'px-3 sm:px-6 justify-between'
      }`}
    >
      <div className="flex flex-1 items-center gap-2 sm:gap-3 min-w-0 h-16">
        <button
          id="mobile-navigation-trigger"
          onClick={onOpenNavigation}
          aria-label="Open navigation"
          aria-expanded={navigationOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg lg:hidden text-gray-500 hover:bg-gray-100"
        >
          <Menu size={20} />
        </button>
        {scheduleLayout && schedulerDateNav ? (
          <>
            <h1 className="truncate text-lg font-semibold sm:hidden">
              Schedule
            </h1>
            <div className="hidden min-w-0 sm:block">{dateNavigation}</div>
          </>
        ) : (
          <h1
            className={
              scheduleLayout
                ? 'text-xl font-semibold text-gray-800 truncate min-w-[1rem]'
                : 'text-xl font-semibold text-gray-800 truncate'
            }
          >
            {pageTitle[currentPage] || 'Dashboard'}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-3 lg:gap-4 shrink-0 ml-auto">
        {}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Bell size={20} />
            {unreadNotifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                {unreadNotifications.length}
              </span>
            )}
          </button>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />
              <div className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
                <div className="p-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                  <span className="font-semibold text-sm text-gray-700">
                    Notifications
                  </span>
                  <span
                    className="text-xs text-primary cursor-pointer hover:underline"
                    onClick={() => {
                      notifications.forEach((n) => markNotificationRead(n.id));
                    }}
                  >
                    Mark all read
                  </span>
                </div>
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${!n.read ? 'bg-blue-50/50' : ''}`}
                    onClick={() => openNotification(n)}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          n.type === 'overtime'
                            ? 'bg-orange-500'
                            : n.type === 'incident'
                              ? 'bg-red-500'
                              : n.type === 'alert'
                                ? 'bg-yellow-500'
                                : n.type === 'shift_chat_message'
                                  ? 'bg-emerald-500'
                                  : 'bg-blue-500'
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {notificationTitle(n)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {n.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(n.timestamp).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {}
        <div
          className="hidden md:flex items-center gap-1.5"
          title={
            isDbConnected
              ? realtimeConnected
                ? 'Connected - real-time sync active'
                : 'Connected - real-time sync reconnecting'
              : isLoading
                ? 'Connecting...'
                : 'Offline mode - using local data'
          }
        >
          {isLoading ? (
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          ) : isDbConnected ? (
            <div className="w-2 h-2 rounded-full bg-green-500" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-gray-400" />
          )}
          <span className="text-xs text-gray-400">
            {isLoading
              ? 'Syncing'
              : isDbConnected
                ? realtimeConnected ? 'Live' : 'Reconnecting'
                : 'Offline'}
          </span>
        </div>

        {}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 pl-3 border-l border-gray-200 hover:bg-gray-50 rounded-lg pr-2 py-1 transition-colors"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                user?.role === 'admin'
                  ? 'bg-red-600'
                  : user?.role === 'manager'
                    ? 'bg-primary'
                    : user?.role === 'scheduler'
                      ? 'bg-green-600'
                      : 'bg-gray-500'
              }`}
            >
              {user ? (
                `${user.firstName[0]}${user.lastName[0]}`
              ) : (
                <User size={16} />
              )}
            </div>
            <div className="hidden xl:block max-w-40 truncate text-left">
              <p className="text-sm font-medium text-gray-700">
                {user ? `${user.firstName} ${user.lastName}` : 'Guest'}
              </p>
              <p className="text-xs text-gray-400 capitalize">
                {user?.role || 'Unknown'}
              </p>
            </div>
            <ChevronDown size={14} className="text-gray-400 hidden md:block" />
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 top-12 w-64 max-w-[calc(100vw-1.5rem)] bg-white rounded-lg shadow-xl border border-gray-200 z-50 py-1">
                {}
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-800">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
                  <span
                    className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium capitalize ${roleBadgeColor(user?.role || '')}`}
                  >
                    <Shield size={10} className="inline mr-1" />
                    {user?.role}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setCurrentPage('profile');
                    setShowUserMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <UserCircle size={16} className="text-gray-400" />
                  My Profile
                </button>

                {hasPermission('admin') && (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        sessionStorage.setItem(
                          'settings_target_tab',
                          'system_users',
                        );
                      } catch {}
                      setCurrentPage('settings');
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Shield size={16} className="text-gray-400" />
                    User Management
                  </button>
                )}

                <button
                  onClick={() => {
                    setCurrentPage('settings');
                    setShowUserMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Settings size={16} className="text-gray-400" />
                  Settings
                </button>

                <div className="border-t border-gray-100 my-1" />

                <button
                  onClick={() => {
                    logout();
                    setShowUserMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {scheduleLayout && dateNavigation && (
        <div className="flex h-12 w-full min-w-0 items-center pb-2 sm:hidden">
          {dateNavigation}
        </div>
      )}
    </header>
  );
};

export default Header;
