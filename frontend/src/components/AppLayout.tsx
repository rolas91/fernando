import TableLoading from '@/components/shared/TableLoading';
import React, { useEffect, useState } from 'react';
import * as NavigationDialog from '@radix-ui/react-dialog';
import { useAppContext } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from './Sidebar';
import SystemErrorsView from './SystemErrorsView';
import Header from './Header';
import DashboardView from './dashboard/DashboardView';
import SchedulerView from './scheduler/SchedulerView';
import ShiftsView from './shifts/ShiftsView';
import WorkOrdersView from './workorders/WorkOrdersView';
import WorkOrdersModuleView from './workorders/WorkOrdersModuleView';
import ReadyToBillView from './workorders/ReadyToBillView';
import ItemsCatalogView from './workorders/ItemsCatalogView';
import WorkersView from './workers/WorkersView';
import EquipmentView from './equipment/EquipmentView';
import MaterialsView from './materials/MaterialsView';
import TimesheetsView from './timesheets/TimesheetsView';
import FormsView from './forms/FormsView';
import ClientsView from './clients/ClientsView';
import IncidentsView from './incidents/IncidentsView';
import ReportsView from './reports/ReportsView';
import SettingsView from './settings/SettingsView';
import ProfileView from './profile/ProfileView';
import AvailabilityCalendarView from './availability/AvailabilityCalendarView';
import ProjectsView from './projects/ProjectsView';
import { Lock, X } from 'lucide-react';

const AppLayout: React.FC = () => {
  const { currentPage, sidebarCollapsed, loadErrors, retryFailed, isLoading, pageDataReady } =
    useAppContext();
  const { user } = useAuth();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => {
    setMobileNavigationOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [currentPage]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileNavigationOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardView />;
      case 'scheduler':
        return <SchedulerView />;
      case 'shifts':
        return <ShiftsView />;
      case 'workorders':
        return <WorkOrdersView />;
      case 'workOrdersModule':
        return <WorkOrdersModuleView />;
      case 'readyToBill':
        return <ReadyToBillView />;
      case 'itemsCatalog':
        return <ItemsCatalogView />;
      case 'projects':
        return <ProjectsView />;
      case 'workers':
        return <WorkersView />;
      case 'equipment':
        return <EquipmentView />;
      case 'materials':
        return <MaterialsView />;
      case 'timesheets':
        return <TimesheetsView />;
      case 'forms':
        return <FormsView />;
      case 'clients':
        return <ClientsView />;
      case 'incidents':
        return <IncidentsView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView />;
      case 'systemErrors':
        return <SystemErrorsView />;
      case 'profile':
        return <ProfileView />;
      case 'availability':
        return <AvailabilityCalendarView />;
      default:
        return <DashboardView />;
    }
  };

  const showReadOnlyBanner =
    user?.role === 'viewer' &&
    !['dashboard', 'reports', 'profile'].includes(currentPage);

  return (
    <div
      className={`app-shell min-h-dvh bg-gray-50 ${currentPage === 'scheduler' ? 'app-shell-schedule' : ''}`}
    >
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <NavigationDialog.Root
        open={mobileNavigationOpen}
        onOpenChange={setMobileNavigationOpen}
      >
        <NavigationDialog.Portal>
          <NavigationDialog.Overlay className="fixed inset-0 z-[10300] bg-black/50" />
          <NavigationDialog.Content
            className="fixed inset-y-0 left-0 z-[10301] w-72 max-w-[85vw] bg-[#1a2332] text-white shadow-xl"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById('mobile-navigation-trigger')?.focus();
            }}
          >
            <NavigationDialog.Title className="sr-only">
              Main navigation
            </NavigationDialog.Title>
            <Sidebar mobile onNavigate={() => setMobileNavigationOpen(false)} />
            <NavigationDialog.Close
              className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"
              aria-label="Close navigation"
            >
              <X size={20} />
            </NavigationDialog.Close>
          </NavigationDialog.Content>
        </NavigationDialog.Portal>
      </NavigationDialog.Root>
      <div
        className={`min-w-0 transition-[margin] duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'}`}
      >
        <Header
          onOpenNavigation={() => setMobileNavigationOpen(true)}
          navigationOpen={mobileNavigationOpen}
        />
        {showReadOnlyBanner && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2 flex items-center gap-2">
            <Lock size={14} className="text-yellow-600" />
            <span className="text-sm text-yellow-700">
              You are in <strong>read-only mode</strong>. Contact an
              administrator to request edit access.
            </span>
          </div>
        )}
        <main className="app-main min-w-0 min-h-[calc(100dvh-var(--app-header-height))]">
          {loadErrors.length > 0 && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p>
                Could not refresh: {loadErrors.join(', ')}. Other sections remain available.
              </p>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void retryFailed()}
                className="min-h-11 rounded-md border border-amber-700 px-3 font-medium hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 disabled:opacity-50"
              >
                Retry loading
              </button>
            </div>
          )}
          {pageDataReady ? renderPage() : isLoading ? (
            <TableLoading label="Loading this section…" className="px-4" />
          ) : (
            <div role="alert" className="flex min-h-64 items-center justify-center px-6 text-sm text-gray-600">
              This section could not finish loading. Use Retry loading above to try again.
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
