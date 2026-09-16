import {
    PANEL_NAVIGATION,
    PANEL_ROUTE_PERMISSIONS,
    canAccessPanelItem,
    firstAuthorizedPanelUrl,
    shouldShowPanelItem
} from './panel-access.config';

function item(key: string) {
    const all = [PANEL_NAVIGATION.dashboard, ...PANEL_NAVIGATION.categories.flatMap((category) => category.items)];
    const found = all.find((candidate) => candidate.key === key);
    if (!found) throw new Error(`Missing navigation item ${key}`);
    return found;
}

describe('panel access configuration', () => {
    it('keeps Staff focused on document and personal workspaces', () => {
        const permissions = [
            'dashboard.view',
            'documents.view',
            'document-requests.view',
            'document-requests.view-own',
            'document-requests.create',
            'softcopy-folders.view',
            'document-access-requests.catalog',
            'document-access-requests.view-own',
            'document-disposal.request'
        ];
        const context = { roleName: 'Staff', permissions };

        expect(shouldShowPanelItem(item('softcopy-documents'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('softcopy-folders'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('my-document-requests'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('my-access-requests'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('my-disposal-requests'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('storage-admin'), context)).toBeFalse();
        expect(shouldShowPanelItem(item('user-management'), context)).toBeFalse();
        expect(shouldShowPanelItem(item('workflow-builder'), context)).toBeFalse();
        expect(shouldShowPanelItem(item('system-settings'), context)).toBeFalse();
    });

    it('shows Plant Manager the review workspaces without exposing administration', () => {
        const permissions = [
            'dashboard.view',
            'documents.view',
            'document-requests.view-own',
            'softcopy-folders.view',
            'document-access-requests.catalog',
            'document-access-requests.view-own',
            'document-requests.review',
            'document-requests.approve-plant-manager',
            'document-access-requests.review',
            'document-access-requests.approve'
        ];
        const context = { roleName: 'Plant Manager', permissions };

        expect(shouldShowPanelItem(item('approval-review'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('access-review'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('storage-admin'), context)).toBeFalse();
        expect(shouldShowPanelItem(item('workflow-builder'), context)).toBeFalse();
        expect(shouldShowPanelItem(item('backup-restore'), context)).toBeFalse();
    });

    it('shows Documentation Officer document-control tasks without exposing system administration', () => {
        const permissions = [
            'dashboard.view',
            'documents.view',
            'softcopy-folders.view',
            'document-requests.review',
            'document-requests.approve-document-controller',
            'document-requests.approve-hardcopy',
            'document-access-requests.review',
            'document-access-requests.approve'
        ];
        const context = { roleName: 'Documentation Officer', permissions };

        expect(shouldShowPanelItem(item('softcopy-documents'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('approval-review'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('access-review'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('roles-permissions'), context)).toBeFalse();
        expect(shouldShowPanelItem(item('system-settings'), context)).toBeFalse();
    });

    it('shows an assigned requester-leader approval task without global review permission', () => {
        const context = {
            roleName: 'Staff',
            permissions: ['dashboard.view'],
            assignedApprovalCount: 1
        };

        expect(shouldShowPanelItem(item('approval-review'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('approval-review'), { ...context, assignedApprovalCount: 0 })).toBeFalse();
    });

    it('keeps Internal Audit read-only and audit focused', () => {
        const context = {
            roleName: 'Internal Audit',
            permissions: ['dashboard.view', 'documents.view', 'softcopy-folders.view', 'activity-logs.view_logs']
        };

        expect(shouldShowPanelItem(item('softcopy-documents'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('hardcopy-documents'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('softcopy-folders'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('audit-logs'), context)).toBeTrue();
        expect(shouldShowPanelItem(item('my-document-requests'), context)).toBeFalse();
        expect(shouldShowPanelItem(item('approval-review'), context)).toBeFalse();
        expect(shouldShowPanelItem(item('roles-permissions'), context)).toBeFalse();
    });

    it('hides personal requester shortcuts from the Admin sidebar without revoking access', () => {
        const permissions = [
            'document-requests.view-own',
            'document-requests.create',
            'document-access-requests.catalog',
            'document-access-requests.view-own',
            'document-disposal.request'
        ];
        const context = { roleName: 'Admin', permissions };

        expect(canAccessPanelItem(item('my-document-requests'), permissions)).toBeTrue();
        expect(canAccessPanelItem(item('my-access-requests'), permissions)).toBeTrue();
        expect(canAccessPanelItem(item('my-disposal-requests'), permissions)).toBeTrue();
        expect(shouldShowPanelItem(item('my-document-requests'), context)).toBeFalse();
        expect(shouldShowPanelItem(item('my-access-requests'), context)).toBeFalse();
        expect(shouldShowPanelItem(item('my-disposal-requests'), context)).toBeFalse();
        expect(shouldShowPanelItem(item('my-profile'), context)).toBeFalse();
    });

    it('does not treat action-only permissions as workspace-entry permissions', () => {
        expect(canAccessPanelItem(item('softcopy-folders'), ['softcopy-folders.create'])).toBeFalse();
        expect(canAccessPanelItem(item('my-access-requests'), ['document-access-requests.cancel-own'])).toBeFalse();
        expect(canAccessPanelItem(item('workflow-builder'), ['document-workflow.publish'])).toBeFalse();
    });

    it('uses the shared registry to choose the first authorized landing page', () => {
        expect(firstAuthorizedPanelUrl(['dashboard.view'], 'Staff')).toBe('/panel/dashboard');
        expect(firstAuthorizedPanelUrl(['documents.view'], 'Internal Audit')).toBe('/panel/softcopy-documents');
        expect(firstAuthorizedPanelUrl(['activity-logs.view_logs'], 'Internal Audit')).toBe('/panel/audit-logs');
        expect(firstAuthorizedPanelUrl([], 'Staff')).toBe('/panel/my-profile');
    });

    it('protects approval review with explicit permissions', () => {
        expect(PANEL_ROUTE_PERMISSIONS.approvalReview.length).toBeGreaterThan(0);
        expect(PANEL_ROUTE_PERMISSIONS.approvalReview).toContain('document-requests.review');
    });
});
