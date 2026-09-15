import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, finalize } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { Role } from '../roles-permissions/role-permission.types';
import { RolePermissionService } from '../roles-permissions/role-permission.service';
import { UserAccountSummary } from '../user-account/user-account.types';
import { UserAccountService } from '../user-account/user-account.service';
import { WorkflowBuilderService } from './workflow-builder.service';
import { EditableWorkflowAssignmentType, WorkflowDefinition, WorkflowEdge, WorkflowGraph, WorkflowNode, WorkflowVersion } from './workflow-builder.types';

@Component({
    selector: 'app-workflow-builder-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './workflow-builder.page.html',
    styleUrl: './workflow-builder.page.scss'
})
export class WorkflowBuilderPage implements OnInit {
    private workflowsApi = inject(WorkflowBuilderService);
    private usersApi = inject(UserAccountService);
    private accessApi = inject(RolePermissionService);
    readonly auth = inject(AuthService);

    definitions: WorkflowDefinition[] = [];
    users: UserAccountSummary[] = [];
    roles: Role[] = [];
    selectedDefinition?: WorkflowDefinition;
    selectedVersion?: WorkflowVersion;
    graph: WorkflowGraph = this.blankGraph();
    loading = true;
    referenceDataLoading = false;
    referenceDataError = '';
    saving = false;
    dirty = false;
    legacyComplex = false;
    unsupportedLegacyAssignment = false;
    message = '';
    error = '';
    draggedIndex = -1;
    createOpen = false;
    createForm = { workflow_key: '', name: '', description: '', document_type: '' as '' | 'SOFTCOPY' | 'HARDCOPY' };

    private referenceDataLoaded = false;
    private loadSequence = 0;

    ngOnInit() { this.load(); }

    get canConfigure() { return this.auth.hasPermission('document-workflow.configure'); }
    get canPublish() { return this.auth.hasPermission('document-workflow.publish'); }
    get editable() {
        return this.canConfigure
            && this.selectedVersion?.status === 'DRAFT'
            && !this.legacyComplex
            && !this.unsupportedLegacyAssignment;
    }
    get approvalNodes() { return this.graph.nodes.filter((node) => node.type === 'APPROVAL'); }
    get approvedNode() { return this.graph.nodes.find((node) => node.type === 'END'); }

    load(selectDefinitionId?: string, selectVersionId?: string) {
        const sequence = ++this.loadSequence;
        this.loading = true;
        this.error = '';
        this.loadReferenceData();
        this.workflowsApi.list(true).pipe(finalize(() => {
            if (sequence === this.loadSequence) this.loading = false;
        })).subscribe({
            next: (definitions) => {
                if (sequence !== this.loadSequence) return;
                try {
                    this.applyDefinitions(Array.isArray(definitions) ? definitions : [], selectDefinitionId, selectVersionId);
                } catch (error) {
                    this.error = this.errorText(error);
                }
            },
            error: (error) => {
                if (sequence === this.loadSequence) this.error = this.errorText(error);
            }
        });
    }

    retryReferenceData() {
        this.referenceDataLoaded = false;
        this.loadReferenceData();
    }

    selectDefinition(definition?: WorkflowDefinition, versionId?: string) {
        this.selectedDefinition = definition;
        const version = definition?.versions.find((item) => item.workflow_version_id === versionId)
            || definition?.versions[0];
        this.selectVersion(version);
    }

    selectVersion(version?: WorkflowVersion) {
        if (this.dirty && !confirm('Discard unsaved workflow changes?')) return;
        this.selectedVersion = version;
        this.legacyComplex = false;
        this.unsupportedLegacyAssignment = false;
        this.graph = version ? this.prepareSequentialGraph(version.graph) : this.blankGraph();
        if (this.referenceDataLoaded && !this.legacyComplex) this.normalizeLegacyAssignments();
        this.dirty = false;
        this.clearFeedback();
    }

    selectVersionById(versionId: string) {
        this.selectVersion(this.selectedDefinition?.versions.find((version) => version.workflow_version_id === versionId));
    }

    createDefinition() {
        const name = this.createForm.name.trim();
        const key = this.createForm.workflow_key.trim().toLowerCase() || this.workflowKeyFromName(name);
        if (!name || !key) { this.error = 'Workflow name is required.'; return; }
        this.saving = true;
        this.workflowsApi.create({
            workflow_key: key,
            name,
            description: this.createForm.description.trim() || undefined,
            document_type: this.createForm.document_type || undefined,
            graph: this.blankGraph()
        }).subscribe({
            next: (created) => {
                this.saving = false;
                this.createOpen = false;
                this.createForm = { workflow_key: '', name: '', description: '', document_type: '' };
                this.load(created.workflow_definition_id);
                this.message = 'Workflow draft created.';
            },
            error: (error) => { this.saving = false; this.error = this.errorText(error); }
        });
    }

