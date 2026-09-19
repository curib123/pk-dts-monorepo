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
                description: null,
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

    it('renders the workflow list before loading the selected graph', () => {
        const page = fixture.componentInstance;

        expect(page.loading).toBeFalse();
        expect(page.versionLoading).toBeTrue();
        expect(page.selectedDefinition?.workflow_definition_id).toBe('1');
        expect(page.selectedVersion?.workflow_version_id).toBe('2');
        expect(workflows.getVersion).toHaveBeenCalledWith('1', '2');
        expect(users.listUsers).not.toHaveBeenCalled();
        expect(roles.listRoles).not.toHaveBeenCalled();

        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('Workflows');
        expect(text).toContain('Loading selected workflow');
    });

    it('hydrates the selected graph and only then loads editor reference data', async () => {
        const page = fixture.componentInstance;

        versionRequest.next({
            workflow_version_id: '2',
            workflow_definition_id: '1',
            version_number: 1,
            status: 'DRAFT',
            graph
        });
        versionRequest.complete();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(page.versionLoading).toBeFalse();
        expect(page.approvalNodes.length).toBe(1);
        expect(page.approvalNodes[0].label).toBe('Leader approval');
        expect(users.listUsers).toHaveBeenCalledTimes(1);
        expect(roles.listRoles).toHaveBeenCalledTimes(1);
    });
});
