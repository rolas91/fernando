import React, { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageView } from '@/lib/types';
import {
  LayoutDashboard,
  Calendar,
  Briefcase,
  Users,
  Truck,
  Clock,
  FileText,
  AlertTriangle,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Building2,
  ClipboardList,
  Shield,
  UserCircle,
  LogOut,
  FolderKanban,
  Package,
  DollarSign,
  ListTree,
  Timer,
} from 'lucide-react';
interface NavItem {
  id: PageView;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  requiredRole?: string[];
  dividerBefore?: boolean;
}
interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  children: NavItem[];
}
type SidebarEntry = NavItem | NavGroup;

function isNavGroup(item: SidebarEntry): item is NavGroup {
  return 'children' in item;
}

const Sidebar: React.FC<{ mobile?: boolean; onNavigate?: () => void }> = ({
  mobile = false,
  onNavigate,
}) => {
  const {
    currentPage,
    setCurrentPage: navigate,
    sidebarCollapsed: desktopCollapsed,
    setSidebarCollapsed,
    pendingTimesheetsCount,
    settings,
  } = useAppContext();
  const sidebarCollapsed = !mobile && desktopCollapsed;
  const setCurrentPage = (page: PageView) => {
    navigate(page);
    onNavigate?.();
  };
  const { user, hasPermission, logout } = useAuth();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const navItems: SidebarEntry[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard size={20} />,
    },
    {
      id: 'scheduler',
      label: 'Schedule',
      icon: <Calendar size={20} />,
    },
    {
      id: 'workorders',
      label: 'Assignments',
      icon: <Briefcase size={20} />,
    },
    {
      id: 'shifts',
      label: 'Shifts',
      icon: <Timer size={20} />,
    },
    {
      id: 'work-orders-group',
      label: 'Work Orders',
      icon: <Briefcase size={20} />,
      children: [
        {
          id: 'workOrdersModule',
          label: 'Work Orders',
          icon: <Briefcase size={18} />,
        },
        {
          id: 'readyToBill',
          label: 'Ready To Bill',
          icon: <DollarSign size={18} />,
        },
        {
          id: 'itemsCatalog',
          label: 'Items Catalog',
          icon: <ListTree size={18} />,
        },
      ],
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: <FolderKanban size={20} />,
    },
    {
      id: 'workers',
      label: 'Workers',
      icon: <Users size={20} />,
    },
    {
      id: 'equipment',
      label: 'Equipment',
      icon: <Truck size={20} />,
    },
    {
      id: 'materials',
      label: 'Materials',
      icon: <Package size={20} />,
    },
    {
      id: 'clients',
      label: 'Clients',
      icon: <Building2 size={20} />,
    },
    {
      id: 'timesheets',
      label: 'Timesheets',
      icon: <Clock size={20} />,
      badge: pendingTimesheetsCount || undefined,
    },
    {
      id: 'forms',
      label: 'Forms',
      icon: <ClipboardList size={20} />,
    },
    {
      id: 'incidents',
      label: 'Incidents',
      icon: <AlertTriangle size={20} />,
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: <BarChart3 size={20} />,
    },
    ...(user?.role === 'admin'
      ? [
          {
            id: 'systemErrors' as PageView,
            label: 'System errors',
            icon: <Shield size={20} />,
          },
        ]
      : []),
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings size={20} />,
    },
  ];
  const canShowItem = (item: NavItem) => {
    if (!item.requiredRole) return true;
    return item.requiredRole.some((r) => hasPermission(r as any));
  };
  const visibleNavItems = navItems
    .map((item) => {
      if (!isNavGroup(item)) return canShowItem(item) ? item : null;
      const children = item.children.filter(canShowItem);
      return children.length > 0 ? { ...item, children } : null;
    })
    .filter((item): item is SidebarEntry => Boolean(item));
  const activeGroupIds = new Set(
    visibleNavItems
      .filter(isNavGroup)
      .filter((item) => item.children.some((child) => child.id === currentPage))
      .map((item) => item.id),
  );
  const isGroupOpen = (group: NavGroup) => Boolean(openGroups[group.id]);
  const toggleGroup = (group: NavGroup) => {
    if (sidebarCollapsed) {
      setCurrentPage(group.children[0].id);
      return;
    }
    setOpenGroups((current) => ({
      ...current,
      [group.id]: !current[group.id],
    }));
  };

  const isReadOnly = user?.role === 'viewer';
  return (
    <aside
      className={`${mobile ? 'relative h-dvh w-full' : 'fixed left-0 top-0 h-dvh z-50'} bg-[#1a2332] text-white flex flex-col transition-all duration-300 ${mobile ? '' : sidebarCollapsed ? 'w-16' : 'w-56'}`}
    >
      {}
      <div className="flex shrink-0 items-center h-16 px-3 border-b border-white/10">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            {settings.logo ? (
              <img
                src={settings.logo}
                alt="DR Traffic Control"
                className="h-8 w-auto"
              />
            ) : (
              <span className="text-lg font-bold text-white">DR</span>
            )}
          </div>
        )}
        {sidebarCollapsed && (
          <div className="w-10 h-10 rounded flex items-center justify-center mx-auto">
            {settings.logoIcon ? (
              <img
                src={settings.logoIcon}
                alt="DR"
                className="h-8 w-8 rounded object-contain bg-white"
              />
            ) : (
              <span className="bg-red-600 w-full h-full rounded flex items-center justify-center font-bold text-sm text-white">
                DR
              </span>
            )}
          </div>
        )}
      </div>

      {}
      {!sidebarCollapsed && user && (
        <div className="px-3 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${user.role === 'admin' ? 'bg-red-500' : user.role === 'manager' ? 'bg-primary' : user.role === 'scheduler' ? 'bg-green-500' : 'bg-gray-500'}`}
            >
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-gray-400 capitalize">{user.role}</p>
            </div>
          </div>
        </div>
      )}

      {}
      <nav
        aria-label="Main navigation"
        className="hide-scrollbar min-h-0 flex-1 py-2 overflow-y-auto overscroll-contain"
      >
        {visibleNavItems.map((item) => {
          if (isNavGroup(item)) {
            const groupActive = activeGroupIds.has(item.id);
            const groupOpen = isGroupOpen(item);
            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => toggleGroup(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${groupActive ? 'text-primary' : 'text-gray-400 hover:bg-white/5 hover:text-white'} ${sidebarCollapsed ? 'justify-center' : ''}`}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-expanded={groupOpen}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!sidebarCollapsed && (
                    <span className="truncate font-semibold">{item.label}</span>
                  )}
                  {!sidebarCollapsed && (
                    <span className="ml-auto">
                      {groupOpen ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </span>
                  )}
                </button>
                {!sidebarCollapsed && groupOpen && (
                  <div className="mb-1">
                    {item.children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => setCurrentPage(child.id)}
                        className={`w-full flex items-center gap-3 py-2 pl-11 pr-4 text-sm transition-colors relative group ${currentPage === child.id ? 'bg-primary/20 text-primary border-l-[3px] border-primary' : 'text-gray-400 hover:bg-white/5 hover:text-white border-l-[3px] border-transparent'}`}
                      >
                        <span className="flex-shrink-0">{child.icon}</span>
                        <span className="truncate">{child.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <React.Fragment key={item.id}>
              {item.dividerBefore && (
                <div className="mx-3 my-2 border-t border-white/10" />
              )}
              <button
                onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative group ${currentPage === item.id ? 'bg-primary/20 text-primary border-l-[3px] border-primary' : 'text-gray-400 hover:bg-white/5 hover:text-white border-l-[3px] border-transparent'}`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!sidebarCollapsed && (
                  <>
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
                {sidebarCollapsed && item.badge && (
                  <span className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {}
      {isReadOnly && !sidebarCollapsed && (
        <div className="mx-3 mb-2 px-3 py-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
          <p className="text-xs text-yellow-400 font-medium">Read-Only Mode</p>
          <p className="text-xs text-yellow-400/70 mt-0.5">
            Viewer access only
          </p>
        </div>
      )}

      {}
      <div className="border-t border-white/10">
        {!sidebarCollapsed && (
          <button
            onClick={() => setCurrentPage('profile')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${currentPage === 'profile' ? 'text-primary' : 'text-gray-400 hover:text-white'}`}
          >
            <UserCircle size={20} />
            <span>My Profile</span>
          </button>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 hover:text-red-400 transition-colors"
          title={sidebarCollapsed ? 'Sign Out' : undefined}
        >
          <LogOut size={20} />
          {!sidebarCollapsed && <span>Sign Out</span>}
        </button>
        {!mobile && (
          <button
            aria-label={
              sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
            }
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex items-center justify-center h-10 w-full text-gray-400 hover:text-white transition-colors"
          >
            {sidebarCollapsed ? (
              <ChevronRight size={18} />
            ) : (
              <ChevronLeft size={18} />
            )}
          </button>
        )}
      </div>
    </aside>
  );
};
export default Sidebar;
