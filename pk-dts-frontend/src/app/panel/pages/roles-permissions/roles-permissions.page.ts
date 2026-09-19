import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import type { PaginatorState } from 'primeng/types/paginator';
import { Observable, forkJoin } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { AlertModalComponent } from '@/app/shared/components/alert-modal/alert-modal.component';
import { ConfirmationDialogComponent } from '@/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { LoadingShimmerComponent } from '@/app/shared/components/loading-shimmer/loading-shimmer.component';
import { PaginationComponent } from '@/app/shared/components/pagination/pagination.component';
import { TableShellComponent } from '@/app/shared/components/table-shell/table-shell.component';
import { DataViewMode, DataViewSwitchComponent } from '@/app/shared/components/data-view-switch/data-view-switch.component';
import { RecordCardComponent, RecordGridComponent } from '@/app/shared/components/record-grid/record-grid.component';
import { RolePermissionService } from './role-permission.service';
import { Permission, Role, RolePermission } from './role-permission.types';
import { PermissionAssignmentDialogComponent, PermissionAssignmentFormValue } from './components/permission-assignment-dialog/permission-assignment-dialog.component';
import { ResourceFormDialogComponent, ResourceFormValue } from './components/resource-form-dialog/resource-form-dialog.component';
import { ResourceViewDialogComponent, ResourceViewDialogData } from './components/resource-view-dialog/resource-view-dialog.component';
import { WorkspacePageComponent } from '@/app/shared/components/workspace-ui/workspace-ui.component';

type NoticeSeverity = 'success' | 'error' | 'warning' | 'info';
type DeleteTargetType = 'role' | 'rolePermission';

interface NoticeState {
    severity: NoticeSeverity;
    title: string;
    message: string;
    details?: string;
}

interface DeleteTarget {
    type: DeleteTargetType;
    id: string;
    label: string;
}

