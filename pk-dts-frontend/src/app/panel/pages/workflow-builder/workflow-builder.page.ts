import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, finalize } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { Permission, Role } from '../roles-permissions/role-permission.types';
import { RolePermissionService } from '../roles-permissions/role-permission.service';
import { UserAccountSummary } from '../user-account/user-account.types';
import { UserAccountService } from '../user-account/user-account.service';
import { WorkflowBuilderService } from './workflow-builder.service';
import { WorkflowCondition, WorkflowDefinition, WorkflowEdge, WorkflowGraph, WorkflowNode, WorkflowOutcome, WorkflowVersion } from './workflow-builder.types';

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
    permissions: Permission[] = [];
    selectedDefinition?: WorkflowDefinition;
    selectedVersion?: WorkflowVersion;
    graph: WorkflowGraph = this.blankGraph();
    loading = true;
    referenceDataLoading = false;
    referenceDataError = '';
    saving = false;
    dirty = false;
    message = '';
    error = '';
    draggedIndex = -1;
    createOpen = false;
    createForm = { workflow_key: '', name: '', description: '', document_type: '' as '' | 'SOFTCOPY' | 'HARDCOPY' };

    readonly outcomes: WorkflowOutcome[] = ['APPROVE', 'REJECT', 'RETURN', 'DEFAULT'];
    readonly conditionFields: WorkflowCondition['field'][] = ['document_type', 'action_requested', 'business_document_type', 'requester_type'];

    private referenceDataLoaded = false;
    private edgeLookup = new Map<string, WorkflowEdge>();
    private loadSequence = 0;

    ngOnInit() { this.load(); }

    get canConfigure() { return this.auth.hasPermission('document-workflow.configure'); }
    get canPublish() { return this.auth.hasPermission('document-workflow.publish'); }
    get editable() { return this.canConfigure && this.selectedVersion?.status === 'DRAFT'; }
    get approvalNodes() { return this.graph.nodes.filter((node) => node.type === 'APPROVAL'); }

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
        this.graph = version ? this.copyGraph(version.graph) : this.blankGraph();
        this.rebuildEdgeLookup();
        this.dirty = false;
        this.clearFeedback();
    }

    selectVersionById(versionId: string) {
        this.selectVersion(this.selectedDefinition?.versions.find((version) => version.workflow_version_id === versionId));
    }

    createDefinition() {
        const name = this.createForm.name.trim();
        const key = this.createForm.workflow_key.trim().toLowerCase() || this.workflowKeyFromName(name);
        if (!name || !key) { this.error = 'Workflow name and key are required.'; return; }
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
        if (!this.selectedDefinition) return;
        this.saving = true;
        this.workflowsApi.createVersion(this.selectedDefinition.workflow_definition_id).subscribe({
            next: (version) => { this.saving = false; this.load(this.selectedDefinition!.workflow_definition_id, version.workflow_version_id); },
            error: (error) => { this.saving = false; this.error = this.errorText(error); }
        });
    }

    save() {
        if (!this.selectedDefinition || !this.selectedVersion || !this.editable) return;
        this.saving = true;
        this.workflowsApi.save(this.selectedDefinition.workflow_definition_id, this.selectedVersion.workflow_version_id, this.normalizedGraph()).subscribe({
            next: (version) => {
                this.saving = false;
                this.selectedVersion = { ...this.selectedVersion!, ...version };
                this.graph = this.copyGraph(version.graph);
                this.rebuildEdgeLookup();
                this.dirty = false;
                this.message = 'Draft saved. Requests already in progress remain bound to their original snapshot.';
            },
            error: (error) => { this.saving = false; this.error = this.errorText(error); }
        });
    }

    publish() {
        if (!this.selectedDefinition || !this.selectedVersion || !this.canPublish || this.dirty) return;
        if (!confirm(`Publish version ${this.selectedVersion.version_number}? The published version becomes immutable.`)) return;
        this.saving = true;
        this.workflowsApi.publish(this.selectedDefinition.workflow_definition_id, this.selectedVersion.workflow_version_id).subscribe({
            next: () => { this.saving = false; this.load(this.selectedDefinition!.workflow_definition_id, this.selectedVersion!.workflow_version_id); this.message = 'Workflow version published.'; },
            error: (error) => { this.saving = false; this.error = this.errorText(error); }
        });
    }

    toggleActive() {
        if (!this.selectedDefinition || !this.canConfigure) return;
        this.workflowsApi.setActive(this.selectedDefinition.workflow_definition_id, !this.selectedDefinition.is_active).subscribe({
            next: (definition) => { this.selectedDefinition = definition; this.load(definition.workflow_definition_id, this.selectedVersion?.workflow_version_id); },
            error: (error) => this.error = this.errorText(error)
        });
    }

    addApproval() {
        const key = this.uniqueKey('approval');
        this.graph.nodes.push({
            key, label: 'New approval step', type: 'APPROVAL', stage: 'CUSTOM',
            assignment: { type: 'REQUESTER_LEADER' }, position: { x: 80, y: this.graph.nodes.length * 160 }
        });
        this.markDirty();
    }

    addEnd() {
        this.graph.nodes.push({ key: this.uniqueKey('end'), label: 'End', type: 'END', position: { x: 80, y: this.graph.nodes.length * 160 } });
        this.markDirty();
    }

    removeNode(node: WorkflowNode) {
        if (!this.editable || this.graph.nodes.length === 1) return;
        this.graph.nodes = this.graph.nodes.filter((item) => item.key !== node.key);
        this.graph.edges = this.graph.edges.filter((edge) => edge.from !== node.key && edge.to !== node.key);
        this.rebuildEdgeLookup();
        if (this.graph.start_node_key === node.key) this.graph.start_node_key = this.graph.nodes[0].key;
        this.markDirty();
    }

    setAssignmentType(node: WorkflowNode, type: WorkflowNode['assignment'] extends infer _T ? 'USER' | 'ROLE' | 'REQUESTER_LEADER' | 'PERMISSION' : never) {
        node.assignment = { type };
        node.required_permission = undefined;
        this.markDirty();
    }

    target(node: WorkflowNode, outcome: WorkflowOutcome) {
        return this.edge(node, outcome)?.to || '';
    }

    setTarget(node: WorkflowNode, outcome: WorkflowOutcome, target: string) {
        this.graph.edges = this.graph.edges.filter((edge) => !(edge.from === node.key && edge.outcome === outcome));
        if (target) this.graph.edges.push({ key: this.uniqueEdgeKey(node.key, outcome), from: node.key, to: target, outcome });
        this.rebuildEdgeLookup();
        this.markDirty();
    }

    conditions(node: WorkflowNode, outcome: WorkflowOutcome) {
        return this.edge(node, outcome)?.conditions || [];
    }

    addCondition(node: WorkflowNode, outcome: WorkflowOutcome) {
        const edge = this.edge(node, outcome);
        if (!edge) { this.error = `Connect the ${this.outcomeLabel(outcome)} path before adding conditions.`; return; }
        edge.conditions ||= [];
        edge.conditions.push({ field: 'document_type', operator: 'EQUALS', value: 'SOFTCOPY' });
        this.markDirty();
    }

    removeCondition(node: WorkflowNode, outcome: WorkflowOutcome, index: number) {
        const edge = this.edge(node, outcome);
        edge?.conditions?.splice(index, 1);
        this.markDirty();
    }

    conditionValue(condition: WorkflowCondition) { return Array.isArray(condition.value) ? condition.value.join(', ') : condition.value; }
    setConditionValue(condition: WorkflowCondition, value: string) { condition.value = condition.operator === 'IN' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value; this.markDirty(); }
    setConditionOperator(condition: WorkflowCondition, operator: WorkflowCondition['operator']) { condition.operator = operator; condition.value = operator === 'IN' ? [String(condition.value)] : String(condition.value); this.markDirty(); }

    dragStart(index: number) { if (this.editable) this.draggedIndex = index; }
    drop(index: number) {
        if (!this.editable || this.draggedIndex < 0 || this.draggedIndex === index) return;
        const [node] = this.graph.nodes.splice(this.draggedIndex, 1);
        this.graph.nodes.splice(index, 0, node);
        this.graph.nodes.forEach((item, order) => item.position = { x: item.position?.x ?? 80, y: order * 160 });
        this.draggedIndex = -1;
        this.markDirty();
    }

    userLabel(user: UserAccountSummary) { return `${user.firstname} ${user.lastname} · ${user.role.role_name}`; }
    versionLabel(version: WorkflowVersion) { return `Version ${version.version_number} · ${version.status}${version._count?.documents ? ` · ${version._count.documents} request(s)` : ''}`; }
    outcomeLabel(outcome: WorkflowOutcome) { return ({ APPROVE: 'Approve', REJECT: 'Reject', RETURN: 'Return', DEFAULT: 'Default' })[outcome]; }
    markDirty() { if (this.editable) { this.dirty = true; this.clearFeedback(); } }

    trackDefinition(_index: number, definition: WorkflowDefinition) { return definition.workflow_definition_id; }
    trackVersion(_index: number, version: WorkflowVersion) { return version.workflow_version_id; }
    trackNode(_index: number, node: WorkflowNode) { return node.key; }
    trackUser(_index: number, user: UserAccountSummary) { return user.user_id; }
    trackRole(_index: number, role: Role) { return role.role_id; }
    trackPermission(_index: number, permission: Permission) { return permission.permission_id; }
    trackOutcome(_index: number, outcome: WorkflowOutcome) { return outcome; }
    trackConditionField(_index: number, field: WorkflowCondition['field']) { return field; }

    private loadReferenceData() {
        if (this.referenceDataLoaded || this.referenceDataLoading) return;
        this.referenceDataLoading = true;
        this.referenceDataError = '';
        forkJoin({
            users: this.usersApi.listUsers(1, 1000),
            roles: this.accessApi.listRoles(),
            permissions: this.accessApi.listPermissions()
        }).pipe(finalize(() => this.referenceDataLoading = false)).subscribe({
            next: ({ users, roles, permissions }) => {
                this.users = users.items || [];
                this.roles = roles;
                this.permissions = permissions;
                this.referenceDataLoaded = true;
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

    private edge(node: WorkflowNode, outcome: WorkflowOutcome) {
        return this.edgeLookup.get(this.edgeLookupKey(node.key, outcome));
    }

    private rebuildEdgeLookup() {
        this.edgeLookup.clear();
        for (const edge of this.graph.edges) {
            this.edgeLookup.set(this.edgeLookupKey(edge.from, edge.outcome), edge);
        }
    }

    private edgeLookupKey(nodeKey: string, outcome: WorkflowOutcome) { return `${nodeKey}:${outcome}`; }
    private clearFeedback() { this.message = ''; this.error = ''; }
    private uniqueKey(prefix: string) { let index = 1; while (this.graph.nodes.some((node) => node.key === `${prefix}-${index}`)) index++; return `${prefix}-${index}`; }
    private workflowKeyFromName(name: string) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 88); }
    private uniqueEdgeKey(from: string, outcome: WorkflowOutcome) { return `${from}-${outcome.toLowerCase()}-${Date.now()}`.slice(0, 100); }
    private copyGraph(graph: WorkflowGraph): WorkflowGraph { return JSON.parse(JSON.stringify(graph)); }
    private normalizedGraph(): WorkflowGraph { return { ...this.copyGraph(this.graph), schema_version: 2 }; }
    private blankGraph(): WorkflowGraph {
        return {
            schema_version: 2,
            start_node_key: 'approval-1',
            nodes: [
                { key: 'approval-1', label: 'Approval', type: 'APPROVAL', stage: 'CUSTOM', assignment: { type: 'REQUESTER_LEADER' }, position: { x: 80, y: 0 } },
                { key: 'end-approved', label: 'Approved', type: 'END', position: { x: 80, y: 160 } }
            ],
            edges: [{ key: 'approval-1-approve', from: 'approval-1', to: 'end-approved', outcome: 'APPROVE' }]
        };
    }
    private errorText(error: unknown) {
        const value = error as { error?: { message?: string | string[] }; message?: string };
        return Array.isArray(value?.error?.message) ? value.error!.message!.join(' ') : value?.error?.message || value?.message || 'The workflow operation failed.';
    }
}