    newVersion() {
        if (!this.selectedDefinition || !this.selectedVersion) return;
        if (this.legacyComplex || this.unsupportedLegacyAssignment) {
            this.error = 'This legacy workflow contains routing or assignment rules that cannot be converted safely. Create a new sequential workflow instead.';
            return;
        }
        const validationError = this.validateDraft();
        if (validationError) { this.error = validationError; return; }
        this.saving = true;
        this.workflowsApi.createVersion(this.selectedDefinition.workflow_definition_id, this.normalizedGraph()).subscribe({
            next: (version) => {
                this.saving = false;
                this.load(this.selectedDefinition!.workflow_definition_id, version.workflow_version_id);
                this.message = 'New sequential workflow version created.';
            },
            error: (error) => { this.saving = false; this.error = this.errorText(error); }
        });
    }

    save() {
        if (!this.selectedDefinition || !this.selectedVersion || !this.editable) return;
        const validationError = this.validateDraft();
        if (validationError) { this.error = validationError; return; }
        this.saving = true;
        this.workflowsApi.save(this.selectedDefinition.workflow_definition_id, this.selectedVersion.workflow_version_id, this.normalizedGraph()).subscribe({
            next: (version) => {
                this.saving = false;
                this.selectedVersion = { ...this.selectedVersion!, ...version };
                this.graph = this.prepareSequentialGraph(version.graph);
                if (this.referenceDataLoaded) this.normalizeLegacyAssignments();
                this.dirty = false;
                this.message = 'Draft saved. Requests already in progress remain bound to their original workflow version.';
            },
            error: (error) => { this.saving = false; this.error = this.errorText(error); }
        });
    }

    publish() {
        if (!this.selectedDefinition || !this.selectedVersion || !this.canPublish || this.dirty || this.legacyComplex || this.unsupportedLegacyAssignment) return;
        const validationError = this.validateDraft();
        if (validationError) { this.error = validationError; return; }
        if (!confirm(`Publish version ${this.selectedVersion.version_number}? Published versions cannot be edited.`)) return;
        this.saving = true;
        this.workflowsApi.publish(this.selectedDefinition.workflow_definition_id, this.selectedVersion.workflow_version_id).subscribe({
            next: () => {
                this.saving = false;
                this.load(this.selectedDefinition!.workflow_definition_id, this.selectedVersion!.workflow_version_id);
                this.message = 'Workflow version published.';
            },
            error: (error) => { this.saving = false; this.error = this.errorText(error); }
        });
    }

    toggleActive() {
        if (!this.selectedDefinition || !this.canConfigure) return;
        this.workflowsApi.setActive(this.selectedDefinition.workflow_definition_id, !this.selectedDefinition.is_active).subscribe({
            next: (definition) => {
                this.selectedDefinition = definition;
                this.load(definition.workflow_definition_id, this.selectedVersion?.workflow_version_id);
            },
            error: (error) => this.error = this.errorText(error)
        });
    }

    addApproval() {
        if (!this.editable) return;
        this.graph.nodes = [
            ...this.approvalNodes,
            {
                key: this.uniqueKey('approval'),
                label: 'New approval step',
                type: 'APPROVAL',
                stage: 'CUSTOM',
                assignment: { type: 'REQUESTER_LEADER' }
            },
            this.approvedNode || this.approvedEndNode()
        ];
        this.rebuildLinearRoute();
        this.markDirty();
    }

    removeNode(node: WorkflowNode) {
        if (!this.editable || node.type !== 'APPROVAL' || this.approvalNodes.length <= 1) return;
        this.graph.nodes = this.graph.nodes.filter((item) => item.key !== node.key);
        this.rebuildLinearRoute();
        this.markDirty();
    }

    setAssignmentType(node: WorkflowNode, type: EditableWorkflowAssignmentType) {
        node.assignment = { type };
        node.required_permission = undefined;
        this.markDirty();
    }

    dragStart(index: number) { if (this.editable) this.draggedIndex = index; }

    drop(index: number) {
        if (!this.editable || this.draggedIndex < 0 || this.draggedIndex === index) return;
        const approvals = [...this.approvalNodes];
        const [node] = approvals.splice(this.draggedIndex, 1);
        approvals.splice(index, 0, node);
        this.graph.nodes = [...approvals, this.approvedNode || this.approvedEndNode()];
        this.draggedIndex = -1;
        this.rebuildLinearRoute();
        this.markDirty();
    }

