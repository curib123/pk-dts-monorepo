import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Subscription, finalize } from 'rxjs';
import { AlertModalComponent } from '@/app/shared/components/alert-modal/alert-modal.component';
import { PaginationComponent } from '@/app/shared/components/pagination/pagination.component';
import { TableShellComponent } from '@/app/shared/components/table-shell/table-shell.component';
import { DataViewMode, DataViewSwitchComponent } from '@/app/shared/components/data-view-switch/data-view-switch.component';
import { RecordCardComponent, RecordGridComponent } from '@/app/shared/components/record-grid/record-grid.component';
import { DocumentDetailDialogComponent } from '../documents/components/document-detail-dialog/document-detail-dialog.component';
import { LoadingShimmerComponent } from '@/app/shared/components/loading-shimmer/loading-shimmer.component';
import { DocumentsService } from '../documents/documents.service';
import { DocumentDetail, DocumentSummary, RevisionSummary } from '../documents/documents.types';
import { AuthService } from '@/app/auth/auth.service';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { WorkspacePageComponent, WorkspaceSearchComponent } from '@/app/shared/components/workspace-ui/workspace-ui.component';

type NoticeSeverity = 'success' | 'error' | 'warning' | 'info';

@Component({
    selector: 'app-document-disposal-page',
    standalone: true,
    imports: [WorkspaceSearchComponent, WorkspacePageComponent, CommonModule, FormsModule, ButtonModule, PaginationComponent, TableShellComponent, DataViewSwitchComponent, RecordGridComponent, RecordCardComponent, AlertModalComponent, DocumentDetailDialogComponent, LoadingShimmerComponent],
    template: `<app-workspace-page>
        <app-loading-shimmer *ngIf="loading()" label="Loading disposed documents" [columns]="7" />
        <section class="disposal-page space-y-6" [style.display]="loading() ? 'none' : null">
            <article class="surface-card disposal-card p-5 sm:p-6">
                <div class="disposal-summary">
                    <div>
                        <h2 class="m-0 text-xl font-black text-slate-900">Disposed record inventory</h2>
                        <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Filter disposed records and restore them when permitted.</p>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Disposed records</div>
                        <div class="stat-value">{{ totalRecords() }}</div>
                    </div>
                </div>

                <div class="disposal-filters">
                    <app-workspace-search class="disposal-search" [value]="searchTerm" (valueChange)="searchTerm = $event; onFilterInput()" label="Search" placeholder="Search number, title, remarks, disposer, area, or location..." />
                    <div class="field disposed-by-field">
                        <label for="disposed-by-filter">Disposed by</label>
                        <input id="disposed-by-filter" [(ngModel)]="disposedByFilter" (ngModelChange)="onFilterInput()" class="text-field" placeholder="Filter by account or manual name" />
                    </div>
                    <div class="filter-reset">
                        <p-button label="Reset filters" severity="secondary" text icon="pi pi-refresh" (onClick)="resetFilters()" />
                    </div>
                </div>

                <app-data-view-switch [(mode)]="viewMode" title="Disposed document results" />

                <app-table-shell *ngIf="viewMode === 'list'" class="mt-5" minWidth="80rem">
                        <thead>
                            <tr>
                                <th class="px-4 py-3">Document</th>
                                <th class="px-4 py-3">Disposal action</th>
                                <th class="px-4 py-3">Disposed by</th>
                                <th class="px-4 py-3">Disposed date</th>
                                <th class="px-4 py-3">Remarks</th>
                                <th class="px-4 py-3">Storage</th>
                                <th class="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            <tr *ngFor="let document of pagedDocuments(); trackBy: trackDocument">
                                <td class="px-4 py-4">
                                    <div class="font-black text-slate-900">{{ document.document_type === 'HARDCOPY' ? document.document_title : (document.document_number || 'No document number') }}</div>
                                    <div class="mt-1 text-sm text-slate-600">{{ document.document_title }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="font-bold text-slate-700">{{ document.disposal_action || 'Other' }}</div>
                                    <div class="mt-1 text-xs text-slate-400">{{ document.disposal_action_other || 'Method recorded' }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="text-slate-700">{{ document.disposed_by_name || fullName(document.disposer) || 'Unknown' }}</div>
                                    <div class="mt-1 text-xs text-slate-400">{{ fullName(document.disposer) || 'No account captured' }}</div>
                                </td>
                                <td class="px-4 py-4 text-slate-600">{{ formatDate(document.disposed_at || undefined) }}</td>
                                <td class="px-4 py-4 text-slate-600">{{ document.disposal_remarks || 'No remarks recorded' }}</td>
                                <td class="px-4 py-4 text-slate-600">
                                    <div>Area: {{ document.hardcopy?.area?.area_name || 'N/A' }}</div>
                                    <div>Location: {{ document.hardcopy?.location?.location_name || 'N/A' }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="flex justify-end gap-2">
                                        <p-button icon="pi pi-eye" [rounded]="true" [outlined]="true" (onClick)="openDetail(document)" />
                                        <p-button *ngIf="canRestore()" icon="pi pi-replay" [rounded]="true" [outlined]="true" severity="success" (onClick)="restore(document)" />
                                    </div>
                                </td>
                            </tr>
                            <tr *ngIf="!pagedDocuments().length">
                                <td colspan="7" class="px-4 py-10 text-center text-slate-500">No disposed documents match the current filters.</td>
                            </tr>
                        </tbody>
                </app-table-shell>

                <app-record-grid *ngIf="viewMode === 'grid'" [empty]="!pagedDocuments().length" emptyTitle="No disposed documents found" emptyMessage="No disposed documents match the current filters.">
                    <app-record-card *ngFor="let document of pagedDocuments(); trackBy: trackDocument" icon="pi pi-trash" eyebrow="Disposed document" [title]="document.document_type === 'HARDCOPY' ? document.document_title : (document.document_number || 'No document number')" [subtitle]="document.document_title">
                        <div record-badges><span>Disposed</span></div>
                        <div record-details>
                            <div><span>Disposed by</span><strong>{{ document.disposed_by_name || fullName(document.disposer) || 'Unknown' }}</strong><small>{{ fullName(document.disposer) || 'No account captured' }}</small></div>
                            <div><span>Disposal action</span><strong>{{ document.disposal_action || 'Other' }}</strong><small>{{ document.disposal_action_other || 'Method recorded' }}</small></div>
                            <div><span>Disposed date</span><strong>{{ formatDate(document.disposed_at || undefined) }}</strong></div>
                            <div class="wide"><span>Remarks</span><strong>{{ document.disposal_remarks || 'No remarks recorded' }}</strong></div>
                            <div><span>Area</span><strong>{{ document.hardcopy?.area?.area_name || 'N/A' }}</strong></div>
                            <div><span>Location</span><strong>{{ document.hardcopy?.location?.location_name || 'N/A' }}</strong></div>
                        </div>
                        <div record-actions>
                            <p-button label="View" icon="pi pi-eye" size="small" [outlined]="true" (onClick)="openDetail(document)" />
                            <p-button *ngIf="canRestore()" label="Restore" icon="pi pi-replay" size="small" [outlined]="true" severity="success" (onClick)="restore(document)" />
                        </div>
                    </app-record-card>
                </app-record-grid>

                <div *ngIf="totalRecords()" class="pagination-footer mt-5 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div class="text-sm text-slate-500">
                        Showing <span class="font-bold text-slate-900">{{ pageStart() }}</span> to <span class="font-bold text-slate-900">{{ pageEnd() }}</span>
                        of <span class="font-bold text-slate-900">{{ totalRecords() }}</span> disposed records
                    </div>
                    <app-pagination
                        [first]="first"
                        [rows]="rows"
                        [totalRecords]="totalRecords()"
                        [rowsPerPageOptions]="rowsPerPageOptions"
                        [pageLinkSize]="4"
                        [showCurrentPageReport]="false"
                        currentPageReportTemplate="Showing {first} to {last} of {totalRecords} disposed records"
                        (pageChange)="onPageChange($event)"
                    />
                </div>
            </article>
        </section>

        <app-document-detail-dialog [(visible)]="detailVisible" [document]="detail()" [loading]="detailLoading()" [revisions]="revisions()" [canAccessFiles]="canDownload()" />
        <app-alert-modal [(visible)]="noticeVisible" [severity]="noticeSeverity()" [title]="noticeTitle()" [message]="noticeMessage()" />
    </app-workspace-page>`,
    styles: [
        `
            :host { display:block;min-width:0;max-width:100%; }
            .disposal-page,.disposal-card { min-width:0;max-width:100%; }
            .surface-card { overflow:hidden;border:1px solid rgba(148,163,184,.18);border-radius:1.75rem;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(248,250,252,.96));box-shadow:0 24px 64px rgba(15,23,42,.08),0 2px 8px rgba(15,23,42,.04); }
            .disposal-summary { min-width:0;display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:1rem; }
            .disposal-summary > div:first-child { min-width:0;flex:1 1 24rem; }
            .disposal-summary h2,.disposal-summary p { overflow-wrap:anywhere; }
            .stat-card { min-width:min(100%,11rem);max-width:100%;flex:0 1 13rem;border:1px solid rgba(226,232,240,1);border-radius:1.35rem;background:linear-gradient(180deg,#fff 0%,#f8fafc 100%);padding:1rem 1.1rem; }
            .stat-label { font-size:.75rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#64748b; }
            .stat-value { margin-top:.55rem;font-size:2rem;line-height:1;font-weight:900;color:#111827; }
            .disposal-filters { min-width:0;max-width:100%;display:flex;flex-wrap:wrap;align-items:flex-end;gap:1rem;margin-top:1.5rem; }
            .disposal-search { min-width:min(100%,18rem);flex:1 1 30rem; }
            .field { min-width:0;display:flex;flex-direction:column;gap:.55rem; }
            .disposed-by-field { min-width:min(100%,14rem);flex:0 1 18rem; }
            .field label { font-size:.84rem;font-weight:700;color:#475569; }
            .text-field { min-height:2.75rem;width:100%;max-width:100%;box-sizing:border-box;border-radius:.85rem;border:1px solid #cbd5e1;background:#fff;padding:.75rem .9rem;color:#0f172a;outline:none; }
            .text-field:focus { border-color:#0f172a; }
            .filter-reset { min-width:0;flex:0 0 auto;display:flex;align-items:flex-end; }
            .pagination-footer { min-width:0;max-width:100%;overflow:hidden; }
            app-pagination { min-width:0;max-width:100%; }
            :host ::ng-deep app-table-shell td { overflow-wrap:anywhere;word-break:break-word; }
            :host ::ng-deep app-table-shell td:last-child { white-space:nowrap; }
            @media (max-width:760px) {
                .stat-card { flex:1 1 100%; }
                .disposal-search,.disposed-by-field,.filter-reset { min-width:0;flex:1 1 100%; }
                :host ::ng-deep .filter-reset .p-button { width:100%;justify-content:center; }
                app-pagination { width:100%;overflow-x:auto; }
            }
        `
    ]
})
export class DocumentDisposalPage implements OnInit, OnDestroy {
    private documentsService = inject(DocumentsService);
    private auth = inject(AuthService);
    private alerts = inject(AlertDialogService);
    private systemSettings = inject(SystemSettingsService);
    canRestore = () => this.auth.hasAnyPermission('documents.restore', 'document-disposal.restore', 'document-disposal.manage');
    canDownload = () => this.auth.hasPermission('documents.download');

