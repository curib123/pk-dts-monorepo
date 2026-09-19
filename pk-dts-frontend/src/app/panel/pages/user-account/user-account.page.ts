import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '@/app/auth/auth.service';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import type { PaginatorState } from 'primeng/types/paginator';
import { AlertModalComponent } from '@/app/shared/components/alert-modal/alert-modal.component';
import { ConfirmationDialogComponent } from '@/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { LoadingShimmerComponent } from '@/app/shared/components/loading-shimmer/loading-shimmer.component';
import { PaginationComponent } from '@/app/shared/components/pagination/pagination.component';
import { TableShellComponent } from '@/app/shared/components/table-shell/table-shell.component';
import { DataViewMode, DataViewSwitchComponent } from '@/app/shared/components/data-view-switch/data-view-switch.component';
import { RecordCardComponent, RecordGridComponent } from '@/app/shared/components/record-grid/record-grid.component';
import { ResourceViewDialogComponent, ResourceViewDialogData } from '../roles-permissions/components/resource-view-dialog/resource-view-dialog.component';
import { UserFormDialogComponent } from './components/user-form-dialog/user-form-dialog.component';
import { UserDocumentAssignmentDialogComponent } from './components/user-document-assignment-dialog/user-document-assignment-dialog.component';
import { UserAccountService } from './user-account.service';
import { PaginatedMeta, RegistrationRequestSummary, UserAccountDetail, UserAccountFormValue, UserAccountSummary, UserDocumentAssignmentOption, UserRoleSummary } from './user-account.types';
import { WorkspacePageComponent, WorkspaceTabsComponent } from '@/app/shared/components/workspace-ui/workspace-ui.component';

type NoticeSeverity = 'success' | 'error' | 'warning' | 'info';

interface NoticeState {
    severity: NoticeSeverity;
    title: string;
    message: string;
    details?: string;
}

