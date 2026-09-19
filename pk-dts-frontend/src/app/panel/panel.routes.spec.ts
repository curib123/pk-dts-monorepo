import { panelRoutes } from './panel.routes';

describe('panel routes', () => {
    it('lazy-loads workspace pages instead of bundling every page into the panel entry chunk', () => {
        const pagePaths = ['dashboard', 'documents', 'workflow-builder', 'settings'];

        for (const path of pagePaths) {
            const route = panelRoutes[0].children?.find((item) => item.path === path);

            expect(route?.loadComponent).toEqual(jasmine.any(Function), `${path} should be lazy-loaded`);
            expect(route?.component).toBeUndefined(`${path} should not be eagerly imported`);
        }
    });

    it('allows the approval workspace to be opened for an assigned workflow task', () => {
        const approvalRoute = panelRoutes[0].children?.find((route) => route.path === 'approval-review');

        expect(approvalRoute?.data?.['allowAssignedWorkflowTask']).toBeTrue();
    });
    it('labels backup and audit pages as system administration workspaces', () => {
        for (const path of ['backup-restore', 'audit-logs']) {
            const route = panelRoutes[0].children?.find((item) => item.path === path);

            expect(route?.data?.['eyebrow']).toBe('System administration');
            expect(route?.data?.['icon']).toMatch(/^pi pi-/);
        }
    });

    it('gives every non-dashboard workspace centralized topbar metadata', () => {
        const children = panelRoutes[0].children ?? [];
        const redirects = new Set(['', 'my-requests', 'classification']);

        for (const route of children) {
            if (!route.path || route.path === 'dashboard' || redirects.has(route.path) || route.redirectTo) continue;

            expect(route.data?.['title']).withContext(route.path).toBeTruthy();
            expect(route.data?.['subtitle']).withContext(route.path).toBeTruthy();
            expect(route.data?.['eyebrow']).withContext(route.path).toBeTruthy();
            expect(route.data?.['icon']).withContext(route.path).toMatch(/^pi pi-/);
        }
    });

});
