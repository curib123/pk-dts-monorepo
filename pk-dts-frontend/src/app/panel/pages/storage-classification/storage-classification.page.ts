import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import type { PaginatorState } from 'primeng/types/paginator';
import { EMPTY, expand, forkJoin, Observable, reduce } from 'rxjs';
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
import { ResourceViewDialogComponent, ResourceViewDialogData } from '../roles-permissions/components/resource-view-dialog/resource-view-dialog.component';
import { StorageResourceFormDialogComponent } from './components/storage-resource-form-dialog/storage-resource-form-dialog.component';
import { StorageClassificationService } from './storage-classification.service';
import { WorkspacePageComponent, WorkspaceTabsComponent, WorkspaceSearchComponent } from '@/app/shared/components/workspace-ui/workspace-ui.component';
import {
    AreaDetail,
    AreaSummary,
    AssetNumberDetail,
    AssetNumberSummary,
    LocationDetail,
    LocationSummary,
    PaginatedMeta,
    SequenceDetail,
    SequenceSummary,
    SoftcopyCategoryDetail,
    SoftcopyCategorySummary,
    SpecificDetail,
    SpecificSummary,
    StorageResourceFormValue,
    StorageResourceKey
} from './storage-classification.types';

type NoticeSeverity = 'success' | 'error' | 'warning' | 'info';

interface NoticeState {
    severity: NoticeSeverity;
    title: string;
    message: string;
    details?: string;
}

interface ResourceOption {
    key: StorageResourceKey;
    label: string;
    icon: string;
}