    moveStep(index: number, direction: -1 | 1) {
        const target = index + direction;
        const approvals = [...this.approvalNodes];
        if (!this.editable || target < 0 || target >= approvals.length) return;
        [approvals[index], approvals[target]] = [approvals[target], approvals[index]];
        this.graph.nodes = [...approvals, this.approvedNode || this.approvedEndNode()];
        this.rebuildLinearRoute();
        this.markDirty();
    }

    userLabel(user: UserAccountSummary) { return `${user.firstname} ${user.lastname} · ${user.role.role_name}`; }
    versionLabel(version: WorkflowVersion) { return `Version ${version.version_number} · ${version.status}${version._count?.documents ? ` · ${version._count.documents} request(s)` : ''}`; }
    trackDefinition(_index: number, definition: WorkflowDefinition) { return definition.workflow_definition_id; }
    trackVersion(_index: number, version: WorkflowVersion) { return version.workflow_version_id; }
    trackNode(_index: number, node: WorkflowNode) { return node.key; }
    trackUser(_index: number, user: UserAccountSummary) { return user.user_id; }
    trackRole(_index: number, role: Role) { return role.role_id; }
    markDirty() { if (this.editable) { this.dirty = true; this.clearFeedback(); } }

    private loadReferenceData() {
        if (this.referenceDataLoaded || this.referenceDataLoading) return;
        this.referenceDataLoading = true;
        this.referenceDataError = '';
        forkJoin({
            users: this.usersApi.listUsers(1, 1000),
            roles: this.accessApi.listRoles()
        }).pipe(finalize(() => this.referenceDataLoading = false)).subscribe({
            next: ({ users, roles }) => {
                this.users = users.items || [];
                this.roles = roles;
                this.referenceDataLoaded = true;
                if (this.selectedVersion && !this.legacyComplex) this.normalizeLegacyAssignments();
            },
            error: (error) => {
                this.referenceDataError = this.errorText(error);
            }
        });
    }

    private applyDefinitions(definitions: WorkflowDefinition[], selectDefinitionId?: string, selectVersionId?: string) {
        this.definitions = definitions;
        const definition = definitions.find((item) => item.workflow_definition_id === selectDefinitionId)
            || definitions.find((item) => item.workflow_definition_id === this.selectedDefinition?.workflow_definition_id)
            || definitions[0];
        this.selectDefinition(definition, selectVersionId);
    }

    private prepareSequentialGraph(source: WorkflowGraph): WorkflowGraph {
        const graph = this.copyGraph(source);
        const nodesByKey = new Map(graph.nodes.map((node) => [node.key, node]));
        const endNodes = graph.nodes.filter((node) => node.type === 'END');
        const approvalCount = graph.nodes.filter((node) => node.type === 'APPROVAL').length;
        const ordered: WorkflowNode[] = [];
        const visited = new Set<string>();
        let currentKey = graph.start_node_key;
        let valid = endNodes.length === 1 && approvalCount > 0 && graph.edges.length === approvalCount;

        while (valid && currentKey) {
            if (visited.has(currentKey)) { valid = false; break; }
            visited.add(currentKey);
            const node = nodesByKey.get(currentKey);
            if (!node) { valid = false; break; }
            if (node.type === 'END') break;
            if (node.type !== 'APPROVAL') { valid = false; break; }
            ordered.push(node);
            const outgoing = graph.edges.filter((edge) => edge.from === node.key);
            if (outgoing.length !== 1 || outgoing[0].outcome !== 'APPROVE' || outgoing[0].conditions?.length) {
                valid = false;
                break;
            }
            currentKey = outgoing[0].to;
        }

        const finalNode = nodesByKey.get(currentKey);
        if (!valid || finalNode?.type !== 'END' || ordered.length !== approvalCount || visited.size !== graph.nodes.length) {
            this.legacyComplex = true;
            return graph;
        }

        const normalized: WorkflowGraph = {
            schema_version: 2,
            start_node_key: ordered[0].key,
            nodes: [...ordered, finalNode],
            edges: []
        };
        normalized.edges = this.linearEdges(normalized.nodes);
        return normalized;
    }

    private normalizeLegacyAssignments() {
        if (this.legacyComplex) return;
        let unresolved = false;
        for (const node of this.approvalNodes) {
            if (node.required_permission && node.assignment?.type !== 'PERMISSION') {
                unresolved = true;
                continue;
            }
            if (!node.assignment) {
                unresolved = true;
                continue;
            }
            if (node.assignment.type !== 'PERMISSION') continue;
            const replacement = this.replacementForLegacyPermission(node);
            if (replacement) {
                node.assignment = replacement;
                node.required_permission = undefined;
            } else {
                unresolved = true;
            }
        }
        this.unsupportedLegacyAssignment = unresolved;
    }