@Component({
    selector: 'app-roles-permissions-page',
    standalone: true,
    imports: [WorkspacePageComponent, CommonModule, ButtonModule, AlertModalComponent, ConfirmationDialogComponent, LoadingShimmerComponent, PaginationComponent, TableShellComponent, DataViewSwitchComponent, RecordGridComponent, RecordCardComponent, ResourceFormDialogComponent, ResourceViewDialogComponent, PermissionAssignmentDialogComponent],
    template: `<app-workspace-page>
        <app-loading-shimmer *ngIf="isLoading()" label="Loading roles and permissions" [columns]="5" />
        <section class="role-permission-page space-y-6" [style.display]="isLoading() ? 'none' : null">
            <div *ngIf="errorMessage()" class="surface-alert">
                <div class="flex items-start gap-3">
                    <i class="pi pi-exclamation-triangle mt-1 text-red-500"></i>
                    <div>
                        <div class="font-bold text-red-700">Unable to load access-control data.</div>
                        <div class="mt-1 text-sm text-red-600">{{ errorMessage() }}</div>
                    </div>
                </div>
            </div>

            <article class="surface-card p-5 sm:p-6">
                <div class="section-head">
                    <div>
                        <h2 class="m-0 text-xl font-black text-slate-900">Roles</h2>
                        <p class="m-0 mt-1 text-sm text-slate-500">Admin, Internal Audit, Documentation Officer, Staff, and Plant Manager.</p>
                    </div>
                </div>

                <app-data-view-switch [(mode)]="viewMode" title="Role results" />

                <app-table-shell *ngIf="viewMode === 'list'" class="mt-5" minWidth="100%">
                        <thead>
                            <tr>
                                <th class="px-4 py-3 font-bold">Role</th>
                                <th class="px-4 py-3 font-bold">Users</th>
                                <th class="px-4 py-3 font-bold">Permissions</th>
                                <th class="px-4 py-3 text-right font-bold">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            <tr *ngFor="let role of pagedRoles; trackBy: trackRole" class="align-top">
                                <td class="px-4 py-4">
                                    <div class="font-black text-slate-900">{{ role.role_name }}</div>
                                    <div class="mt-1 max-w-xs text-sm leading-6 text-slate-500">
                                        {{ role.description || 'No description added.' }}
                                    </div>
                                </td>
                                <td class="px-4 py-4">
                                    <span class="count-pill">{{ userCount(role) }} user{{ userCount(role) === 1 ? '' : 's' }}</span>
                                </td>
                                <td class="px-4 py-4">
                                    <div *ngIf="roleAssignedPermissions(role).length; else noRolePermissions" class="flex max-w-sm flex-wrap gap-2">
                                        <span *ngFor="let permission of roleAssignedPermissions(role); trackBy: trackPermission" class="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                                            {{ permission.permission_name }}
                                        </span>
                                    </div>
                                    <ng-template #noRolePermissions>
                                        <span class="text-sm text-slate-400">No permission yet</span>
                                    </ng-template>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="flex justify-end gap-2">
                                        <p-button icon="pi pi-eye" [rounded]="true" [outlined]="true" (onClick)="openRoleView(role)" />
                                        <p-button *ngIf="canManage()" icon="pi pi-link" [rounded]="true" [outlined]="true" (onClick)="openAssignmentDialog(role)" />
                                    </div>
                                </td>
                            </tr>
                            <tr *ngIf="!roles().length && !isLoading()">
                                <td colspan="4" class="px-4 py-10 text-center text-slate-500">No system roles found.</td>
                            </tr>
                        </tbody>
                </app-table-shell>

                <app-record-grid *ngIf="viewMode === 'grid'" [empty]="!roles().length && !isLoading()" emptyTitle="No roles found" emptyMessage="Create the first role to start.">
                    <app-record-card *ngFor="let role of pagedRoles; trackBy: trackRole" icon="pi pi-shield" eyebrow="Access role" [title]="role.role_name" [subtitle]="role.description || 'No description'">
                        <div record-badges><span>{{ userCount(role) }} user{{ userCount(role) === 1 ? '' : 's' }}</span><span>{{ permissionNames(role).length }} permission{{ permissionNames(role).length === 1 ? '' : 's' }}</span></div>
                        <div record-details>
                            <div class="wide"><span>Permissions</span><strong>{{ permissionNames(role).length ? permissionNames(role).join(', ') : 'No permission yet' }}</strong></div>
                        </div>
                        <div record-actions>
                            <p-button label="View" icon="pi pi-eye" size="small" [outlined]="true" (onClick)="openRoleView(role)" />
                            <p-button *ngIf="canManage()" icon="pi pi-link" size="small" [rounded]="true" [outlined]="true" (onClick)="openAssignmentDialog(role)" />
                        </div>
                    </app-record-card>
                </app-record-grid>

                <div *ngIf="roles().length" class="pagination-footer mt-5 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div class="text-sm text-slate-500">
                        Showing <span class="font-bold text-slate-900">{{ pageStart }}</span> to <span class="font-bold text-slate-900">{{ pageEnd }}</span> of <span class="font-bold text-slate-900">{{ roles().length }}</span> role{{
                            roles().length === 1 ? '' : 's'
                        }}
                    </div>

                    <app-pagination
                        [first]="first"
                        [rows]="rows"
                        [totalRecords]="roles().length"
                        [rowsPerPageOptions]="rowsPerPageOptions"
                        [pageLinkSize]="4"
                        [showCurrentPageReport]="false"
                        currentPageReportTemplate="Showing {first} to {last} of {totalRecords} roles"
                        (pageChange)="onPageChange($event)"
                    />
                </div>
            </article>
        </section>

        <app-resource-form-dialog [(visible)]="roleDialogVisible" kind="role" [mode]="roleFormMode" [form]="roleForm" [saving]="isSaving()" (save)="saveRole($event)" />

        <app-permission-assignment-dialog
            [(visible)]="assignmentDialogVisible"
            [roles]="roles()"
            [permissions]="permissions()"
            [loading]="isLoading()"
            [form]="assignmentForm"
            [roleName]="assignmentRoleName"
            [saving]="isSaving()"
            (roleSelectionChange)="syncAssignmentSelection($event)"
            (save)="assignPermissions()"
        />

        <app-resource-view-dialog [(visible)]="viewDialogVisible" [data]="viewData()" />

        <app-confirmation-dialog
            [(visible)]="deleteConfirmVisible"
            title="Delete item?"
            subtitle="This action cannot be undone"
            [message]="deleteMessage()"
            confirmLabel="Delete"
            cancelLabel="Cancel"
            tone="danger"
            [dismissableMask]="true"
            (confirm)="confirmDelete()"
        />

        <app-alert-modal [(visible)]="noticeVisible" [severity]="notice()?.severity ?? 'info'" [title]="notice()?.title ?? 'Notice'" [message]="notice()?.message ?? ''" [details]="notice()?.details ?? ''" />
    </app-workspace-page>`,
    styles: [
        `
            :host {
                display: block;
            }

            .role-permission-page {
                color: #0f172a;
            }

            .surface-card {
                border: 1px solid rgba(148, 163, 184, 0.18);
                border-radius: 1.75rem;
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.96));
                box-shadow:
                    0 24px 64px rgba(15, 23, 42, 0.08),
                    0 2px 8px rgba(15, 23, 42, 0.04);
            }

            .hero-strip {
                height: 0.5rem;
                background: linear-gradient(90deg, var(--brand-primary) 0%, var(--brand-primary-hover) 50%, var(--brand-primary-deep) 100%);
            }

            .surface-alert {
                border: 1px solid rgba(252, 165, 165, 0.6);
                border-radius: 1.25rem;
                background: linear-gradient(180deg, var(--brand-soft) 0%, var(--brand-soft-strong) 100%);
                padding: 1rem 1.25rem;
            }

            .section-head {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
            }

            .stat-card {
                border: 1px solid rgba(226, 232, 240, 1);
                border-radius: 1.35rem;
                background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
                padding: 1rem 1.1rem;
            }

            .stat-label {
                font-size: 0.75rem;
                font-weight: 800;
                letter-spacing: 0.18em;
                text-transform: uppercase;
                color: #64748b;
            }

            .stat-value {
                margin-top: 0.55rem;
                font-size: 2rem;
                line-height: 1;
                font-weight: 900;
                color: #111827;
            }

            .stat-hint {
                margin-top: 0.4rem;
                font-size: 0.86rem;
                line-height: 1.5;
                color: #64748b;
            }

            .count-pill {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 9999px;
                border: 1px solid rgba(220, 38, 38, 0.18);
                background: rgba(254, 242, 242, 0.98);
                padding: 0.35rem 0.8rem;
                font-size: 0.75rem;
                font-weight: 800;
                color: var(--brand-primary);
            }

            .count-pill-emerald {
                border-color: rgba(220, 38, 38, 0.16);
                background: rgba(255, 255, 255, 0.96);
                color: var(--brand-primary-deep);
            }
        `
    ]
})
export class RolesPermissionsPage implements OnInit {
    private auth = inject(AuthService);
    private accessControlService = inject(RolePermissionService);
    private alerts = inject(AlertDialogService);
    private systemSettings = inject(SystemSettingsService);

