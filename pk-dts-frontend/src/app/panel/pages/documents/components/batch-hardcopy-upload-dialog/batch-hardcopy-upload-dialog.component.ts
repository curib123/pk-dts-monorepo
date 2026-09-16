import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableShellComponent } from '@/app/shared/components/table-shell/table-shell.component';
import { BatchHardcopyImportResponse, BatchHardcopyImportRow } from '../../documents.types';

@Component({
    selector: 'app-batch-hardcopy-upload-dialog',
    standalone: true,
    imports: [CommonModule, ButtonModule, DialogModule, TableShellComponent],
    template: `
        <p-dialog
            [(visible)]="visible"
            [modal]="true"
            [draggable]="false"
            [resizable]="false"
            [dismissableMask]="true"
            [blockScroll]="true"
            [focusOnShow]="false"
            [appendTo]="'body'"
            [style]="{ width: '72rem', maxWidth: '96vw' }"
            [breakpoints]="{ '960px': '94vw', '640px': '96vw' }"
            header="Batch Add Hardcopy Documents"
            (onHide)="handleHide()"
        >
            <div class="space-y-5 pt-2">
                <div class="upload-card">
                    <div class="upload-title">Excel Reference Import</div>
                    <div class="upload-copy">Upload a workbook with SEQUENCE, DOCUMENT NAME, LOCATION, ASSET NUMBER, AREA, and SPECIFIC. Hardcopy records use the document name and storage classification; any legacy document-number column is ignored.</div>
                    <div class="upload-meta">
                        Allowed formats: <strong>.xlsx</strong>, <strong>.xls</strong>
                        <span class="upload-meta-divider">|</span>
                        Maximum file size: <strong>{{ maxFileSizeLabel }}</strong>
                    </div>
                    <input type="file" accept=".xlsx,.xls" class="file-input" (change)="fileChange.emit($event)" />
                    <div *ngIf="fileName" class="mt-3 text-sm text-slate-500">{{ fileName }}</div>
                    <div *ngIf="validationMessage" class="validation-message">{{ validationMessage }}</div>
                    <div *ngIf="saving" class="progress-shell">
                        <div class="progress-copy">
                            <span>{{ progressLabel }}</span>
                            <strong>{{ uploadProgress }}%</strong>
                        </div>
                        <div class="progress-track">
                            <div class="progress-bar" [style.width.%]="uploadProgress"></div>
                        </div>
                    </div>
                </div>

                <div *ngIf="rows.length" class="grid gap-4 sm:grid-cols-4">
                    <div class="metric-card">
                        <div class="metric-label">Rows Ready</div>
                        <div class="metric-value">{{ rows.length }}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Sheets</div>
                        <div class="metric-value">{{ sheetCount }}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Type</div>
                        <div class="metric-value">HARDCOPY</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Status</div>
                        <div class="metric-value">Approved</div>
                    </div>
                </div>

                <div *ngIf="rows.length" class="preview-shell">
                    <div class="preview-head">Preview</div>
                    <app-table-shell class="mt-3" minWidth="64rem" [compact]="true">
                            <thead>
                                <tr>
                                    <th class="px-4 py-3">Sheet</th>
                                    <th class="px-4 py-3">Row</th>
                                    <th class="px-4 py-3">Sequence</th>
                                    <th class="px-4 py-3">Document Name</th>
                                    <th class="px-4 py-3">Location</th>
                                    <th class="px-4 py-3">Asset Number</th>
                                    <th class="px-4 py-3">Area</th>
                                    <th class="px-4 py-3">Specific</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200">
                                <tr *ngFor="let row of rows.slice(0, 12)">
                                    <td class="px-4 py-3">{{ row.sheet_name }}</td>
                                    <td class="px-4 py-3">{{ row.row_number }}</td>
                                    <td class="px-4 py-3">{{ row.sequence }}</td>
                                    <td class="px-4 py-3">{{ row.document_name }}</td>
                                    <td class="px-4 py-3">{{ row.location_name }}</td>
                                    <td class="px-4 py-3">{{ row.asset_number }}</td>
                                    <td class="px-4 py-3">{{ row.area_name }}</td>
                                    <td class="px-4 py-3">{{ row.specific_name }}</td>
                                </tr>
                            </tbody>
                    </app-table-shell>
                    <div *ngIf="rows.length > 12" class="mt-2 text-xs text-slate-400">Showing the first 12 rows from the parsed workbook.</div>
                </div>

                <div *ngIf="result" class="result-shell">
                    <div class="grid gap-4 sm:grid-cols-4">
                        <div class="metric-card">
                            <div class="metric-label">Total</div>
                            <div class="metric-value">{{ result.summary.total }}</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-label">Created</div>
                            <div class="metric-value text-emerald-700!">{{ result.summary.created }}</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-label">Skipped</div>
                            <div class="metric-value text-amber-700!">{{ result.summary.skipped }}</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-label">Errors</div>
                            <div class="metric-value text-red-700!">{{ result.summary.errors }}</div>
                        </div>
                    </div>

                    <app-table-shell class="mt-4" minWidth="64rem" [compact]="true">
                            <thead>
                                <tr>
                                    <th class="px-4 py-3">Status</th>
                                    <th class="px-4 py-3">Sheet</th>
                                    <th class="px-4 py-3">Row</th>
                                    <th class="px-4 py-3">Document Name</th>
                                    <th class="px-4 py-3">Message</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200">
                                <tr *ngFor="let row of result.results">
                                    <td class="px-4 py-3">
                                        <span class="status-chip" [class.status-chip-success]="row.status === 'created'" [class.status-chip-warning]="row.status === 'skipped'" [class.status-chip-error]="row.status === 'error'">
                                            {{ row.status }}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3">{{ row.sheet_name }}</td>
                                    <td class="px-4 py-3">{{ row.row_number }}</td>
                                    <td class="px-4 py-3">{{ row.document_name }}</td>
                                    <td class="px-4 py-3">{{ row.message }}</td>
                                </tr>
                            </tbody>
                    </app-table-shell>
                </div>
            </div>

            <ng-template pTemplate="footer">
                <p-button label="Close" severity="secondary" text (onClick)="close()" />
                <p-button label="Upload batch" icon="pi pi-upload" [loading]="saving" [disabled]="!rows.length" (onClick)="upload.emit()" />
            </ng-template>
        </p-dialog>
    `,
    styles: [
        `
            .upload-card,
            .preview-shell,
            .result-shell,
            .metric-card {
                border: 1px solid #e2e8f0;
                border-radius: 1.25rem;
                background: #ffffff;
                padding: 1rem;
            }

            .upload-title,
            .preview-head {
                font-weight: 900;
                color: #0f172a;
            }

            .upload-copy {
                margin-top: 0.45rem;
                color: #64748b;
                line-height: 1.6;
                font-size: 0.92rem;
            }

            .upload-meta {
                margin-top: 0.85rem;
                color: #475569;
                font-size: 0.85rem;
            }

            .upload-meta-divider {
                margin: 0 0.5rem;
                color: #cbd5e1;
            }

            .file-input {
                width: 100%;
                margin-top: 1rem;
                border: 1px dashed #cbd5e1;
                border-radius: 1rem;
                padding: 0.9rem 1rem;
                background: #f8fafc;
            }

            .validation-message {
                margin-top: 0.85rem;
                border-radius: 0.9rem;
                background: var(--brand-soft);
                color: var(--brand-primary);
                padding: 0.75rem 0.9rem;
                font-size: 0.85rem;
                line-height: 1.5;
            }

            .progress-shell {
                margin-top: 1rem;
            }

            .progress-copy {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                color: #0f172a;
                font-size: 0.85rem;
                font-weight: 700;
            }

            .progress-track {
                margin-top: 0.65rem;
                height: 0.65rem;
                border-radius: 9999px;
                background: #e2e8f0;
                overflow: hidden;
            }

            .progress-bar {
                height: 100%;
                border-radius: 9999px;
                background: linear-gradient(90deg, var(--brand-primary-deep), var(--brand-primary));
                transition: width 0.2s ease;
            }

            .metric-label {
                font-size: 0.72rem;
                font-weight: 800;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                color: #64748b;
            }

            .metric-value {
                margin-top: 0.55rem;
                font-size: 1.5rem;
                font-weight: 900;
                color: #0f172a;
            }

            .status-chip {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 9999px;
                padding: 0.3rem 0.7rem;
                font-size: 0.75rem;
                font-weight: 800;
                text-transform: capitalize;
                background: #f8fafc;
                color: #475569;
            }

            .status-chip-success {
                background: #ecfdf5;
                color: #047857;
            }

            .status-chip-warning {
                background: #fffbeb;
                color: #b45309;
            }

            .status-chip-error {
                background: var(--brand-soft);
                color: #be123c;
            }

            :host ::ng-deep .p-dialog {
                border-radius: 1.5rem;
                overflow: hidden;
            }
        `
    ]
})
export class BatchHardcopyUploadDialogComponent {
    @Input() visible = false;
    @Output() visibleChange = new EventEmitter<boolean>();

    @Input() fileName = '';
    @Input() rows: BatchHardcopyImportRow[] = [];
    @Input() result: BatchHardcopyImportResponse | null = null;
    @Input() saving = false;
    @Input() uploadProgress = 0;
    @Input() progressLabel = 'Uploading workbook...';
    @Input() validationMessage = '';
    @Input() maxFileSizeLabel = '10 MB';

    @Output() fileChange = new EventEmitter<Event>();
    @Output() upload = new EventEmitter<void>();

    get sheetCount() {
        return new Set(this.rows.map((row) => row.sheet_name)).size;
    }

    close() {
        this.visible = false;
        this.visibleChange.emit(false);
    }

    handleHide() {
        this.close();
    }
}
