import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { Observable, Subscription, catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import * as XLSX from 'xlsx';
import { AuthService } from '@/app/auth/auth.service';
import { AlertModalComponent } from '@/app/shared/components/alert-modal/alert-modal.component';
import { ConfirmationDialogComponent } from '@/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { LoadingShimmerComponent } from '@/app/shared/components/loading-shimmer/loading-shimmer.component';
import { PaginationComponent } from '@/app/shared/components/pagination/pagination.component';
import { TableShellComponent } from '@/app/shared/components/table-shell/table-shell.component';
import { DocumentViewMode, SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import {
    SEARCHABLE_DROPDOWN_THRESHOLD,
    SearchableDropdownComponent,
    SearchableDropdownOption,
    SearchableDropdownValue
} from '@/app/shared/components/searchable-dropdown/searchable-dropdown.component';
import { BatchHardcopyUploadDialogComponent } from './components/batch-hardcopy-upload-dialog/batch-hardcopy-upload-dialog.component';
import { DocumentDetailDialogComponent } from './components/document-detail-dialog/document-detail-dialog.component';
import { DocumentFormDialogComponent } from './components/document-form-dialog/document-form-dialog.component';
import { DocumentStatusDialogComponent } from './components/document-status-dialog/document-status-dialog.component';
import { RevisionUploadDialogComponent } from './components/revision-upload-dialog/revision-upload-dialog.component';
import { SoftcopyFolderUploadDialogComponent } from './components/softcopy-folder-upload-dialog/softcopy-folder-upload-dialog.component';
import { DocumentAssignmentDialogComponent } from './components/document-assignment-dialog/document-assignment-dialog.component';
import { DocumentDirectoryDialogComponent } from './components/document-directory-dialog/document-directory-dialog.component';
import { DocumentsService } from './documents.service';
import { folderIdsToExpandForDocuments } from './folder-tree-navigation';
import {
    AreaReference,
    AssetReference,
    BatchHardcopyImportResponse,
    BatchHardcopyImportRow,
    BatchSoftcopyFolderImportResponse,
    DocumentDetail,
    DocumentFormValue,
    DocumentStatusValue,
    DocumentSummary,
    DocumentUserSummary,
    LocationReference,
    RevisionFormValue,
    RevisionSummary,
    SequenceReference,
    SoftcopyCategoryReference,
    SpecificReference
} from './documents.types';

type NoticeSeverity = 'success' | 'error' | 'warning' | 'info';
type DocumentWorkspaceViewMode = DocumentViewMode | 'folder';
type WorkspaceDocumentType = '' | 'SOFTCOPY' | 'HARDCOPY';

const BATCH_HARDCOPY_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const BATCH_HARDCOPY_ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

interface NoticeState {
    severity: NoticeSeverity;
    title: string;
    message: string;
    details?: string;
}

interface DocumentFolderNode {
    id: string;
    name: string;
    path: string;
    eyebrow: string;
    documents: DocumentSummary[];
    children: DocumentFolderNode[];
    categoryId?: string;
}

@Component({
    selector: 'app-documents-page',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        DialogModule,
        PaginationComponent,
        TableShellComponent,
        SearchableDropdownComponent,
        AlertModalComponent,
        ConfirmationDialogComponent,
        LoadingShimmerComponent,
        DocumentFormDialogComponent,
        DocumentDetailDialogComponent,
        RevisionUploadDialogComponent,
        BatchHardcopyUploadDialogComponent,
        SoftcopyFolderUploadDialogComponent,
        DocumentStatusDialogComponent,
        DocumentAssignmentDialogComponent,
        DocumentDirectoryDialogComponent
    ],
    template: `
        <app-loading-shimmer *ngIf="isLoading()" label="Loading documents" [columns]="7" />
        <section class="documents-page space-y-6" [style.display]="isLoading() ? 'none' : null">
            <div *ngIf="errorMessage()" class="surface-alert">
                <div class="flex items-start gap-3">
                    <i class="pi pi-exclamation-triangle mt-1 text-red-500"></i>
                    <div>
                        <div class="font-bold text-red-700">Unable to load documents.</div>
                        <div class="mt-1 text-sm text-red-600">{{ errorMessage() }}</div>
                    </div>
                </div>
            </div>

            <div *ngIf="referenceWarningMessage()" class="surface-alert surface-alert-warning">
                <div class="flex items-start gap-3">
                    <i class="pi pi-info-circle mt-1 text-amber-600"></i>
                    <div>
                        <div class="font-bold text-amber-800">Some supporting lists are unavailable.</div>
                        <div class="mt-1 text-sm text-amber-700">{{ referenceWarningMessage() }}</div>
                    </div>
                </div>
            </div>

            <article class="surface-card document-search-card p-5 sm:p-6">
                <div class="document-search-bar">
                    <i class="pi pi-search"></i>
                    <input id="search" pInputText [(ngModel)]="searchTerm" (ngModelChange)="onTableSearchChange()" placeholder="Search number, title, creator, asset, area, or file..." aria-label="Search documents" />
                    <button *ngIf="searchTerm" class="search-clear-button" type="button" title="Clear search" aria-label="Clear search" (click)="searchTerm = ''; onTableSearchChange()"><i class="pi pi-times"></i></button>
                    <button class="advanced-filter-button" [class.active]="advancedFiltersOpen || activeFilterCount()" type="button" title="Advanced search filters" aria-label="Advanced search filters" [attr.aria-expanded]="advancedFiltersOpen" (click)="advancedFiltersOpen = !advancedFiltersOpen">
                        <i class="pi pi-sliders-h"></i>
                        <span>Advanced</span>
                        <strong *ngIf="activeFilterCount()">{{ activeFilterCount() }}</strong>
                    </button>
                </div>
                <div *ngIf="advancedFiltersOpen" class="filter-shell legacy-document-filters" role="region" aria-label="Advanced document search filters">
                    <div class="filter-head advanced-filter-head">
                        <div class="advanced-filter-heading">
                            <span class="advanced-filter-icon"><i class="pi pi-sliders-h"></i></span>
                            <div>
                                <div class="filter-title">Advanced search</div>
                                <div class="filter-copy">Refine results using document and storage details.</div>
                            </div>
                        </div>
                        <div class="filter-badges">
                            <span class="filter-badge">{{ filteredDocuments().length }} match{{ filteredDocuments().length === 1 ? '' : 'es' }}</span>
                            <span *ngIf="selectedType" class="filter-badge">{{ selectedType }}</span>
                            <span *ngIf="selectedStatus" class="filter-badge">{{ selectedStatus }}</span>
                            <span *ngIf="selectedAssignmentStatus" class="filter-badge">{{ selectedAssignmentStatus === 'assigned' ? 'Assigned' : 'Unassigned' }}</span>
                            <button class="filter-close-button" type="button" aria-label="Close advanced filters" title="Close" (click)="advancedFiltersOpen = false"><i class="pi pi-times"></i></button>
                        </div>
                    </div>

                    <div class="filter-section-label"><i class="pi pi-file"></i><span><strong>Document filters</strong><small>Filter by record type, status, or assignment.</small></span></div>
                    <div class="filter-section-grid document-filter-grid">
                        <div class="field" *ngIf="!workspaceType">
                            <label for="type-filter">Type</label>
                            <select id="type-filter" [(ngModel)]="selectedType" (ngModelChange)="onTypeFilterChange()" class="select-field">
                                <option value="">All</option>
                                <option value="HARDCOPY">HARDCOPY</option>
                                <option value="SOFTCOPY">SOFTCOPY</option>
                            </select>
                        </div>
                        <div class="field">
                            <label for="status-filter">Status</label>
                            <select id="status-filter" [(ngModel)]="selectedStatus" (ngModelChange)="resetPagination()" class="select-field">
                                <option value="">All</option>
                                <option *ngFor="let status of documentStatuses" [value]="status">{{ statusLabel(status) }}</option>
                            </select>
                        </div>
                        <div class="field">
                            <label for="assignment-filter">Assignment</label>
                            <select id="assignment-filter" [(ngModel)]="selectedAssignmentStatus" (ngModelChange)="resetPagination()" class="select-field">
                                <option value="">All assignments</option>
                                <option value="assigned">Assigned documents</option>
                                <option value="unassigned">Unassigned documents</option>
                            </select>
                        </div>
                    </div>

                    <div *ngIf="selectedType !== 'SOFTCOPY'" class="filter-section-label"><i class="pi pi-map-marker"></i><span><strong>Physical storage</strong><small>Follow the route from area through sequence.</small></span></div>
                    <div *ngIf="selectedType !== 'SOFTCOPY'" class="filter-section-grid area-filter-grid">
                        <div class="field" *ngIf="selectedType !== 'SOFTCOPY'">
                            <label for="area-filter">Area</label>
                            <ng-container *ngIf="areas().length > searchableThreshold; else defaultAreaFilter">
                                <app-searchable-dropdown
                                    inputId="area-filter"
                                    [value]="selectedAreaId"
                                    [options]="areaFilterOptions()"
                                    [placeholder]="selectedType === 'SOFTCOPY' ? 'Not used for softcopy' : 'All areas'"
                                    [disabled]="selectedType === 'SOFTCOPY'"
                                    [loading]="isLoading()"
                                    [clearValue]="''"
                                    (valueChange)="onAreaFilterChange($event)"
                                />
                            </ng-container>
                            <ng-template #defaultAreaFilter>
                                <select id="area-filter" [(ngModel)]="selectedAreaId" (ngModelChange)="resetPagination()" class="select-field" [disabled]="selectedType === 'SOFTCOPY'">
                                    <option value="">{{ selectedType === 'SOFTCOPY' ? 'Not used for softcopy' : 'All' }}</option>
                                    <option *ngFor="let area of areas(); trackBy: trackArea" [value]="area.area_id">{{ area.area_name }}</option>
                                </select>
                            </ng-template>
                        </div>
                    </div>

                    <div *ngIf="selectedType !== 'HARDCOPY'" class="filter-section-label"><i class="pi pi-folder"></i><span><strong>Digital organization</strong><small>Browse uploaded files by folder or subfolder.</small></span></div>
                    <div *ngIf="selectedType !== 'HARDCOPY'" class="filter-section-grid digital-filter-grid">
                        <div class="field">
                            <label for="folder-filter">Softcopy folder / subfolder</label>
                            <select id="folder-filter" [(ngModel)]="selectedCategoryId" (ngModelChange)="resetPagination()" class="select-field">
                                <option value="">All folders and subfolders</option>
                                <option *ngFor="let category of softcopyCategories(); trackBy: trackSoftcopyCategory" [value]="category.softcopy_category_id">{{ category.folder_name || category.category_name }}</option>
                            </select>
                        </div>
                        <div class="filter-meta folder-filter-note"><i class="pi pi-sitemap"></i> Selecting a parent folder includes documents inside all of its nested subfolders.</div>
                    </div>

                    <div *ngIf="selectedType !== 'SOFTCOPY'" class="filter-section-grid storage-filter-grid storage-filter-grid-secondary">
                        <div class="field">
                            <label for="location-filter">Location</label>
                            <ng-container *ngIf="locations().length > searchableThreshold; else defaultLocationFilter">
                                <app-searchable-dropdown
                                    inputId="location-filter"
                                    [value]="selectedLocationId"
                                    [options]="locationFilterOptions()"
                                    [placeholder]="selectedType === 'SOFTCOPY' ? 'Not used for softcopy' : 'All locations'"
                                    [disabled]="selectedType === 'SOFTCOPY'"
                                    [loading]="isLoading()"
                                    [clearValue]="''"
                                    (valueChange)="onLocationFilterChange($event)"
                                />
                            </ng-container>
                            <ng-template #defaultLocationFilter>
                                <select id="location-filter" [(ngModel)]="selectedLocationId" (ngModelChange)="resetPagination()" class="select-field" [disabled]="selectedType === 'SOFTCOPY'">
                                    <option value="">{{ selectedType === 'SOFTCOPY' ? 'Not used for softcopy' : 'All locations' }}</option>
                                    <option *ngFor="let location of locations(); trackBy: trackLocation" [value]="location.location_id">{{ location.location_name }}</option>
                                </select>
                            </ng-template>
                        </div>

                        <div class="field">
                            <label for="specific-filter">Specific</label>
                            <ng-container *ngIf="specifics().length > searchableThreshold; else defaultSpecificFilter">
                                <app-searchable-dropdown
                                    inputId="specific-filter"
                                    [value]="selectedSpecificId"
                                    [options]="specificFilterOptions()"
                                    [placeholder]="selectedType === 'SOFTCOPY' ? 'Not used for softcopy' : 'All specifics'"
                                    [disabled]="selectedType === 'SOFTCOPY'"
                                    [loading]="isLoading()"
                                    [clearValue]="''"
                                    (valueChange)="onSpecificFilterChange($event)"
                                />
                            </ng-container>
                            <ng-template #defaultSpecificFilter>
                                <select id="specific-filter" [(ngModel)]="selectedSpecificId" (ngModelChange)="resetPagination()" class="select-field" [disabled]="selectedType === 'SOFTCOPY'">
                                    <option value="">{{ selectedType === 'SOFTCOPY' ? 'Not used for softcopy' : 'All specifics' }}</option>
                                    <option *ngFor="let specific of specifics(); trackBy: trackSpecific" [value]="specific.specific_id">{{ specific.specific_name }}</option>
                                </select>
                            </ng-template>
                        </div>

                        <div class="field">
                            <label for="asset-filter">Asset Number</label>
                            <ng-container *ngIf="assets().length > searchableThreshold; else defaultAssetFilter">
                                <app-searchable-dropdown
                                    inputId="asset-filter"
                                    [value]="selectedAssetId"
                                    [options]="assetFilterOptions()"
                                    [placeholder]="selectedType === 'SOFTCOPY' ? 'Not used for softcopy' : 'All asset numbers'"
                                    [disabled]="selectedType === 'SOFTCOPY'"
                                    [loading]="isLoading()"
                                    [clearValue]="''"
                                    (valueChange)="onAssetFilterChange($event)"
                                />
                            </ng-container>
                            <ng-template #defaultAssetFilter>
                                <select id="asset-filter" [(ngModel)]="selectedAssetId" (ngModelChange)="resetPagination()" class="select-field" [disabled]="selectedType === 'SOFTCOPY'">
                                    <option value="">{{ selectedType === 'SOFTCOPY' ? 'Not used for softcopy' : 'All asset numbers' }}</option>
                                    <option *ngFor="let asset of assets(); trackBy: trackAsset" [value]="asset.asset_id">{{ asset.asset_number }}</option>
                                </select>
                            </ng-template>
                        </div>

                        <div class="field">
                            <label for="sequence-filter">Sequence</label>
                            <ng-container *ngIf="sequences().length > searchableThreshold; else defaultSequenceFilter">
                                <app-searchable-dropdown
                                    inputId="sequence-filter"
                                    [value]="selectedSequenceId"
                                    [options]="sequenceFilterOptions()"
                                    [placeholder]="selectedType === 'SOFTCOPY' ? 'Not used for softcopy' : 'All sequences'"
                                    [disabled]="selectedType === 'SOFTCOPY'"
                                    [loading]="isLoading()"
                                    [clearValue]="''"
                                    (valueChange)="onSequenceFilterChange($event)"
                                />
                            </ng-container>
                            <ng-template #defaultSequenceFilter>
                                <select id="sequence-filter" [(ngModel)]="selectedSequenceId" (ngModelChange)="resetPagination()" class="select-field" [disabled]="selectedType === 'SOFTCOPY'">
                                    <option value="">{{ selectedType === 'SOFTCOPY' ? 'Not used for softcopy' : 'All sequences' }}</option>
                                    <option *ngFor="let sequence of sequences(); trackBy: trackSequence" [value]="sequence.sequence_id">{{ sequence.sequence_code }}</option>
                                </select>
                            </ng-template>
                        </div>
                    </div>

                    <div class="filter-footer">
                        <p-button label="Reset filters" severity="secondary" text icon="pi pi-refresh" (onClick)="resetFilters()" />
                        <div class="filter-meta">
                            {{ selectedType === 'SOFTCOPY' ? 'Use main folders and subfolders to organize and browse uploaded digital files.' : 'Use area, location, specific, asset number, and sequence to locate physical records.' }}
                        </div>
                    </div>
                </div>

                <div class="view-toolbar">
                    <div>
                        <div class="view-title">Document results</div>
                        <div class="view-copy">Switch between folder organization, a detailed table list, and a visual card grid.</div>
                    </div>
                    <div class="view-toolbar-controls">
                        <div class="document-primary-actions">
                            <p-button *ngIf="canImportDocuments() && workspaceType !== 'SOFTCOPY'" label="Batch Upload" icon="pi pi-file-import" severity="secondary" size="small" (onClick)="openBatchDialog()" />
                            <p-button *ngIf="canImportDocuments() && workspaceType !== 'HARDCOPY'" label="Upload Folder" icon="pi pi-folder-open" severity="secondary" size="small" (onClick)="openSoftcopyFolderDialog()" />
                            <p-button *ngIf="canCreateDocuments()" label="New Document" icon="pi pi-plus" size="small" (onClick)="openDocumentDialog()" />
                        </div>
                        <div class="view-switch" role="group" aria-label="Document view">
                            <button type="button" [class.active]="viewMode === 'list'" (click)="setViewMode('list')"><i class="pi pi-list"></i><span>Table list</span></button>
                            <button type="button" [class.active]="viewMode === 'grid'" (click)="setViewMode('grid')"><i class="pi pi-th-large"></i><span>Table grid</span></button>
                            <button type="button" [class.active]="viewMode === 'folder'" (click)="setViewMode('folder')"><i class="pi pi-folder-open"></i><span>Folders</span></button>
                        </div>
                    </div>
                </div>

                <app-table-shell *ngIf="viewMode === 'list'" class="mt-4 documents-table compact-documents-table" minWidth="68rem">
                        <thead>
                            <tr>
                                <th class="px-4 py-3 font-bold">Document</th>
                                <th class="px-4 py-3 font-bold">State</th>
                                <th class="px-4 py-3 font-bold">Assigned users</th>
                                <th class="px-4 py-3 font-bold">Storage / Revision</th>
                                <th class="px-4 py-3 text-right font-bold">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            <tr *ngFor="let document of pagedDocuments(); trackBy: trackDocument" class="align-top">
                                <td class="px-4 py-3">
                                    <div class="document-row-main">
                                        <button type="button" class="document-list-preview" [ngClass]="documentPreviewTone(document)" title="Preview document" (click)="openDetailDialog(document)">
                                            <div class="preview-art"><i [class]="documentPreviewIcon(document)"></i><span>{{ documentPreviewLabel(document) }}</span></div>
                                            <img *ngIf="documentPreviewImage(document) as previewImage" [src]="previewImage" [alt]="document.document_title" (error)="hideBrokenPreview($event)" />
                                        </button>
                                        <div class="document-row-copy">
                                            <h3 class="document-row-title document-title-highlight">{{ document.document_title }}</h3>
                                            <div class="document-number-line"><strong>{{ document.document_type === 'HARDCOPY' ? 'Hardcopy record' : (document.document_number || 'No document number') }}</strong><span>{{ formatDate(document.created_at) }}</span></div>
                                            <div class="document-row-file"><i [class]="documentPreviewIcon(document)"></i>{{ documentPreviewDescription(document) }}</div>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-4 py-3">
                                    <div class="state-stack">
                                        <span class="status-pill" [ngClass]="statusPillClass(document.status)">{{ statusLabel(document.status) }}</span>
                                        <div *ngIf="document.status === 'Disposed' && document.disposal_remarks" class="status-remark">
                                            {{ document.disposal_remarks }}
                                        </div>
                                        <button
                                            *ngIf="canChangeDocumentStatus(document)"
                                            type="button"
                                            class="status-toggle-button"
                                            [class.status-toggle-button-restore]="document.status === 'Disposed'"
                                            (click)="openStatusDialog(document)"
                                        >
                                            {{ document.status === 'Disposed' ? 'Restore' : 'Dispose' }}
                                        </button>
                                    </div>
                                </td>
                                <td class="px-4 py-3">
                                    <div class="document-assignment-panel" [class.unassigned]="!document.assignments?.length">
                                        <i class="pi" [ngClass]="document.assignments?.length ? 'pi-users' : 'pi-user-plus'"></i>
                                        <span><small>{{ document.assignments?.length ? 'Assigned to' : 'Access' }}</small><strong>{{ assignmentUsersLabel(document) }}</strong></span>
                                    </div>
                                </td>
                                <td class="px-4 py-3">
                                    <div *ngIf="document.document_type === 'HARDCOPY'; else softcopyCell" class="document-facts">
                                        <div class="fact-primary"><i class="pi pi-map-marker"></i><span><small>Location</small><strong>{{ document.hardcopy?.location?.location_name || 'None' }}</strong></span></div>
                                        <div class="fact-tags"><span>{{ document.hardcopy?.area?.area_name || 'No area' }}</span><span>{{ document.hardcopy?.specific?.specific_name || 'No classification' }}</span><span>{{ document.hardcopy?.asset?.asset_number || 'No asset' }}</span><span>{{ document.hardcopy?.sequence?.sequence_code || 'No series' }}</span></div>
                                        <div *ngIf="document.hardcopy?.retention" class="retention-summary" [class.retention-alert]="document.hardcopy?.retention?.days_remaining !== null && (document.hardcopy?.retention?.days_remaining || 0) <= 30"><i class="pi pi-clock"></i><span>{{ document.hardcopy?.retention?.label }}</span></div>
                                    </div>
                                    <ng-template #softcopyCell>
                                        <div class="document-facts">
                                            <div class="fact-primary"><i [class]="documentPreviewIcon(document)"></i><span><small>Current file</small><strong>{{ displayRevisionFileName(document.softcopy?.current_revision?.file_name) }}</strong></span></div>
                                            <div class="fact-tags"><span>Rev {{ document.softcopy?.current_revision?.revision_number || 'None' }}</span><span>{{ document.softcopy?.category?.category_name || 'Uncategorized' }}</span></div>
                                        </div>
                                    </ng-template>
                                </td>
                                <td class="px-4 py-3">
                                    <div class="document-row-actions">
                                        <p-button title="View document" icon="pi pi-eye" size="small" [rounded]="true" [outlined]="true" (onClick)="openDetailDialog(document)" />
                                        <p-button *ngIf="canRequestHardcopyTransfer(document)" title="Request hardcopy transfer" icon="pi pi-arrows-h" size="small" [rounded]="true" [outlined]="true" severity="warn" (onClick)="openHardcopyTransfer(document)" />
                                        <p-button *ngIf="canAttachToDocument(document)" title="Attach scanned documents" icon="pi pi-paperclip" size="small" [rounded]="true" [outlined]="true" severity="success" (onClick)="openAttachmentDialog(document)" />
                                        <p-button *ngIf="canRequestHardcopyTransfer(document)" title="Request hardcopy transfer" icon="pi pi-arrows-h" size="small" [rounded]="true" [outlined]="true" severity="warn" (onClick)="openHardcopyTransfer(document)" />
                                        <p-button *ngIf="canAssignDocuments()" title="Assign users" icon="pi pi-users" size="small" [rounded]="true" styleClass="assignment-action-button" (onClick)="openAssignmentDialog(document)" />
                                        <p-button *ngIf="canManageDocument(document)" title="Edit document" icon="pi pi-pencil" size="small" [rounded]="true" [outlined]="true" (onClick)="openDocumentDialog(document)" />
                                        <p-button *ngIf="canUploadRevision(document)" title="Upload and finalize controlled copy" icon="pi pi-upload" size="small" [rounded]="true" [outlined]="true" (onClick)="openRevisionDialog(document)" /><p-button *ngIf="canChangeDirectory(document)" title="Change directory" icon="pi pi-folder-open" size="small" [rounded]="true" [outlined]="true" severity="warn" (onClick)="openDirectoryDialog(document)" />
                                        <p-button *ngIf="canDeleteDocument(document)" title="Delete document" icon="pi pi-trash" size="small" [rounded]="true" [outlined]="true" severity="danger" (onClick)="requestDelete(document)" />
                                    </div>
                                </td>
                            </tr>
                            <tr *ngIf="!pagedDocuments().length && !isLoading()">
                                <td colspan="5" class="px-4 py-10 text-center text-slate-500">No documents match your search.</td>
                            </tr>
                        </tbody>
                </app-table-shell>

                <div *ngIf="viewMode === 'folder'" class="folder-browser">
                    <div *ngIf="draggingFolderId" class="folder-root-drop" [class.folder-root-drop-active]="rootFolderDropActive" (dragover)="allowRootFolderDrop($event)" (dragleave)="rootFolderDropActive = false" (drop)="dropFolderAtRoot($event)"><i class="pi pi-sitemap"></i><strong>Move to main folders</strong><span>Drop here to make this a root folder.</span></div>
                    <ng-container *ngFor="let folder of documentFolders(); trackBy: trackFolder">
                        <ng-container *ngTemplateOutlet="folderNode; context: { $implicit: folder, depth: 0 }" />
                    </ng-container>
                    <div *ngIf="!documentFolders().length && !isLoading()" class="grid-empty"><i class="pi pi-folder"></i><strong>No folders found</strong><span>No documents match the current search and filters.</span></div>
                </div>

                <ng-template #folderNode let-folder let-depth="depth">
                    <article class="folder-group" [class.folder-group-nested]="depth > 0" [class.folder-drop-target]="dropTargetCategoryId === folder.categoryId" (dragover)="allowFolderDrop($event, folder)" (dragleave)="leaveFolderDrop($event, folder)" (drop)="dropDocumentInFolder($event, folder)">
                        <header class="folder-header">
                            <button type="button" class="folder-toggle" [attr.aria-expanded]="isFolderExpanded(folder.id)" [attr.draggable]="canEditFolders() ? 'true' : null" title="Open folder or drag it into another folder" (dragstart)="startFolderDrag($event, folder)" (dragend)="endFolderDrag()" (click)="toggleFolder(folder.id)">
                                <div class="folder-icon"><i [class]="isFolderExpanded(folder.id) ? 'pi pi-folder-open' : 'pi pi-folder'"></i></div>
                                <div class="folder-heading"><span>{{ depth === 0 ? 'Softcopy folder' : 'Softcopy subfolder' }}</span><h3>{{ folder.name }}</h3><small>{{ folder.path }}</small></div>
                                <div class="folder-counts"><strong>{{ folder.documents.length }} file{{ folder.documents.length === 1 ? '' : 's' }}</strong><small>{{ folder.children.length }} subfolder{{ folder.children.length === 1 ? '' : 's' }}</small></div>
                                <i class="pi pi-chevron-down folder-chevron" [class.folder-chevron-open]="isFolderExpanded(folder.id)"></i>
                            </button>
                            <div *ngIf="folder.categoryId" class="folder-actions" (click)="$event.stopPropagation()">
                                <button *ngIf="canCreateDocuments()" type="button" title="Upload a document into this folder" (click)="openDocumentInFolder(folder)"><i class="pi pi-upload"></i><span>Upload document</span></button>
                                <button *ngIf="canCreateFolders()" type="button" title="Add a subfolder" (click)="openFolderDialog('create', folder)"><i class="pi pi-folder-plus"></i><span>Add subfolder</span></button>
                                <button *ngIf="canEditFolders()" type="button" title="Edit folder" (click)="openFolderDialog('edit', folder)"><i class="pi pi-pencil"></i><span>Edit</span></button>
                            </div>
                        </header>
                        <div *ngIf="isFolderExpanded(folder.id)" class="folder-contents">
                            <div *ngIf="folder.documents.length" class="folder-files">
                                <div *ngFor="let document of folder.documents; trackBy: trackDocument" class="folder-document-row" [class.folder-document-dragging]="draggingDocumentId === document.document_id" [attr.draggable]="canManageDocument(document) ? 'true' : null" (dragstart)="startDocumentDrag($event, document)" (dragend)="endDocumentDrag()">
                                    <button class="folder-document-main" type="button" (click)="openDetailDialog(document)">
                                    <i [class]="documentPreviewIcon(document)"></i>
                                    <span><strong>{{ document.document_type === 'HARDCOPY' ? 'Hardcopy record' : (document.document_number || 'No document number') }}</strong><small>{{ document.document_title }}</small><small class="assignment-inline">{{ assignmentUsersLabel(document) }} · {{ assignmentActorLabel(document) }}</small></span>
                                    <em *ngIf="document.document_type === 'SOFTCOPY'">{{ displayRevisionFileName(document.softcopy?.current_revision?.file_name, 'No file') }}</em>
                                    <em *ngIf="document.document_type === 'HARDCOPY'"><span>{{ document.hardcopy?.asset?.asset_number || 'No asset number' }}</span><small *ngIf="document.hardcopy?.retention">{{ document.hardcopy?.retention?.label }}</small></em>
                                    </button>
                                    <div class="folder-document-actions">
                                        <p-button title="Preview document" icon="pi pi-eye" size="small" [rounded]="true" [outlined]="true" (onClick)="openDetailDialog(document)" />
                                        <p-button *ngIf="canAttachToDocument(document)" title="Attach scanned documents" icon="pi pi-paperclip" size="small" [rounded]="true" [outlined]="true" severity="success" (onClick)="openAttachmentDialog(document)" />
                                        <p-button *ngIf="canAssignDocuments()" title="Assign users" icon="pi pi-users" size="small" [rounded]="true" [outlined]="true" (onClick)="openAssignmentDialog(document)" />
                                        <p-button *ngIf="canChangeDocumentStatus(document)" [title]="document.status === 'Disposed' ? 'Restore document' : 'Dispose document'" [icon]="document.status === 'Disposed' ? 'pi pi-replay' : 'pi pi-ban'" size="small" [rounded]="true" [outlined]="true" [severity]="document.status === 'Disposed' ? 'success' : 'danger'" (onClick)="openStatusDialog(document)" />
                                        <p-button *ngIf="canManageDocument(document)" title="Edit document" icon="pi pi-pencil" size="small" [rounded]="true" [outlined]="true" (onClick)="openDocumentDialog(document)" />
                                        <p-button *ngIf="canUploadRevision(document)" title="Upload and finalize controlled copy" icon="pi pi-upload" size="small" [rounded]="true" [outlined]="true" (onClick)="openRevisionDialog(document)" /><p-button *ngIf="canChangeDirectory(document)" title="Change directory" icon="pi pi-folder-open" size="small" [rounded]="true" [outlined]="true" severity="warn" (onClick)="openDirectoryDialog(document)" />
                                        <p-button *ngIf="canDeleteDocument(document)" title="Delete document" icon="pi pi-trash" size="small" [rounded]="true" [outlined]="true" severity="danger" (onClick)="requestDelete(document)" />
                                    </div>
                                </div>
                            </div>
                            <div *ngIf="folder.children.length" class="folder-children">
                                <ng-container *ngFor="let child of folder.children; trackBy: trackFolder">
                                    <ng-container *ngTemplateOutlet="folderNode; context: { $implicit: child, depth: depth + 1 }" />
                                </ng-container>
                            </div>
                            <div *ngIf="dropTargetCategoryId === folder.categoryId" class="folder-drop-message"><i class="pi pi-folder-open"></i> Drop here to move the document into {{ folder.name }}</div>
                            <div *ngIf="!folder.documents.length && !folder.children.length" class="folder-empty">This softcopy folder has no documents or subfolders.</div>
                        </div>
                    </article>
                </ng-template>

                <div *ngIf="viewMode === 'grid' && pagedDocuments().length" class="document-grid">
                    <article *ngFor="let document of pagedDocuments(); trackBy: trackDocument" class="document-card">
                        <div class="document-card-accent"></div>
                        <button type="button" class="document-card-preview" [ngClass]="documentPreviewTone(document)" title="Open document preview" (click)="openDetailDialog(document)">
                            <div class="preview-art"><i [class]="documentPreviewIcon(document)"></i><span>{{ documentPreviewLabel(document) }}</span><small>{{ documentPreviewDescription(document) }}</small></div>
                            <img *ngIf="documentPreviewImage(document) as previewImage" [src]="previewImage" [alt]="document.document_title" (error)="hideBrokenPreview($event)" />
                            <div class="document-card-pills">
                                <span class="status-pill" [ngClass]="statusPillClass(document.status)">{{ statusLabel(document.status) }}</span>
                            </div>
                        </button>

                        <div class="document-card-body">
                            <div class="document-card-kicker"><span class="document-card-number">{{ document.document_type === 'HARDCOPY' ? 'Hardcopy record' : (document.document_number || 'No document number') }}</span><span class="document-card-date"><i class="pi pi-calendar"></i>{{ formatDate(document.created_at) }}</span></div>
                            <h3 class="document-title-highlight">{{ document.document_title }}</h3>

                            <div class="document-card-meta" *ngIf="document.document_type === 'HARDCOPY'; else softcopyGridMeta">
                                <div><span>Area</span><strong>{{ document.hardcopy?.area?.area_name || 'None' }}</strong></div>
                                <div><span>Location</span><strong>{{ document.hardcopy?.location?.location_name || 'None' }}</strong></div>
                                <div><span>Classification</span><strong>{{ document.hardcopy?.specific?.specific_name || 'None' }}</strong></div>
                                <div><span>Asset</span><strong>{{ document.hardcopy?.asset?.asset_number || 'None' }}</strong></div>
                                <div><span>Series</span><strong>{{ document.hardcopy?.sequence?.sequence_code || 'None' }}</strong></div>
                                <div class="wide retention-card-meta" *ngIf="document.hardcopy?.retention"><span>Retention guide</span><strong>{{ document.hardcopy?.retention?.label }}</strong><small>{{ document.hardcopy?.retention?.guidance }}</small></div>
                            </div>
                            <ng-template #softcopyGridMeta>
                                <div class="document-card-meta">
                                    <div><span>Revision</span><strong>{{ document.softcopy?.current_revision?.revision_number || 'None' }}</strong></div>
                                    <div><span>Folder</span><strong>{{ document.softcopy?.category?.category_name || 'Uncategorized' }}</strong></div>
                                    <div class="wide"><span>Current file</span><strong>{{ displayRevisionFileName(document.softcopy?.current_revision?.file_name) }}</strong></div>
                                </div>
                            </ng-template>

                            <div class="document-assignment-panel card-assignment" [class.unassigned]="!document.assignments?.length">
                                <i class="pi" [ngClass]="document.assignments?.length ? 'pi-users' : 'pi-user-plus'"></i>
                                <span><small>{{ document.assignments?.length ? 'Assigned to' : 'Access' }}</small><strong>{{ assignmentUsersLabel(document) }}</strong></span>
                            </div>

                            <div *ngIf="document.status === 'Disposed' && document.disposal_remarks" class="status-remark mt-3"><strong>{{ document.disposal_action || 'Other' }}</strong> · {{ document.disposal_remarks }}<span *ngIf="document.disposal_action_other"> · {{ document.disposal_action_other }}</span></div>
                        </div>

                        <div class="document-card-actions">
                            <p-button title="View document" icon="pi pi-eye" size="small" [rounded]="true" [outlined]="true" (onClick)="openDetailDialog(document)" />
                            <p-button *ngIf="canRequestHardcopyTransfer(document)" title="Request hardcopy transfer" icon="pi pi-arrows-h" size="small" [rounded]="true" [outlined]="true" severity="warn" (onClick)="openHardcopyTransfer(document)" />
                            <p-button *ngIf="canAttachToDocument(document)" title="Attach scanned documents" icon="pi pi-paperclip" size="small" [rounded]="true" [outlined]="true" severity="success" (onClick)="openAttachmentDialog(document)" />
                            <p-button *ngIf="canRequestHardcopyTransfer(document)" title="Request hardcopy transfer" icon="pi pi-arrows-h" size="small" [rounded]="true" [outlined]="true" severity="warn" (onClick)="openHardcopyTransfer(document)" />
                            <p-button *ngIf="canAssignDocuments()" title="Assign users" icon="pi pi-users" size="small" [rounded]="true" styleClass="assignment-action-button" (onClick)="openAssignmentDialog(document)" />
                            <p-button *ngIf="canChangeDocumentStatus(document)" [title]="document.status === 'Disposed' ? 'Restore document' : 'Dispose document'" [icon]="document.status === 'Disposed' ? 'pi pi-replay' : 'pi pi-ban'" size="small" [rounded]="true" [outlined]="true" [severity]="document.status === 'Disposed' ? 'success' : 'danger'" (onClick)="openStatusDialog(document)" />
                            <p-button *ngIf="canManageDocument(document)" title="Edit document" icon="pi pi-pencil" size="small" [rounded]="true" [outlined]="true" (onClick)="openDocumentDialog(document)" />
                            <p-button *ngIf="canUploadRevision(document)" title="Upload and finalize controlled copy" icon="pi pi-upload" size="small" [rounded]="true" [outlined]="true" (onClick)="openRevisionDialog(document)" /><p-button *ngIf="canChangeDirectory(document)" title="Change directory" icon="pi pi-folder-open" size="small" [rounded]="true" [outlined]="true" severity="warn" (onClick)="openDirectoryDialog(document)" />
                            <p-button *ngIf="canDeleteDocument(document)" title="Delete document" icon="pi pi-trash" size="small" [rounded]="true" [outlined]="true" severity="danger" (onClick)="requestDelete(document)" />
                        </div>
                    </article>
                </div>

                <div *ngIf="viewMode === 'grid' && !pagedDocuments().length && !isLoading()" class="grid-empty">
                    <i class="pi pi-search"></i>
                    <strong>No documents found</strong>
                    <span>No documents match your search.</span>
                </div>

                <div *ngIf="filteredDocuments().length && viewMode !== 'folder'" class="pagination-footer mt-5 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div class="text-sm text-slate-500">
                        Showing <span class="font-bold text-slate-900">{{ pageStart() }}</span> to <span class="font-bold text-slate-900">{{ pageEnd() }}</span> of
                        <span class="font-bold text-slate-900">{{ filteredDocuments().length }}</span> document{{ filteredDocuments().length === 1 ? '' : 's' }}
                    </div>

                    <app-pagination
                        [first]="first"
                        [rows]="rows"
                        [totalRecords]="filteredDocuments().length"
                        [rowsPerPageOptions]="rowsPerPageOptions"
                        [pageLinkSize]="4"
                        [showCurrentPageReport]="false"
                        currentPageReportTemplate="Showing {first} to {last} of {totalRecords} documents"
                        (pageChange)="onPageChange($event)"
                    />
                </div>
            </article>
        </section>

        <app-document-form-dialog
            [(visible)]="documentDialogVisible"
            [mode]="documentFormMode"
            [form]="documentForm"
            [areas]="areas()"
            [assets]="assets()"
            [specifics]="specifics()"
            [locations]="locations()"
            [sequences]="sequences()"
            [softcopyCategories]="softcopyCategories()"
            [users]="users()"
            [canAssignUsers]="canAssignDocuments()"
            [canDirectCreate]="canDirectCreateSoftcopy()"
            [currentUserName]="currentUserName()"
            [referenceLoading]="isLoading()"
            [saving]="isSaving()"
            (save)="saveDocument($event)"
        />

        <app-document-detail-dialog [(visible)]="detailDialogVisible" [document]="selectedDocumentDetail()" [loading]="detailLoading()" [revisions]="selectedRevisions()" [users]="users()" [canConfigureWorkflow]="canConfigureWorkflow()" [canAccessFiles]="canDownloadDocuments()" [canDeleteAttachments]="canAttachScans() || canDeleteDocuments()" (attachmentDelete)="deleteAttachment($event)" />

        <p-dialog [(visible)]="attachmentDialogVisible" [modal]="true" [draggable]="false" [resizable]="false" [style]="{ width: '38rem', maxWidth: '94vw' }" styleClass="attachment-modal" header="Attach scanned documents">
            <div class="attachment-upload-dialog">
                <div class="attachment-target"><span class="attachment-target-icon"><i class="pi pi-file"></i></span><span><small>{{ attachmentTarget?.document_type === 'HARDCOPY' ? 'Hardcopy record' : 'Softcopy record' }}</small><strong>{{ attachmentTarget?.document_title }}</strong><em>{{ attachmentTarget?.document_number || 'No document number' }}</em></span></div>
                <label for="direct-scan-files" class="attachment-dropzone">
                    <input id="direct-scan-files" type="file" multiple [disabled]="attachmentSaving()" (change)="selectAttachmentFiles($event)" />
                    <span class="upload-orb"><i class="pi pi-cloud-upload"></i></span>
                    <strong>{{ attachmentFiles.length ? attachmentFiles.length + ' file(s) ready' : 'Choose supporting files' }}</strong>
                    <span>Click to browse images, PDFs, Office files, or other supporting evidence</span>
                    <small>Maximum 10 files · stored under Supporting evidence</small>
                </label>
                <div *ngIf="attachmentFiles.length" class="attachment-file-list">
                    <div *ngFor="let file of attachmentFiles; let index = index"><span class="file-kind"><i class="pi pi-paperclip"></i></span><span><strong>{{ file.name }}</strong><small>{{ formatBytes(file.size) }}</small></span><button type="button" [disabled]="attachmentSaving()" title="Remove file" (click)="removeAttachmentFile(index)"><i class="pi pi-times"></i></button></div>
                </div>
            </div>
            <ng-template pTemplate="footer">
                <small>Files are saved as pending attachments and require Plant Manager approval before they are approved.</small>
                <p-button label="Cancel" severity="secondary" [outlined]="true" [disabled]="attachmentSaving()" (onClick)="closeAttachmentDialog()" />
                <p-button label="Upload files" icon="pi pi-upload" severity="success" [loading]="attachmentSaving()" [disabled]="!attachmentFiles.length" (onClick)="uploadAttachmentFiles()" />
            </ng-template>
        </p-dialog>

        <app-document-assignment-dialog #assignmentDialog [(visible)]="assignmentDialogVisible" [document]="assignmentDocument" [users]="users()" [saving]="assignmentSaving()" (save)="saveAssignments($event)" />

        <app-revision-upload-dialog
            [(visible)]="revisionDialogVisible"
            [form]="revisionForm"
            [saving]="isSaving()"
            [documentNumber]="revisionContextDocumentNumber"
            [currentRevision]="revisionCurrentRevision"
            [existingRevisions]="revisionExistingRevisions"
            [documentStatus]="revisionTargetStatus"
            [softcopyCategories]="softcopyCategories()"
            (save)="uploadRevision($event)"
        />

        <app-document-directory-dialog
            [(visible)]="directoryDialogVisible"
            [saving]="isSaving()"
            [documentNumber]="directoryContextDocumentNumber"
            [currentCategoryId]="directoryCurrentCategoryId"
            [softcopyCategories]="softcopyCategories()"
            (save)="saveDirectory($event)"
        />

        <app-document-status-dialog [(visible)]="statusDialogVisible" [document]="statusTargetDocument" [mode]="statusDialogMode" [saving]="isSaving()" [administrator]="auth.hasPermission('documents.manage')" [users]="users()" [currentUser]="auth.user()" (save)="saveDocumentStatus($event)" />

        <app-batch-hardcopy-upload-dialog
            [(visible)]="batchDialogVisible"
            [fileName]="batchFileName"
            [rows]="batchRows()"
            [result]="batchResult()"
            [saving]="batchSaving()"
            [uploadProgress]="batchUploadProgress()"
            [progressLabel]="batchProgressLabel()"
            [validationMessage]="batchValidationMessage()"
            [maxFileSizeLabel]="batchMaxFileSizeLabel"
            (fileChange)="onBatchFileSelected($event)"
            (upload)="uploadBatchHardcopy()"
        />

        <app-softcopy-folder-upload-dialog
            [(visible)]="softcopyFolderDialogVisible"
            [saving]="softcopyFolderSaving()"
            [progress]="softcopyFolderProgress()"
            [result]="softcopyFolderResult()"
            (upload)="uploadSoftcopyFolder($event)"
        />

        <p-dialog [(visible)]="folderDialogVisible" [modal]="true" [draggable]="false" [resizable]="false" [style]="{ width: '32rem', maxWidth: '94vw' }" [header]="folderDialogMode === 'edit' ? 'Edit folder' : 'Add subfolder'">
            <div class="folder-form">
                <div *ngIf="folderDialogMode === 'create'" class="folder-parent"><span>Parent folder</span><strong>{{ folderDialogParentPath }}</strong></div>
                <label for="folder-name">Folder name</label>
                <input id="folder-name" class="select-field" [(ngModel)]="folderName" maxlength="150" placeholder="Enter folder name" (keyup.enter)="saveFolder()" />
            </div>
            <ng-template pTemplate="footer">
                <p-button label="Cancel" severity="secondary" [outlined]="true" [disabled]="folderSaving()" (onClick)="folderDialogVisible = false" />
                <p-button [label]="folderDialogMode === 'edit' ? 'Save changes' : 'Create subfolder'" [icon]="folderDialogMode === 'edit' ? 'pi pi-check' : 'pi pi-folder-plus'" [loading]="folderSaving()" [disabled]="!folderName.trim()" (onClick)="saveFolder()" />
            </ng-template>
        </p-dialog>

        <app-confirmation-dialog
            [(visible)]="deleteConfirmVisible"
            title="Delete document?"
            subtitle="This action cannot be undone"
            [message]="deleteMessage()"
            confirmLabel="Delete"
            cancelLabel="Cancel"
            tone="danger"
            [dismissableMask]="true"
            (confirm)="confirmDelete()"
        />

        <app-alert-modal [(visible)]="noticeVisible" [severity]="notice()?.severity ?? 'info'" [title]="notice()?.title ?? 'Notice'" [message]="notice()?.message ?? ''" [details]="notice()?.details ?? ''" />

        <div *ngIf="false" class="assistant-fab-shell">
            <button type="button" class="assistant-fab" (click)="toggleAssistant()">
                <i class="pi" [ngClass]="assistantOpen() ? 'pi-times' : 'pi-comments'"></i>
                <span>{{ assistantTitle }}</span>
            </button>

            <div *ngIf="assistantOpen()" class="assistant-panel">
                <div class="assistant-head">
                    <div>
                        <div class="assistant-title">{{ assistantTitle }}</div>
                        <div class="assistant-subtitle">Ask for faster document lookup, filtered suggestions, and a quick summary of likely matches.</div>
                    </div>
                    <div class="assistant-status">
                        <span class="assistant-status-dot"></span>
                        {{ assistantLoading() ? 'Assisting...' : 'Ready to assist' }}
                    </div>
                </div>

                <div class="assistant-body">
                    <div class="field">
                        <label for="assistant-query">Ask about documents</label>
                        <div class="assistant-input-card">
                            <div class="assistant-input-icon">
                                <i class="pi pi-comments"></i>
                            </div>
                            <div class="assistant-input-copy">
                                <div class="assistant-input-label">Assistant Prompt</div>
                                <input
                                    id="assistant-query"
                                    pInputText
                                    [(ngModel)]="assistantQuery"
                                    class="assistant-text-input"
                                    placeholder="Find active hardcopy quality manual documents"
                                    (ngModelChange)="onAssistantQueryChange()"
                                    (keyup.enter)="runAssistantSearch()"
                                />
                            </div>
                        </div>
                        <div class="assistant-hint">Type naturally. Results update with AI help and you can push the same wording into the table filters.</div>
                    </div>

                    <div class="assistant-actions">
                        <p-button label="Ask now" icon="pi pi-send" [loading]="assistantLoading()" (onClick)="runAssistantSearch()" />
                        <p-button label="Use table filters" severity="secondary" text (onClick)="applyAssistantQueryToSearch()" />
                    </div>

                    <div *ngIf="assistantAnswer()" class="assistant-answer">
                        {{ assistantAnswer() }}
                    </div>

                    <div *ngIf="assistantMatches().length" class="assistant-results">
                        <button *ngFor="let match of assistantMatches(); trackBy: trackDocument" type="button" class="assistant-result" (click)="openDetailDialog(match)">
                            <div class="font-black text-slate-900">{{ match.document_type === 'HARDCOPY' ? match.document_title : (match.document_number || 'No document number') }}</div>
                            <div class="mt-1 text-sm text-slate-600">{{ match.document_title }}</div>
                            <div class="mt-1 text-xs text-slate-400">{{ match.document_type }} · {{ statusLabel(match.status) }}</div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
            }

            .documents-page {
                color: #0f172a;
            }

            .document-search-card { position: relative; }
            .legacy-document-filters { position: absolute; z-index: 40; top: 5.15rem; left: 1.25rem; right: 1.25rem; display: block; max-height: min(74vh, 46rem); overflow: auto; border: 1px solid #d4d4d8; border-radius: 1.25rem; background: #fff; padding: 1.4rem; box-shadow: none; }
            .document-search-bar { display: flex; align-items: center; gap: 0.7rem; min-height: 3rem; border: 1px solid #cbd5e1; border-radius: 1rem; background: #fff; padding: 0 0.9rem; }
            .document-search-bar > i { color: #64748b; }
            .document-search-bar input { min-width: 0; flex: 1; border: none; background: transparent; color: #0f172a; outline: none; }
            .document-search-bar button { display: grid; place-items: center; min-width: 2rem; height: 2rem; border: none; background: #f1f5f9; color: #64748b; cursor: pointer; }
            .document-search-bar .search-clear-button { border-radius: 50%; }
            .document-search-bar .advanced-filter-button { display: flex; gap: .45rem; width: auto; padding: 0 .75rem; border-left: 1px solid #e2e8f0; border-radius: .65rem; color: #334155; font-size: .78rem; font-weight: 800; }
            .document-search-bar .advanced-filter-button.active { background: var(--brand-soft-strong); color: var(--brand-primary-deep); }
            .advanced-filter-button strong { display: grid; place-items: center; min-width: 1.15rem; height: 1.15rem; border-radius: 999px; background: var(--brand-primary); color: #fff; font-size: .65rem; }
            .filter-close-button { display: grid; place-items: center; width: 2rem; height: 2rem; border: 0; border-radius: .55rem; background: #f1f5f9; color: #475569; cursor: pointer; }

            .surface-card {
                border: 1px solid rgba(148, 163, 184, 0.18);
                border-radius: 1.75rem;
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.96));
                box-shadow:
                    0 24px 64px rgba(15, 23, 42, 0.08),
                    0 2px 8px rgba(15, 23, 42, 0.04);
            }

            .surface-alert {
                border: 1px solid rgba(252, 165, 165, 0.6);
                border-radius: 1.25rem;
                background: linear-gradient(180deg, var(--brand-soft) 0%, var(--brand-soft-strong) 100%);
                padding: 1rem 1.25rem;
            }

            .surface-alert-warning {
                border-color: rgba(251, 191, 36, 0.45);
                background: linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%);
            }

            .select-field {
                min-height: 2.75rem;
                width: 100%;
                border-radius: 0.85rem;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                padding: 0.75rem 0.9rem;
                color: #0f172a;
                outline: none;
                transition:
                    border-color 0.2s ease,
                    box-shadow 0.2s ease,
                    background 0.2s ease;
            }

            .select-field:focus {
                border-color: #0f172a;
                box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.06);
            }

            .select-field:disabled {
                background: #f1f5f9;
                color: #94a3b8;
                cursor: not-allowed;
            }

            .type-pill,
            .status-pill {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 9999px;
                min-height: 2.1rem;
                padding: 0.45rem 0.95rem;
                font-size: 0.76rem;
                font-weight: 800;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }

            .type-pill {
                border: 1px solid #111111;
                background: #ffffff;
                color: #111111;
            }

            .type-pill-softcopy {
                border-color: #111111;
                background: #111111;
                color: #ffffff;
            }

            .status-pill {
                border: 1px solid #111111;
                background: #111111;
                color: #ffffff;
            }

            .status-pill-disposed {
                border-color: var(--brand-primary);
                background: var(--brand-primary);
                color: #ffffff;
            }

            .status-pill-draft {
                border-color: #64748b;
                background: #64748b;
                color: #ffffff;
            }

            .status-pill-pending {
                border-color: #b45309;
                background: #b45309;
                color: #ffffff;
            }

            .status-pill-approved {
                border-color: #111111;
                background: #111111;
                color: #ffffff;
            }

            .status-pill-rejected {
                border-color: var(--brand-primary);
                background: var(--brand-primary);
                color: #ffffff;
            }

            .status-pill-revised {
                border-color: #1d4ed8;
                background: #1d4ed8;
                color: #ffffff;
            }

            .state-stack {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 0.65rem;
            }

            .status-remark {
                max-width: 15rem;
                border-left: 4px solid var(--brand-primary);
                background: #ffffff;
                padding: 0.35rem 0 0.35rem 0.75rem;
                color: #475569;
                font-size: 0.77rem;
                line-height: 1.45;
            }

            .retention-summary {
                display: flex;
                align-items: center;
                gap: 0.35rem;
                margin-top: 0.55rem;
                border-radius: 0.6rem;
                background: #f0fdf4;
                padding: 0.45rem 0.55rem;
                color: #166534;
                font-size: 0.7rem;
                font-weight: 800;
            }

            .retention-summary.retention-alert {
                background: var(--brand-soft);
                color: var(--brand-primary);
            }

            .retention-card-meta small {
                display: block;
                margin-top: 0.25rem;
                color: #64748b;
                font-size: 0.68rem;
                line-height: 1.35;
            }

            .folder-document-main em small {
                display: block;
                margin-top: 0.2rem;
                color: #166534;
                font-size: 0.68rem;
                font-style: normal;
                font-weight: 700;
            }

            .status-toggle-button {
                border: 1px solid var(--brand-primary);
                border-radius: 9999px;
                background: var(--brand-primary);
                padding: 0.55rem 0.95rem;
                color: #ffffff;
                font-size: 0.76rem;
                font-weight: 800;
                letter-spacing: 0.04em;
                cursor: pointer;
                text-align: left;
                transition:
                    background 0.2s ease,
                    border-color 0.2s ease,
                    color 0.2s ease,
                    transform 0.2s ease;
            }

            .status-toggle-button:hover {
                background: var(--brand-primary-deep);
                border-color: var(--brand-primary-deep);
                transform: translateY(-1px);
            }

            .status-toggle-button-restore {
                border-color: #111111;
                background: #ffffff;
                color: #111111;
            }

            .status-toggle-button-restore:hover {
                background: #111111;
                color: #ffffff;
            }

            .assistant-fab-shell {
                position: fixed;
                right: 1.5rem;
                bottom: 1.5rem;
                z-index: 1200;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 0.85rem;
            }

            .assistant-fab {
                border: none;
                border-radius: 9999px;
                background: linear-gradient(135deg, #0f172a 0%, #0369a1 100%);
                color: #ffffff;
                padding: 0.9rem 1.15rem;
                display: inline-flex;
                align-items: center;
                gap: 0.7rem;
                font-weight: 800;
                box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
                cursor: pointer;
            }

            .assistant-panel {
                width: min(34rem, calc(100vw - 2rem));
                max-height: min(46rem, calc(100vh - 7rem));
                border: 1px solid rgba(148, 163, 184, 0.18);
                border-radius: 1.75rem;
                background: radial-gradient(circle at top right, rgba(191, 219, 254, 0.28), transparent 26%), linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 250, 252, 0.98));
                box-shadow:
                    0 32px 80px rgba(15, 23, 42, 0.24),
                    0 10px 24px rgba(15, 23, 42, 0.1);
                overflow: hidden;
                backdrop-filter: blur(10px);
                display: flex;
                flex-direction: column;
            }

            .assistant-head {
                padding: 1.15rem 1.15rem 1rem;
                background: linear-gradient(135deg, rgba(15, 23, 42, 0.03), rgba(14, 165, 233, 0.08)), linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
                border-bottom: 1px solid rgba(148, 163, 184, 0.14);
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 1rem;
            }

            .assistant-title {
                font-size: 1rem;
                font-weight: 900;
                color: #0f172a;
            }

            .assistant-subtitle {
                margin-top: 0.25rem;
                font-size: 0.82rem;
                color: #64748b;
                line-height: 1.6;
                max-width: 22rem;
            }

            .assistant-status {
                display: inline-flex;
                align-items: center;
                gap: 0.45rem;
                border-radius: 9999px;
                border: 1px solid rgba(14, 165, 233, 0.14);
                background: rgba(255, 255, 255, 0.86);
                padding: 0.42rem 0.72rem;
                font-size: 0.73rem;
                font-weight: 800;
                color: #0369a1;
                white-space: nowrap;
            }

            .assistant-status-dot {
                width: 0.48rem;
                height: 0.48rem;
                border-radius: 9999px;
                background: #22c55e;
                box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.16);
            }

            .assistant-body {
                padding: 1.15rem;
                display: flex;
                flex-direction: column;
                gap: 0.9rem;
                overflow-y: auto;
                overflow-x: hidden;
                min-height: 0;
            }

            .assistant-actions {
                display: flex;
                gap: 0.75rem;
                flex-wrap: wrap;
                align-items: center;
            }

            .assistant-input-card {
                display: grid;
                grid-template-columns: 3rem minmax(0, 1fr);
                align-items: center;
                gap: 0.85rem;
                border: 1px solid rgba(148, 163, 184, 0.2);
                border-radius: 1.2rem;
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
                padding: 0.8rem 0.9rem;
                box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
                transition:
                    border-color 0.2s ease,
                    box-shadow 0.2s ease,
                    transform 0.2s ease;
            }

            .assistant-input-card:focus-within {
                border-color: rgba(14, 165, 233, 0.4);
                box-shadow:
                    0 0 0 4px rgba(14, 165, 233, 0.1),
                    inset 0 1px 2px rgba(15, 23, 42, 0.04);
                transform: translateY(-1px);
            }

            .assistant-input-icon {
                display: grid;
                place-items: center;
                width: 3rem;
                height: 3rem;
                border-radius: 1rem;
                background: linear-gradient(135deg, #0f172a 0%, #0369a1 100%);
                color: #ffffff;
                box-shadow: 0 12px 24px rgba(3, 105, 161, 0.2);
            }

            .assistant-input-copy {
                min-width: 0;
            }

            .assistant-input-label {
                font-size: 0.7rem;
                font-weight: 800;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                color: #64748b;
            }

            .assistant-text-input {
                width: 100%;
                margin-top: 0.35rem;
                border: none;
                background: transparent;
                color: #0f172a;
                outline: none;
                padding: 0;
                font-size: 0.98rem;
                line-height: 1.5;
            }

            .assistant-hint {
                color: #64748b;
                font-size: 0.8rem;
            }

            .assistant-answer {
                border: 1px solid rgba(14, 165, 233, 0.16);
                border-radius: 1.1rem;
                background: linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(239, 246, 255, 0.92));
                padding: 1rem 1.05rem;
                color: #334155;
                line-height: 1.65;
                font-size: 0.92rem;
                white-space: pre-wrap;
            }

            .assistant-results {
                display: grid;
                gap: 0.75rem;
            }

            .assistant-result {
                text-align: left;
                border: 1px solid #e2e8f0;
                border-radius: 1.05rem;
                background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
                padding: 0.95rem 1rem;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .assistant-result:hover {
                border-color: #93c5fd;
                background: #f8fbff;
                transform: translateY(-1px);
            }

            .folder-header { display: flex; align-items: center; gap: 0.75rem; }
            .view-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.25rem; }
            .view-toolbar-controls { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 0.75rem; }
            .document-primary-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
            .folder-toggle { min-width: 0; flex: 1; }
            .folder-counts { display: grid; justify-items: end; gap: 0.15rem; white-space: nowrap; }
            .folder-counts small { color: #64748b; font-size: 0.74rem; font-weight: 700; }
            .folder-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.45rem; padding-right: 0.8rem; }
            .folder-actions button { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.25rem; border: none; border-radius: 0.7rem; background: #f1f5f9; padding: 0.5rem 0.7rem; color: #334155; font-size: 0.76rem; font-weight: 800; cursor: pointer; }
            .folder-actions button:hover { background: #e2e8f0; color: #0f172a; }
            .folder-document-row { display: flex; align-items: center; gap: 0.65rem; border-radius: 0.85rem; background: #fff; padding: 0.35rem 0.45rem 0.35rem 0; }
            .folder-document-main { min-width: 0; flex: 1; }
            .folder-document-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.3rem; }
            .folder-document-row[draggable='true'] { cursor: grab; }
            .folder-document-dragging { opacity: 0.45; }
            .folder-drop-target { background: #eff6ff; box-shadow: inset 0 0 0 2px #3b82f6; }
            .folder-drop-message { display: flex; align-items: center; justify-content: center; gap: 0.55rem; min-height: 3.5rem; border-radius: 0.85rem; background: #dbeafe; color: #1d4ed8; font-size: 0.86rem; font-weight: 800; }
            .folder-root-drop { display: grid; place-items: center; gap: 0.25rem; min-height: 5rem; border: 2px dashed #94a3b8; border-radius: 1rem; background: #f8fafc; color: #475569; text-align: center; }
            .folder-root-drop-active { border-color: #2563eb; background: #dbeafe; color: #1d4ed8; }
            .folder-root-drop span { font-size: 0.76rem; }
            .folder-form { display: grid; gap: 0.7rem; padding-top: 0.35rem; }
            .folder-form label, .folder-parent span { color: #64748b; font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
            .folder-parent { display: grid; gap: 0.25rem; border-radius: 0.85rem; background: #f8fafc; padding: 0.8rem 0.9rem; }

            :host-context(.app-dark) .documents-page { color: #e5e7eb; }
            :host-context(.app-dark) .document-search-bar { border-color: #404040; background: #101010; }
            :host-context(.app-dark) .document-search-bar input { color: #f5f5f5; }
            :host-context(.app-dark) .document-search-bar button { background: #292929; color: #d4d4d4; }
            :host-context(.app-dark) .document-search-bar .advanced-filter-button { border-left-color: #404040; }
            :host-context(.app-dark) .document-search-bar .advanced-filter-button.active { background: #3f1818; color: var(--brand-border); }
            :host-context(.app-dark) .filter-close-button { background: #292929; color: #d4d4d4; }
            :host-context(.app-dark) .surface-card,
            :host-context(.app-dark) .filter-shell,
            :host-context(.app-dark) .folder-group,
            :host-context(.app-dark) .folder-document-row,
            :host-context(.app-dark) .document-card,
            :host-context(.app-dark) .assistant-result { border-color: #333; background: #171717; box-shadow: none; }
            :host-context(.app-dark) h1,
            :host-context(.app-dark) h2,
            :host-context(.app-dark) h3,
            :host-context(.app-dark) .folder-heading h3,
            :host-context(.app-dark) .folder-document-main strong,
            :host-context(.app-dark) .folder-parent strong { color: #f5f5f5; }
            :host-context(.app-dark) .filter-copy,
            :host-context(.app-dark) .field label,
            :host-context(.app-dark) .folder-heading span,
            :host-context(.app-dark) .folder-heading small,
            :host-context(.app-dark) .folder-counts small,
            :host-context(.app-dark) .folder-document-main small,
            :host-context(.app-dark) .folder-document-main em { color: #a3a3a3; }
            :host-context(.app-dark) .search-input-shell,
            :host-context(.app-dark) .select-field,
            :host-context(.app-dark) .folder-parent { border-color: #404040; background: #101010; color: #f5f5f5; }
            :host-context(.app-dark) .folder-actions button { background: #292929; color: #e5e5e5; }
            :host-context(.app-dark) .folder-actions button:hover { background: #3f3f46; color: #fff; }
            :host-context(.app-dark) .folder-drop-target { background: #172554; box-shadow: inset 0 0 0 2px #60a5fa; }
            :host-context(.app-dark) .folder-drop-message { background: #1e3a8a; color: #bfdbfe; }
            :host-context(.app-dark) .folder-root-drop { border-color: #52525b; background: #101010; color: #d4d4d4; }
            :host-context(.app-dark) .folder-root-drop-active { border-color: #60a5fa; background: #172554; color: #bfdbfe; }
            :host-context(.app-dark) .folder-empty,
            :host-context(.app-dark) .grid-empty { color: #a3a3a3; }
            :host-context(.app-dark) ::ng-deep .p-dialog { border-color: #333; background: #171717; color: #e5e5e5; }
            :host-context(.app-dark) ::ng-deep .p-dialog-header,
            :host-context(.app-dark) ::ng-deep .p-dialog-content,
            :host-context(.app-dark) ::ng-deep .p-dialog-footer { background: #171717; color: #e5e5e5; }

            :host ::ng-deep .attachment-modal .p-dialog-header{padding:1.25rem 1.35rem .8rem;font-weight:900}.attachment-upload-dialog{display:grid;gap:1rem}.attachment-target{display:flex;align-items:center;gap:.85rem;border-radius:1rem;background:linear-gradient(135deg,#111827,#27272a);padding:1rem;color:#fff}.attachment-target-icon{display:grid;place-items:center;width:3rem;height:3rem;flex:0 0 auto;border-radius:.85rem;background:linear-gradient(135deg,var(--dts-accent,var(--brand-primary)),var(--dts-accent-deep,var(--brand-primary-deep)));font-size:1.1rem}.attachment-target>span:last-child{display:grid;min-width:0}.attachment-target small{color:var(--brand-border);font-size:.62rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.attachment-target strong{overflow:hidden;margin:.18rem 0;color:#fff;text-overflow:ellipsis;white-space:nowrap}.attachment-target em{color:#a3a3a3;font-size:.68rem;font-style:normal}.attachment-dropzone{display:grid;place-items:center;gap:.38rem;border:1.5px dashed #cbd5e1;border-radius:1rem;background:#f8fafc;padding:1.35rem;text-align:center;cursor:pointer;transition:.18s ease}.attachment-dropzone:hover{border-color:var(--dts-accent,var(--brand-primary));background:var(--dts-accent-soft,var(--brand-soft));transform:translateY(-1px)}.attachment-dropzone input{position:absolute;width:1px;height:1px;overflow:hidden;opacity:0}.upload-orb{display:grid;place-items:center;width:3.2rem;height:3.2rem;border-radius:1rem;background:#fff;color:var(--dts-accent,var(--brand-primary));font-size:1.25rem;box-shadow:0 8px 22px rgba(15,23,42,.08)}.attachment-dropzone strong{color:#111827;font-size:.88rem}.attachment-dropzone>span:not(.upload-orb){color:#64748b;font-size:.72rem}.attachment-dropzone small{color:#94a3b8;font-size:.65rem}.attachment-file-list{display:grid;gap:.5rem;max-height:13rem;overflow:auto}.attachment-file-list>div{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:.7rem;border:1px solid #e5e7eb;border-radius:.8rem;background:#fff;padding:.62rem}.file-kind{display:grid;place-items:center;width:2.2rem;height:2.2rem;border-radius:.65rem;background:var(--brand-soft);color:var(--brand-primary)}.attachment-file-list>div>span:nth-child(2){display:grid;min-width:0}.attachment-file-list strong{overflow:hidden;color:#111827;font-size:.72rem;text-overflow:ellipsis;white-space:nowrap}.attachment-file-list small{color:#94a3b8;font-size:.62rem}.attachment-file-list button{display:grid;place-items:center;width:2rem;height:2rem;border:0;border-radius:.6rem;background:#f1f5f9;color:#64748b;cursor:pointer}.attachment-file-list button:hover{background:var(--brand-soft-strong);color:var(--brand-primary)}

            @media (max-width: 640px) {
                .filter-shell {
                    padding: 0.95rem;
                }
                .legacy-document-filters { top: 5rem; left: .75rem; right: .75rem; max-height: 70vh; }
                .document-search-bar .advanced-filter-button span { display: none; }
                .document-search-bar .advanced-filter-button { padding: 0 .55rem; }

                .assistant-panel {
                    width: calc(100vw - 1rem);
                    max-height: calc(100vh - 5.5rem);
                }

                .assistant-head,
                .assistant-body {
                    padding: 1rem;
                }

                .assistant-head {
                    flex-direction: column;
                }

                .assistant-input-card {
                    grid-template-columns: 2.8rem minmax(0, 1fr);
                }

                .folder-header { align-items: stretch; flex-direction: column; }
                .view-toolbar, .view-toolbar-controls { align-items: stretch; flex-direction: column; }
                .document-primary-actions { justify-content: flex-start; }
                .folder-actions { justify-content: flex-start; padding: 0 0.8rem 0.8rem; }
                .folder-counts { justify-items: start; }
                .folder-document-row { align-items: stretch; flex-direction: column; padding: 0.35rem; }
                .folder-document-actions { justify-content: flex-start; padding: 0 0.35rem 0.35rem; }
            }

        `
    ]
})
export class DocumentsPage implements OnInit, OnDestroy {
    @ViewChild('assignmentDialog') assignmentDialog?: DocumentAssignmentDialogComponent;
    protected auth = inject(AuthService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private documentsService = inject(DocumentsService);
    private systemSettings = inject(SystemSettingsService);
    private alerts = inject(AlertDialogService);
    private assistantSearchTimer: ReturnType<typeof setTimeout> | null = null;
    private dataLoadRequest = 0;

    documents = signal<DocumentSummary[]>([]);
    users = signal<DocumentUserSummary[]>([]);
    areas = signal<AreaReference[]>([]);
    assets = signal<AssetReference[]>([]);
    specifics = signal<SpecificReference[]>([]);
    locations = signal<LocationReference[]>([]);
    sequences = signal<SequenceReference[]>([]);
    softcopyCategories = signal<SoftcopyCategoryReference[]>([]);

    isLoading = signal(true);
    isSaving = signal(false);
    errorMessage = signal('');
    referenceWarningMessage = signal('');
    notice = signal<NoticeState | null>(null);
    selectedDocumentDetail = signal<DocumentDetail | null>(null);
    selectedRevisions = signal<RevisionSummary[]>([]);
    detailLoading = signal(false);
    private detailRequest?: Subscription;

    documentDialogVisible = false;
    detailDialogVisible = false;
    revisionDialogVisible = false;
    directoryDialogVisible = false;
    statusDialogVisible = false;
    assignmentDialogVisible = false;
    attachmentDialogVisible = false;
    batchDialogVisible = false;
    softcopyFolderDialogVisible = false;
    folderDialogVisible = false;
    deleteConfirmVisible = false;
    noticeVisible = false;
    get assistantEnabled() {
        return false;
    }

    get assistantTitle() {
        return '';
    }

    moduleKicker() {
        return this.workspaceType === 'SOFTCOPY' ? 'Softcopy Document Module' : this.workspaceType === 'HARDCOPY' ? 'Hardcopy Document Module' : 'Document Module';
    }

    moduleTitle() {
        return this.workspaceType === 'SOFTCOPY' ? 'Softcopy workspace' : this.workspaceType === 'HARDCOPY' ? 'Hardcopy workspace' : 'Document workspace';
    }

    moduleDescription() {
        if (this.workspaceType === 'SOFTCOPY') return 'Manage uploaded digital files and revisions, organized by folder, table list, or card grid.';
        if (this.workspaceType === 'HARDCOPY') return 'Manage physical records using area, location, specific, asset number, and sequence filing details.';
        return 'Track hardcopy and softcopy documents, manage revisions, inspect mappings, and search the full document catalog.';
    }

    documentFormMode: 'create' | 'update' = 'create';
    editingDocumentId = '';
    revisionTargetDocumentId = '';
    deletingDocument: DocumentSummary | null = null;
    statusTargetDocument: DocumentSummary | null = null;
    assignmentDocument: DocumentSummary | null = null;
    assignmentSaving = signal(false);
    attachmentSaving = signal(false);
    attachmentTarget: DocumentSummary | null = null;
    attachmentFiles: File[] = [];
    statusDialogMode: 'dispose' | 'restore' = 'dispose';

    first = 0;
    rows = 10;
    viewMode: DocumentWorkspaceViewMode = 'list';
    workspaceType: WorkspaceDocumentType = '';
    rowsPerPageOptions = [10, 20, 50];

    searchTerm = '';
    advancedFiltersOpen = false;
    selectedType = '';
    selectedStatus = '';
    selectedAssignmentStatus: '' | 'assigned' | 'unassigned' = '';
    selectedAreaId = '';
    selectedLocationId = '';
    selectedSpecificId = '';
    selectedAssetId = '';
    selectedSequenceId = '';
    selectedCategoryId = '';
    private pendingDocumentId = '';
    private expandedFolders = new Set<string>();

    documentForm: DocumentFormValue = this.emptyDocumentForm();
    revisionForm: RevisionFormValue = this.emptyRevisionForm();
    revisionContextDocumentNumber = '';
    revisionCurrentRevision: RevisionSummary | null = null;
    revisionExistingRevisions: RevisionSummary[] = [];
    revisionTargetStatus = '';
    directoryTargetDocumentId = '';
    directoryContextDocumentNumber = '';
    directoryCurrentCategoryId = '';
    assistantOpen = signal(false);
    assistantLoading = signal(false);
    assistantAnswer = signal('');
    assistantMatches = signal<DocumentSummary[]>([]);
    assistantQuery = '';
    batchRows = signal<BatchHardcopyImportRow[]>([]);
    batchResult = signal<BatchHardcopyImportResponse | null>(null);
    batchSaving = signal(false);
    batchUploadProgress = signal(0);
    batchProgressLabel = signal('Uploading workbook...');
    batchValidationMessage = signal('');
    batchFile: File | null = null;
    batchFileName = '';
    softcopyFolderSaving = signal(false);
    softcopyFolderProgress = signal(0);
    softcopyFolderResult = signal<BatchSoftcopyFolderImportResponse | null>(null);
    folderSaving = signal(false);
    folderDialogMode: 'create' | 'edit' = 'create';
    folderName = '';
    folderDialogCategoryId = '';
    folderDialogParentPath = '';
    draggingDocumentId = '';
    draggingFolderId = '';
    dropTargetCategoryId = '';
    rootFolderDropActive = false;
    batchMaxFileSizeLabel = '10 MB';
    readonly searchableThreshold = SEARCHABLE_DROPDOWN_THRESHOLD;
    readonly documentStatuses: DocumentStatusValue[] = ['Draft', 'ForNotedBy', 'ForPlantManagerApproval', 'ForDocumentControllerAdmin', 'ForApproval', 'Approved', 'Completed', 'ForRevision', 'Rejected', 'Cancelled', 'ForTransfer', 'Transferred', 'PendingRecipientAcceptance', 'Disposed'];
    canCreateDocuments = computed(() => this.auth.hasAnyPermission('documents.create', 'document-requests.create'));
    canDirectCreateSoftcopy = computed(() => this.auth.hasPermission('documents.create-direct'));
    canEditDocuments = computed(() => this.auth.hasAnyPermission('documents.edit', 'documents.manage-own', 'document-requests.edit'));
    canAttachScans = computed(() => this.auth.hasAnyPermission('documents.attach-scans', 'documents.edit', 'documents.manage-own'));
    canDeleteDocuments = computed(() => this.auth.hasAnyPermission('documents.delete', 'document-requests.delete'));
    canDeleteDocument(document: DocumentSummary) {
        if (this.canDeleteDocuments()) return true;
        const userId = this.auth.user()?.user_id;
        return document.status === 'Draft'
            && !!userId
            && document.creator?.user_id === userId
            && this.auth.hasPermission('documents.manage-own');
    }
    canImportDocuments = computed(() => this.auth.hasAnyPermission('documents.import', 'batch-import.import'));
    canCreateFolders = computed(() => this.auth.hasAnyPermission('softcopy-folders.create', 'softcopy-folders.manage'));
    canEditFolders = computed(() => this.auth.hasAnyPermission('softcopy-folders.edit', 'softcopy-folders.manage'));
    canChangeDocumentStatus(document: DocumentSummary) {
        return document.status === 'Disposed'
            ? this.auth.hasAnyPermission('documents.restore', 'document-disposal.restore', 'document-disposal.manage')
            : this.auth.hasPermission('documents.dispose')
                ? this.auth.hasAnyPermission('documents.dispose', 'document-disposal.dispose', 'document-disposal.manage')
                : this.auth.hasPermission('document-disposal.request');
    }
    canDownloadDocuments = computed(() => this.auth.hasPermission('documents.download'));
    canConfigureWorkflow = computed(() => this.auth.hasPermission('document-workflow.configure'));
    canUseAssistant = computed(() => this.auth.hasAnyPermission('ai-document-assistant.search', 'documents.search'));
    canAssignDocuments = computed(() => {
        return this.auth.hasPermission('documents.manage');
    });
    canManageDocument(document: DocumentSummary) {
        if (this.auth.hasPermission('documents.edit')) return true;
        const userId = this.auth.user()?.user_id;
        return !!userId && this.auth.hasPermission('documents.manage-own') && (document.creator?.user_id === userId || document.assignments?.some((assignment) => assignment.user.user_id === userId));
    }
    canRequestHardcopyTransfer(document: DocumentSummary) {
        return document.document_type === 'HARDCOPY' && ['Approved', 'Completed'].includes(document.status || '') && this.auth.hasPermission('hardcopy-transfers.create');
    }
    openHardcopyTransfer(document: DocumentSummary) {
        if (!this.canRequestHardcopyTransfer(document)) return;
        this.router.navigate(['/panel/hardcopy-transfers'], { queryParams: { document: document.document_id } });
    }
    canAttachToDocument(document: DocumentSummary) { return document.document_type === 'SOFTCOPY' && this.canAttachScans() && this.canManageDocument(document); }
    canUploadRevision(document: DocumentSummary) {
        const hasRevisionFile = !!document.softcopy?.current_revision || !!document.softcopy?.revisions?.length;
        return document.document_type === 'SOFTCOPY' && document.status === 'Approved' && !hasRevisionFile && this.canManageDocument(document) && this.auth.hasAnyPermission('documents.edit', 'documents.manage-own', 'document-requests.edit');
    }
    canChangeDirectory(document: DocumentSummary) {
        return document.document_type === 'SOFTCOPY' && document.status === 'Completed' && this.canManageDocument(document);
    }

    filteredDocuments() {
        const search = this.searchTerm.trim().toLowerCase();
        return this.documents().filter((document) => {
            const matchesSearch =
                !search ||
                [
                    document.document_number,
                    document.document_title,
                    document.creator ? this.fullName(document.creator) : '',
                    document.disposal_remarks || '',
                    document.disposed_by_name || '',
                    document.disposer ? this.fullName(document.disposer) : '',
                    document.requested_by_name || '',
                    document.requester ? this.fullName(document.requester) : '',
                    document.hardcopy?.asset?.asset_number || '',
                    document.hardcopy?.area?.area_name || '',
                    document.hardcopy?.location?.location_name || '',
                    document.hardcopy?.specific?.specific_name || '',
                    document.hardcopy?.sequence?.sequence_code || '',
                    document.softcopy?.category?.category_name || '',
                    document.softcopy?.category?.folder_name || '',
                    document.softcopy?.current_revision?.file_name || ''
                ]
                    .join(' ')
                    .toLowerCase()
                    .includes(search);

            const matchesType = !this.selectedType || document.document_type === this.selectedType;
            const matchesStatus = !this.selectedStatus || (document.status || '') === this.selectedStatus;
            const matchesArea = !this.selectedAreaId || (document.hardcopy?.area?.area_id || '') === this.selectedAreaId;
            const matchesLocation = !this.selectedLocationId || (document.hardcopy?.location?.location_id || '') === this.selectedLocationId;
            const matchesSpecific = !this.selectedSpecificId || (document.hardcopy?.specific?.specific_id || '') === this.selectedSpecificId;
            const matchesAsset = !this.selectedAssetId || (document.hardcopy?.asset?.asset_id || '') === this.selectedAssetId;
            const matchesSequence = !this.selectedSequenceId || (document.hardcopy?.sequence?.sequence_id || '') === this.selectedSequenceId;
            const selectedCategory = this.softcopyCategories().find((category) => category.softcopy_category_id === this.selectedCategoryId);
            const selectedFolder = selectedCategory?.folder_name || '';
            const documentFolder = document.softcopy?.category?.folder_name || '';
            const matchesCategory = !this.selectedCategoryId || (selectedFolder ? documentFolder === selectedFolder || documentFolder.startsWith(`${selectedFolder}/`) : (document.softcopy?.category?.softcopy_category_id || '') === this.selectedCategoryId);
            const isAssigned = !!document.assignments?.length;
            const matchesAssignment = !this.selectedAssignmentStatus || (this.selectedAssignmentStatus === 'assigned' ? isAssigned : !isAssigned);

            return matchesSearch && matchesType && matchesStatus && matchesArea && matchesLocation && matchesSpecific && matchesAsset && matchesSequence && matchesCategory && matchesAssignment;
        });
    }

    documentFolders(): DocumentFolderNode[] {
        const filtered = this.filteredDocuments();
        const roots: DocumentFolderNode[] = [];
        const categoryNodes = new Map<string, DocumentFolderNode>();
        const categoryNodesByPath = new Map<string, DocumentFolderNode>();

        for (const category of this.softcopyCategories()) {
            const node: DocumentFolderNode = {
                id: `softcopy:${category.softcopy_category_id}`,
                name: category.category_name,
                path: category.folder_name || category.category_name,
                eyebrow: category.parent_category_id ? 'Softcopy subfolder' : 'Softcopy main folder',
                documents: [],
                children: [],
                categoryId: category.softcopy_category_id
            };
            categoryNodes.set(String(category.softcopy_category_id), node);
            categoryNodesByPath.set(this.normalizeFolderPath(node.path), node);
        }

        for (const category of this.softcopyCategories()) {
            const node = categoryNodes.get(String(category.softcopy_category_id))!;
            const parent = category.parent_category_id ? categoryNodes.get(String(category.parent_category_id)) : undefined;
            (parent?.children ?? roots).push(node);
        }

        let uncategorized: DocumentFolderNode | null = null;
        const hardcopyAreas = new Map<string, DocumentFolderNode>();
        for (const document of filtered) {
            if (document.document_type === 'SOFTCOPY') {
                const categoryId = document.softcopy?.category?.softcopy_category_id;
                const categoryPath = document.softcopy?.category?.folder_name;
                const categoryNode = categoryId
                    ? categoryNodes.get(String(categoryId)) ?? (categoryPath ? categoryNodesByPath.get(this.normalizeFolderPath(categoryPath)) : undefined)
                    : categoryPath
                      ? categoryNodesByPath.get(this.normalizeFolderPath(categoryPath))
                      : undefined;
                if (categoryNode) {
                    categoryNode.documents.push(document);
                } else {
                    uncategorized ??= {
                        id: 'softcopy:uncategorized',
                        name: 'Uncategorized',
                        path: 'uncategorized',
                        eyebrow: 'Softcopy folder',
                        documents: [],
                        children: []
                    };
                    uncategorized.documents.push(document);
                }
                continue;
            }

            const area = document.hardcopy?.area?.area_name || 'Unassigned area';
            const location = document.hardcopy?.location?.location_name || 'Unassigned location';
            const areaId = document.hardcopy?.area?.area_id || area;
            const locationId = document.hardcopy?.location?.location_id || location;
            let areaNode = hardcopyAreas.get(areaId);
            if (!areaNode) {
                areaNode = { id: `hardcopy-area:${areaId}`, name: area, path: area, eyebrow: 'Physical area', documents: [], children: [] };
                hardcopyAreas.set(areaId, areaNode);
                roots.push(areaNode);
            }
            let locationNode = areaNode.children.find((child) => child.id === `hardcopy-location:${areaId}:${locationId}`);
            if (!locationNode) {
                locationNode = { id: `hardcopy-location:${areaId}:${locationId}`, name: location, path: `${area} / ${location}`, eyebrow: 'Storage location', documents: [], children: [] };
                areaNode.children.push(locationNode);
            }
            locationNode.documents.push(document);
        }

        if (uncategorized) roots.push(uncategorized);
        this.sortFolderTree(roots);
        return roots.filter((folder) => this.folderDocumentCount(folder) > 0 || (this.workspaceType === 'SOFTCOPY' && !this.searchTerm.trim() && !this.selectedStatus));
    }

    activeFilterCount() {
        return [
            !this.workspaceType && this.selectedType,
            this.selectedStatus,
            this.selectedAssignmentStatus,
            this.selectedAreaId,
            this.selectedLocationId,
            this.selectedSpecificId,
            this.selectedAssetId,
            this.selectedSequenceId,
            this.selectedCategoryId
        ].filter(Boolean).length;
    }

    private normalizeFolderPath(path: string) {
        return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim().toLowerCase();
    }

    documentFolderCount() {
        return this.countFolderNodes(this.documentFolders());
    }

    folderDocumentCount(folder: DocumentFolderNode): number {
        return folder.documents.length + folder.children.reduce((total, child) => total + this.folderDocumentCount(child), 0);
    }

    private syncFolderExpansionForSearch() {
        if (this.viewMode !== 'folder') return;

        if (!this.searchTerm.trim()) {
            this.expandedFolders.clear();
            return;
        }

        const matchingDocumentIds = new Set(this.filteredDocuments().map((document) => document.document_id));
        const folderIds = folderIdsToExpandForDocuments(this.documentFolders(), matchingDocumentIds);
        this.expandedFolders.clear();
        folderIds.forEach((folderId) => this.expandedFolders.add(folderId));
    }

    toggleFolder(folderId: string) {
        if (this.expandedFolders.has(folderId)) this.expandedFolders.delete(folderId);
        else this.expandedFolders.add(folderId);
    }

    isFolderExpanded(folderId: string) {
        return this.expandedFolders.has(folderId);
    }

    startDocumentDrag(event: DragEvent, document: DocumentSummary) {
        if (!this.canManageDocument(document) || document.document_type !== 'SOFTCOPY' || !event.dataTransfer) return;
        this.draggingDocumentId = document.document_id;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', document.document_id);
    }

    endDocumentDrag() {
        this.draggingDocumentId = '';
        this.dropTargetCategoryId = '';
    }

    allowFolderDrop(event: DragEvent, folder: DocumentFolderNode) {
        if (!folder.categoryId || (!this.draggingDocumentId && !this.draggingFolderId)) return;
        if (this.draggingFolderId && !this.canMoveFolderTo(this.draggingFolderId, folder.categoryId)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        this.dropTargetCategoryId = folder.categoryId;
    }

    leaveFolderDrop(event: DragEvent, folder: DocumentFolderNode) {
        const related = event.relatedTarget as Node | null;
        if (related && (event.currentTarget as HTMLElement | null)?.contains(related)) return;
        if (this.dropTargetCategoryId === folder.categoryId) this.dropTargetCategoryId = '';
    }

    dropDocumentInFolder(event: DragEvent, folder: DocumentFolderNode) {
        event.preventDefault();
        event.stopPropagation();
        if (this.draggingFolderId) {
            const folderId = this.draggingFolderId;
            this.endFolderDrag();
            if (folder.categoryId && this.canMoveFolderTo(folderId, folder.categoryId)) this.moveFolder(folderId, folder.categoryId, folder.path);
            return;
        }
        const documentId = this.draggingDocumentId || event.dataTransfer?.getData('text/plain') || '';
        this.endDocumentDrag();
        if (!documentId || !folder.categoryId) return;
        const document = this.documents().find((item) => item.document_id === documentId);
        if (!document || document.document_type !== 'SOFTCOPY') return;
        if (document.softcopy?.category?.softcopy_category_id === folder.categoryId) {
            this.showNotice('info', 'Document already in folder', `${document.document_title} is already inside ${folder.path}.`);
            return;
        }
        this.documentsService.moveDocumentToFolder(documentId, folder.categoryId).subscribe({
            next: (updatedDocument) => {
                this.documents.update((items) => items.map((item) => (item.document_id === documentId ? { ...item, ...updatedDocument } : item)));
                this.expandedFolders.add(folder.id);
                this.showNotice('success', 'Document moved', `${document.document_title} was moved to ${folder.path}.`);
                this.loadData();
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to move document')
        });
    }

    startFolderDrag(event: DragEvent, folder: DocumentFolderNode) {
        if (!this.canEditFolders() || !folder.categoryId || !event.dataTransfer) return;
        this.draggingFolderId = folder.categoryId;
        this.draggingDocumentId = '';
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-dts-softcopy-folder', folder.categoryId);
        event.dataTransfer.setData('text/plain', folder.categoryId);
    }

    endFolderDrag() {
        this.draggingFolderId = '';
        this.dropTargetCategoryId = '';
        this.rootFolderDropActive = false;
    }

    allowRootFolderDrop(event: DragEvent) {
        if (!this.draggingFolderId) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        this.rootFolderDropActive = true;
    }

    dropFolderAtRoot(event: DragEvent) {
        event.preventDefault();
        const folderId = this.draggingFolderId;
        this.endFolderDrag();
        if (!folderId) return;
        const category = this.softcopyCategories().find((item) => item.softcopy_category_id === folderId);
        if (!category?.parent_category_id) {
            this.showNotice('info', 'Already a main folder', `${category?.category_name || 'This folder'} is already a root folder.`);
            return;
        }
        this.moveFolder(folderId, '', 'Main folders');
    }

    private canMoveFolderTo(folderId: string, targetId: string) {
        if (folderId === targetId) return false;
        const categoryMap = new Map(this.softcopyCategories().map((category) => [category.softcopy_category_id, category]));
        let currentId: string | null | undefined = targetId;
        while (currentId) {
            if (currentId === folderId) return false;
            currentId = categoryMap.get(currentId)?.parent_category_id;
        }
        return true;
    }

    private moveFolder(folderId: string, parentId: string, destination: string) {
        const category = this.softcopyCategories().find((item) => item.softcopy_category_id === folderId);
        if (!category) return;
        this.documentsService.updateSoftcopyCategory(folderId, { parent_category_id: parentId }).subscribe({
            next: () => {
                if (parentId) this.expandedFolders.add(`softcopy:${parentId}`);
                this.showNotice('success', 'Softcopy folder moved', `${category.category_name} and everything inside it moved to ${destination}.`);
                this.loadData();
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to move softcopy folder')
        });
    }

    openDocumentInFolder(folder: DocumentFolderNode) {
        if (!folder.categoryId) return;
        this.openDocumentDialog();
        this.documentForm = { ...this.documentForm, document_type: 'SOFTCOPY', softcopy_category_id: folder.categoryId };
    }

    openFolderDialog(mode: 'create' | 'edit', folder: DocumentFolderNode) {
        if (!folder.categoryId) return;
        this.folderDialogMode = mode;
        this.folderDialogCategoryId = folder.categoryId;
        this.folderDialogParentPath = folder.path;
        this.folderName = mode === 'edit' ? folder.name : '';
        this.folderDialogVisible = true;
    }

    saveFolder() {
        const categoryName = this.folderName.trim();
        if (!categoryName || this.folderSaving()) return;
        this.folderSaving.set(true);
        const request = this.folderDialogMode === 'edit'
            ? this.documentsService.updateSoftcopyCategory(this.folderDialogCategoryId, { category_name: categoryName })
            : this.documentsService.createSoftcopyCategory({ category_name: categoryName, parent_category_id: this.folderDialogCategoryId });
        request.subscribe({
            next: () => {
                this.folderSaving.set(false);
                this.folderDialogVisible = false;
                this.expandedFolders.add(`softcopy:${this.folderDialogCategoryId}`);
                this.showNotice('success', this.folderDialogMode === 'edit' ? 'Folder updated' : 'Subfolder created', this.folderDialogMode === 'edit' ? 'The folder name was updated successfully.' : `${categoryName} was created inside ${this.folderDialogParentPath}.`);
                this.loadData();
            },
            error: (error: unknown) => {
                this.folderSaving.set(false);
                this.handleActionError(error, this.folderDialogMode === 'edit' ? 'Unable to update folder' : 'Unable to create subfolder');
            }
        });
    }

    private countFolderNodes(folders: DocumentFolderNode[]): number {
        return folders.reduce((total, folder) => total + 1 + this.countFolderNodes(folder.children), 0);
    }

    private sortFolderTree(folders: DocumentFolderNode[]) {
        folders.sort((left, right) => left.path.localeCompare(right.path));
        for (const folder of folders) {
            folder.documents.sort((left, right) => left.document_title.localeCompare(right.document_title));
            this.sortFolderTree(folder.children);
        }
    }

    pagedDocuments() {
        return this.filteredDocuments().slice(this.first, this.first + this.rows);
    }

    pageStart() {
        return this.filteredDocuments().length === 0 ? 0 : this.first + 1;
    }

    pageEnd() {
        return Math.min(this.first + this.rows, this.filteredDocuments().length);
    }

    hardcopyCount() {
        return this.filteredDocuments().filter((document) => document.document_type === 'HARDCOPY').length;
    }

    softcopyCount() {
        return this.filteredDocuments().filter((document) => document.document_type === 'SOFTCOPY').length;
    }

    numberedDocumentCount() {
        return this.filteredDocuments().filter((document) => !!document.document_number).length;
    }

    assetMappedCount() {
        return this.filteredDocuments().filter((document) => !!document.hardcopy?.asset?.asset_number).length;
    }

    ngOnInit() {
        this.workspaceType = (this.route.snapshot.data['documentType'] as WorkspaceDocumentType | undefined) ?? '';
        this.selectedType = this.workspaceType;
        const settings = this.systemSettings.settings();
        this.viewMode = settings.defaultDocumentView;
        this.rows = settings.documentRowsPerPage;
        this.route.queryParamMap.subscribe((params) => {
            const query = params.get('q') ?? '';
            if (query !== this.searchTerm) {
                this.searchTerm = query;
                this.resetPagination();
                this.syncFolderExpansionForSearch();
            }

            const documentId = params.get('document') ?? '';
            if (documentId && documentId !== this.pendingDocumentId) {
                this.pendingDocumentId = documentId;
                this.openDetailDialogById(documentId);
            }
            const transferDocumentId = params.get('transferDocument') ?? '';
            if (transferDocumentId) this.router.navigate(['/panel/hardcopy-transfers'], { queryParams: { document: transferDocumentId } });
        });
        this.loadData();
    }

    setViewMode(mode: DocumentWorkspaceViewMode) {
        this.viewMode = mode;
        this.first = 0;
        if (mode === 'folder') {
            this.expandedFolders.clear();
            this.syncFolderExpansionForSearch();
        }
    }

    ngOnDestroy() {
        this.detailRequest?.unsubscribe();
        if (this.assistantSearchTimer) {
            clearTimeout(this.assistantSearchTimer);
            this.assistantSearchTimer = null;
        }
    }

    loadData() {
        const requestId = ++this.dataLoadRequest;
        this.isLoading.set(true);
        this.errorMessage.set('');
        this.referenceWarningMessage.set('');
        const referenceIssues: string[] = [];

        this.documentsService.listDocuments().subscribe({
            next: (documents) => {
                if (requestId !== this.dataLoadRequest) return;
                this.documents.set(documents ?? []);
                this.isLoading.set(false);
                this.clampPagination();
                this.syncFolderExpansionForSearch();
            },
            error: (error: unknown) => {
                if (requestId !== this.dataLoadRequest) return;
                this.errorMessage.set(this.extractErrorMessage(error));
                this.isLoading.set(false);
            }
        });

        forkJoin({
            users: this.auth.hasPermission('user-accounts.view')
                ? this.withReferenceFallback('users', this.documentsService.listUsers(), referenceIssues)
                : of([] as DocumentUserSummary[]),
            areas: this.withReferenceFallback('areas', this.documentsService.listAreas(), referenceIssues),
            assets: this.withReferenceFallback('asset numbers', this.documentsService.listAssetNumbers(), referenceIssues),
            specifics: this.withReferenceFallback('specifics', this.documentsService.listSpecifics(), referenceIssues),
            locations: this.withReferenceFallback('locations', this.documentsService.listLocations(), referenceIssues),
            sequences: this.withReferenceFallback('sequences', this.documentsService.listSequences(), referenceIssues),
            softcopyCategories: this.withReferenceFallback('softcopy folders', this.documentsService.listSoftcopyCategories(), referenceIssues)
        }).subscribe({
            next: ({ users, areas, assets, specifics, locations, sequences, softcopyCategories }) => {
                if (requestId !== this.dataLoadRequest) return;
                this.users.set(users ?? []);
                this.areas.set(areas ?? []);
                this.assets.set(assets ?? []);
                this.specifics.set(specifics ?? []);
                this.locations.set(locations ?? []);
                this.sequences.set(sequences ?? []);
                this.softcopyCategories.set((softcopyCategories ?? []).filter((category) => category.is_active !== false));
                this.syncFolderExpansionForSearch();
                if (referenceIssues.length) {
                    this.referenceWarningMessage.set(
                        `The document list loaded, but ${referenceIssues.join('; ')} could not be loaded. Filters and dialogs may be limited until those endpoints recover.`
                    );
                }
            }
        });
    }

    onPageChange(event: { first?: number; rows?: number }) {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
    }

    resetPagination() {
        this.first = 0;
    }

    areaFilterOptions(): SearchableDropdownOption[] {
        return this.areas().map((area) => ({
            label: area.area_name,
            value: area.area_id
        }));
    }

    locationFilterOptions(): SearchableDropdownOption[] {
        return this.locations().map((location) => ({
            label: location.location_name,
            value: location.location_id
        }));
    }

    specificFilterOptions(): SearchableDropdownOption[] {
        return this.specifics().map((specific) => ({
            label: specific.specific_name,
            value: specific.specific_id
        }));
    }

    assetFilterOptions(): SearchableDropdownOption[] {
        return this.assets().map((asset) => ({
            label: asset.asset_number,
            value: asset.asset_id
        }));
    }

    sequenceFilterOptions(): SearchableDropdownOption[] {
        return this.sequences().map((sequence) => ({
            label: sequence.sequence_code,
            value: sequence.sequence_id
        }));
    }

    onTableSearchChange() {
        this.resetPagination();
        this.syncFolderExpansionForSearch();
    }

    onTypeFilterChange() {
        if (this.selectedType === 'SOFTCOPY') {
            this.selectedAreaId = '';
            this.selectedLocationId = '';
            this.selectedSpecificId = '';
            this.selectedAssetId = '';
            this.selectedSequenceId = '';
        }
        if (this.selectedType === 'HARDCOPY') this.selectedCategoryId = '';

        this.resetPagination();
    }

    onAreaFilterChange(value: SearchableDropdownValue) {
        this.selectedAreaId = this.normalizeSelectValue(value);
        this.resetPagination();
    }

    onLocationFilterChange(value: SearchableDropdownValue) {
        this.selectedLocationId = this.normalizeSelectValue(value);
        this.resetPagination();
    }

    onSpecificFilterChange(value: SearchableDropdownValue) {
        this.selectedSpecificId = this.normalizeSelectValue(value);
        this.resetPagination();
    }

    onAssetFilterChange(value: SearchableDropdownValue) {
        this.selectedAssetId = this.normalizeSelectValue(value);
        this.resetPagination();
    }

    onSequenceFilterChange(value: SearchableDropdownValue) {
        this.selectedSequenceId = this.normalizeSelectValue(value);
        this.resetPagination();
    }

    resetFilters() {
        this.searchTerm = '';
        this.selectedType = this.workspaceType;
        this.selectedStatus = '';
        this.selectedAssignmentStatus = '';
        this.selectedAreaId = '';
        this.selectedLocationId = '';
        this.selectedSpecificId = '';
        this.selectedAssetId = '';
        this.selectedSequenceId = '';
        this.selectedCategoryId = '';
        this.resetPagination();
    }

    toggleAssistant() {
        this.assistantOpen.update((value) => !value);
    }

    onAssistantQueryChange() {
        if (this.assistantSearchTimer) {
            clearTimeout(this.assistantSearchTimer);
        }

        const query = this.assistantQuery.trim();
        if (!query) {
            this.assistantAnswer.set('');
            this.assistantMatches.set([]);
            return;
        }

        this.assistantSearchTimer = setTimeout(() => this.runAssistantSearch(), 350);
    }

    applyAssistantQueryToSearch() {
        this.searchTerm = this.assistantQuery.trim();
        this.resetPagination();
    }

    runAssistantSearch() {
        const query = this.assistantQuery.trim();
        if (!query) {
            this.assistantAnswer.set('Enter a question or search phrase first.');
            this.assistantMatches.set([]);
            return;
        }

        this.assistantLoading.set(true);
        this.documentsService.assistantSearch(query).subscribe({
            next: (response) => {
                this.assistantLoading.set(false);
                this.assistantAnswer.set(response.answer);
                this.assistantMatches.set(response.matches ?? []);
            },
            error: (error: unknown) => {
                this.assistantLoading.set(false);
                this.assistantAnswer.set(this.extractErrorMessage(error));
                this.assistantMatches.set([]);
            }
        });
    }

    openDocumentDialog(document?: DocumentSummary) {
        const isDraft = !!document && this.isDraftDocument(document);
        this.documentFormMode = document && !isDraft ? 'update' : 'create';
        this.editingDocumentId = document?.document_id ?? '';
        this.documentForm = document
            ? {
                  document_number: document.document_number || '',
                  document_title: document.document_title,
                  document_type: document.document_type,
                  action: 'DRAFT',
                  requester_type: document.requested_by_name ? 'MANUAL_NAME' : 'CURRENT_USER',
                  requested_by_name: document.requested_by_name || '',
                  request_date: document.request_date || '',
                  department: document.department || '',
                  business_document_type: document.business_document_type || 'Forms',
                  action_requested: isDraft
                      ? 'CREATE'
                      : (document.document_type === 'SOFTCOPY' ? 'REVISE' : undefined),
                  from_party: document.from_party || '',
                  to_party: document.to_party || '',
                  reason_for_change: document.reason_for_change || 'Improvement',
                  brief_description: document.brief_description || '',
                  proposed_change: document.proposed_change || '',
                  revision_level_from: document.revision_level_from || '',
                  revision_level_to: document.revision_level_to || '',
                  previous_effective_date: document.previous_effective_date?.slice(0, 10) || '',
                  new_effective_date: document.new_effective_date?.slice(0, 10) || '',
                  asset_id: document.hardcopy?.asset?.asset_id || '',
                  area_id: document.hardcopy?.area?.area_id || '',
                  specific_id: document.hardcopy?.specific?.specific_id || '',
                  location_id: document.hardcopy?.location?.location_id || '',
                  sequence_id: document.hardcopy?.sequence?.sequence_id || '',
                  softcopy_category_id: document.softcopy?.category?.softcopy_category_id || '',
                  series_number: document.softcopy?.series_number || document.softcopy?.current_revision?.series_number || '',
                  initial_revision_number: document.softcopy?.current_revision?.revision_number || '',
                  initial_file: null,
                  attached_scan_files: [], assigned_user_ids: [],
                  workflow_editable: document.status === 'Draft',
                  workflow_version_id: document.workflow_version_id || '',
                  workflow_name: document.approver_configuration?.workflow_name || '',
                  workflow_version: document.approver_configuration?.workflow_version || 1,
                  workflow_steps: document.approver_configuration?.workflow_plan || (document.workflow_steps || []).map((step) => ({
                      stage: step.stage,
                      assigned_user_id: step.assignee?.user_id || ''
                  })),
                  retention_enabled: document.hardcopy?.retention_enabled ?? false,
                  retention_start_date: document.hardcopy?.retention_start_date?.slice(0, 10) || '',
                  retention_end_date: document.hardcopy?.retention_end_date?.slice(0, 10) || ''
              }
            : {
                  ...this.emptyDocumentForm()
              };
        this.documentDialogVisible = true;
    }

    private isDraftDocument(document: DocumentSummary) {
        return document.status?.trim().toLowerCase() === 'draft';
    }

    openAssignmentDialog(document: DocumentSummary) {
        this.assignmentDocument = document;
        this.assignmentDialog?.open(document);
        this.assignmentDialogVisible = true;
    }

    openAttachmentDialog(document: DocumentSummary) {
        this.attachmentTarget = document;
        this.attachmentFiles = [];
        this.attachmentDialogVisible = true;
    }

    selectAttachmentFiles(event: Event) {
        const input = event.target as HTMLInputElement;
        this.attachmentFiles = Array.from(input.files ?? []).slice(0, 10);
    }

    removeAttachmentFile(index: number) { this.attachmentFiles = this.attachmentFiles.filter((_file, fileIndex) => fileIndex !== index); }
    formatBytes(bytes: number) { if (!bytes) return '0 B'; const units = ['B', 'KB', 'MB', 'GB']; const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`; }

    closeAttachmentDialog() {
        if (this.attachmentSaving()) return;
        this.attachmentDialogVisible = false;
        this.attachmentTarget = null;
        this.attachmentFiles = [];
    }

    uploadAttachmentFiles() {
        if (!this.attachmentTarget || !this.attachmentFiles.length || this.attachmentSaving()) return;
        const target = this.attachmentTarget;
        this.attachmentSaving.set(true);
        this.documentsService.uploadAttachments(target.document_id, this.attachmentFiles).subscribe({
            next: () => {
                this.attachmentSaving.set(false);
                this.attachmentDialogVisible = false;
                this.attachmentTarget = null;
                this.attachmentFiles = [];
                this.showNotice('success', 'Scans attached', `Supporting evidence was added to ${target.document_title}.`);
                this.loadData();
            },
            error: (error: unknown) => {
                this.attachmentSaving.set(false);
                this.handleActionError(error, 'Unable to attach scanned documents');
            }
        });
    }

    saveAssignments(userIds: string[]) {
        if (!this.assignmentDocument) return;
        this.assignmentSaving.set(true);
        this.documentsService.assignDocumentUsers(this.assignmentDocument.document_id, userIds).subscribe({
            next: () => {
                this.assignmentSaving.set(false);
                this.assignmentDialogVisible = false;
                this.showNotice('success', 'Access updated', 'The assigned users were updated successfully.');
                this.loadData();
            },
            error: (error: unknown) => {
                this.assignmentSaving.set(false);
                this.handleActionError(error, 'Unable to update document access');
            }
        });
    }

    private normalizeSelectValue(value: SearchableDropdownValue) {
        return value === null || value === undefined ? '' : String(value);
    }

    openStatusDialog(document: DocumentSummary) {
        this.statusTargetDocument = document;
        this.statusDialogMode = document.status === 'Disposed' ? 'restore' : 'dispose';
        this.statusDialogVisible = true;
    }

    saveDocumentStatus(event: { action: 'dispose' | 'restore'; disposal_action: string; disposal_action_other: string; disposal_remarks: string; disposed_by_user_id: string }) {
        if (!this.statusTargetDocument) {
            return;
        }

        this.isSaving.set(true);
        const request: Observable<unknown> =
            event.action === 'dispose'
                  ? (this.auth.hasPermission('documents.dispose') ? this.documentsService.disposeDocument(this.statusTargetDocument.document_id, {
                      disposal_action: event.disposal_action,
                      disposal_action_other: event.disposal_action_other,
                      disposal_remarks: event.disposal_remarks,
                      disposed_by_user_id: event.disposed_by_user_id
                  }) : this.documentsService.requestDocumentDisposal(this.statusTargetDocument.document_id, {
                      disposal_action: event.disposal_action,
                      disposal_action_other: event.disposal_action_other,
                      disposal_remarks: event.disposal_remarks,
                      disposed_by_user_id: event.disposed_by_user_id
                  }))
                : this.documentsService.restoreDocument(this.statusTargetDocument.document_id);

        request.subscribe({
            next: () => {
                const requested = event.action === 'dispose' && !this.auth.hasPermission('documents.dispose');
                const nextStatusLabel = event.action === 'dispose' ? (requested ? 'submitted for disposal approval' : 'disposed') : 'restored';
                this.isSaving.set(false);
                this.statusDialogVisible = false;
                this.statusTargetDocument = null;
                this.showNotice('success', requested ? 'Disposal request submitted' : 'Document state updated', `The document was ${nextStatusLabel} successfully.`);
                this.loadData();
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to change document state')
        });
    }

    openBatchDialog() {
        this.batchDialogVisible = true;
    }

    openSoftcopyFolderDialog() {
        this.softcopyFolderResult.set(null);
        this.softcopyFolderProgress.set(0);
        this.softcopyFolderDialogVisible = true;
    }

    uploadSoftcopyFolder(event: { files: File[]; relativePaths: string[] }) {
        const currentUserId = this.auth.user()?.user_id || '';
        if (!currentUserId) {
            this.showNotice('error', 'Missing session', 'No current user session was found for folder import ownership.');
            return;
        }
        this.softcopyFolderSaving.set(true);
        this.softcopyFolderProgress.set(0);
        this.documentsService.batchUploadSoftcopyFolder(event.files, event.relativePaths, currentUserId).subscribe({
            next: (progress) => {
                this.softcopyFolderProgress.set(progress.progress);
                if (progress.phase !== 'complete' || !progress.result) return;
                this.softcopyFolderSaving.set(false);
                this.softcopyFolderResult.set(progress.result);
                this.showNotice(
                    progress.result.summary.errors ? 'warning' : 'success',
                    'Softcopy folder import finished',
                    `Created ${progress.result.summary.created} document${progress.result.summary.created === 1 ? '' : 's'} with ${progress.result.summary.errors} error${progress.result.summary.errors === 1 ? '' : 's'}.`
                );
                this.loadData();
            },
            error: (error: unknown) => {
                this.softcopyFolderSaving.set(false);
                this.softcopyFolderProgress.set(0);
                this.showNotice('error', 'Folder import failed', this.extractErrorMessage(error));
            }
        });
    }

    onBatchFileSelected(event: Event) {
        const input = event.target as HTMLInputElement | null;
        const file = input?.files?.[0] ?? null;

        this.batchResult.set(null);
        this.batchValidationMessage.set('');
        this.batchUploadProgress.set(0);
        this.batchProgressLabel.set('Uploading workbook...');

        if (!file) {
            this.batchFile = null;
            this.batchFileName = '';
            this.batchRows.set([]);
            return;
        }

        const fileExtension = this.fileExtension(file.name);
        if (!BATCH_HARDCOPY_ALLOWED_EXTENSIONS.includes(fileExtension)) {
            this.batchFile = null;
            this.batchFileName = '';
            this.batchRows.set([]);
            this.batchValidationMessage.set('Invalid File Format: choose an .xlsx or .xls workbook.');
            return;
        }

        if (file.size > BATCH_HARDCOPY_MAX_FILE_SIZE_BYTES) {
            this.batchFile = null;
            this.batchFileName = '';
            this.batchRows.set([]);
            this.batchValidationMessage.set(`File Too Large: choose a workbook smaller than ${this.batchMaxFileSizeLabel}.`);
            return;
        }

        this.batchFile = file;
        this.batchFileName = file.name;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const workbook = XLSX.read(reader.result, { type: 'array' });
                const rows = this.parseBatchWorkbook(workbook);
                this.batchRows.set(rows);

                if (!rows.length) {
                    this.batchValidationMessage.set('Invalid Column Structure: the workbook must include SEQUENCE, DOCUMENT NAME, LOCATION, ASSET NUMBER, AREA, and SPECIFIC.');
                    this.showNotice('warning', 'No importable rows found', 'The workbook did not contain any sheet with the expected hardcopy headers and data rows.');
                }
            } catch (error) {
                this.batchFile = null;
                this.batchRows.set([]);
                this.batchFileName = '';
                this.batchValidationMessage.set('Invalid File Format: the selected workbook could not be parsed.');
                this.showNotice('error', 'Invalid workbook', this.extractErrorMessage(error));
            }
        };
        reader.onerror = () => {
            this.batchFile = null;
            this.batchRows.set([]);
            this.batchFileName = '';
            this.batchValidationMessage.set('Storage Failure: the selected workbook could not be read from the browser.');
            this.showNotice('error', 'File read failed', 'The selected Excel file could not be read.');
        };
        reader.readAsArrayBuffer(file);
    }

    uploadBatchHardcopy() {
        const currentUserId = this.auth.user()?.user_id || '';
        if (!currentUserId) {
            this.showNotice('error', 'Missing session', 'No current user session was found for batch import ownership.');
            return;
        }

        if (!this.batchFile || !this.batchRows().length) {
            this.showNotice('warning', 'No rows to upload', 'Choose an Excel file first so the hardcopy rows can be parsed and previewed.');
            return;
        }

        this.batchSaving.set(true);
        this.batchUploadProgress.set(0);
        this.batchProgressLabel.set('Uploading workbook...');
        this.documentsService.batchUploadHardcopy(this.batchFile, currentUserId).subscribe({
            next: (event) => {
                if (event.phase === 'uploading') {
                    this.batchUploadProgress.set(event.progress);
                    this.batchProgressLabel.set(event.progress >= 95 ? 'Processing workbook on the server...' : 'Uploading workbook...');
                    return;
                }

                const response = event.result;
                if (!response) {
                    return;
                }

                this.batchSaving.set(false);
                this.batchUploadProgress.set(100);
                this.batchProgressLabel.set('Import completed.');
                this.batchResult.set(response);
                this.showNotice(
                    response.summary.errors ? 'warning' : 'success',
                    'Batch import finished',
                    `Created ${response.summary.created}, skipped ${response.summary.skipped}, and flagged ${response.summary.errors} row${response.summary.errors === 1 ? '' : 's'}.`
                );
                this.loadData();
            },
            error: (error: unknown) => {
                this.batchSaving.set(false);
                this.batchUploadProgress.set(0);
                this.batchProgressLabel.set('Uploading workbook...');
                this.showNotice('error', 'Batch import failed', this.extractErrorMessage(error));
            }
        });
    }

    saveDocument(form: DocumentFormValue) {
        const currentUserId = this.auth.user()?.user_id || '';
        if (!currentUserId) {
            this.showNotice('error', 'Missing session', 'No current user session was found for document ownership.');
            return;
        }

        this.isSaving.set(true);
        const request = this.editingDocumentId ? this.documentsService.updateDocument(this.editingDocumentId, form) : this.documentsService.createDocument(form, currentUserId);

        request.subscribe({
            next: () => {
                this.isSaving.set(false);
                this.documentDialogVisible = false;
                this.documentForm = this.emptyDocumentForm();
                const documentLabel = form.document_number.trim() || form.document_title.trim();
                this.showNotice('success', 'Document saved', `The document "${documentLabel}" was saved successfully.`);
                this.loadData();
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to save document')
        });
    }

    openDetailDialog(document: DocumentSummary) {
        this.selectedDocumentDetail.set(document);
        this.selectedRevisions.set(document.softcopy?.revisions ?? []);
        this.detailDialogVisible = true;
        this.pendingDocumentId = document.document_id;
        this.openDetailDialogById(document.document_id, document.document_type);
    }

    private openDetailDialogById(documentId: string, documentType?: string) {
        this.detailRequest?.unsubscribe();

        const listedDocument = this.documents().find((document) => document.document_id === documentId);
        const currentDocument = this.selectedDocumentDetail();
        if (listedDocument && currentDocument?.document_id !== documentId) {
            this.selectedDocumentDetail.set(listedDocument);
            this.selectedRevisions.set(listedDocument.softcopy?.revisions ?? []);
        }
        if (listedDocument || currentDocument?.document_id === documentId) {
            this.detailDialogVisible = true;
        }

        this.pendingDocumentId = documentId;
        this.detailLoading.set(true);
        this.detailRequest = this.documentsService.getDocument(documentId).pipe(
            map(detail => ({ detail, revisions: detail?.softcopy?.revisions || [] })),
            finalize(() => {
                if (this.pendingDocumentId === documentId) this.detailLoading.set(false);
            })
        ).subscribe({
            next: ({ detail, revisions }) => {
                if (!detail) {
                    this.showNotice('warning', 'Document not found', 'The selected document could not be loaded.');
                    if (!listedDocument) this.detailDialogVisible = false;
                    return;
                }

                this.selectedDocumentDetail.set(detail);
                this.selectedRevisions.set(revisions ?? []);
                this.detailDialogVisible = true;
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to load full document details')
        });
    }

    openRevisionDialog(document: DocumentSummary) {
        if (document.document_type !== 'SOFTCOPY') {
            this.showNotice('warning', 'Revision not allowed', 'Only softcopy documents can receive revisions.');
            return;
        }

        const currentUserId = this.auth.user()?.user_id || '';
        if (!currentUserId) {
            this.showNotice('error', 'Missing session', 'No current user session was found for revision upload.');
            return;
        }

        this.documentsService.getDocument(document.document_id).pipe(
            map(detail => ({ detail, revisions: detail?.softcopy?.revisions || [] }))
        ).subscribe({
            next: ({ detail, revisions }) => {
                this.revisionTargetDocumentId = document.document_id;
                this.revisionTargetStatus = detail?.status || document.status || '';
                this.revisionForm = {
                    ...this.emptyRevisionForm(),
                    uploaded_by: currentUserId,
                    set_as_current: this.revisionTargetStatus === 'Approved',
                    series_number: detail?.softcopy?.series_number || '',
                    softcopy_category_id: detail?.softcopy?.category?.softcopy_category_id || '',
                    correction_reason: ''
                };
                this.revisionContextDocumentNumber = detail?.document_number || document.document_number || 'No document number';
                this.revisionCurrentRevision = detail?.softcopy?.current_revision || null;
                this.revisionExistingRevisions = revisions ?? [];
                this.revisionDialogVisible = true;
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to load revision history')
        });
    }

    uploadRevision(form: RevisionFormValue) {
        if (!this.revisionTargetDocumentId) {
            return;
        }

        this.isSaving.set(true);
        const request = this.documentsService.uploadRevision(this.revisionTargetDocumentId, form);
        request.subscribe({
            next: () => {
                this.isSaving.set(false);
                this.revisionDialogVisible = false;
                this.revisionForm = this.emptyRevisionForm();
                this.revisionContextDocumentNumber = '';
                this.revisionCurrentRevision = null;
                this.revisionExistingRevisions = [];
                this.revisionTargetStatus = '';
                this.showNotice('success', 'Revision uploaded', 'The new revision was uploaded successfully.');
                this.loadData();
                if (this.detailDialogVisible && this.revisionTargetDocumentId) {
                    this.openDetailDialogById(this.revisionTargetDocumentId);
                }
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to upload revision')
        });
    }

    openDirectoryDialog(document: DocumentSummary) {
        if (!this.canChangeDirectory(document)) return;
        this.directoryTargetDocumentId = document.document_id;
        this.directoryContextDocumentNumber = document.document_number || document.document_title || 'Softcopy document';
        this.directoryCurrentCategoryId = document.softcopy?.category?.softcopy_category_id || '';
        this.directoryDialogVisible = true;
    }

    saveDirectory(categoryId: string) {
        if (!this.directoryTargetDocumentId || !categoryId) return;
        this.isSaving.set(true);
        this.documentsService.changeDirectory(this.directoryTargetDocumentId, categoryId).subscribe({
            next: () => {
                this.isSaving.set(false);
                const documentId = this.directoryTargetDocumentId;
                this.directoryDialogVisible = false;
                this.directoryTargetDocumentId = '';
                this.directoryContextDocumentNumber = '';
                this.directoryCurrentCategoryId = '';
                this.showNotice('success', 'Directory changed', 'The controlled file was moved to the selected folder.');
                this.loadData();
                if (this.detailDialogVisible && documentId) this.openDetailDialogById(documentId);
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to change directory')
        });
    }

    requestDelete(document: DocumentSummary) {
        this.deletingDocument = document;
        this.deleteConfirmVisible = true;
    }

    confirmDelete() {
        if (!this.deletingDocument) {
            return;
        }

        this.isSaving.set(true);
        this.documentsService.deleteDocument(this.deletingDocument.document_id).subscribe({
            next: () => {
                const deletedNumber = this.deletingDocument?.document_number || 'Document';
                this.isSaving.set(false);
                this.deletingDocument = null;
                this.showNotice('success', 'Document deleted', `${deletedNumber} was removed successfully.`);
                this.loadData();
            },
            error: (error: unknown) => this.handleActionError(error, 'Unable to delete document')
        });
    }

    deleteMessage() {
        return this.deletingDocument ? `Delete "${this.deletingDocument.document_number || this.deletingDocument.document_title}"?` : 'Are you sure you want to delete this document?';
    }

    fullName(user?: { firstname?: string; lastname?: string } | null) {
        return [user?.firstname, user?.lastname].filter(Boolean).join(' ');
    }

    currentUserName() {
        return this.fullName(this.auth.user()) || this.auth.user()?.username || '';
    }

    requestorName(document: DocumentSummary) {
        return document.requested_by_name || this.fullName(document.requester) || 'Current creator';
    }

    deleteAttachment(attachmentId: string) {
        const document = this.selectedDocumentDetail();
        if (!document || !confirm('Delete this attached scan document?')) return;
        this.documentsService.deleteAttachment(document.document_id, attachmentId).subscribe({
            next: (updated) => { this.selectedDocumentDetail.set(updated); this.loadData(); this.showNotice('success', 'Attachment deleted', 'The supporting file was deleted.'); },
            error: (error: unknown) => this.handleActionError(error, 'Unable to delete attachment')
        });
    }

    assignmentUsersLabel(document: DocumentSummary) {
        const assignments = document.assignments ?? [];
        if (!assignments.length) return 'Unassigned';
        const names = assignments.map((assignment) => this.fullName(assignment.user) || assignment.user.username || 'User');
        return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2} more` : names.join(', ');
    }

    assignmentActorLabel(document: DocumentSummary) {
        const assignments = document.assignments ?? [];
        if (!assignments.length) return 'No user-specific access assigned';
        const latest = [...assignments].sort((left, right) => new Date(right.assigned_at ?? 0).getTime() - new Date(left.assigned_at ?? 0).getTime())[0];
        const actor = this.fullName(latest.assigner) || latest.assigner?.username || 'Administrator';
        return `Assigned by ${actor}${latest.assigned_at ? ` · ${this.formatDate(latest.assigned_at)}` : ''}`;
    }

    statusLabel(status?: DocumentStatusValue | null) {
        if (!status) {
            return 'N/A';
        }

        const labels: Record<string, string> = { Draft: 'Draft', PendingApproval: 'Pending Approval', ForNotedBy: 'For Noted By', ForPlantManagerApproval: 'For Plant Manager Approval', ForDocumentControllerAdmin: 'For Document Controller/Admin Approval', ForApproval: 'For Approval', Approved: 'Approved — Pending Release', Completed: 'Completed / Released', ForRevision: 'For Revision', ReturnedForCorrection: 'For Revision', Rejected: 'Rejected', Cancelled: 'Cancelled', PendingRecipientAcceptance: 'Pending Recipient Acceptance', ForTransfer: 'For Transfer', Transferred: 'Transferred', Disposed: 'Disposed' };
        return labels[status] ?? String(status).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    }

    statusPillClass(status?: DocumentStatusValue | null) {
        switch (status) {
            case 'Draft':
                return 'status-pill-draft';
            case 'PendingApproval':
            case 'ForNotedBy':
            case 'ForPlantManagerApproval':
            case 'ForDocumentControllerAdmin':
            case 'ForApproval':
            case 'ForTransfer':
            case 'Transferred':
            case 'PendingRecipientAcceptance':
                return 'status-pill-pending';
            case 'Cancelled':
            case 'Rejected':
                return 'status-pill-rejected';
            case 'ReturnedForCorrection':
            case 'ForRevision':
                return 'status-pill-revised';
            case 'Disposed':
                return 'status-pill-disposed';
            case 'Approved':
            default:
                return 'status-pill-approved';
        }
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

    documentPreviewImage(document: DocumentSummary) {
        const revision = document.softcopy?.current_revision;
        const extension = this.documentFileExtension(document);
        const isImage = revision?.mime_type?.startsWith('image/') || ['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP', 'BMP', 'SVG'].includes(extension);
        return isImage ? revision?.file_url || '' : '';
    }

    documentPreviewIcon(document: DocumentSummary) {
        if (document.document_type === 'HARDCOPY') {
            return 'pi pi-folder';
        }

        const extension = this.documentFileExtension(document);
        if (['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP', 'BMP', 'SVG'].includes(extension)) {
            return 'pi pi-image';
        }
        if (extension === 'PDF') {
            return 'pi pi-file-pdf';
        }
        if (['DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX'].includes(extension)) {
            return 'pi pi-file-edit';
        }
        return 'pi pi-file';
    }

    documentPreviewLabel(document: DocumentSummary) {
        if (document.document_type === 'HARDCOPY') {
            return 'PHYSICAL';
        }
        return this.documentFileExtension(document) || 'NO FILE';
    }

    documentPreviewDescription(document: DocumentSummary) {
        if (document.document_type === 'HARDCOPY') {
            return [document.hardcopy?.area?.area_name, document.hardcopy?.location?.location_name].filter(Boolean).join(' · ') || 'Physical document record';
        }
        return this.displayRevisionFileName(document.softcopy?.current_revision?.file_name, 'No current file uploaded');
    }

    displayRevisionFileName(fileName?: string | null, fallback = 'No current file') {
        return (fileName || '').replace(/-(controlled|uncontrolled|stamped)(?=\.[^.]+$)/i, '') || fallback;
    }

    documentPreviewTone(document: DocumentSummary) {
        if (document.document_type === 'HARDCOPY') {
            return 'preview-hardcopy';
        }
        const extension = this.documentFileExtension(document);
        if (['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP', 'BMP', 'SVG'].includes(extension)) {
            return 'preview-image';
        }
        if (extension === 'PDF') {
            return 'preview-pdf';
        }
        if (['DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX'].includes(extension)) {
            return 'preview-office';
        }
        return 'preview-file';
    }

    hideBrokenPreview(event: Event) {
        (event.target as HTMLImageElement).hidden = true;
    }

    private documentFileExtension(document: DocumentSummary) {
        const fileName = document.softcopy?.current_revision?.file_name || '';
        const match = fileName.match(/\.([^.]+)$/);
        return (match?.[1] || '').toUpperCase();
    }

    trackDocument = (_index: number, document: DocumentSummary) => document.document_id;
    trackFolder = (_index: number, folder: DocumentFolderNode) => folder.id;
    trackArea = (_index: number, area: AreaReference) => area.area_id;
    trackAsset = (_index: number, asset: AssetReference) => asset.asset_id;
    trackSpecific = (_index: number, specific: SpecificReference) => specific.specific_id;
    trackLocation = (_index: number, location: LocationReference) => location.location_id;
    trackSequence = (_index: number, sequence: SequenceReference) => sequence.sequence_id;
    trackSoftcopyCategory = (_index: number, category: SoftcopyCategoryReference) => category.softcopy_category_id;

    private clampPagination() {
        const total = this.filteredDocuments().length;
        if (total === 0) {
            this.first = 0;
            return;
        }

        const lastPageFirst = Math.max(0, Math.floor((total - 1) / this.rows) * this.rows);
        if (this.first > lastPageFirst) {
            this.first = lastPageFirst;
        }
    }

    private withReferenceFallback<T>(label: string, request$: Observable<T[]>, issues: string[]) {
        return request$.pipe(
            catchError((error: unknown) => {
                issues.push(`${label} (${this.extractErrorMessage(error)})`);
                return of([] as T[]);
            })
        );
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
            if (error.status === 413) {
                return `File Too Large: choose a workbook smaller than ${this.batchMaxFileSizeLabel}.`;
            }

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

    private fileExtension(fileName: string) {
        const lastDotIndex = fileName.lastIndexOf('.');
        return lastDotIndex >= 0 ? fileName.slice(lastDotIndex).toLowerCase() : '';
    }

    private parseBatchWorkbook(workbook: XLSX.WorkBook) {
        const rows: BatchHardcopyImportRow[] = [];
        const requiredHeaders = ['SEQUENCE', 'DOCUMENT NAME', 'LOCATION', 'ASSET NUMBER', 'AREA', 'SPECIFIC'];

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) {
                continue;
            }

            const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
                header: 1,
                raw: false,
                defval: '',
                blankrows: false
            });

            const headerRow = (matrix[0] ?? []).map((value) => this.normalizeWorkbookCell(value).toUpperCase());
            if (!requiredHeaders.every((header) => headerRow.includes(header))) {
                continue;
            }

            const headerIndex = new Map(headerRow.map((header, index) => [header, index]));
            for (let index = 2; index < matrix.length; index += 1) {
                const row = matrix[index] ?? [];
                const parsedRow: BatchHardcopyImportRow = {
                    sheet_name: sheetName,
                    row_number: index + 1,
                    sequence: this.readWorkbookCell(row, headerIndex, 'SEQUENCE'),
                    document_name: this.readWorkbookCell(row, headerIndex, 'DOCUMENT NAME'),
                    location_name: this.readWorkbookCell(row, headerIndex, 'LOCATION'),
                    asset_number: this.readWorkbookCell(row, headerIndex, 'ASSET NUMBER'),
                    area_name: this.readWorkbookCell(row, headerIndex, 'AREA'),
                    specific_name: this.readWorkbookCell(row, headerIndex, 'SPECIFIC')
                };

                if (!this.hasBatchRowContent(parsedRow)) {
                    continue;
                }

                rows.push(parsedRow);
            }
        }

        return rows;
    }

    private readWorkbookCell(row: (string | number | null)[], headerIndex: Map<string, number>, header: string) {
        const index = headerIndex.get(header);
        return index === undefined ? '' : this.normalizeWorkbookCell(row[index]);
    }

    private readWorkbookCellAliases(row: (string | number | null)[], headerIndex: Map<string, number>, headers: string[]) {
        for (const header of headers) {
            const value = this.readWorkbookCell(row, headerIndex, header);
            if (value) return value;
        }
        return '';
    }

    private normalizeWorkbookCell(value: string | number | null | undefined) {
        return value === undefined || value === null ? '' : String(value).replace(/\s+/g, ' ').trim();
    }

    private hasBatchRowContent(row: BatchHardcopyImportRow) {
        return !!(row.document_name || row.location_name || row.asset_number || row.area_name || row.specific_name || row.sequence);
    }

    private emptyDocumentForm(): DocumentFormValue {
        return {
            document_number: '',
            document_title: '',
            document_type: this.workspaceType || 'HARDCOPY',
            action: 'DRAFT',
            requester_type: 'CURRENT_USER',
            requested_by_name: '',
            asset_id: '',
            area_id: '',
            specific_id: '',
            location_id: '',
            sequence_id: '',
            softcopy_category_id: '',
            initial_revision_number: '',
            initial_file: null,
            attached_scan_files: [], assigned_user_ids: [],
            workflow_name: this.workspaceType === 'SOFTCOPY' ? 'Standard Softcopy Approval' : 'Direct Hardcopy Approval',
            workflow_version: 1,
            workflow_steps: this.workspaceType === 'SOFTCOPY'
                ? [
                      { stage: 'NOTED_BY', assigned_user_id: '' },
                      { stage: 'PLANT_MANAGER', assigned_user_id: '' },
                      { stage: 'DOCUMENT_CONTROLLER_ADMIN', assigned_user_id: '' }
                  ]
                : [{ stage: 'HARDCOPY_APPROVAL', assigned_user_id: '' }],
            retention_enabled: false,
            retention_start_date: '',
            retention_end_date: ''
        };
    }

    private emptyRevisionForm(): RevisionFormValue {
        return {
            uploaded_by: '',
            revision_number: '',
            reason_of_revision: '',
            effective_date: '',
            series_number: '',
            page_number: '',
            set_as_current: true,
            file: null,
            softcopy_category_id: ''
        };
    }
}