    roles = signal<Role[]>([]);
    permissions = signal<Permission[]>([]);
    rolePermissions = signal<RolePermission[]>([]);

    isLoading = signal(true);
    isSaving = signal(false);
    errorMessage = signal('');
    notice = signal<NoticeState | null>(null);
    viewData = signal<ResourceViewDialogData | null>(null);

    roleDialogVisible = false;
    assignmentDialogVisible = false;
    viewDialogVisible = false;
    deleteConfirmVisible = false;
    noticeVisible = false;

    roleFormMode: 'create' | 'update' = 'create';
    editingRoleId = '';
    assignmentRoleName = '';
    first = 0;
    rows = 6;
    rowsPerPageOptions = [10, 20, 50];
    viewMode: DataViewMode = 'list';

    roleForm: ResourceFormValue = this.emptyRoleForm();
    assignmentForm: PermissionAssignmentFormValue = this.emptyAssignmentForm();
    deleteTarget: DeleteTarget | null = null;

    totalUsers = computed(() => this.roles().reduce((total, role) => total + this.userCount(role), 0));
    coveragePercent = computed(() => {
        const totalRoles = this.roles().length;
        if (!totalRoles) {
            return 0;
        }

        const coveredRoles = this.roles().filter((role) => this.roleAssignedPermissions(role).length > 0).length;
        return Math.round((coveredRoles / totalRoles) * 100);
    });
    canManage = computed(() => this.auth.hasAnyPermission('roles-permissions.manage'));

