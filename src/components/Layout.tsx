import { Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import LanguageSwitcher from './LanguageSwitcher';
import { Archive, Dumbbell, Users, Calendar, ScanLine, LayoutDashboard, CreditCard, LogOut, Settings, Bell, Landmark, ClipboardList, Menu, X, HelpCircle, FileText, Warehouse, Receipt, Truck } from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { engagementApi, type NotificationItem } from '../lib/engagementApi';
import { preloadRoute } from '../lib/routePreload';
import { hasClientPermission, normalizeClientRole, type ClientPermission } from '../lib/permissions';
import type { TranslationKey } from '../i18n/translations';

export default function Layout() {
  const { user, profile, logout } = useAuth();
  const { settings } = useSettings();
  const { t, direction, formatDateTime } = useLocalization();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const getInitials = (name: string) => name ? name.charAt(0).toUpperCase() : 'U';
  const iconSpacing = direction === 'rtl' ? 'ml-4' : 'mr-4';

  const navItems: Array<{ labelKey: TranslationKey; path: string; icon: ReactNode; permission: ClientPermission }> = [
    { labelKey: 'nav.dashboard', path: '/', icon: <LayoutDashboard className="w-4 h-4" />, permission: 'dashboard.read' },
    { labelKey: 'nav.members', path: '/members', icon: <Users className="w-4 h-4" />, permission: 'membership.read' },
    { labelKey: 'nav.plans', path: '/plans', icon: <CreditCard className="w-4 h-4" />, permission: 'membership.read' },
    { labelKey: 'nav.classes', path: '/classes', icon: <Calendar className="w-4 h-4" />, permission: 'scheduling.read' },
    { labelKey: 'nav.privatePt', path: '/private-classes', icon: <Dumbbell className="w-4 h-4" />, permission: 'scheduling.read' },
    { labelKey: 'nav.employees', path: '/hr?tab=employees', icon: <Users className="w-4 h-4" />, permission: 'hr.read' },
    { labelKey: 'nav.hrPayroll', path: '/hr?tab=payroll', icon: <ClipboardList className="w-4 h-4" />, permission: 'hr.read' },
    { labelKey: 'nav.accounting', path: '/accounting', icon: <Landmark className="w-4 h-4" />, permission: 'finance.read' },
    { labelKey: 'nav.warehouse', path: '/warehouse', icon: <Warehouse className="w-4 h-4" />, permission: 'warehouse.read' },
    { labelKey: 'nav.inventory', path: '/warehouse?tab=inventory', icon: <Archive className="w-4 h-4" />, permission: 'warehouse.read' },
    { labelKey: 'nav.pos', path: '/warehouse?tab=pos', icon: <Receipt className="w-4 h-4" />, permission: 'warehouse.pos' },
    { labelKey: 'nav.suppliers', path: '/warehouse?tab=suppliers', icon: <Truck className="w-4 h-4" />, permission: 'warehouse.purchase' },
    { labelKey: 'nav.warehouseReports', path: '/warehouse?tab=reports', icon: <FileText className="w-4 h-4" />, permission: 'warehouse.reports' },
    { labelKey: 'nav.reports', path: '/reports', icon: <FileText className="w-4 h-4" />, permission: 'reports.read' },
    { labelKey: 'nav.qrAccess', path: '/scanner', icon: <ScanLine className="w-4 h-4" />, permission: 'membership.access.validate' },
    { labelKey: 'nav.subscriptions' as any, path: '/subscriptions', icon: <CreditCard className="w-4 h-4" />, permission: 'membership.read' },
    { labelKey: 'nav.settings', path: '/settings', icon: <Settings className="w-4 h-4" />, permission: 'platform.audit.read' },
    { labelKey: 'nav.support', path: '/support', icon: <HelpCircle className="w-4 h-4" />, permission: 'support.self' },
  ];

  const allowedNavItems = navItems.filter(item => hasClientPermission(profile?.role, item.permission));
  const currentUrl = `${location.pathname}${location.search}`;
  const itemPathname = (path: string) => path.split('?')[0];
  const isNavigationItemActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/warehouse') return location.pathname === '/warehouse' && !location.search;
    if (path.includes('?')) return currentUrl === path;
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };
  const activeNavigationItem = allowedNavItems.find(item => isNavigationItemActive(item.path))
    || allowedNavItems.find(item => location.pathname === itemPathname(item.path));
  const activePageName = location.pathname === '/'
    ? t('nav.dashboard')
    : activeNavigationItem
      ? t(activeNavigationItem.labelKey)
      : t('breadcrumb.page');

  const resetNotifications = () => {
    setNotifications([]);
    setUnreadCount(0);
  };

  const loadNotifications = async () => {
    if (!user) {
      resetNotifications();
      return;
    }

    try {
      const response = await engagementApi.listNotifications();
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch {
      resetNotifications();
    }
  };

  useEffect(() => {
    if (!user) {
      resetNotifications();
      return;
    }

    loadNotifications();
    const interval = globalThis.setInterval(loadNotifications, 60000);
    return () => globalThis.clearInterval(interval);
  }, [user?.uid]);

  const markAllRead = async () => {
    if (!user) return;

    try {
      await engagementApi.markAllNotificationsRead();
      await loadNotifications();
    } catch {
      // Notification failures should not interrupt the user workflow.
    }
  };

  const Navigation = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={cn('py-4 space-y-1 overflow-y-auto', mobile ? 'flex-1' : 'flex-1')}>
      {allowedNavItems.map((item) => {
        const isActive = isNavigationItemActive(item.path);
        return (
          <Link
            key={item.labelKey}
            to={item.path}
            className="block"
            onMouseEnter={() => preloadRoute(item.path)}
            onFocus={() => preloadRoute(item.path)}
            onClick={() => setMobileOpen(false)}
          >
            <div className={cn(
              'flex items-center px-6 py-3 text-sm font-medium transition-colors',
              isActive
                ? 'bg-white/5 text-[#6bfb53] border-l-4 border-[#6bfb53] rtl:border-l-0 rtl:border-r-4'
                : 'text-slate-400 border-l-4 border-transparent hover:bg-white/5 hover:text-white rtl:border-l-0 rtl:border-r-4'
            )}>
              <span className={cn(iconSpacing, isActive ? 'text-[#6bfb53]' : 'text-slate-400')}>
                {item.icon}
              </span>
              {t(item.labelKey)}
            </div>
          </Link>
        );
      })}
    </div>
  );

  const SidebarContent = () => (
    <>
      <div className="pt-8 pb-6 px-6 shrink-0">
        <h1 className="font-black text-2xl text-[#6bfb53] tracking-wider leading-tight">
          {settings?.gymName?.toUpperCase() || 'POWERPULSE GYM'}
        </h1>
        <p className="text-xs text-slate-400 mt-2 font-medium">{t('app.adminTerminal')}</p>
      </div>
      <Navigation />
      <div className="pb-6">
        <button onClick={logout} className="flex items-center w-full px-6 py-3 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
          <LogOut className={cn('w-4 h-4', iconSpacing)} />
          {t('user.logout')}
        </button>
      </div>
    </>
  );

  const normalizedRole = normalizeClientRole(profile?.role);
  const roleLabel = normalizedRole === 'super_admin'
    ? t('role.superAdmin')
    : normalizedRole
      ? normalizedRole.replace(/_/g, ' ')
      : t('role.staff');

  return (
    <div className="flex h-screen bg-[#f8f9fa] font-sans" dir={direction}>
      <aside className={cn('hidden md:flex bg-[#2b2b2b] text-slate-300 flex-col transition-all duration-200', sidebarCollapsed ? 'w-16' : 'w-64')}>
        {!sidebarCollapsed && <SidebarContent />}
        {sidebarCollapsed && (
          <div className="flex flex-col items-center py-4 flex-1 overflow-y-auto">
            {allowedNavItems.map((item) => {
              const isActive = isNavigationItemActive(item.path);
              return (
                <Link key={item.labelKey} to={item.path} className="block w-full" onClick={() => setMobileOpen(false)}>
                  <div className={cn('flex items-center justify-center py-3 transition-colors', isActive ? 'text-[#6bfb53]' : 'text-slate-400 hover:text-white')} title={t(item.labelKey)}>
                    {item.icon}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex items-center justify-center py-3 text-slate-400 hover:text-white hover:bg-white/5 transition-colors border-t border-white/10"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
        </button>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className={cn('relative h-full w-72 max-w-[85vw] bg-[#2b2b2b] text-slate-300 flex flex-col shadow-2xl', direction === 'rtl' ? 'mr-auto' : 'ml-0')}>
            <button className={cn('absolute top-3 rounded-full p-2 text-slate-300 hover:bg-white/10', direction === 'rtl' ? 'left-3' : 'right-3')} onClick={() => setMobileOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden bg-[#f4f6f8] min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex items-center text-sm text-slate-500 min-w-0">
              <span className="hidden sm:inline">{t('breadcrumb.management')}</span>
              <span className="hidden sm:inline mx-2">&gt;</span>
              <span className="font-semibold text-slate-900 truncate">{activePageName}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3 sm:space-x-6 rtl:space-x-reverse">
            <LanguageSwitcher />
            <div className="relative">
              <button className="relative text-slate-400 hover:text-slate-600" onClick={() => setNotificationsOpen((open) => !open)} aria-label={t('notifications.title')}>
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && <span className={cn('absolute -top-1 min-w-4 h-4 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white text-center', direction === 'rtl' ? '-left-1' : '-right-1')}>{unreadCount}</span>}
              </button>

              {notificationsOpen && (
                <div className={cn('absolute top-9 z-40 w-80 max-w-[90vw] rounded-xl border bg-white shadow-xl', direction === 'rtl' ? 'left-0' : 'right-0')}>
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <p className="font-semibold text-slate-900">{t('notifications.title')}</p>
                    <Button variant="ghost" size="sm" onClick={markAllRead}>{t('notifications.markRead')}</Button>
                  </div>
                  <div className="max-h-96 overflow-y-auto p-2">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-sm text-slate-500">{t('notifications.empty')}</div>
                    ) : notifications.slice(0, 8).map((item) => (
                      <Link key={item.id} to={item.linkUrl || '#'} className="block rounded-lg p-3 hover:bg-slate-50" onClick={() => setNotificationsOpen(false)}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          {!item.readAt && <Badge variant="destructive">{t('notifications.new')}</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{item.body}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(item.createdAt)}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className="hidden sm:block text-right rtl:text-left">
                <p className="text-sm font-bold text-slate-900 leading-tight">{profile?.firstName || 'Gym'} {profile?.lastName || 'Admin'}</p>
                <p className="text-xs text-slate-500">{roleLabel}</p>
              </div>
              <Avatar className="h-9 w-9 border object-cover">
                <AvatarImage src={profile?.photoUrl || 'https://i.pravatar.cc/150?u=a042581f4e29026704d'} />
                <AvatarFallback>{getInitials(profile?.firstName || profile?.email || 'AD')}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto w-full h-full p-3 sm:p-6">
          <div className="h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
