import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { RolePermissionService } from '../roles-permissions/role-permission.service';
import { UserAccountService } from '../user-account/user-account.service';
import { WorkflowBuilderPage } from './workflow-builder.page';
import { WorkflowBuilderService } from './workflow-builder.service';

describe('WorkflowBuilderPage', () => {
    let fixture: ComponentFixture<WorkflowBuilderPage>;
    let versionRequest: Subject<any>;

    const workflows = jasmine.createSpyObj<WorkflowBuilderService>('WorkflowBuilderService', [
        'list',
        'getVersion',
        'create',
        'createVersion',
        'save',
        'publish',
        'setActive'
    ]);
    const users = jasmine.createSpyObj<UserAccountService>('UserAccountService', ['listUsers']);
    const roles = jasmine.createSpyObj<RolePermissionService>('RolePermissionService', ['listRoles']);
    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['hasPermission']);

    const graph = {
        schema_version: 2,
        start_node_key: 'leader',
        nodes: [
            { key: 'leader', label: 'Leader approval', type: 'APPROVAL', stage: 'NOTED_BY', assignment: { type: 'REQUESTER_LEADER' } },
            { key: 'approved', label: 'Approved', type: 'END' }
        ],
        edges: [{ key: 'leader-approve', from: 'leader', to: 'approved', outcome: 'APPROVE' }]
    };

    beforeEach(async () => {
        workflows.list.calls.reset();
        workflows.getVersion.calls.reset();
        users.listUsers.calls.reset();
        roles.listRoles.calls.reset();
        auth.hasPermission.calls.reset();
        versionRequest = new Subject<any>();
        workflows.list.and.returnValue(of([
            {
                workflow_definition_id: '1',
                workflow_key: 'system-softcopy-create',
                name: 'Softcopy approval',
                description: 'Standard softcopy route',
                document_type: 'SOFTCOPY',
                is_active: true,
                versions: [
                    {
                        workflow_version_id: '2',
                        workflow_definition_id: '1',
                        version_number: 1,
                        status: 'DRAFT',
                        published_at: null
                    }
                ]
            }
        ] as any));
        workflows.getVersion.and.returnValue(versionRequest);
        users.listUsers.and.returnValue(of({ items: [], meta: {} } as any));
        roles.listRoles.and.returnValue(of([]));
        auth.hasPermission.and.callFake((permission: string) => permission === 'document-workflow.configure' || permission === 'document-workflow.publish');

        await TestBed.configureTestingModule({
            imports: [WorkflowBuilderPage],
            providers: [
                { provide: WorkflowBuilderService, useValue: workflows },
                { provide: UserAccountService, useValue: users },
                { provide: RolePermissionService, useValue: roles },
                { provide: AuthService, useValue: auth }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(WorkflowBuilderPage);
        fixture.detectChanges();
    });

    it('loads only the workflow list until a workflow is clicked', () => {
        const page = fixture.componentInstance;

        expect(page.loading).toBeFalse();
        expect(page.versionLoading).toBeFalse();
        expect(page.selectedDefinition).toBeUndefined();
        expect(page.selectedVersion).toBeUndefined();
        expect(workflows.getVersion).not.toHaveBeenCalled();
        expect(users.listUsers).not.toHaveBeenCalled();
        expect(roles.listRoles).not.toHaveBeenCalled();

        const element = fixture.nativeElement as HTMLElement;
        expect(element.querySelector('.builder-shell')).not.toBeNull();
        expect(element.querySelector('.workflow-sidebar')).not.toBeNull();
        expect(element.querySelector('.editor-empty')).not.toBeNull();
        expect(element.querySelector('.page-heading')).toBeNull();
    });

    it('loads the selected graph first without fetching approver lists that are not needed', () => {
        const page = fixture.componentInstance;

        page.selectDefinition(page.definitions[0]);

        expect(page.selectedDefinition?.workflow_definition_id).toBe('1');
        expect(page.selectedVersion?.workflow_version_id).toBe('2');
        expect(page.versionLoading).toBeTrue();
        expect(workflows.getVersion).toHaveBeenCalledWith('1', '2');
        expect(users.listUsers).not.toHaveBeenCalled();
        expect(roles.listRoles).not.toHaveBeenCalled();

        versionRequest.next({
            workflow_version_id: '2',
            workflow_definition_id: '1',
            version_number: 1,
            status: 'DRAFT',
            graph
        });
        versionRequest.complete();

        expect(page.versionLoading).toBeFalse();
        expect(page.approvalNodes.length).toBe(1);
        expect(page.approvalNodes[0].label).toBe('Leader approval');
        expect(users.listUsers).not.toHaveBeenCalled();
        expect(roles.listRoles).not.toHaveBeenCalled();

        fixture.detectChanges();
        const element = fixture.nativeElement as HTMLElement;
        expect(element.querySelectorAll('.step-card').length).toBe(1);
        expect(element.querySelectorAll('.behavior-strip').length).toBe(1);
        expect(element.textContent).toContain('Approve → next step');
    });

    it('shows the saved role immediately and loads the full role list only when editing it', () => {
        const page = fixture.componentInstance;
        const roleGraph = {
            ...graph,
            nodes: [
                { key: 'leader', label: 'Manager approval', type: 'APPROVAL', stage: 'CUSTOM', assignment: { type: 'ROLE', role_id: '4' } },
                { key: 'approved', label: 'Approved', type: 'END' }
            ]
        };

        page.selectDefinition(page.definitions[0]);
        versionRequest.next({
            workflow_version_id: '2',
            workflow_definition_id: '1',
            version_number: 1,
            status: 'DRAFT',
            graph: roleGraph,
            assignment_references: {
                users: [],
                roles: [{ role_id: '4', role_name: 'Plant Manager' }]
            }
        });

        expect(page.versionLoading).toBeFalse();
        expect(page.assignedRoleLabel(page.approvalNodes[0])).toBe('Plant Manager');
        expect(roles.listRoles).not.toHaveBeenCalled();
        expect(users.listUsers).not.toHaveBeenCalled();

        page.prepareRoleOptions();
        expect(roles.listRoles).toHaveBeenCalledTimes(1);
    });

    it('shows the selected user in a published version without a directory lookup and clears loading on data receipt', () => {
        const page = fixture.componentInstance;
        const publishedGraph = {
            ...graph,
            nodes: [
                { key: 'leader', label: 'Plant Manager approval', type: 'APPROVAL', stage: 'CUSTOM', assignment: { type: 'USER', user_id: '77' } },
                { key: 'approved', label: 'Approved', type: 'END' }
            ]
        };
        page.definitions[0].versions[0].status = 'PUBLISHED';

        page.selectDefinition(page.definitions[0]);
        expect(page.versionLoading).toBeTrue();

        versionRequest.next({
            workflow_version_id: '2',
            workflow_definition_id: '1',
            version_number: 1,
            status: 'PUBLISHED',
            graph: publishedGraph,
            assignment_references: {
                users: [{
                    user_id: '77',
                    firstname: 'Ada',
                    lastname: 'Approver',
                    username: 'ada.approver',
                    position_title: 'Plant Manager',
                    role_name: 'Plant Manager'
                }],
                roles: []
            }
        });

        expect(page.versionLoading).toBeFalse();
        expect(users.listUsers).not.toHaveBeenCalled();
        expect(roles.listRoles).not.toHaveBeenCalled();
        expect(page.assignedUserLabel(page.approvalNodes[0])).toBe('Ada Approver · Plant Manager');

        fixture.detectChanges();
        const element = fixture.nativeElement as HTMLElement;
        expect(element.querySelector('.editor-loading')).toBeNull();
        expect(element.textContent).toContain('Ada Approver · Plant Manager');
        expect(element.textContent).not.toContain('Loading people');
    });

    it('loads people only when an editor changes a step to Specific person', () => {
        const page = fixture.componentInstance;

        page.selectDefinition(page.definitions[0]);
        versionRequest.next({
            workflow_version_id: '2',
            workflow_definition_id: '1',
            version_number: 1,
            status: 'DRAFT',
            graph
        });
        versionRequest.complete();

        page.setAssignmentType(page.approvalNodes[0], 'USER');

        expect(users.listUsers).toHaveBeenCalledTimes(1);
        expect(roles.listRoles).not.toHaveBeenCalled();
        expect(page.dirty).toBeTrue();
    });

    it('publishes in place without reloading the workflow list or graph', () => {
        const page = fixture.componentInstance;
        spyOn(window, 'confirm').and.returnValue(true);

        page.selectDefinition(page.definitions[0]);
        versionRequest.next({
            workflow_version_id: '2',
            workflow_definition_id: '1',
            version_number: 1,
            status: 'DRAFT',
            published_at: null,
            graph
        });
        versionRequest.complete();

        workflows.publish.and.returnValue(of({
            workflow_version_id: '2',
            workflow_definition_id: '1',
            version_number: 1,
            status: 'PUBLISHED',
            published_at: '2026-09-19T06:30:00.000Z',
            graph
        } as any));

        page.publish();

        expect(workflows.publish).toHaveBeenCalledWith('1', '2');
        expect(workflows.list).toHaveBeenCalledTimes(1);
        expect(workflows.getVersion).toHaveBeenCalledTimes(1);
        expect(page.selectedVersion?.status).toBe('PUBLISHED');
        expect(page.message).toContain('published');
    });

    it('changes active state in place without refetching the workflow list', () => {
        const page = fixture.componentInstance;

        page.selectDefinition(page.definitions[0]);
        versionRequest.next({
            workflow_version_id: '2',
            workflow_definition_id: '1',
            version_number: 1,
            status: 'DRAFT',
            graph
        });
        versionRequest.complete();

        workflows.setActive.and.returnValue(of({ ...page.selectedDefinition!, is_active: false } as any));
        page.toggleActive();

        expect(workflows.setActive).toHaveBeenCalledWith('1', false);
        expect(workflows.list).toHaveBeenCalledTimes(1);
        expect(workflows.getVersion).toHaveBeenCalledTimes(1);
        expect(page.selectedDefinition?.is_active).toBeFalse();
    });

    it('filters the local workflow list without another API request', () => {
        const page = fixture.componentInstance;

        page.workflowSearch = 'hardcopy';
        expect(page.filteredDefinitions).toEqual([]);
        expect(workflows.list).toHaveBeenCalledTimes(1);

        page.workflowSearch = 'softcopy';
        expect(page.filteredDefinitions.length).toBe(1);
        expect(workflows.list).toHaveBeenCalledTimes(1);
    });
});
