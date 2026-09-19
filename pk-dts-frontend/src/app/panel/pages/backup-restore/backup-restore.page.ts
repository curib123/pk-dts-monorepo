import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { AlertModalComponent } from '@/app/shared/components/alert-modal/alert-modal.component';
import { ConfirmationDialogComponent } from '@/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { TableShellComponent } from '@/app/shared/components/table-shell/table-shell.component';
import { DataViewMode, DataViewSwitchComponent } from '@/app/shared/components/data-view-switch/data-view-switch.component';
import { RecordCardComponent, RecordGridComponent } from '@/app/shared/components/record-grid/record-grid.component';
import { AuthService } from '@/app/auth/auth.service';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { BackupListItem, BackupLogItem, FactoryResetScope } from './backup-restore.types';
import { BackupRestoreService } from './backup-restore.service';
import { WorkspacePageComponent, WorkspaceTabsComponent } from '@/app/shared/components/workspace-ui/workspace-ui.component';

type NoticeSeverity = 'success' | 'error' | 'warning' | 'info';

interface NoticeState {
    severity: NoticeSeverity;
    title: string;
    message: string;
    details?: string;
}

@Component({
    selector: 'app-backup-restore-page',
    standalone: true,
    imports: [WorkspacePageComponent, WorkspaceTabsComponent, CommonModule, FormsModule, ButtonModule, AlertModalComponent, ConfirmationDialogComponent, TableShellComponent, DataViewSwitchComponent, RecordGridComponent, RecordCardComponent],
    template: `<app-workspace-page>
        <section class="backup-page">
            <div class="backup-toolbar">
                <app-workspace-tabs ariaLabel="Backup workspace sections">
                    <button type="button" [class.active]="activeTab() === 'backups'" (click)="selectTab('backups')"><i class="pi pi-database"></i> Backups <span>{{ backups().length }}</span></button>
                    <button *ngIf="canRestoreBackup()" type="button" [class.active]="activeTab() === 'restore'" (click)="selectTab('restore')"><i class="pi pi-refresh"></i> Restore</button>
                    <button *ngIf="canViewLogs()" type="button" [class.active]="activeTab() === 'activity'" (click)="selectTab('activity')"><i class="pi pi-history"></i> Activity</button>
                    <button *ngIf="canReset()" type="button" class="danger-tab" [class.active]="activeTab() === 'reset'" (click)="selectTab('reset')"><i class="pi pi-exclamation-triangle"></i> Reset</button>
                </app-workspace-tabs>
                <div class="backup-actions">
                    <p-button title="Refresh" severity="secondary" icon="pi pi-refresh" [rounded]="true" [outlined]="true" (onClick)="refreshActiveTab()" />
                    <p-button *ngIf="canCreateBackup()" label="Back Up Now" icon="pi pi-plus" [loading]="saving()" (onClick)="createBackup()" />
                </div>
            </div>

            <div *ngIf="errorMessage()" class="surface-alert">
                <div class="flex items-start gap-3">
                    <i class="pi pi-exclamation-triangle mt-1 text-red-500"></i>
                    <div>
                        <div class="font-bold text-red-700">Unable to load backups.</div>
                        <div class="mt-1 text-sm text-red-600">{{ errorMessage() }}</div>
                    </div>
                </div>
            </div>

            <article *ngIf="activeTab() === 'restore' && canRestoreBackup()" class="surface-card p-5 sm:p-6">
                <div class="section-head">
                    <div>
                        <h2 class="m-0 text-xl font-black text-slate-900">Restore upload</h2>
                        <p class="m-0 mt-1 text-sm text-slate-500">Restore from a system backup package or a legacy .json snapshot.</p>
                    </div>
                    <p-button label="Restore Uploaded Backup" icon="pi pi-upload" [disabled]="!restoreFile || saving()" [loading]="saving()" (onClick)="requestUploadedRestore()" />
                </div>

                <div class="mt-5 upload-restore-panel">
                    <div class="upload-field">
                        <label for="backup-restore-file">Backup file</label>
                        <input id="backup-restore-file" type="file" accept=".zip,.json" class="file-input" (change)="onRestoreFileSelected($event)" />
                    </div>
                    <div class="upload-summary">
                        <div class="upload-title">{{ restoreFileName || 'No backup file selected' }}</div>
                        <div class="upload-copy">{{ restoreFileName ? 'Ready to restore after confirmation.' : 'System backups include the database snapshot and uploaded softcopy revision files.' }}</div>
                    </div>
                </div>
            </article>

            <article *ngIf="activeTab() === 'reset' && canReset()" class="surface-card p-5 sm:p-6">
                <div class="section-head">
                    <div>
                        <h2 class="m-0 text-xl font-black text-slate-900">Reset data</h2>
                        <p class="m-0 mt-1 text-sm text-slate-500">Choose exactly what to delete. A safety backup is always created first.</p>
                    </div>
                    <p-button label="Reset Selected Data" icon="pi pi-history" severity="danger" [disabled]="saving()" [loading]="saving()" (onClick)="requestReset()" />
                </div>
                <div class="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)] md:items-end">
                    <div class="rounded-2xl border border-slate-200 bg-white p-4">
                        <label for="reset-scope" class="block text-sm font-black text-slate-800">Data to delete</label>
                        <p class="mb-3 mt-1 text-xs leading-5 text-slate-500">Document-only options keep user accounts, roles, permissions, and classification catalogs.</p>
                        <select id="reset-scope" [(ngModel)]="resetScope" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100">
                            <option value="SOFTCOPY">All softcopy documents and uploaded files</option>
                            <option value="HARDCOPY">All hardcopy documents</option>
                            <option value="ALL">Full factory reset (all application data)</option>
                        </select>
                    </div>
                    <div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
                        <strong>{{ resetScopeLabel() }}</strong><br />{{ resetScopeDescription() }}
                    </div>
                </div>
            </article>

            <article *ngIf="activeTab() === 'backups'" class="surface-card p-5 sm:p-6">
                <div class="section-head">
                    <div>
                        <h2 class="m-0 text-xl font-black text-slate-900">Backups</h2>
                        <p class="m-0 mt-1 text-sm text-slate-500">Create, restore, or delete server snapshots stored on the system.</p>
                    </div>
                    <div class="text-sm text-slate-500">{{ backups().length ? 'Select an action for each backup below.' : 'No backups have been created yet.' }}</div>
                </div>

                <div *ngIf="loading()" class="inline-loading" role="status">
                    <i class="pi pi-spin pi-spinner"></i>
                    <div><strong>Loading backups</strong><span>Reading available backup metadata…</span></div>
                </div>

                <app-data-view-switch *ngIf="!loading()" [(mode)]="backupViewMode" title="Backup results" />

                <app-table-shell *ngIf="!loading() && backupViewMode === 'list'" class="mt-5" minWidth="62rem">
                        <thead>
                            <tr>
                                <th class="px-4 py-3 font-bold">Backup</th>
                                <th class="px-4 py-3 font-bold">Created</th>
                                <th class="px-4 py-3 font-bold">Size</th>
                                <th class="px-4 py-3 font-bold">Records</th>
                                <th class="px-4 py-3 text-right font-bold">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            <tr *ngFor="let backup of backups(); trackBy: trackBackup" class="align-top">
                                <td class="px-4 py-4">
                                    <div class="font-black text-slate-900">{{ backup.file_name }}</div>
                                    <div class="mt-1 text-sm text-slate-500">Created by {{ backup.created_by || 'system' }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="text-slate-700">{{ formatDate(backup.created_at) }}</div>
                                    <div class="mt-1 text-xs text-slate-400">Schema v{{ backup.schema_version }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="text-slate-700">{{ formatBytes(backup.size_bytes) }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="text-slate-700">{{ backup.record_count }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="flex justify-end gap-2">
                                        <p-button *ngIf="canRestoreBackup()" icon="pi pi-refresh" [rounded]="true" [outlined]="true" severity="success" [disabled]="saving()" (onClick)="requestRestore(backup)" />
                                        <p-button *ngIf="canDeleteBackup()" icon="pi pi-trash" [rounded]="true" [outlined]="true" severity="danger" [disabled]="saving()" (onClick)="requestDelete(backup)" />
                                    </div>
                                </td>
                            </tr>
                            <tr *ngIf="!backups().length && !loading()">
                                <td colspan="5" class="px-4 py-10 text-center text-slate-500">No backups are available yet. Create the first snapshot to start the recovery history.</td>
                            </tr>
                        </tbody>
                </app-table-shell>

                <app-record-grid *ngIf="!loading() && backupViewMode === 'grid'" [empty]="!backups().length && !loading()" emptyTitle="No backups available" emptyMessage="Create the first snapshot to start the recovery history." emptyIcon="pi pi-database">
                    <app-record-card *ngFor="let backup of backups(); trackBy: trackBackup" icon="pi pi-database" eyebrow="System backup" [title]="backup.file_name" [subtitle]="'Created by ' + (backup.created_by || 'system')">
                        <div record-badges><span>Schema v{{ backup.schema_version }}</span></div>
                        <div record-details>
                            <div class="wide"><span>Created</span><strong>{{ formatDate(backup.created_at) }}</strong></div>
                            <div><span>Size</span><strong>{{ formatBytes(backup.size_bytes) }}</strong></div>
                            <div><span>Records</span><strong>{{ backup.record_count }}</strong></div>
                        </div>
                        <div record-actions *ngIf="canRestoreBackup() || canDeleteBackup()">
                            <p-button *ngIf="canRestoreBackup()" label="Restore" icon="pi pi-refresh" size="small" [outlined]="true" severity="success" [disabled]="saving()" (onClick)="requestRestore(backup)" />
                            <p-button *ngIf="canDeleteBackup()" icon="pi pi-trash" size="small" [rounded]="true" [outlined]="true" severity="danger" [disabled]="saving()" (onClick)="requestDelete(backup)" />
                        </div>
                    </app-record-card>
                </app-record-grid>
            </article>

            <article *ngIf="activeTab() === 'activity' && canViewLogs()" class="surface-card p-5 sm:p-6">
                <div class="section-head">
                    <div>
                        <h2 class="m-0 text-xl font-black text-slate-900">Activity log</h2>
                        <p class="m-0 mt-1 text-sm text-slate-500">Recent backup actions from the server.</p>
                    </div>
                </div>

                <div *ngIf="logsLoading()" class="inline-loading" role="status">
                    <i class="pi pi-spin pi-spinner"></i>
                    <div><strong>Loading activity</strong><span>Fetching backup actions only when this tab is opened…</span></div>
                </div>
                <div *ngIf="logsError() && !logsLoading()" class="surface-alert compact-alert">{{ logsError() }}</div>

                <app-data-view-switch *ngIf="!logsLoading()" [(mode)]="logViewMode" title="Activity log results" />

                <app-table-shell *ngIf="!logsLoading() && logViewMode === 'list'" class="mt-5" minWidth="54rem">
                        <thead>
                            <tr>
                                <th class="px-4 py-3 font-bold">Time</th>
                                <th class="px-4 py-3 font-bold">Action</th>
                                <th class="px-4 py-3 font-bold">Backup</th>
                                <th class="px-4 py-3 font-bold">User</th>
                                <th class="px-4 py-3 font-bold">Details</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            <tr *ngFor="let log of logs(); trackBy: trackLog">
                                <td class="px-4 py-4 text-slate-700">{{ formatDate(log.timestamp) }}</td>
                                <td class="px-4 py-4">
                                    <span class="action-pill" [class.action-pill-success]="log.action === 'restored'" [class.action-pill-danger]="log.action === 'deleted'">
                                        {{ log.action }}
                                    </span>
                                </td>
                                <td class="px-4 py-4 text-slate-700">{{ log.file_name }}</td>
                                <td class="px-4 py-4 text-slate-700">{{ log.performed_by }}</td>
                                <td class="px-4 py-4 text-slate-500">{{ log.details || 'No additional details.' }}</td>
                            </tr>
                            <tr *ngIf="!logs().length && !loading()">
                                <td colspan="5" class="px-4 py-10 text-center text-slate-500">No backup activity has been recorded yet.</td>
                            </tr>
                        </tbody>
                </app-table-shell>

                <app-record-grid *ngIf="!logsLoading() && logViewMode === 'grid'" [empty]="!logs().length && !loading()" emptyTitle="No backup activity" emptyMessage="No backup activity has been recorded yet." emptyIcon="pi pi-history">
                    <app-record-card *ngFor="let log of logs(); trackBy: trackLog" icon="pi pi-history" eyebrow="Backup activity" [title]="log.file_name" [subtitle]="formatDate(log.timestamp)">
                        <div record-badges><span>{{ log.action }}</span></div>
                        <div record-details>
                            <div><span>Action</span><strong>{{ log.action }}</strong></div>
                            <div><span>User</span><strong>{{ log.performed_by }}</strong></div>
                            <div class="wide"><span>Details</span><strong>{{ log.details || 'No additional details.' }}</strong></div>
                        </div>
                    </app-record-card>
                </app-record-grid>
            </article>

            <app-confirmation-dialog
                [(visible)]="confirmVisible"
                [title]="confirmTitle()"
                [subtitle]="confirmSubtitle()"
                [message]="confirmMessage()"
                [confirmLabel]="confirmActionLabel()"
                cancelLabel="Cancel"
                [tone]="confirmTone()"
                [dismissableMask]="true"
                (confirm)="confirmAction()"
                (cancel)="dismissConfirm()"
            />

            <app-alert-modal [(visible)]="noticeVisible" [severity]="notice()?.severity ?? 'info'" [title]="notice()?.title ?? 'Notice'" [message]="notice()?.message ?? ''" [details]="notice()?.details ?? ''" />
        </section>
    </app-workspace-page>`,
    styles: [
        `
            :host {
                display: block;
            }

            .backup-page {
                display: grid;
                gap: 1rem;
                color: #0f172a;
            }

            .backup-toolbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                border: 1px solid #e2e8f0;
                border-radius: 0.9rem;
                background: #fff;
                padding: 0.45rem;
                box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
            }
            .backup-tabs,
            .backup-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0.4rem; }
            .backup-tabs button {
                display: inline-flex;
                align-items: center;
                gap: 0.45rem;
                min-height: 2.65rem;
                border: 0;
                border-radius: 0.8rem;
                background: transparent;
                padding: 0 0.8rem;
                color: #475569;
                font-size: 0.78rem;
                font-weight: 850;
                cursor: pointer;
            }
            .backup-tabs button span { border-radius:999px;background:#e2e8f0;padding:.12rem .4rem;font-size:.65rem; }
            .backup-tabs button:hover,
            .backup-tabs button.active { background:var(--dts-accent-soft,var(--brand-soft-strong));color:var(--dts-accent-deep,var(--brand-primary-deep)); }
            .backup-tabs .danger-tab { color:var(--brand-primary); }
            .backup-tabs .danger-tab.active { background:var(--brand-soft-strong);color:var(--brand-primary-deep); }
            :host-context(.app-dark) .backup-toolbar { border-color:#333;background:#171717;box-shadow:none; }
            :host-context(.app-dark) .backup-tabs button { color:#d4d4d4; }
            :host-context(.app-dark) .backup-tabs button span { background:#333;color:#d4d4d4; }
            :host-context(.app-dark) .backup-tabs button:hover,
            :host-context(.app-dark) .backup-tabs button.active { background:color-mix(in srgb,var(--dts-accent) 18%,#171717);color:#fff; }

            .surface-card {
                border: 1px solid rgba(148, 163, 184, 0.18);
                border-radius: 1rem;
                background: #fff;
                box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
            }

            .hero-strip {
                height: 0.5rem;
                background: linear-gradient(90deg, var(--brand-primary-deep) 0%, #0f172a 50%, var(--brand-primary) 100%);
            }

            .inline-loading {
                min-height: 6rem;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.75rem;
                border: 1px dashed #cbd5e1;
                border-radius: 0.9rem;
                background: #f8fafc;
                color: #475569;
                text-align: left;
            }
            .inline-loading > i { color: var(--brand-primary-deep); font-size: 1.1rem; }
            .inline-loading div { display: grid; gap: 0.15rem; }
            .inline-loading strong { color: #0f172a; font-size: 0.82rem; }
            .inline-loading span { color: #64748b; font-size: 0.72rem; }
            .compact-alert { padding: 0.75rem 0.9rem; font-size: 0.78rem; }

            .surface-alert {
                border: 1px solid rgba(252, 165, 165, 0.6);
                border-radius: 1.25rem;
                background: linear-gradient(180deg, var(--brand-soft) 0%, var(--brand-soft-strong) 100%);
                padding: 1rem 1.25rem;
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

            .section-head {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
            }

            .upload-restore-panel {
                display: grid;
                gap: 1rem;
                grid-template-columns: minmax(0, 1.3fr) minmax(14rem, 0.7fr);
                align-items: stretch;
            }

            .upload-field,
            .upload-summary {
                border: 1px solid rgba(226, 232, 240, 1);
                border-radius: 1rem;
                background: #ffffff;
                padding: 1rem;
            }

            .upload-field {
                display: flex;
                flex-direction: column;
                gap: 0.65rem;
            }

            .upload-field label {
                font-size: 0.82rem;
                font-weight: 800;
                color: #475569;
            }

            .file-input {
                width: 100%;
                border: 1px dashed #cbd5e1;
                border-radius: 0.85rem;
                background: #f8fafc;
                padding: 0.85rem;
                color: #0f172a;
            }

            .upload-title {
                font-weight: 900;
                color: #0f172a;
                overflow-wrap: anywhere;
            }

            .upload-copy {
                margin-top: 0.45rem;
                color: #64748b;
                font-size: 0.9rem;
                line-height: 1.55;
            }

            .action-pill {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 9999px;
                border: 1px solid rgba(148, 163, 184, 0.18);
                background: rgba(241, 245, 249, 0.92);
                padding: 0.35rem 0.75rem;
                font-size: 0.72rem;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: #475569;
            }

            .action-pill-success {
                border-color: rgba(16, 185, 129, 0.18);
                background: rgba(236, 253, 245, 0.98);
                color: #047857;
            }

            .action-pill-danger {
                border-color: rgba(239, 68, 68, 0.18);
                background: rgba(254, 242, 242, 0.98);
                color: var(--brand-primary);
            }

            @media (max-width: 720px) {
                .backup-toolbar { align-items:stretch;flex-direction:column; }
                .backup-tabs { display:grid;grid-template-columns:repeat(2,minmax(0,1fr)); }
                .backup-tabs button { justify-content:center; }
                .backup-actions { justify-content:flex-end; }
                .upload-restore-panel {
                    grid-template-columns: 1fr;
                }
            }
        `
    ]
})
export class BackupRestorePage implements OnInit {
    private auth = inject(AuthService);
    private backupRestoreService = inject(BackupRestoreService);
    private alerts = inject(AlertDialogService);
    private systemSettings = inject(SystemSettingsService);