@Component({
    selector: 'app-storage-classification-page',
    standalone: true,
    imports: [WorkspaceSearchComponent, WorkspacePageComponent, WorkspaceTabsComponent, CommonModule, FormsModule, ButtonModule, AlertModalComponent, ConfirmationDialogComponent, LoadingShimmerComponent, PaginationComponent, TableShellComponent, DataViewSwitchComponent, RecordGridComponent, RecordCardComponent, ResourceViewDialogComponent, StorageResourceFormDialogComponent],
    template: `<app-workspace-page>
        <app-loading-shimmer *ngIf="isLoading()" label="Loading storage classifications" [columns]="6" />
        <section class="storage-page space-y-6" [style.display]="isLoading() ? 'none' : null">
            <div *ngIf="errorMessage()" class="surface-alert">
                <div class="flex items-start gap-3">
                    <i class="pi pi-exclamation-triangle mt-1 text-red-500"></i>
                    <div>
                        <div class="font-bold text-red-700">Unable to load the selected catalog.</div>
                        <div class="mt-1 text-sm text-red-600">{{ errorMessage() }}</div>
                    </div>
                </div>
            </div>

            <article class="surface-card p-5 sm:p-6">
                <app-workspace-tabs ariaLabel="Storage catalog types">
                    <button *ngFor="let option of resourceOptions" type="button" class="resource-tab" [class.active]="activeResource() === option.key" (click)="selectResource(option.key)">
                        <i [class]="option.icon"></i>
                        <span>{{ option.label }}</span>
                    </button>
                </app-workspace-tabs>

                <div class="section-head mt-5">
                    <div>
                        <h2 class="m-0 text-xl font-black text-slate-900">{{ activeResourceLabel() }}</h2>
                        <p class="m-0 mt-1 text-sm text-slate-500">{{ activeResourceSubtitle() }}</p>
                    </div>
                    <p-button *ngIf="canCreateActiveResource()" [label]="'Create ' + activeResourceLabel()" icon="pi pi-plus" (onClick)="openFormDialog()" />
                </div>

                <app-workspace-search [value]="searchTerm" (valueChange)="searchTerm = $event; first = 0" [placeholder]="'Search all ' + activeResourceLabel().toLowerCase() + ' records'" ariaLabel="Search storage and classification records" />

                <app-data-view-switch [(mode)]="viewMode" [title]="activeResourceLabel() + ' results'" />

                <app-table-shell *ngIf="viewMode === 'list'" class="mt-5" minWidth="68rem">
                        <thead>
                            <tr>
                                <th class="px-4 py-3 font-bold">{{ primaryColumnLabel() }}</th>
                                <th class="px-4 py-3 font-bold">{{ secondaryColumnLabel() }}</th>
                                <th class="px-4 py-3 font-bold">{{ tertiaryColumnLabel() }}</th>
                                <th class="px-4 py-3 text-right font-bold">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            <tr *ngFor="let item of pagedItems(); trackBy: trackByResource" class="align-top">
                                <td class="px-4 py-4">
                                    <div class="font-black text-slate-900">{{ primaryValue(item) }}</div>
                                    <div *ngIf="descriptionValue(item)" class="mt-1 max-w-sm text-sm text-slate-500">{{ descriptionValue(item) }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="text-slate-700">{{ secondaryValue(item) }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="text-slate-700">{{ tertiaryValue(item) }}</div>
                                </td>
                                <td class="px-4 py-4">
                                    <div class="flex justify-end gap-2">
                                        <p-button icon="pi pi-eye" [rounded]="true" [outlined]="true" (onClick)="openViewDialog(item)" />
                                        <p-button *ngIf="canEditActiveResource()" icon="pi pi-pencil" [rounded]="true" [outlined]="true" (onClick)="openFormDialog(item)" />
                                        <p-button *ngIf="canDeleteActiveResource()" icon="pi pi-trash" [rounded]="true" [outlined]="true" severity="danger" (onClick)="requestDelete(item)" />
                                    </div>
                                </td>
                            </tr>
                            <tr *ngIf="!currentItems().length && !isLoading()">
                                <td colspan="4" class="px-4 py-10 text-center text-slate-500">No records found for this catalog yet.</td>
                            </tr>
                        </tbody>
                </app-table-shell>

                <app-record-grid *ngIf="viewMode === 'grid'" [empty]="!currentItems().length && !isLoading()" emptyTitle="No catalog records found" emptyMessage="Create the first record for this catalog.">
                    <app-record-card *ngFor="let item of pagedItems(); trackBy: trackByResource" [icon]="activeResourceIcon()" [eyebrow]="activeResourceLabel()" [title]="primaryValue(item)" [subtitle]="descriptionValue(item)">
                        <div record-details>
                            <div><span>{{ secondaryColumnLabel() }}</span><strong>{{ secondaryValue(item) }}</strong></div>
                            <div><span>{{ tertiaryColumnLabel() }}</span><strong>{{ tertiaryValue(item) }}</strong></div>
                        </div>
                        <div record-actions>
                            <p-button label="View" icon="pi pi-eye" size="small" [outlined]="true" (onClick)="openViewDialog(item)" />
                            <p-button *ngIf="canEditActiveResource()" icon="pi pi-pencil" size="small" [rounded]="true" [outlined]="true" (onClick)="openFormDialog(item)" />
                            <p-button *ngIf="canDeleteActiveResource()" icon="pi pi-trash" size="small" [rounded]="true" [outlined]="true" severity="danger" (onClick)="requestDelete(item)" />
                        </div>
                    </app-record-card>
                </app-record-grid>

                <div *ngIf="filteredTotal() > 0" class="pagination-footer mt-5 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div class="text-sm text-slate-500">
                        Showing <span class="font-bold text-slate-900">{{ pageStart() }}</span> to <span class="font-bold text-slate-900">{{ pageEnd() }}</span> of <span class="font-bold text-slate-900">{{ filteredTotal() }}</span> item{{
                            filteredTotal() === 1 ? '' : 's'
                        }}
                    </div>

                    <app-pagination
                        [first]="first"
                        [rows]="rows"
                        [totalRecords]="filteredTotal()"
                        [rowsPerPageOptions]="rowsPerPageOptions"
                        [pageLinkSize]="4"
                        [showCurrentPageReport]="false"
                        currentPageReportTemplate="Showing {first} to {last} of {totalRecords} records"
                        (pageChange)="onPageChange($event)"
                    />
                </div>
            </article>
        </section>

        <app-storage-resource-form-dialog [(visible)]="formDialogVisible" [resource]="activeResource()" [mode]="formMode" [form]="form" [saving]="isSaving()" [categoryOptions]="softcopyCategories()" [areas]="hierarchyAreas()" [specifics]="hierarchySpecifics()" [assets]="hierarchyAssets()" (save)="saveResource($event)" />

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
            .legacy-workspace-header { display: none; }
            :host {
                display: block;
            }

            .storage-page {
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
                background: linear-gradient(90deg, #0369a1 0%, #0ea5e9 50%, #0f172a 100%);
            }

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

            .resource-tabs {
                display: flex;
                flex-wrap: wrap;
                gap: 0.75rem;
            }

            .resource-tab {
                display: inline-flex;
                align-items: center;
                gap: 0.7rem;
                border: 1px solid #dbe4ee;
                background: #ffffff;
                color: #334155;
                border-radius: 9999px;
                padding: 0.8rem 1rem;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .resource-tab.active {
                border-color: #0ea5e9;
                background: #eff6ff;
                color: #0369a1;
                box-shadow: 0 12px 24px rgba(14, 165, 233, 0.12);
            }

            .section-head {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
            }

            .catalog-search { display:flex;align-items:center;gap:.65rem;margin-top:1rem;border:1px solid #dbe4ee;border-radius:1rem;background:#fff;padding:.2rem .75rem;box-shadow:0 5px 15px rgba(15,23,42,.04); }
            .catalog-search>i { color:var(--brand-primary-deep); }
            .catalog-search input { min-width:0;min-height:2.7rem;flex:1;border:0;background:transparent;color:#0f172a;outline:0; }
            .catalog-search button { display:grid;place-items:center;width:2rem;height:2rem;border:0;border-radius:.55rem;background:#f1f5f9;color:#475569;cursor:pointer; }
            :host-context(.app-dark) .catalog-search { border-color:#404040;background:#171717; }
            :host-context(.app-dark) .catalog-search input { color:#f5f5f5; }

        `
    ]
})
export class StorageClassificationPage implements OnInit {
    private auth = inject(AuthService);
    private storageService = inject(StorageClassificationService);
    private alerts = inject(AlertDialogService);
    private route = inject(ActivatedRoute);
    private systemSettings = inject(SystemSettingsService);