    get pagedRoles() {
        return this.roles().slice(this.first, this.first + this.rows);
    }

    get pageStart() {
        return this.roles().length === 0 ? 0 : this.first + 1;
    }

    get pageEnd() {
        return Math.min(this.first + this.rows, this.roles().length);
    }

    ngOnInit() {
        this.viewMode = this.systemSettings.defaultDataView();
        this.rows = this.systemSettings.defaultRowsPerPage();
        this.loadData();
    }

    loadData(showLoading = this.roles().length === 0 && this.permissions().length === 0) {
        this.isLoading.set(showLoading);
        this.errorMessage.set('');

        forkJoin({
            roles: this.accessControlService.listRoles(),
            permissions: this.accessControlService.listPermissions(),
            rolePermissions: this.accessControlService.listRolePermissions()
        }).subscribe({
            next: ({ roles, permissions, rolePermissions }) => {
                this.roles.set(roles ?? []);
                this.permissions.set(permissions ?? []);
                this.rolePermissions.set(rolePermissions ?? []);
                this.isLoading.set(false);
                this.clampPagination();

                if (this.assignmentDialogVisible) {
                    this.syncAssignmentSelection(this.assignmentForm.roleId);
                }
            },
            error: (error: unknown) => {
                this.errorMessage.set(this.extractErrorMessage(error));
                this.isLoading.set(false);
            }
        });
    }

    openRoleDialog(role?: Role) {
        this.roleFormMode = role ? 'update' : 'create';
        this.editingRoleId = role ? this.roleId(role) : '';
        this.roleForm = role
            ? {
                  name: role.role_name,
                  description: role.description ?? ''
              }
            : this.emptyRoleForm();
        this.roleDialogVisible = true;
    }

