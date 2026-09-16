import { panelRoutes } from './panel.routes';

describe('panel routes', () => {
    it('allows the approval workspace to be opened for an assigned workflow task', () => {
        const approvalRoute = panelRoutes[0].children?.find((route) => route.path === 'approval-review');

        expect(approvalRoute?.data?.['allowAssignedWorkflowTask']).toBeTrue();
    });
});