    resourceOptions: ResourceOption[] = [
        { key: 'areas', label: 'Area', icon: 'pi pi-sitemap' },
        { key: 'assetNumbers', label: 'Asset Number', icon: 'pi pi-hashtag' },
        { key: 'specifics', label: 'Specific', icon: 'pi pi-tags' },
        { key: 'locations', label: 'Location', icon: 'pi pi-map-marker' },
        { key: 'sequences', label: 'Sequence', icon: 'pi pi-sort-alpha-down' },
        { key: 'softcopyCategories', label: 'Folders', icon: 'pi pi-folder' }
    ];

    activeResource = signal<StorageResourceKey>('areas');
    areas = signal<AreaSummary[]>([]);
    assetNumbers = signal<AssetNumberSummary[]>([]);
    specifics = signal<SpecificSummary[]>([]);
    locations = signal<LocationSummary[]>([]);
    sequences = signal<SequenceSummary[]>([]);
    softcopyCategories = signal<SoftcopyCategorySummary[]>([]);
    hierarchyAreas = signal<AreaSummary[]>([]);
    hierarchySpecifics = signal<SpecificSummary[]>([]);
    hierarchyAssets = signal<AssetNumberSummary[]>([]);
    totalRecords = signal(0);
    meta = signal<PaginatedMeta | null>(null);

    isLoading = signal(true);
    isSaving = signal(false);
    errorMessage = signal('');
    notice = signal<NoticeState | null>(null);
    viewData = signal<ResourceViewDialogData | null>(null);

    formDialogVisible = false;
    viewDialogVisible = false;
    deleteConfirmVisible = false;
    noticeVisible = false;

    formMode: 'create' | 'update' = 'create';
    editingId = '';
    private hierarchyLoaded = false;
    private hierarchyLoading = false;
    deletingId = '';
    deletingLabel = '';

    first = 0;
    rows = 10;
    rowsPerPageOptions = [10, 20, 50];
    viewMode: DataViewMode = 'list';
    searchTerm = '';

    form: StorageResourceFormValue = this.emptyForm();

    filteredTotal = computed(() => this.currentItems().length);
    pageStart = computed(() => (this.filteredTotal() === 0 ? 0 : this.first + 1));
    pageEnd = computed(() => Math.min(this.first + this.rows, this.filteredTotal()));
    canCreateActiveResource = computed(() => {
        if (this.activeResource() === 'softcopyCategories') return this.auth.hasAnyPermission('softcopy-folders.manage', 'softcopy-folders.create');
        if (this.activeResource() === 'locations') {
            return this.auth.hasAnyPermission('location-management.manage', 'location-management.create');
        }
        return this.auth.hasAnyPermission('storage-classification.manage', 'storage-classification.create');
    });
    canEditActiveResource = computed(() => {
        if (this.activeResource() === 'softcopyCategories') return this.auth.hasAnyPermission('softcopy-folders.manage', 'softcopy-folders.edit');
        if (this.activeResource() === 'locations') {
            return this.auth.hasAnyPermission('location-management.manage', 'location-management.edit');
        }
        return this.auth.hasAnyPermission('storage-classification.manage', 'storage-classification.edit');
    });
    canDeleteActiveResource = computed(() => {
        if (this.activeResource() === 'softcopyCategories') return this.auth.hasAnyPermission('softcopy-folders.manage', 'softcopy-folders.delete');
        if (this.activeResource() === 'locations') {
            return this.auth.hasAnyPermission('location-management.manage', 'location-management.archive');
        }
        return this.auth.hasAnyPermission('storage-classification.manage', 'storage-classification.delete');
    });