    saveRole(form: ResourceFormValue) {
        if (!form.name.trim()) {
            return;
        }

        this.isSaving.set(true);
        const request = this.editingRoleId ? this.accessControlService.updateRole(this.editingRoleId, this.mapRoleForm(form)) : this.accessControlService.createRole(this.mapRoleForm(form));

        request.subscribe({
            next: () => {
                this.isSaving.set(false);
                this.roleDialogVisible = false;
                this.showNotice('success', 'Role saved', `The role "${form.name.trim()}" was saved successfully.`);
                this.loadData();
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to save role')
        });
    }

    openRoleView(role: Role) {
        const permissions = this.roleAssignedPermissions(role);
        this.viewData.set({
            kindLabel: 'Role',
            title: role.role_name,
            subtitle: 'Access profile overview',
            nameLabel: 'Role name',
            name: role.role_name,
            description: role.description ?? '',
            metrics: [
                { label: 'Users', value: String(this.userCount(role)) },
                { label: 'Permissions', value: String(permissions.length) }
            ],
            chipsLabel: 'Granted permissions',
            chips: permissions.map((permission) => permission.permission_name),
            emptyChipsText: 'This role does not have any permissions yet.'
        });
        this.viewDialogVisible = true;
    }

    openPermissionView(permission: Permission) {
        const roles = this.rolesWithPermission(permission);
        this.viewData.set({
            kindLabel: 'Permission',
            title: permission.permission_name,
            subtitle: 'Permission usage overview',
            nameLabel: 'Permission key',
            name: permission.permission_name,
            description: permission.description ?? '',
            metrics: [
                { label: 'Roles using it', value: String(roles.length) },
                { label: 'Links', value: String(this.permissionRoleCount(permission)) }
            ],
            chipsLabel: 'Assigned roles',
            chips: roles.map((role) => role.role_name),
            emptyChipsText: 'This permission is not assigned to any role yet.'
        });
        this.viewDialogVisible = true;
    }

    openAssignmentDialog(role?: Role) {
        const defaultRole = role ? this.roleId(role) : this.assignmentForm.roleId || this.roles()[0]?.role_id || '';
        this.assignmentDialogVisible = true;
        this.assignmentRoleName = role?.role_name ?? this.roleById(defaultRole)?.role_name ?? 'role';
        this.assignmentForm = {
            roleId: defaultRole,
            permissionIds: []
        };
        this.syncAssignmentSelection(defaultRole);
    }

    syncAssignmentSelection(roleId: string) {
        this.assignmentForm.roleId = roleId;
        this.assignmentRoleName = this.roleById(roleId)?.role_name ?? '';
        this.assignmentForm.permissionIds = this.roleAssignedPermissionsById(roleId).map((permission) => this.permissionId(permission));
    }

    onPageChange(event: PaginatorState) {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
    }

    assignPermissions() {
        const roleId = this.assignmentForm.roleId;
        const selectedPermissionIds = [...new Set(this.assignmentForm.permissionIds)].filter(Boolean);

        if (!roleId) {
            return;
        }

        const currentPermissionIds = new Set(this.roleAssignedPermissionsById(roleId).map((permission) => this.permissionId(permission)));
        const selectedPermissionIdSet = new Set(selectedPermissionIds);
        const permissionIdsToCreate = selectedPermissionIds.filter((permissionId) => !currentPermissionIds.has(permissionId));
        const permissionIdsToRemove = [...currentPermissionIds].filter((permissionId) => !selectedPermissionIdSet.has(permissionId));

        if (!permissionIdsToCreate.length && !permissionIdsToRemove.length) {
            this.showNotice('info', 'No changes made', 'The selected role already matches the permissions in this modal.');
            return;
        }

        this.isSaving.set(true);

        const addRequests = permissionIdsToCreate.map((permissionId) =>
            this.accessControlService.assignPermission({
                role_id: roleId,
                permission_id: permissionId
            })
        );
        const removeRequests = permissionIdsToRemove
            .map((permissionId) => this.rolePermissionLinkId(roleId, permissionId))
            .filter((id): id is string => !!id)
            .map((id) => this.accessControlService.removeRolePermission(id));

        const requests = [...addRequests, ...removeRequests];

        if (!requests.length) {
            this.isSaving.set(false);
            this.showNotice('warning', 'No permission links found', 'The role selection changed, but the matching role-permission records could not be located.');
            return;
        }

        forkJoin(requests).subscribe({
            next: () => {
                this.isSaving.set(false);
                this.assignmentDialogVisible = false;
                this.assignmentForm = this.emptyAssignmentForm();
                this.assignmentRoleName = '';
                const addedCount = permissionIdsToCreate.length;
                const removedCount = permissionIdsToRemove.length;
                this.showNotice(
                    'success',
                    'Permissions updated',
                    [addedCount ? `${addedCount} permission${addedCount === 1 ? '' : 's'} added.` : '', removedCount ? `${removedCount} permission${removedCount === 1 ? '' : 's'} removed.` : ''].filter(Boolean).join(' ')
                );
                this.loadData();
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to update permissions')
        });
    }

    requestDelete(type: DeleteTargetType, id: string, label: string) {
        if (!id) {
            this.showNotice('error', 'Missing ID', 'This row cannot be deleted because its ID was not found in the API response.');
            return;
        }

        this.deleteTarget = { type, id, label };
        this.deleteConfirmVisible = true;
    }

    confirmDelete() {
        if (!this.deleteTarget) {
            return;
        }

        this.isSaving.set(true);
        const target = this.deleteTarget;
        const request: Observable<unknown> = target.type === 'role' ? this.accessControlService.deleteRole(target.id) : this.accessControlService.removeRolePermission(target.id);

        request.subscribe({
            next: () => {
                this.isSaving.set(false);
                this.showNotice('success', 'Deleted successfully', `"${target.label}" was removed.`);
                this.deleteTarget = null;
                this.loadData();
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to delete item')
        });
    }

    deleteMessage() {
        if (!this.deleteTarget) {
            return 'Are you sure you want to delete this item?';
        }

        if (this.deleteTarget.type === 'role') {
            return `Delete the role "${this.deleteTarget.label}"? The backend may block deletion if users are still assigned to this role.`;
        }

        return `Remove the role-permission link "${this.deleteTarget.label}"?`;
    }

    roleAssignedPermissions(role: Role) {
        return this.uniquePermissions(this.roleAssignedPermissionsById(this.roleId(role)));
    }

    roleAssignedPermissionsById(roleId: string) {
        const permissionsFromLinks = this.rolePermissions()
            .filter((link) => this.stringValue(link.role_id) === roleId || this.stringValue(link.role?.role_id) === roleId)
            .map((link) => link.permission ?? this.permissionById(this.stringValue(link.permission_id)))
            .filter((permission): permission is Permission => !!permission);

        const permissionsFromRole =
            this.roleById(roleId)
                ?.role_permissions?.map((link) => link.permission ?? this.permissionById(this.stringValue(link.permission_id)))
                .filter((permission): permission is Permission => !!permission) ?? [];

        return this.uniquePermissions([...permissionsFromLinks, ...permissionsFromRole]);
    }

    rolesWithPermission(permission: Permission) {
        const permissionId = this.permissionId(permission);
        const rolesFromLinks = this.rolePermissions()
            .filter((link) => this.stringValue(link.permission_id) === permissionId || this.stringValue(link.permission?.permission_id) === permissionId)
            .map((link) => link.role ?? this.roleById(this.stringValue(link.role_id)))
            .filter((role): role is Role => !!role);

        const rolesFromPermission = permission.role_permissions?.map((link) => link.role ?? this.roleById(this.stringValue(link.role_id))).filter((role): role is Role => !!role) ?? [];

        return this.uniqueRoles([...rolesFromLinks, ...rolesFromPermission]);
    }

    userCount(role: Role) {
        return role._count?.users ?? role.users?.length ?? 0;
    }

    permissionNames(role: Role) {
        return this.roleAssignedPermissions(role).map((permission) => permission.permission_name);
    }

    permissionRoleCount(permission: Permission) {
        const permissionId = this.permissionId(permission);
        const countFromLinks = this.rolePermissions().filter((link) => this.stringValue(link.permission_id) === permissionId || this.stringValue(link.permission?.permission_id) === permissionId).length;
        return countFromLinks || permission.role_permissions?.length || 0;
    }

    roleNameForLink(link: RolePermission) {
        return link.role?.role_name ?? this.roleById(this.stringValue(link.role_id))?.role_name ?? 'Unknown role';
    }

    permissionNameForLink(link: RolePermission) {
        return link.permission?.permission_name ?? this.permissionById(this.stringValue(link.permission_id))?.permission_name ?? 'Unknown permission';
    }

    permissionDescriptionForLink(link: RolePermission) {
        return link.permission?.description ?? this.permissionById(this.stringValue(link.permission_id))?.description ?? '';
    }

    roleId(role: Role) {
        const flexibleRole = role as Role & { id?: unknown; roleId?: unknown };
        return this.stringValue(flexibleRole.role_id ?? flexibleRole.id ?? flexibleRole.roleId);
    }

    permissionId(permission: Permission) {
        const flexiblePermission = permission as Permission & { id?: unknown; permissionId?: unknown };
        return this.stringValue(flexiblePermission.permission_id ?? flexiblePermission.id ?? flexiblePermission.permissionId);
    }

    rolePermissionId(link: RolePermission) {
        const flexibleLink = link as RolePermission & { id?: unknown; rolePermissionId?: unknown };
        return this.stringValue(flexibleLink.role_permission_id ?? flexibleLink.id ?? flexibleLink.rolePermissionId);
    }

    private rolePermissionLinkId(roleId: string, permissionId: string) {
        const link = this.rolePermissions().find(
            (item) => (this.stringValue(item.role_id) === roleId || this.stringValue(item.role?.role_id) === roleId) && (this.stringValue(item.permission_id) === permissionId || this.stringValue(item.permission?.permission_id) === permissionId)
        );

        return link ? this.rolePermissionId(link) : '';
    }

    trackRole = (_index: number, role: Role) => this.roleId(role);
    trackPermission = (_index: number, permission: Permission) => this.permissionId(permission);
    trackRolePermission = (_index: number, link: RolePermission) => this.rolePermissionId(link);

    private roleById(id: string) {
        return this.roles().find((role) => this.roleId(role) === id);
    }

    private permissionById(id: string) {
        return this.permissions().find((permission) => this.permissionId(permission) === id);
    }

    private uniquePermissions(permissions: Permission[]) {
        const seen = new Set<string>();
        return permissions.filter((permission) => {
            const id = this.permissionId(permission);
            if (seen.has(id)) {
                return false;
            }

            seen.add(id);
            return true;
        });
    }

    private uniqueRoles(roles: Role[]) {
        const seen = new Set<string>();
        return roles.filter((role) => {
            const id = this.roleId(role);
            if (seen.has(id)) {
                return false;
            }

            seen.add(id);
            return true;
        });
    }

    private mapRoleForm(form: ResourceFormValue) {
        return {
            role_name: form.name,
            description: form.description
        };
    }

    private handleActionError(error: unknown, fallbackTitle: string) {
        this.isSaving.set(false);
        this.showNotice('error', fallbackTitle, this.extractErrorMessage(error));
    }

    private showNotice(severity: NoticeSeverity, title: string, message: string, details = '') {
        this.notice.set({ severity, title, message, details });
        this.noticeVisible = false;
        this.alerts.show(severity, title, message, details);
    }

    private extractErrorMessage(error: unknown) {
        if (error instanceof HttpErrorResponse) {
            const apiMessage = this.apiErrorMessage(error.error);
            return apiMessage || error.message || 'Request failed.';
        }

        if (error instanceof Error) {
            return error.message;
        }

        return 'Unexpected error. Please check the backend server and API response.';
    }

    private apiErrorMessage(errorBody: unknown): string {
        if (!errorBody) {
            return '';
        }

        if (typeof errorBody === 'string') {
            return errorBody;
        }

        if (typeof errorBody === 'object') {
            const body = errorBody as { message?: unknown; error?: unknown; details?: unknown };
            const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
            const error = Array.isArray(body.error) ? body.error.join(', ') : body.error;
            const details = Array.isArray(body.details) ? body.details.join(', ') : body.details;
            return this.stringValue(message || error || details);
        }

        return '';
    }

    private stringValue(value: unknown) {
        return value === undefined || value === null ? '' : String(value);
    }

    private emptyRoleForm(): ResourceFormValue {
        return { name: '', description: '' };
    }

    private emptyAssignmentForm(): PermissionAssignmentFormValue {
        return { roleId: '', permissionIds: [] };
    }

    private clampPagination() {
        const total = this.roles().length;
        if (total === 0) {
            this.first = 0;
            return;
        }

        const lastPageFirst = Math.max(0, Math.floor((total - 1) / this.rows) * this.rows);
        if (this.first > lastPageFirst) {
            this.first = lastPageFirst;
        }
    }
}