    backups = signal<BackupListItem[]>([]);
    logs = signal<BackupLogItem[]>([]);
    loading = signal(true);
    logsLoading = signal(false);
    logsLoaded = signal(false);
    saving = signal(false);
    errorMessage = signal('');
    logsError = signal('');
    notice = signal<NoticeState | null>(null);
    noticeVisible = false;
    confirmVisible = false;
    canReset = signal(this.auth.hasAnyPermission('backup-restore.reset'));
    canCreateBackup = signal(this.auth.hasAnyPermission('backup-restore.create_backup'));
    canRestoreBackup = signal(this.auth.hasAnyPermission('backup-restore.restore_backup'));
    canDeleteBackup = signal(this.auth.hasAnyPermission('backup-restore.delete_backup'));
    canViewLogs = signal(this.auth.hasAnyPermission('backup-restore.view_logs'));

    restoreFile: File | null = null;
    restoreFileName = '';
    resetScope: FactoryResetScope = 'SOFTCOPY';
    backupViewMode: DataViewMode = 'list';
    logViewMode: DataViewMode = 'list';
    activeTab = signal<'backups' | 'restore' | 'activity' | 'reset'>('backups');

    private confirmMode: 'restore' | 'restoreUpload' | 'delete' | 'reset' | null = null;
    private targetBackup: BackupListItem | null = null;