@Component({
    selector: 'app-user-account-page',
    standalone: true,
    imports: [WorkspacePageComponent, WorkspaceTabsComponent, CommonModule, FormsModule, ButtonModule, TooltipModule, AlertModalComponent, ConfirmationDialogComponent, LoadingShimmerComponent, PaginationComponent, TableShellComponent, DataViewSwitchComponent, RecordGridComponent, RecordCardComponent, ResourceViewDialogComponent, UserFormDialogComponent, UserDocumentAssignmentDialogComponent],
    template: `<app-workspace-page>
        <app-loading-shimmer *ngIf="isLoading()" label="Loading user accounts" [columns]="6" />
        <section class="user-account-page space-y-6" [style.display]="isLoading() ? 'none' : null">
            <div *ngIf="errorMessage()" class="surface-alert">
                <div class="flex items-start gap-3">
                    <i class="pi pi-exclamation-triangle mt-1 text-red-500"></i>
                    <div>
                        <div class="font-bold text-red-700">Unable to load user accounts.</div>
                        <div class="mt-1 text-sm text-red-600">{{ errorMessage() }}</div>
                    </div>
                </div>
            </div>

            <app-workspace-tabs ariaLabel="User account sections">
                <button type="button" [class.active]="activeTab() === 'accounts'" (click)="activeTab.set('accounts')"><i class="pi pi-users"></i> Accounts</button>
                <button *ngIf="canApproveRegistrations()" type="button" [class.active]="activeTab() === 'registrations'" (click)="activeTab.set('registrations')"><i class="pi pi-user-plus"></i> Registration requests <span>{{ pendingRegistrations().length }}</span></button>
            </app-workspace-tabs>

            <article *ngIf="activeTab() === 'accounts' && currentUser()" class="session-card">
                <div class="session-head">
                    <div class="session-badge">
                        <i class="pi pi-user"></i>
                        <span>Current Session</span>
                    </div>
                    <p-button label="Edit my account" icon="pi pi-pencil" size="small" (onClick)="openCurrentUserDialog()" />
                </div>

                <div class="session-grid">
                    <div>
                        <div class="session-name">{{ currentSessionName() }}</div>
                        <div class="session-copy">{{ currentUser()?.username }}</div>
                    </div>
                    <div>
                        <div class="session-label">Role</div>
                        <div class="session-copy">{{ currentUser()?.role?.role_name || 'User' }}</div>
                    </div>
                    <div>
                        <div class="session-label">Protection</div>
                        <div class="session-copy">This signed-in account can always edit its own profile, but cannot delete itself.</div>
                    </div>
                </div>
            </article>

            <article *ngIf="activeTab() === 'registrations' && canApproveRegistrations()" class="surface-card p-5 sm:p-6">
                <div class="section-head">
                    <div><h2 class="m-0 text-xl font-black text-slate-900">Pending registration requests</h2><p class="m-0 mt-1 text-sm text-slate-500">Review the applicant's requested role, choose the final role, then approve or reject the account.</p></div>
                    <span class="registration-count">{{ pendingRegistrations().length }} pending</span>
                </div>
                <div class="registration-list" *ngIf="pendingRegistrations().length; else noRegistrations">
                    <article class="registration-request" *ngFor="let request of pendingRegistrations(); trackBy: trackRegistration">
                        <div class="request-person"><span class="request-avatar"><i class="pi pi-user"></i></span><div><strong>{{ registrationName(request) }}</strong><small>{{ request.username }}</small><small>{{ request.position_title || 'No position title' }} ·</small></div></div>
                        <div class="requested-role"><span>Requested role</span><strong>{{ request.requested_role.role_name }}</strong><small>Submitted {{ formatDate(request.created_at) }}</small></div>
                        <div class="applicant-remarks"><span>Applicant remarks</span><p>{{ request.applicant_remarks || 'No remarks provided.' }}</p></div>
                        <label class="review-field"><span>Final assigned role</span><select [(ngModel)]="reviewRoles[request.registration_id]"><option value="">Select role</option><option *ngFor="let role of registrationRoles()" [value]="role.role_id">{{ role.role_name }}</option></select></label>
                        <label class="review-field"><span>Reviewer note</span><input [(ngModel)]="reviewRemarks[request.registration_id]" placeholder="Optional note shown in status lookup" /></label>
                        <div class="review-actions"><p-button label="Reject" icon="pi pi-times" severity="danger" [outlined]="true" [loading]="reviewingId() === request.registration_id" (onClick)="reviewRegistration(request, 'REJECTED')" /><p-button label="Approve account" icon="pi pi-check" [loading]="reviewingId() === request.registration_id" [disabled]="!reviewRoles[request.registration_id]" (onClick)="reviewRegistration(request, 'APPROVED')" /></div>
                    </article>
                </div>
                <ng-template #noRegistrations><div class="empty-registrations"><i class="pi pi-check-circle"></i><strong>No pending requests</strong><span>New registration requests will appear here.</span></div></ng-template>
            </article>

            <article *ngIf="activeTab() === 'accounts' && canViewUsers()" class="surface-card p-5 sm:p-6">
                <div class="section-head">
                    <div>
                        <h2 class="m-0 text-xl font-black text-slate-900">Users</h2>
                        <p class="m-0 mt-1 text-sm text-slate-500">Manage user profiles and role assignments from one page.</p>
                    </div>
                    <p-button *ngIf="canCreateUser()" label="Create User" icon="pi pi-plus" (onClick)="openUserDialog()" />
                </div>

                <app-data-view-switch [(mode)]="viewMode" title="User results" />

                <app-table-shell *ngIf="viewMode === 'list'" class="mt-5" minWidth="72rem">
                        <thead>
                            <tr>
                                <th class="px-4 py-3 font-bold">User</th>
                                <th class="px-4 py-3 font-bold">Role</th>
                                <th class="px-4 py-3 font-bold">Position</th>
                                <th class="px-4 py-3 font-bold">Created</th>
                                <th class="px-4 py-3 text-right font-bold">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            <tr *ngFor="let user of users(); trackBy: trackUser" class="align-top">
                                <td class="px-4 py-4">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <div class="font-black text-slate-900">{{ fullName(user) }}</div>
                                        <span *ngIf="isCurrentUser(user)" class="current-user-pill">Current session</span>
                                    </div>
                                    <div class="mt-1 text-sm text-slate-500">{{ user.username }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <span class="role-pill">{{ user.role.role_name || 'No role' }}</span>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="text-slate-700">{{ user.position_title || 'No position title' }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="text-slate-700">{{ formatDate(user.created_at) }}</div>
                                    <div class="mt-1 text-xs text-slate-400">Updated {{ formatDate(user.updated_at) }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="flex justify-end gap-2">
                                        <p-button icon="pi pi-eye" [rounded]="true" [outlined]="true" (onClick)="openUserView(user)" />
                                        <p-button *ngIf="canManageDocumentAssignments()" icon="pi pi-folder-open" [rounded]="true" [outlined]="true" pTooltip="Assign documents" tooltipPosition="top" (onClick)="openDocumentAssignments(user)" />
                                        <p-button *ngIf="canEditUser() || isCurrentUser(user)" icon="pi pi-pencil" [rounded]="true" [outlined]="true" [pTooltip]="isCurrentUser(user) && !canEditUser() ? 'Edit your own account' : 'Edit user'" tooltipPosition="top" (onClick)="openUserDialog(user)" />
                                        <p-button
                                            *ngIf="canDeleteUser()"
                                            icon="pi pi-trash"
                                            [rounded]="true"
                                            [outlined]="true"
                                            severity="danger"
                                            [disabled]="isCurrentUser(user)"
                                            [pTooltip]="isCurrentUser(user) ? 'You cannot delete the account in the current session.' : 'Delete user'"
                                            tooltipPosition="top"
                                            (onClick)="requestDelete(user)"
                                        />
                                    </div>
                                </td>
                            </tr>
                            <tr *ngIf="!users().length && !isLoading()">
                                <td colspan="5" class="px-4 py-10 text-center text-slate-500">No user accounts found. Create the first user to get started.</td>
                            </tr>
                        </tbody>
                </app-table-shell>

                <app-record-grid *ngIf="viewMode === 'grid'" [empty]="!users().length && !isLoading()" emptyTitle="No user accounts found" emptyMessage="Create the first user to get started.">
                    <app-record-card *ngFor="let user of users(); trackBy: trackUser" icon="pi pi-user" eyebrow="User account" [title]="fullName(user)" [subtitle]="user.username">
                        <div record-badges>
                            <span>{{ user.role.role_name || 'No role' }}</span>
                            <span *ngIf="isCurrentUser(user)">Current session</span>
                        </div>
                        <div record-details>
                            <div><span>Position</span><strong>{{ user.position_title || 'No position title' }}</strong></div>
                            <div><span>Created</span><strong>{{ formatDate(user.created_at) }}</strong><small>Updated {{ formatDate(user.updated_at) }}</small></div>
                        </div>
                        <div record-actions>
                            <p-button label="View" icon="pi pi-eye" size="small" [outlined]="true" (onClick)="openUserView(user)" />
                            <p-button *ngIf="canManageDocumentAssignments()" label="Assign documents" icon="pi pi-folder-open" size="small" [outlined]="true" (onClick)="openDocumentAssignments(user)" />
                            <p-button *ngIf="canEditUser() || isCurrentUser(user)" icon="pi pi-pencil" size="small" [rounded]="true" [outlined]="true" [pTooltip]="isCurrentUser(user) && !canEditUser() ? 'Edit your own account' : 'Edit user'" tooltipPosition="top" (onClick)="openUserDialog(user)" />
                            <p-button *ngIf="canDeleteUser()" icon="pi pi-trash" size="small" [rounded]="true" [outlined]="true" severity="danger" [disabled]="isCurrentUser(user)" [pTooltip]="isCurrentUser(user) ? 'You cannot delete the account in the current session.' : 'Delete user'" tooltipPosition="top" (onClick)="requestDelete(user)" />
                        </div>
                    </app-record-card>
                </app-record-grid>

                <div *ngIf="totalRecords() > 0" class="pagination-footer mt-5 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div class="text-sm text-slate-500">
                        Showing <span class="font-bold text-slate-900">{{ pageStart() }}</span> to <span class="font-bold text-slate-900">{{ pageEnd() }}</span> of <span class="font-bold text-slate-900">{{ totalRecords() }}</span> user{{
                            totalRecords() === 1 ? '' : 's'
                        }}
                    </div>

                    <app-pagination
                        [first]="first"
                        [rows]="rows"
                        [totalRecords]="totalRecords()"
                        [rowsPerPageOptions]="rowsPerPageOptions"
                        [pageLinkSize]="4"
                        [showCurrentPageReport]="false"
                        currentPageReportTemplate="Showing {first} to {last} of {totalRecords} users"
                        (pageChange)="onPageChange($event)"
                    />
                </div>
            </article>
        </section>

        <app-user-form-dialog [(visible)]="userDialogVisible" [mode]="userFormMode" [roles]="roles()" [users]="users()" [rolesLoading]="rolesLoading()" [roleLocked]="editingOwnWithoutManage" [form]="userForm" [saving]="isSaving()" (save)="saveUser($event)" />

        <app-user-document-assignment-dialog #documentAssignmentDialog [(visible)]="documentAssignmentDialogVisible" [user]="assignmentUser" [documents]="assignmentDocuments()" [loading]="assignmentLoading()" [saving]="assignmentSaving()" [error]="assignmentError()" (save)="saveDocumentAssignments($event)" />

        <app-resource-view-dialog [(visible)]="viewDialogVisible" [data]="viewData()" />

        <app-confirmation-dialog
            [(visible)]="deleteConfirmVisible"
            title="Delete user?"
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
            .legacy-workspace-header { display: none; }
            :host {
                display: block;
            }

            .user-account-page {
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
                background: linear-gradient(90deg, #0f172a 0%, #2563eb 50%, #0f172a 100%);
            }

            .surface-alert {
                border: 1px solid rgba(252, 165, 165, 0.6);
                border-radius: 1.25rem;
                background: linear-gradient(180deg, var(--brand-soft) 0%, var(--brand-soft-strong) 100%);
                padding: 1rem 1.25rem;
            }

            .account-tabs { display:flex;flex-wrap:wrap;gap:.4rem;border:1px solid #e2e8f0;border-radius:.9rem;background:#fff;padding:.4rem; }
            .account-tabs button { display:inline-flex;align-items:center;gap:.45rem;border:0;border-radius:.65rem;background:transparent;padding:.55rem .75rem;color:#64748b;font-size:.75rem;font-weight:850;cursor:pointer; }
            .account-tabs button:hover,.account-tabs button.active { background:var(--dts-accent-soft,var(--brand-soft-strong));color:var(--dts-accent-deep,var(--brand-primary-deep)); }
            .account-tabs button span { display:grid;place-items:center;min-width:1.25rem;height:1.25rem;border-radius:999px;background:var(--brand-primary-deep);color:#fff;font-size:.62rem; }

            .session-card {
                border: 1px solid rgba(59, 130, 246, 0.18);
                border-radius: 1.5rem;
                background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
                padding: 1.25rem 1.5rem;
                box-shadow: 0 16px 40px rgba(37, 99, 235, 0.08);
            }

            .session-badge {
                display: inline-flex;
                align-items: center;
                gap: 0.55rem;
                border-radius: 9999px;
                border: 1px solid rgba(37, 99, 235, 0.16);
                background: rgba(255, 255, 255, 0.88);
                padding: 0.45rem 0.85rem;
                font-size: 0.78rem;
                font-weight: 800;
                letter-spacing: 0.14em;
                text-transform: uppercase;
                color: #1d4ed8;
            }

            .session-grid {
                margin-top: 1rem;
                display: grid;
                gap: 1rem;
                grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
            }

            .session-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }

            .session-name {
                font-size: 1.1rem;
                font-weight: 900;
                color: #0f172a;
            }

            .session-label {
                font-size: 0.72rem;
                font-weight: 800;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                color: #64748b;
            }

            .session-copy {
                margin-top: 0.3rem;
                color: #334155;
                line-height: 1.6;
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

            .role-pill {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 9999px;
                border: 1px solid rgba(37, 99, 235, 0.16);
                background: rgba(239, 246, 255, 0.98);
                padding: 0.35rem 0.8rem;
                font-size: 0.75rem;
                font-weight: 800;
                color: #1d4ed8;
            }

            .current-user-pill {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 9999px;
                border: 1px solid rgba(16, 185, 129, 0.2);
                background: rgba(236, 253, 245, 0.98);
                padding: 0.25rem 0.65rem;
                font-size: 0.7rem;
                font-weight: 800;
                color: #047857;
                text-transform: uppercase;
                letter-spacing: 0.08em;
            }

            .registration-count { border-radius: 9999px; padding: .4rem .75rem; color: var(--brand-primary-deep); background: var(--brand-soft-strong); font-size: .76rem; font-weight: 850; }
            .registration-list { margin-top: 1.25rem; display: grid; gap: .85rem; }
            .registration-request { display: grid; grid-template-columns: minmax(13rem,1.2fr) minmax(9rem,.7fr) minmax(11rem,.8fr) minmax(12rem,1fr) auto; gap: 1rem; align-items: end; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 1.15rem; background: #fff; }
            .request-person { display: flex; align-items: center; gap: .8rem; min-width: 0; }.request-avatar { width: 2.7rem; height: 2.7rem; flex: 0 0 auto; display: grid; place-items: center; border-radius: .8rem; color: var(--brand-primary-deep); background: var(--brand-soft-strong); }.request-person strong,.request-person small { display: block; }.request-person strong { color: #172033; }.request-person small { margin-top: .2rem; color: #7b8495; font-size: .74rem; overflow-wrap: anywhere; }
            .requested-role span,.requested-role strong,.requested-role small { display: block; }.requested-role span,.review-field span { color: #94a3b8; font-size: .67rem; font-weight: 850; text-transform: uppercase; letter-spacing: .08em; }.requested-role strong { margin-top: .3rem; color: #1e293b; }.requested-role small { margin-top: .25rem; color: #94a3b8; font-size: .7rem; }
            .applicant-remarks { grid-column: 1/-1; border-radius: .8rem; padding: .75rem .85rem; background: #f8fafc; }.applicant-remarks span { color: #94a3b8; font-size: .67rem; font-weight: 850; text-transform: uppercase; letter-spacing: .08em; }.applicant-remarks p { margin: .35rem 0 0; color: #475569; font-size: .82rem; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
            .review-field { display: grid; gap: .4rem; }.review-field select,.review-field input { width: 100%; min-height: 2.65rem; border: 1px solid #dbe1e9; border-radius: .75rem; padding: .55rem .7rem; background: #fff; color: #334155; }
            .review-actions { display: flex; gap: .55rem; white-space: nowrap; }.empty-registrations { margin-top: 1.25rem; padding: 2rem; display: grid; place-items: center; gap: .4rem; border: 1px dashed #dbe1e9; border-radius: 1rem; color: #64748b; }.empty-registrations i { color: #16a34a; font-size: 1.5rem; }
            @media (max-width: 1180px) { .registration-request { grid-template-columns: 1fr 1fr; }.review-actions { grid-column: 1/-1; justify-content: flex-end; } }
            @media (max-width: 640px) { .registration-request { grid-template-columns: 1fr; }.review-actions { grid-column: 1; flex-wrap: wrap; justify-content: stretch; } }
        `
    ]
})
export class UserAccountPage implements OnInit {
    @ViewChild('documentAssignmentDialog') documentAssignmentDialog?: UserDocumentAssignmentDialogComponent;
    private auth = inject(AuthService);
    private userAccountService = inject(UserAccountService);
    private alerts = inject(AlertDialogService);
    private systemSettings = inject(SystemSettingsService);