    private replacementForLegacyPermission(node: WorkflowNode): WorkflowNode['assignment'] | undefined {
        if (node.stage === 'NOTED_BY') return { type: 'REQUESTER_LEADER' };
        const roleName = node.stage === 'PLANT_MANAGER'
            ? 'Plant Manager'
            : node.stage === 'DOCUMENT_CONTROLLER_ADMIN' || node.stage === 'HARDCOPY_APPROVAL'
                ? 'Documentation Officer'
                : undefined;
        if (!roleName) return undefined;
        const role = this.roles.find((item) => item.role_name.trim().toLowerCase() === roleName.toLowerCase());
        return role ? { type: 'ROLE', role_id: role.role_id } : undefined;
    }

    private validateDraft() {
        if (this.legacyComplex) return 'Legacy branching workflows are read-only. Create a new sequential workflow instead.';
        if (this.unsupportedLegacyAssignment) return 'This legacy workflow contains an assignment rule that cannot be converted safely.';
        const approvals = this.approvalNodes;
        if (!approvals.length) return 'Add at least one approval step.';
        if (approvals.length > 15) return 'A workflow can contain at most 15 approval steps.';
        for (const node of approvals) {
            if (!node.label?.trim()) return 'Every approval step needs a name.';
            if (!node.assignment) return `${node.label || 'Approval step'} needs an approver.`;
            if (node.required_permission) return `${node.label} contains legacy permission routing and cannot be saved as a sequential route.`;
            if (node.assignment.type === 'USER' && !node.assignment.user_id) return `${node.label} needs a selected person.`;
            if (node.assignment.type === 'ROLE' && !node.assignment.role_id) return `${node.label} needs a selected role.`;
            if (node.assignment.type === 'PERMISSION') return `${node.label} still uses an unsupported legacy permission assignment.`;
        }
        return '';
    }

    private rebuildLinearRoute() {
        const approvals = this.approvalNodes;
        const end = this.approvedNode || this.approvedEndNode();
        this.graph.nodes = [...approvals, end];
        this.graph.start_node_key = approvals[0]?.key || '';
        this.graph.edges = this.linearEdges(this.graph.nodes);
    }

    private linearEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
        const approvals = nodes.filter((node) => node.type === 'APPROVAL');
        const end = nodes.find((node) => node.type === 'END');
        if (!end) return [];
        return approvals.map((node, index) => ({
            key: `${node.key}-approve`,
            from: node.key,
            to: approvals[index + 1]?.key || end.key,
            outcome: 'APPROVE'
        }));
    }

    private normalizedGraph(): WorkflowGraph {
        this.rebuildLinearRoute();
        return {
            schema_version: 2,
            start_node_key: this.graph.start_node_key,
            nodes: this.graph.nodes.map((node) => {
                if (node.type === 'END') return { key: node.key, label: node.label, type: 'END' as const };
                const assignment = node.assignment?.type === 'USER'
                    ? { type: 'USER' as const, user_id: node.assignment.user_id }
                    : node.assignment?.type === 'ROLE'
                        ? { type: 'ROLE' as const, role_id: node.assignment.role_id }
                        : { type: 'REQUESTER_LEADER' as const };
                return {
                    key: node.key,
                    label: node.label.trim(),
                    type: 'APPROVAL' as const,
                    stage: node.stage || 'CUSTOM',
                    assignment
                };
            }),
            edges: this.linearEdges(this.graph.nodes)
        };
    }

    private approvedEndNode(): WorkflowNode {
        return { key: 'approved', label: 'Approved', type: 'END' };
    }

    private blankGraph(): WorkflowGraph {
        return {
            schema_version: 2,
            start_node_key: 'approval-1',
            nodes: [
                { key: 'approval-1', label: 'Approval', type: 'APPROVAL', stage: 'CUSTOM', assignment: { type: 'REQUESTER_LEADER' } },
                this.approvedEndNode()
            ],
            edges: [{ key: 'approval-1-approve', from: 'approval-1', to: 'approved', outcome: 'APPROVE' }]
        };
    }

    private clearFeedback() { this.message = ''; this.error = ''; }
    private uniqueKey(prefix: string) { let index = 1; while (this.graph.nodes.some((node) => node.key === `${prefix}-${index}`)) index++; return `${prefix}-${index}`; }
    private workflowKeyFromName(name: string) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 88); }
    private copyGraph(graph: WorkflowGraph): WorkflowGraph { return JSON.parse(JSON.stringify(graph)); }
    private errorText(error: unknown) {
        const value = error as { error?: { message?: string | string[] }; message?: string };
        return Array.isArray(value?.error?.message) ? value.error!.message!.join(' ') : value?.error?.message || value?.message || 'The workflow operation failed.';
    }
}