    confirmTitle() {
        switch (this.confirmMode) {
            case 'restore':
                return 'Restore backup?';
            case 'restoreUpload':
                return 'Restore uploaded backup?';
            case 'delete':
                return 'Delete backup?';
            case 'reset':
                return `Reset ${this.resetScopeLabel().toLowerCase()}?`;
            default:
                return 'Confirm action';
        }
    }

    confirmSubtitle() {
        switch (this.confirmMode) {
            case 'restore':
                return 'This will replace the current database contents.';
            case 'restoreUpload':
                return 'This will replace the current database contents and restore included softcopy files.';
            case 'delete':
                return 'This removes the backup file from the server.';
            case 'reset':
                return 'A safety backup will be created before any selected data is deleted.';
            default:
                return '';
        }
    }

    confirmMessage() {
        if (this.confirmMode === 'restoreUpload') {
            return this.restoreFileName
                ? `Restore "${this.restoreFileName}"? The current database contents will be replaced by this uploaded backup.`
                : 'Restore the uploaded backup? The current database contents will be replaced.';
        }

        if (this.confirmMode === 'reset') {
            return `${this.resetScopeDescription()} The backup folder and the new safety backup will be preserved.`;
        }

        if (!this.targetBackup) {
            return 'Are you sure you want to continue?';
        }

        return this.confirmMode === 'restore'
            ? `Restore "${this.targetBackup.file_name}"? The current database contents will be replaced by this snapshot.`
            : `Delete "${this.targetBackup.file_name}"? This backup will no longer be available for download or restore.`;
    }