    documents = signal<DocumentSummary[]>([]);
    detail = signal<DocumentDetail | null>(null);
    revisions = signal<RevisionSummary[]>([]);
    detailLoading = signal(false);
    detailVisible = false;
    private detailRequest?: Subscription;
    noticeVisible = false;
    noticeSeverity = signal<NoticeSeverity>('info');
    noticeTitle = signal('Notice');
    noticeMessage = signal('');
    loading = signal(true);

    ngOnDestroy() {
        this.detailRequest?.unsubscribe();
        if (this.filterTimer) clearTimeout(this.filterTimer);
    }

    searchTerm = '';
    disposedByFilter = '';
    totalRecords = signal(0);
    private filterTimer: ReturnType<typeof setTimeout> | null = null;
    first = 0;
    rows = 10;
    rowsPerPageOptions = [10, 20, 50];
    viewMode: DataViewMode = 'list';

    ngOnInit() {
        this.viewMode = this.systemSettings.defaultDataView();
        this.rows = this.systemSettings.defaultRowsPerPage();
        this.loadData();
    }

    disposedDocuments() {
        return this.documents();
    }

    pagedDocuments() {
        return this.documents();
    }

    pageStart() {
        return this.totalRecords() === 0 ? 0 : this.first + 1;
    }

    pageEnd() {
        return Math.min(this.first + this.documents().length, this.totalRecords());
    }