    users = signal<UserAccountSummary[]>([]);
    roles = signal<UserRoleSummary[]>([]);
    registrationRoles = signal<UserRoleSummary[]>([]);
    pendingRegistrations = signal<RegistrationRequestSummary[]>([]);
    activeTab = signal<'accounts' | 'registrations'>('accounts');
    reviewingId = signal('');
    reviewRoles: Record<string, string> = {};
    reviewRemarks: Record<string, string> = {};
    totalRecords = signal(0);
    meta = signal<PaginatedMeta | null>(null);

    isLoading = signal(true);
    isSaving = signal(false);
    rolesLoading = signal(false);
    errorMessage = signal('');
    notice = signal<NoticeState | null>(null);
    viewData = signal<ResourceViewDialogData | null>(null);
    assignmentDocuments = signal<UserDocumentAssignmentOption[]>([]);
    assignmentLoading = signal(false);
    assignmentSaving = signal(false);
    assignmentError = signal('');

    userDialogVisible = false;
    viewDialogVisible = false;
    deleteConfirmVisible = false;
    noticeVisible = false;
    documentAssignmentDialogVisible = false;

    userFormMode: 'create' | 'update' = 'create';
    editingUserId = '';
    editingOwnWithoutManage = false;
    deletingUser: UserAccountSummary | null = null;
    assignmentUser: UserAccountSummary | null = null;