    ngOnInit() {
        this.viewMode = this.systemSettings.defaultDataView();
        this.rows = this.systemSettings.defaultRowsPerPage();
        const canViewStorageCatalogs = this.auth.hasAnyPermission('storage-classification.view', 'location-management.view');
        const canViewSoftcopyFolders = this.auth.hasAnyPermission('softcopy-folders.view', 'softcopy-folders.manage');
        this.resourceOptions = this.resourceOptions.filter((option) => option.key === 'softcopyCategories' ? canViewSoftcopyFolders : canViewStorageCatalogs);
        const requestedResource = this.route.snapshot.queryParamMap.get('resource') as StorageResourceKey | null;
        if (requestedResource && this.resourceOptions.some((option) => option.key === requestedResource)) {
            this.activeResource.set(requestedResource);
        } else if (!canViewStorageCatalogs && canViewSoftcopyFolders) {
            this.activeResource.set('softcopyCategories');
        }
        this.loadActiveResource();
    }

    currentItems(): unknown[] {
        let items: unknown[];
        switch (this.activeResource()) {
            case 'areas':
                items = this.areas(); break;
            case 'assetNumbers':
                items = this.assetNumbers(); break;
            case 'specifics':
                items = this.specifics(); break;
            case 'locations':
                items = this.locations(); break;
            case 'softcopyCategories':
                items = this.softcopyCategories(); break;
            default:
                items = this.sequences();
        }
        const search = this.searchTerm.trim().toLowerCase();
        return search ? items.filter((item) => [this.primaryValue(item), this.secondaryValue(item), this.tertiaryValue(item), this.descriptionValue(item)].some((value) => String(value || '').toLowerCase().includes(search))) : items;
    }

    pagedItems(): unknown[] {
        return this.currentItems().slice(this.first, this.first + this.rows);
    }
    selectResource(resource: StorageResourceKey) {
        if (this.activeResource() === resource) {
            return;
        }

        this.activeResource.set(resource);
        this.searchTerm = '';
        this.first = 0;
        this.totalRecords.set(0);
        this.meta.set(null);
        this.loadActiveResource();
    }

    onPageChange(event: PaginatorState) {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
    }

    openFormDialog(item?: any) {
        if (['assetNumbers', 'specifics', 'locations'].includes(this.activeResource())) {
            this.loadHierarchyOptions();
        }
        this.formMode = item ? 'update' : 'create';
        this.editingId = item ? this.resourceId(item) : '';
        this.form = item ? this.mapItemToForm(item) : this.emptyForm();
        this.formDialogVisible = true;
    }

    saveResource(form: StorageResourceFormValue) {
        this.isSaving.set(true);
        const request = this.buildSaveRequest(form);

        request.subscribe({
            next: () => {
                this.isSaving.set(false);
                this.formDialogVisible = false;
                this.form = this.emptyForm();
                this.showNotice('success', `${this.activeResourceLabel()} saved`, `The ${this.activeResourceLabel().toLowerCase()} record was saved successfully.`);
                this.loadActiveResource();
                if (this.hierarchyLoaded) this.loadHierarchyOptions(true);
            },
            error: (error: unknown) => this.handleActionError(error, `Unable to save ${this.activeResourceLabel().toLowerCase()}`)
        });
    }

    openViewDialog(item: any) {
        this.buildDetailRequest(this.resourceId(item)).subscribe({
            next: (detail: AreaDetail | AssetNumberDetail | SpecificDetail | LocationDetail | SequenceDetail | SoftcopyCategoryDetail | null) => {
                if (!detail) {
                    this.showNotice('warning', 'Item not found', 'The selected record could not be loaded.');
                    return;
                }

                this.viewData.set(this.mapDetailToView(detail));
                this.viewDialogVisible = true;
            },
            error: (error: unknown) => this.handleActionError(error, `Unable to load ${this.activeResourceLabel().toLowerCase()} details`)
        });
    }

    requestDelete(item: any) {
        this.deletingId = this.resourceId(item);
        this.deletingLabel = this.primaryValue(item);
        this.deleteConfirmVisible = true;
    }