    onPageChange(event: { first?: number; rows?: number }) {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
        this.loadData(false);
    }

    resetPagination() {
        this.first = 0;
    }

    onFilterInput() {
        this.resetPagination();
        if (this.filterTimer) clearTimeout(this.filterTimer);
        this.filterTimer = setTimeout(() => {
            this.filterTimer = null;
            this.loadData(false);
        }, 250);
    }

    resetFilters() {
        this.searchTerm = '';
        this.disposedByFilter = '';
        this.resetPagination();
        this.loadData(false);
    }

    openDetail(document: DocumentSummary) {
        this.detailRequest?.unsubscribe();
        this.detail.set(document);
        this.revisions.set(document.softcopy?.revisions ?? []);
        this.detailVisible = true;
        this.detailLoading.set(true);

        this.detailRequest = this.documentsService.getDocument(document.document_id).pipe(
            finalize(() => this.detailLoading.set(false))
        ).subscribe({
            next: (detail) => {
                if (!detail) {
                    this.detailVisible = false;
                    this.detail.set(null);
                    this.revisions.set([]);
                    return;
                }
                this.detail.set(detail);
                this.revisions.set(detail.softcopy?.revisions ?? []);
            },
            error: () => {
                this.noticeSeverity.set('error');
                this.noticeTitle.set('Details unavailable');
                this.noticeMessage.set('The document summary is available, but the full document details could not be loaded.');
                this.alerts.error(this.noticeTitle(), this.noticeMessage());
            }
        });
    }