    first = 0;
    rows = 10;
    rowsPerPageOptions = [10, 20, 50];
    viewMode: DataViewMode = 'list';

    userForm: UserAccountFormValue = this.emptyUserForm();

    pageStart = computed(() => (this.totalRecords() === 0 ? 0 : this.first + 1));
    pageEnd = computed(() => Math.min(this.first + this.rows, this.totalRecords()));
    currentUser = computed(() => this.auth.user());
    canViewUsers = computed(() => this.auth.hasAnyPermission('user-accounts.view', 'user-accounts.manage'));
    canCreateUser = computed(() => this.auth.hasAnyPermission('user-accounts.create', 'user-accounts.manage'));
    canEditUser = computed(() => this.auth.hasAnyPermission('user-accounts.edit', 'user-accounts.manage'));
    canDeleteUser = computed(() => this.auth.hasAnyPermission('user-accounts.delete', 'user-accounts.manage'));
    canApproveRegistrations = computed(() => this.auth.hasAnyPermission('user-accounts.approve', 'user-accounts.manage'));
    canManageDocumentAssignments = computed(() => this.auth.hasPermission('documents.manage'));
    currentSessionName = computed(() => {
        const user = this.currentUser();
        return user ? [user.firstname, user.lastname].filter(Boolean).join(' ') : '';
    });

