type RoutePreloader = () => Promise<unknown>;

const preloaders: Record<string, RoutePreloader> = {
  '/': () => import('../pages/Dashboard'),
  '/members': () => import('../pages/Members'),
  '/subscriptions': () => import('../pages/Subscriptions'),
  '/plans': () => import('../pages/Plans'),
  '/classes': () => import('../pages/Classes'),
  '/private-classes': () => import('../pages/PrivateClasses'),
  '/hr': () => import('../pages/HumanResources'),
  '/accounting': () => import('../pages/Accounting'),
  '/warehouse': () => import('../pages/Warehouse'),
  '/reports': () => import('../pages/Reports'),
  '/scanner': () => import('../pages/QRScanner'),
  '/settings': () => import('../pages/Settings'),
  '/support': () => import('../pages/Support'),
};

const cache = new Map<string, Promise<unknown>>();

export function preloadRoute(path: string): void {
  const routePath = (path || '/').split('?')[0] || '/';
  const preload = preloaders[routePath];
  if (!preload || cache.has(routePath)) return;
  cache.set(
    routePath,
    preload().catch((error) => {
      cache.delete(routePath);
      if (import.meta.env.DEV) {
        console.warn(`Failed to preload route ${routePath}`, error);
      }
    }),
  );
}