    restore(document: DocumentSummary) {
        const previousDocuments = this.documents();
        const previousTotal = this.totalRecords();
        this.documents.update((items) => items.filter((item) => item.document_id !== document.document_id));
        this.totalRecords.update((total) => Math.max(0, total - 1));

        this.documentsService.restoreDocument(document.document_id).subscribe({
            next: () => {
                this.noticeSeverity.set('success');
                this.noticeTitle.set('Document restored');
                this.noticeMessage.set(`${document.document_number || document.document_title} was restored successfully.`);
                this.noticeVisible = false;
                this.alerts.success(this.noticeTitle(), this.noticeMessage());
                this.loadData(false);
            },
            error: () => {
                this.documents.set(previousDocuments);
                this.totalRecords.set(previousTotal);
                this.noticeSeverity.set('error');
                this.noticeTitle.set('Restore failed');
                this.noticeMessage.set('The document could not be restored right now.');
                this.noticeVisible = false;
                this.alerts.error(this.noticeTitle(), this.noticeMessage());
            }
        });
    }

    fullName(user?: { firstname?: string; lastname?: string } | null) {
        return [user?.firstname, user?.lastname].filter(Boolean).join(' ');
    }

    formatDate(value?: string) {
        if (!value) {
            return 'N/A';
        }
        const parsedDate = new Date(value);
        return Number.isNaN(parsedDate.getTime()) ? value : parsedDate.toLocaleString();
    }

    trackDocument = (_index: number, document: DocumentSummary) => document.document_id;

    private loadData(showLoading = this.documents().length === 0) {
        this.loading.set(showLoading);
        this.documentsService.listDisposedDocumentsPage({
            page: Math.floor(this.first / this.rows) + 1,
            limit: this.rows,
            search: this.searchTerm.trim(),
            disposed_by: this.disposedByFilter.trim()
        }).subscribe({
            next: (response) => {
                const items = response.items ?? [];
                const total = response.meta?.total ?? items.length;
                if (total > 0 && this.first >= total) {
                    this.first = Math.max(0, Math.floor((total - 1) / this.rows) * this.rows);
                    this.loading.set(false);
                    this.loadData(false);
                    return;
                }
                this.documents.set(items);
                this.totalRecords.set(total);
                this.loading.set(false);
            },
            error: () => this.loading.set(false)
        });
    }
}