    ngOnInit() {
        this.viewMode = this.systemSettings.defaultDataView();
        this.rows = this.systemSettings.defaultRowsPerPage();
        if (this.canApproveRegistrations()) {
            this.loadRegistrations();
        }
        if (this.canViewUsers()) {
            this.loadRoles();
            this.loadUsers();
            return;
        }

        this.isLoading.set(false);
    }

    loadRegistrations() {
        this.userAccountService.listRegistrationRoles().subscribe({ next: (roles) => this.registrationRoles.set(roles ?? []), error: (error) => this.errorMessage.set(this.extractErrorMessage(error)) });
        this.userAccountService.listRegistrationRequests().subscribe({
            next: (response) => {
                const requests = response.items ?? [];
                this.pendingRegistrations.set(requests);
                for (const request of requests) this.reviewRoles[request.registration_id] ||= request.requested_role.role_id;
            },
            error: (error) => this.errorMessage.set(this.extractErrorMessage(error))
        });
    }

    reviewRegistration(request: RegistrationRequestSummary, status: 'APPROVED' | 'REJECTED') {
        const roleId = this.reviewRoles[request.registration_id];
        if (status === 'APPROVED' && !roleId) {
            this.showNotice('warning', 'Select a role', 'Choose the final assigned role before approving this account.');
            return;
        }
        this.reviewingId.set(request.registration_id);
        this.userAccountService.reviewRegistration(request.registration_id, status, status === 'APPROVED' ? roleId : undefined, this.reviewRemarks[request.registration_id]).subscribe({
            next: () => {
                this.reviewingId.set('');
                this.showNotice('success', status === 'APPROVED' ? 'Account approved' : 'Registration rejected', status === 'APPROVED' ? `${this.registrationName(request)} can now sign in with the assigned role.` : `${this.registrationName(request)} can see the rejection through private status lookup.`);
                this.loadRegistrations();
                if (status === 'APPROVED' && this.canViewUsers()) this.loadUsers();
            },
            error: (error) => { this.reviewingId.set(''); this.handleActionError(error, 'Unable to review registration'); }
        });
    }