    confirmDelete() {
        if (!this.deletingId) {
            return;
        }

        this.isSaving.set(true);
        this.buildDeleteRequest(this.deletingId).subscribe({
            next: () => {
                this.isSaving.set(false);
                this.showNotice(
                    'success',
                    this.activeResource() === 'locations' ? `${this.activeResourceLabel()} archived` : `${this.activeResourceLabel()} deleted`,
                    this.activeResource() === 'locations' ? `"${this.deletingLabel}" was archived successfully. Its Location Code remains reserved.` : `"${this.deletingLabel}" was removed successfully.`
                );
                if (this.currentItems().length === 1 && this.first > 0) {
                    this.first = Math.max(0, this.first - this.rows);
                }
                this.deletingId = '';
                this.deletingLabel = '';
                this.loadActiveResource();
            },
            error: (error: unknown) => this.handleActionError(error, `Unable to delete ${this.activeResourceLabel().toLowerCase()}`)
        });
    }

    deleteMessage() {
        return this.deletingLabel
            ? this.activeResource() === 'locations'
                ? `Archive "${this.deletingLabel}" from ${this.activeResourceLabel()}? Its Location Code will stay reserved and cannot be reused.`
                : `Delete "${this.deletingLabel}" from ${this.activeResourceLabel()}?`
            : 'Are you sure you want to delete this item?';
    }

    activeResourceLabel() {
        return this.resourceOptions.find((option) => option.key === this.activeResource())?.label ?? 'Resource';
    }

    activeResourceIcon() {
        return this.resourceOptions.find((option) => option.key === this.activeResource())?.icon ?? 'pi pi-folder';
    }

    activeResourceSubtitle() {
        switch (this.activeResource()) {
            case 'areas':
                return 'Manage area names and see how many specifics belong to each one.';
            case 'assetNumbers':
                return 'Assign each asset number to a specific for guided hardcopy navigation.';
            case 'specifics':
                return 'Assign each specific to an area in the storage hierarchy.';
            case 'locations':
                return 'Assign each location directly to a specific. Asset number is optional and inherits the same route when selected.';
            case 'softcopyCategories':
                return 'Create and manage main folders and subfolders for softcopy documents.';
            default:
                return 'Manage sequence codes used as document prefixes or identifiers.';
        }
    }

    primaryColumnLabel() {
        return this.activeResourceLabel();
    }

    secondaryColumnLabel() {
        switch (this.activeResource()) {
            case 'areas':
                return 'Specifics';
            case 'assetNumbers':
                return 'Assigned Specific';
            case 'specifics':
                return 'Assigned Area';
            case 'locations':
                return 'Assigned Asset';
            case 'softcopyCategories':
                return 'Storage Folder';
            default:
                return 'Usage';
        }
    }

    tertiaryColumnLabel() {
        switch (this.activeResource()) {
            case 'areas':
                return 'Summary';
            case 'assetNumbers':
                return 'Created';
            case 'specifics':
                return 'Usage';
            case 'locations':
                return 'Status';
            case 'softcopyCategories':
                return 'Documents';
            default:
                return 'Details';
        }
    }

    primaryValue(item: any) {
        switch (this.activeResource()) {
            case 'areas':
                return (item as AreaSummary).area_name;
            case 'assetNumbers':
                return (item as AssetNumberSummary).asset_number;
            case 'specifics':
                return (item as SpecificSummary).specific_name;
            case 'locations':
                return (item as LocationSummary).location_name;
            case 'softcopyCategories':
                return (item as SoftcopyCategorySummary).category_name;
            default:
                return (item as SequenceSummary).sequence_code;
        }
    }

    secondaryValue(item: any) {
        switch (this.activeResource()) {
            case 'areas':
                return `${(item as AreaSummary).specifics?.length ?? 0} specific${((item as AreaSummary).specifics?.length ?? 0) === 1 ? '' : 's'}`;
            case 'assetNumbers':
                return (item as AssetNumberSummary).specific?.specific_name || 'Not assigned';
            case 'specifics':
                return (item as SpecificSummary).area?.area_name || 'Not assigned';
            case 'locations':
                return (item as LocationSummary).asset?.asset_number || (item as LocationSummary).specific?.specific_name || 'Not assigned';
            case 'softcopyCategories':
                return `uploads/revisions/${(item as SoftcopyCategorySummary).folder_name}`;
            default:
                return 'Sequence catalog entry';
        }
    }

    tertiaryValue(item: any) {
        switch (this.activeResource()) {
            case 'areas':
                return (
                    ((item as AreaSummary).specifics ?? [])
                        .map((specific) => specific.specific_name)
                        .slice(0, 2)
                        .join(', ') || 'No specifics yet'
                );
            case 'assetNumbers':
                return this.formatDate((item as AssetNumberSummary).created_at);
            case 'specifics':
                return 'Specific catalog entry';
            case 'locations':
                return (item as LocationSummary).is_active === false ? 'Archived' : 'Active';
            case 'softcopyCategories': {
                const count = (item as SoftcopyCategorySummary)._count?.softcopies ?? 0;
                return `${count} document${count === 1 ? '' : 's'}`;
            }
            default:
                return (item as SequenceSummary).sequence_id;
        }
    }