    confirmActionLabel() {
        if (this.confirmMode === 'reset') {
            return 'Reset';
        }

        return this.confirmMode === 'restore' || this.confirmMode === 'restoreUpload' ? 'Restore' : 'Delete';
    }

    confirmTone() {
        return this.confirmMode === 'restore' || this.confirmMode === 'restoreUpload' ? 'primary' : 'danger';
    }

    ngOnInit() {
        this.backupViewMode = this.systemSettings.defaultDataView();
        this.logViewMode = this.systemSettings.defaultDataView();
        this.loadData();
    }

    loadData() {
        this.loading.set(true);
        this.errorMessage.set('');

        this.backupRestoreService.listBackups().subscribe({
            next: (backups) => {
                this.backups.set(backups ?? []);
                this.loading.set(false);
            },
            error: (error: unknown) => {
                this.errorMessage.set(this.extractErrorMessage(error));
                this.loading.set(false);
            }
        });
    }

    selectTab(tab: 'backups' | 'restore' | 'activity' | 'reset') {
        this.activeTab.set(tab);
        if (tab === 'activity' && this.canViewLogs() && !this.logsLoaded() && !this.logsLoading()) {
            this.loadLogs();
        }
    }

    refreshActiveTab() {
        if (this.activeTab() === 'activity' && this.canViewLogs()) {
            this.loadLogs(true);
            return;
        }
        this.loadData();
    }