    registrationName(request: RegistrationRequestSummary) { return [request.firstname, request.middlename, request.lastname].filter(Boolean).join(' '); }
    trackRegistration = (_index: number, request: RegistrationRequestSummary) => request.registration_id;

    loadRoles() {
        this.rolesLoading.set(true);
        this.userAccountService.listRoles().subscribe({
            next: (roles) => {
                this.roles.set(roles ?? []);
                this.rolesLoading.set(false);
            },
            error: (error: unknown) => {
                this.errorMessage.set(this.extractErrorMessage(error));
                this.rolesLoading.set(false);
            }
        });
    }

    loadUsers(showLoading = this.users().length === 0) {
        this.isLoading.set(showLoading);
        this.errorMessage.set('');

        this.userAccountService.listUsers(this.currentPage(), this.rows).subscribe({
            next: (response) => {
                this.users.set(response.items ?? []);
                this.meta.set(response.meta ?? null);
                this.totalRecords.set(response.meta?.total ?? response.items?.length ?? 0);
                this.isLoading.set(false);
            },
            error: (error: unknown) => {
                this.errorMessage.set(this.extractErrorMessage(error));
                this.isLoading.set(false);
            }
        });
    }

    onPageChange(event: PaginatorState) {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
        this.loadUsers(true);
    }