    descriptionValue(item: any) {
        if (this.activeResource() === 'assetNumbers') {
            return (item as AssetNumberSummary).hardcopy?.document?.document_title || '';
        }

        if (this.activeResource() === 'softcopyCategories') return (item as SoftcopyCategorySummary).description || '';

        return '';
    }

    trackByResource = (_index: number, item: any) => this.resourceId(item);

    private resourceId(item: any) {
        switch (this.activeResource()) {
            case 'areas':
                return (item as AreaSummary).area_id;
            case 'assetNumbers':
                return (item as AssetNumberSummary).asset_id;
            case 'specifics':
                return (item as SpecificSummary).specific_id;
            case 'locations':
                return (item as LocationSummary).location_id;
            case 'softcopyCategories':
                return (item as SoftcopyCategorySummary).softcopy_category_id;
            default:
                return (item as SequenceSummary).sequence_id;
        }
    }

    private mapItemToForm(item: any): StorageResourceFormValue {
        switch (this.activeResource()) {
            case 'areas':
                return { primary: (item as AreaSummary).area_name ?? '', area_id: '' };
            case 'assetNumbers':
                return { primary: (item as AssetNumberSummary).asset_number ?? '', area_id: '', specific_id: (item as AssetNumberSummary).specific_id ?? '' };
            case 'specifics':
                return { primary: (item as SpecificSummary).specific_name ?? '', area_id: (item as SpecificSummary).area_id ?? '' };
            case 'locations':
                return { primary: (item as LocationSummary).location_name ?? '', area_id: '', specific_id: (item as LocationSummary).specific_id ?? (item as LocationSummary).asset?.specific_id ?? '', asset_id: (item as LocationSummary).asset_id ?? '' };
            case 'softcopyCategories':
                return { primary: (item as SoftcopyCategorySummary).category_name ?? '', area_id: '', parent_category_id: (item as SoftcopyCategorySummary).parent_category_id ?? '' };
            default:
                return { primary: (item as SequenceSummary).sequence_code ?? '', area_id: '' };
        }
    }