    private loadLogs(force = false) {
        if (!this.canViewLogs() || (this.logsLoaded() && !force)) {
            return;
        }

        this.logsLoading.set(true);
        this.logsError.set('');
        this.backupRestoreService.listLogs().subscribe({
            next: (logs) => {
                this.logs.set(logs ?? []);
                this.logsLoaded.set(true);
                this.logsLoading.set(false);
            },
            error: (error: unknown) => {
                this.logs.set([]);
                this.logsError.set(this.extractErrorMessage(error));
                this.logsLoading.set(false);
            }
        });
    }

    private invalidateLogs() {
        this.logsLoaded.set(false);
    }

    createBackup() {
        this.saving.set(true);
        this.backupRestoreService.createBackup().subscribe({
            next: () => {
                this.saving.set(false);
                this.showNotice('success', 'Backup created', 'The new snapshot is ready and added to the list.');
                this.invalidateLogs();
                this.loadData();
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to create backup')
        });
    }

    requestRestore(backup: BackupListItem) {
        this.confirmMode = 'restore';
        this.targetBackup = backup;
        this.confirmVisible = true;
    }

    onRestoreFileSelected(event: Event) {
        const input = event.target as HTMLInputElement | null;
        const file = input?.files?.[0] ?? null;
        this.restoreFile = file;
        this.restoreFileName = file?.name ?? '';
    }

    requestUploadedRestore() {
        if (!this.restoreFile) {
            this.showNotice('warning', 'Choose a backup file', 'Select a .zip backup package or legacy .json snapshot first.');
            return;
        }

        this.confirmMode = 'restoreUpload';
        this.targetBackup = null;
        this.confirmVisible = true;
    }

    requestDelete(backup: BackupListItem) {
        this.confirmMode = 'delete';
        this.targetBackup = backup;
        this.confirmVisible = true;
    }

    requestReset() {
        this.confirmMode = 'reset';
        this.targetBackup = null;
        this.confirmVisible = true;
    }

    resetScopeLabel() {
        if (this.resetScope === 'SOFTCOPY') return 'All softcopy documents';
        if (this.resetScope === 'HARDCOPY') return 'All hardcopy documents';
        return 'Full factory reset';
    }

    resetScopeDescription() {
        if (this.resetScope === 'SOFTCOPY') return 'Deletes every softcopy record, revision, and uploaded softcopy file. Other system data stays unchanged.';
        if (this.resetScope === 'HARDCOPY') return 'Deletes every hardcopy document. Softcopy documents and other system data stay unchanged.';
        return 'Deletes all application data, then restores the default seeded accounts and catalogs.';
    }

    dismissConfirm() {
        this.confirmVisible = false;
        this.confirmMode = null;
        this.targetBackup = null;
    }

    confirmAction() {
        if (!this.confirmMode) {
            return;
        }

        this.saving.set(true);
        const request =
            this.confirmMode === 'reset'
                ? this.backupRestoreService.factoryReset(this.resetScope)
                : this.confirmMode === 'restoreUpload'
                ? this.backupRestoreService.restoreUploadedBackup(this.restoreFile!)
                : this.confirmMode === 'restore'
                  ? this.backupRestoreService.restoreBackup(this.targetBackup!.backup_id)
                  : this.backupRestoreService.deleteBackup(this.targetBackup!.backup_id);

        request.subscribe({
            next: (response) => {
                this.saving.set(false);
                if (this.confirmMode === 'reset') {
                    const backupName = response.file_name || 'the new safety backup';
                    const deletedCount = response.deleted_documents === undefined ? '' : ` ${response.deleted_documents} document(s) were deleted.`;
                    this.showNotice('success', 'Reset completed', `A safety backup was created as ${backupName}.${deletedCount} Existing backup folder contents were preserved.`);
                } else {
                    const actionLabel = this.confirmMode === 'restore' || this.confirmMode === 'restoreUpload' ? 'restored' : 'deleted';
                    const targetName = this.confirmMode === 'restoreUpload' ? this.restoreFileName : this.targetBackup?.file_name;
                    this.showNotice('success', `Backup ${actionLabel}`, `${targetName || 'Backup'} was ${actionLabel} successfully.`);
                }
                this.confirmVisible = false;
                this.confirmMode = null;
                this.targetBackup = null;
                if (response.reset || response.restored) {
                    this.restoreFile = null;
                    this.restoreFileName = '';
                }
                this.invalidateLogs();
                this.loadData();
            },
            error: (error: unknown) =>
                this.handleActionError(
                    error,
                    this.confirmMode === 'delete' ? 'Unable to delete backup' : this.confirmMode === 'reset' ? 'Unable to reset the system' : 'Unable to restore backup'
                )
        });
    }

    latestBackupLabel() {
        return this.backups().length ? this.backups()[0].file_name : 'None';
    }

    latestBackupSubtitle() {
        return this.backups().length ? `${this.formatDate(this.backups()[0].created_at)} · ${this.formatBytes(this.backups()[0].size_bytes)}` : 'Create a backup to start the recovery history.';
    }

    formatDate(value: string) {
        if (!value) {
            return 'N/A';
        }

        return new Date(value).toLocaleString();
    }

    formatBytes(size: number) {
        if (!Number.isFinite(size)) {
            return '0 B';
        }

        if (size < 1024) {
            return `${size} B`;
        }

        const units = ['KB', 'MB', 'GB', 'TB'];
        let value = size / 1024;
        let unitIndex = 0;

        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
        }

        return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
    }