    openUserDialog(user?: UserAccountSummary) {
        this.userFormMode = user ? 'update' : 'create';
        this.editingUserId = user?.user_id ?? '';
        this.editingOwnWithoutManage = !!user && this.isCurrentUser(user) && !this.canEditUser();
        this.userForm = user
            ? {
                  firstname: user.firstname ?? '',
                  lastname: user.lastname ?? '',
                  middlename: user.middlename ?? '',
                  username: user.username ?? '',
                  position_title: user.position_title ?? '',
                  password: '',
                  role_id: user.role?.role_id ?? '',
                  leader_id: user.leader_id ?? ''
              }
            : this.emptyUserForm();
        this.userDialogVisible = true;
    }

    openCurrentUserDialog() {
        this.userAccountService.getCurrentUser().subscribe({
            next: (user) => {
                if (!user) {
                    this.showNotice('warning', 'Account not found', 'The signed-in account could not be loaded.');
                    return;
                }

                if (!this.roles().some((role) => role.role_id === user.role.role_id)) {
                    this.roles.set([user.role, ...this.roles()]);
                }
                this.openUserDialog(user);
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to load your account')
        });
    }

    saveUser(form: UserAccountFormValue) {
        this.isSaving.set(true);
        const editingOwnAccount = this.editingUserId === this.currentUser()?.user_id;
        const request = this.editingUserId ? this.userAccountService.updateUser(this.editingUserId, form) : this.userAccountService.createUser(form);

        request.subscribe({
            next: () => {
                this.isSaving.set(false);
                this.userDialogVisible = false;
                this.userForm = this.emptyUserForm();
                this.showNotice('success', 'User saved', `The account for ${form.firstname.trim()} ${form.lastname.trim()} was saved successfully.`);
                if (editingOwnAccount) {
                    this.auth.refreshProfile()?.subscribe({ error: () => undefined });
                }
                if (this.canViewUsers()) {
                    this.loadUsers();
                }
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to save user')
        });
    }

    openUserView(user: UserAccountSummary) {
        this.userAccountService.getUser(user.user_id).subscribe({
            next: (detail) => {
                if (!detail) {
                    this.showNotice('warning', 'User not found', 'The selected user record could not be loaded.');
                    return;
                }

                this.viewData.set(this.mapUserDetailToView(detail));
                this.viewDialogVisible = true;
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to load user details')
        });
    }

    openDocumentAssignments(user: UserAccountSummary) {
        this.assignmentUser = user;
        this.assignmentDocuments.set([]);
        this.assignmentError.set('');
        this.assignmentLoading.set(true);
        this.documentAssignmentDialogVisible = true;
        this.userAccountService.listDocumentAssignments(user.user_id).subscribe({
            next: (documents) => {
                this.assignmentDocuments.set(documents ?? []);
                this.documentAssignmentDialog?.initialize(documents ?? []);
                this.assignmentLoading.set(false);
            },
            error: (error: unknown) => {
                this.assignmentError.set(this.extractErrorMessage(error));
                this.assignmentLoading.set(false);
            }
        });
    }

    saveDocumentAssignments(documentIds: string[]) {
        if (!this.assignmentUser) return;
        this.assignmentSaving.set(true);
        this.userAccountService.assignDocuments(this.assignmentUser.user_id, documentIds).subscribe({
            next: () => {
                const userName = this.fullName(this.assignmentUser!);
                this.assignmentSaving.set(false);
                this.documentAssignmentDialogVisible = false;
                this.showNotice('success', 'Document access updated', `${documentIds.length} document${documentIds.length === 1 ? '' : 's'} assigned to ${userName}.`);
            },
            error: (error: unknown) => {
                this.assignmentSaving.set(false);
                this.assignmentError.set(this.extractErrorMessage(error));
            }
        });
    }

    requestDelete(user: UserAccountSummary) {
        if (this.isCurrentUser(user)) {
            this.showNotice('warning', 'Deletion blocked', 'The account in the current session cannot be deleted from this page.');
            return;
        }

        this.deletingUser = user;
        this.deleteConfirmVisible = true;
    }

    confirmDelete() {
        if (!this.deletingUser) {
            return;
        }

        this.isSaving.set(true);
        this.userAccountService.deleteUser(this.deletingUser.user_id).subscribe({
            next: () => {
                const deletedName = this.fullName(this.deletingUser!);
                this.isSaving.set(false);
                this.deletingUser = null;
                this.showNotice('success', 'User deleted', `${deletedName} was removed successfully.`);

                const isLastItemOnPage = this.users().length === 1 && this.first > 0;
                if (isLastItemOnPage) {
                    this.first = Math.max(0, this.first - this.rows);
                }

                this.loadUsers();
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to delete user')
        });
    }

    deleteMessage() {
        if (!this.deletingUser) {
            return 'Are you sure you want to delete this user account?';
        }

        return `Delete ${this.fullName(this.deletingUser)}? The backend may block deletion if this account is still linked to document history or is the last administrator.`;
    }

    fullName(user: Pick<UserAccountSummary, 'firstname' | 'lastname' | 'middlename'>) {
        return [user.firstname, user.middlename, user.lastname].filter(Boolean).join(' ');
    }

    formatDate(value?: string) {
        if (!value) {
            return 'N/A';
        }

        const parsedDate = new Date(value);
        if (Number.isNaN(parsedDate.getTime())) {
            return value;
        }

        return parsedDate.toLocaleDateString();
    }

    trackUser = (_index: number, user: UserAccountSummary) => user.user_id;

    isCurrentUser(user: UserAccountSummary) {
        return user.user_id === this.currentUser()?.user_id;
    }

    private currentPage() {
        return Math.floor(this.first / this.rows) + 1;
    }

    private mapUserDetailToView(detail: UserAccountDetail): ResourceViewDialogData {
        const createdDocuments = detail.created_documents?.length ?? 0;
        const uploadedRevisions = detail.uploaded_revisions?.length ?? 0;

        return {
            kindLabel: 'User Account',
            title: this.fullName(detail),
            subtitle: detail.position_title || 'Account profile overview',
            nameLabel: 'Username',
            name: detail.username,
            description: detail.position_title || "User account",
            metrics: [
                { label: 'Role', value: detail.role?.role_name || 'No role' },
                { label: 'Created documents', value: String(createdDocuments) },
                { label: 'Uploaded revisions', value: String(uploadedRevisions) },
                { label: 'Created', value: this.formatDate(detail.created_at) }
            ],
            remarksLabel: 'Applicant remarks',
            remarks: detail.applicant_remarks,
            chipsLabel: 'Profile details',
            chips: [detail.position_title, detail.middlename ? `Middle name: ${detail.middlename}` : '', detail.role?.description || ''].filter(Boolean).map((value) => String(value)),
            emptyChipsText: 'No additional profile details were returned for this account.'
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

    private emptyUserForm(): UserAccountFormValue {
        return {
            firstname: '',
            lastname: '',
            middlename: '',
            username: '',
            position_title: '',
            password: '',
            role_id: '',
            leader_id: ''
        };
    }
}