    private mapDetailToView(detail: AreaDetail | AssetNumberDetail | SpecificDetail | LocationDetail | SequenceDetail | SoftcopyCategoryDetail): ResourceViewDialogData {
        switch (this.activeResource()) {
            case 'areas': {
                const area = detail as AreaDetail;
                return {
                    kindLabel: 'Area',
                    title: area.area_name,
                    subtitle: 'Area overview',
                    nameLabel: 'Area name',
                    name: area.area_name,
                    description: `${area.hardcopies?.length ?? 0} hardcopy link${(area.hardcopies?.length ?? 0) === 1 ? '' : 's'} currently reference this area.`,
                    metrics: [
                        { label: 'Specifics', value: String(area.specifics?.length ?? 0) },
                        { label: 'Hardcopies', value: String(area.hardcopies?.length ?? 0) }
                    ],
                    chipsLabel: 'Specifics in this area',
                    chips: (area.specifics ?? []).map((specific) => specific.specific_name),
                    emptyChipsText: 'No specifics are assigned to this area yet.'
                };
            }
            case 'assetNumbers': {
                const asset = detail as AssetNumberDetail;
                return {
                    kindLabel: 'Asset Number',
                    title: asset.asset_number,
                    subtitle: 'Asset-number overview',
                    nameLabel: 'Asset number',
                    name: asset.asset_number,
                    description: asset.hardcopy?.document?.document_title || 'No hardcopy is linked to this asset number.',
                    metrics: [
                        { label: 'Document title', value: asset.hardcopy?.document?.document_title || 'Not linked' },
                        { label: 'Area', value: asset.hardcopy?.area?.area_name || 'N/A' }
                    ],
                    chipsLabel: 'Linked catalog values',
                    chips: [asset.hardcopy?.specific?.specific_name, asset.hardcopy?.location?.location_name, asset.hardcopy?.sequence?.sequence_code].filter(Boolean) as string[],
                    emptyChipsText: 'No related hardcopy catalog values are linked to this asset number.'
                };
            }
            case 'specifics': {
                const specific = detail as SpecificDetail;
                return {
                    kindLabel: 'Specific',
                    title: specific.specific_name,
                    subtitle: 'Specific overview',
                    nameLabel: 'Specific name',
                    name: specific.specific_name,
                    description: 'This specific can be used independently without being tied to an area.',
                    metrics: [
                        { label: 'Type', value: 'Standalone specific' },
                        { label: 'Hardcopies', value: String(specific.hardcopies?.length ?? 0) }
                    ],
                    chipsLabel: 'Specific details',
                    chips: [],
                    emptyChipsText: 'This specific is intentionally independent from area assignments.'
                };
            }
            case 'locations': {
                const location = detail as LocationDetail;
                return {
                    kindLabel: 'Location',
                    title: location.location_name,
                    subtitle: 'Location overview',
                    nameLabel: 'Location name',
                    name: location.location_name,
                    description: `${location.hardcopies?.length ?? 0} hardcopy link${(location.hardcopies?.length ?? 0) === 1 ? '' : 's'} currently reference this location.`,
                    metrics: [
                        { label: 'Location Code', value: location.location_code || 'Pending' },
                        { label: 'Status', value: location.is_active === false ? 'Archived' : 'Active' }
                    ],
                    chipsLabel: 'Location details',
                    chips: [location.location_id, location.archived_at ? `Archived ${this.formatDate(location.archived_at)}` : 'Available'].filter(Boolean) as string[],
                    emptyChipsText: 'No additional details are available.'
                };
            }
            case 'softcopyCategories': {
                const category = detail as SoftcopyCategoryDetail;
                return {
                    kindLabel: category.parent_category_id ? 'Subfolder' : 'Main Folder',
                    title: category.category_name,
                    subtitle: 'Softcopy document folder',
                    nameLabel: 'Folder name',
                    name: category.category_name,
                    description: category.description || `Files are stored under uploads/revisions/${category.folder_name}.`,
                    metrics: [
                        { label: 'Documents', value: String(category.softcopies?.length ?? 0) },
                        { label: 'Subfolders', value: String(category.subcategories?.length ?? 0) },
                        { label: 'Main folder', value: category.parent?.category_name || category.category_name },
                        { label: 'Folder', value: category.folder_name }
                    ],
                    chipsLabel: 'Documents in this folder',
                    chips: (category.softcopies ?? []).map((softcopy) => softcopy.document?.document_number || '').filter(Boolean),
                    emptyChipsText: 'No softcopy documents use this folder yet.'
                };
            }
            default: {
                const sequence = detail as SequenceDetail;
                return {
                    kindLabel: 'Sequence',
                    title: sequence.sequence_code,
                    subtitle: 'Sequence overview',
                    nameLabel: 'Sequence code',
                    name: sequence.sequence_code,
                    description: `${sequence.hardcopies?.length ?? 0} hardcopy link${(sequence.hardcopies?.length ?? 0) === 1 ? '' : 's'} currently reference this sequence.`,
                    metrics: [{ label: 'Hardcopies', value: String(sequence.hardcopies?.length ?? 0) }],
                    chipsLabel: 'Sequence details',
                    chips: [sequence.sequence_id],
                    emptyChipsText: 'No additional details are available.'
                };
            }
        }
    }

    private buildSaveRequest(form: StorageResourceFormValue): Observable<unknown> {
        switch (this.activeResource()) {
            case 'areas':
                return this.editingId ? this.storageService.updateArea(this.editingId, { area_name: form.primary.trim() }) : this.storageService.createArea({ area_name: form.primary.trim() });
            case 'assetNumbers':
                return this.editingId ? this.storageService.updateAssetNumber(this.editingId, { asset_number: form.primary.trim(), specific_id: form.specific_id || null }) : this.storageService.createAssetNumber({ asset_number: form.primary.trim(), specific_id: form.specific_id });
            case 'specifics':
                return this.editingId ? this.storageService.updateSpecific(this.editingId, { specific_name: form.primary.trim(), area_id: form.area_id || null }) : this.storageService.createSpecific({ specific_name: form.primary.trim(), area_id: form.area_id });
            case 'locations':
                return this.editingId
                    ? this.storageService.updateLocation(this.editingId, { location_name: form.primary.trim(), specific_id: form.specific_id || null, asset_id: form.asset_id || null })
                    : this.storageService.createLocation({ location_name: form.primary.trim(), specific_id: form.specific_id!, asset_id: form.asset_id });
            case 'softcopyCategories':
                return this.editingId
                    ? this.storageService.updateSoftcopyCategory(this.editingId, { category_name: form.primary.trim(), parent_category_id: form.parent_category_id || '' })
                    : this.storageService.createSoftcopyCategory({ category_name: form.primary.trim(), ...(form.parent_category_id ? { parent_category_id: form.parent_category_id } : {}) });
            default:
                return this.editingId ? this.storageService.updateSequence(this.editingId, { sequence_code: form.primary.trim() }) : this.storageService.createSequence({ sequence_code: form.primary.trim() });
        }
    }