    trackBackup = (_index: number, backup: BackupListItem) => backup.backup_id;
    trackLog = (_index: number, log: BackupLogItem) => `${log.timestamp}-${log.action}-${log.backup_id}`;

    private showNotice(severity: NoticeSeverity, title: string, message: string, details = '') {
        this.notice.set({ severity, title, message, details });
        this.noticeVisible = false;
        this.alerts.show(severity, title, message, details);
    }

    private handleActionError(error: unknown, fallbackTitle: string) {
        this.saving.set(false);
        this.showNotice('error', fallbackTitle, this.extractErrorMessage(error));
    }

    private extractErrorMessage(error: unknown) {
        if (error instanceof HttpErrorResponse) {
            const body = error.error as { message?: unknown; error?: unknown; details?: unknown } | string | null;
            if (typeof body === 'string') {
                return body;
            }

            const message = Array.isArray(body?.message) ? body?.message.join(', ') : body?.message;
            const errorMessage = Array.isArray(body?.error) ? body?.error.join(', ') : body?.error;
            const details = Array.isArray(body?.details) ? body?.details.join(', ') : body?.details;
            return String(message || errorMessage || details || error.message || 'Request failed.');
        }

        if (error instanceof Error) {
            return error.message;
        }

        return 'Unexpected error. Please check the backend server and API response.';
    }

    private extractFileName(contentDisposition: string | null) {
        if (!contentDisposition) {
            return '';
        }

        const match = /filename="?([^"]+)"?/i.exec(contentDisposition);
        return match?.[1] ?? '';
    }
}