    private buildDetailRequest(id: string): Observable<AreaDetail | AssetNumberDetail | SpecificDetail | LocationDetail | SequenceDetail | SoftcopyCategoryDetail | null> {
        switch (this.activeResource()) {
            case 'areas':
                return this.storageService.getArea(id);
            case 'assetNumbers':
                return this.storageService.getAssetNumber(id);
            case 'specifics':
                return this.storageService.getSpecific(id);
            case 'locations':
                return this.storageService.getLocation(id);
            case 'softcopyCategories':
                return this.storageService.getSoftcopyCategory(id);
            default:
                return this.storageService.getSequence(id);
        }
    }

    private buildDeleteRequest(id: string): Observable<unknown> {
        switch (this.activeResource()) {
            case 'areas':
                return this.storageService.deleteArea(id);
            case 'assetNumbers':
                return this.storageService.deleteAssetNumber(id);
            case 'specifics':
                return this.storageService.deleteSpecific(id);
            case 'locations':
                return this.storageService.deleteLocation(id);
            case 'softcopyCategories':
                return this.storageService.deleteSoftcopyCategory(id);
            default:
                return this.storageService.deleteSequence(id);
        }
    }

    private loadActiveResource() {
        this.isLoading.set(true);
        this.errorMessage.set('');

        this.buildListRequest(1, 1000).pipe(
            expand((response) => response.meta?.has_next_page ? this.buildListRequest((response.meta.page ?? 1) + 1, 1000) : EMPTY),
            reduce(
                (all, response) => ({ items: [...all.items, ...(response.items ?? [])], meta: response.meta }),
                { items: [] as unknown[], meta: undefined as PaginatedMeta | undefined }
            )
        ).subscribe({
            next: (response: { items: unknown[]; meta?: PaginatedMeta }) => {
                this.setActiveItems(response.items ?? []);
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

    private buildListRequest(page: number, limit: number): Observable<{ items: unknown[]; meta?: PaginatedMeta }> {
        switch (this.activeResource()) {
            case 'areas':
                return this.storageService.listAreas(page, limit);
            case 'assetNumbers':
                return this.storageService.listAssetNumbers(page, limit);
            case 'specifics':
                return this.storageService.listSpecifics(page, limit);
            case 'locations':
                return this.storageService.listLocations(page, limit);
            case 'softcopyCategories':
                return this.storageService.listSoftcopyCategories(page, limit);
            default:
                return this.storageService.listSequences(page, limit);
        }
    }

    private setActiveItems(items: unknown[]) {
        switch (this.activeResource()) {
            case 'areas':
                this.areas.set(items as AreaSummary[]);
                break;
            case 'assetNumbers':
                this.assetNumbers.set(items as AssetNumberSummary[]);
                break;
            case 'specifics':
                this.specifics.set(items as SpecificSummary[]);
                break;
            case 'locations':
                this.locations.set(items as LocationSummary[]);
                break;
            case 'softcopyCategories':
                this.softcopyCategories.set(items as SoftcopyCategorySummary[]);
                break;
            default:
                this.sequences.set(items as SequenceSummary[]);
                break;
        }
    }

    private formatDate(value?: string) {
        if (!value) {
            return 'N/A';
        }

        const parsedDate = new Date(value);
        if (Number.isNaN(parsedDate.getTime())) {
            return value;
        }

        return parsedDate.toLocaleDateString();
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

    private emptyForm(): StorageResourceFormValue {
        return { primary: '', area_id: '', specific_id: '', asset_id: '', parent_category_id: '' };
    }

    private loadHierarchyOptions(force = false) {
        if (this.hierarchyLoading || (this.hierarchyLoaded && !force)) return;

        this.hierarchyLoading = true;
        forkJoin({
            areas: this.storageService.listAreas(1, 1000),
            specifics: this.storageService.listSpecifics(1, 1000),
            assets: this.storageService.listAssetNumbers(1, 1000)
        }).subscribe({
            next: ({ areas, specifics, assets }) => {
                this.hierarchyAreas.set(areas.items ?? []);
                this.hierarchySpecifics.set(specifics.items ?? []);
                this.hierarchyAssets.set(assets.items ?? []);
                this.hierarchyLoaded = true;
                this.hierarchyLoading = false;
            },
            error: () => {
                this.hierarchyLoading = false;
            }
        });
    }
}
