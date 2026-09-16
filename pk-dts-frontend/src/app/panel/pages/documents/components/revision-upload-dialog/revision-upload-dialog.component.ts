import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { RevisionFormValue, RevisionSummary, SoftcopyCategoryReference } from '../../documents.types';

@Component({
    selector: 'app-revision-upload-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, CheckboxModule, DialogModule, InputTextModule],
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
            [style]="{ width: '38rem', maxWidth: '94vw' }"
            [breakpoints]="{ '960px': '92vw', '640px': '96vw' }"
            [header]="correctionMode ? 'Correct Controlled File' : 'Upload and Finalize Revision'"
            (onHide)="handleHide()"
        >
            <div class="space-y-5 pt-2">
                <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div class="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Revision context</div>
                    <div class="mt-3 text-sm text-slate-700">
                        <div><span class="font-semibold text-slate-900">Document:</span> {{ documentNumber || 'Softcopy document' }}</div>
                        <div><span class="font-semibold text-slate-900">Current revision:</span> {{ currentRevision?.revision_number || 'None yet' }}</div>
                        <div class="mt-2" *ngIf="existingRevisions.length; else firstRevisionNote">
                            <span class="font-semibold text-slate-900">Existing revisions:</span>
                            {{ existingRevisionLabels() }}
                        </div>
                        <ng-template #firstRevisionNote>
                            <div class="mt-2 text-slate-600">No existing revisions yet. This upload will become the first softcopy revision.</div>
                        </ng-template>
                    </div>
                </div>

                <div class="field" *ngIf="correctionMode">
                    <label for="correction-reason">Correction reason <span class="text-red-500">*</span></label>
                    <textarea id="correction-reason" pInputText [(ngModel)]="form.correction_reason" class="w-full" rows="3" placeholder="Explain why the controlled file is being replaced." ></textarea>
                    <small *ngIf="submitted && !form.correction_reason?.trim()">A reason is required for a controlled file correction.</small>
                </div>

                <div class="field">
                    <label for="revision-file">Revision file <span class="text-red-500">*</span></label>
                    <input id="revision-file" type="file" class="file-input" (change)="onFileChange($event)" />
                    <div *ngIf="form.file" class="text-sm text-slate-500">{{ form.file.name }}</div>
                    <div class="text-sm text-slate-500">Maximum softcopy size: 100 MB.</div>
                    <small *ngIf="submitted && !form.file">A file is required.</small>
                </div>

                <div class="field">
                    <label for="revision-folder">Main folder or subfolder <span class="text-red-500">*</span></label>
                    <select id="revision-folder" [(ngModel)]="form.softcopy_category_id" class="w-full" [disabled]="saving">
                        <option value="">Select folder</option>
                        <option *ngFor="let category of softcopyCategories" [value]="category.softcopy_category_id">{{ category.folder_name || category.category_name }}</option>
                    </select>
                    <small class="field-note">Choose the folder after the DCR is fully approved or completed. The controlled revision and later scan attachments use this folder.</small>
                    <small *ngIf="submitted && !form.softcopy_category_id">A folder is required for the revision upload.</small>
                </div>

                <div class="field">
                    <label for="revision-number">Revision number</label>
                    <input id="revision-number" pInputText [(ngModel)]="form.revision_number" class="w-full" placeholder="Automatic when empty" maxlength="50" />
                    <div class="text-sm text-slate-500">Leave blank for the next automatic revision number. The prior file is never overwritten.</div>
                </div>

                <div class="field">
                    <label for="revision-reason">Reason of revision</label>
                    <input id="revision-reason" pInputText [(ngModel)]="form.reason_of_revision" class="w-full" placeholder="Updated approval section." />
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                    <div class="field">
                        <label for="revision-effective">Effective date <span *ngIf="form.set_as_current" class="text-red-500">*</span></label>
                        <input id="revision-effective" type="date" pInputText [(ngModel)]="form.effective_date" class="w-full" />
                        <small *ngIf="submitted && form.set_as_current && !form.effective_date">Effective date is required to finalize.</small>
                    </div>

                    <div class="field">
                        <label for="revision-series">Series number <span *ngIf="form.set_as_current" class="text-red-500">*</span></label>
                        <input id="revision-series" pInputText [(ngModel)]="form.series_number" class="w-full" placeholder="SERIES-2026-01" />
                        <small *ngIf="submitted && form.set_as_current && !form.series_number?.trim()">Series number is required to finalize.</small>
                    </div>

                    <div class="field">
                        <label for="revision-pages">Page number <span *ngIf="form.set_as_current" class="text-red-500">*</span></label>
                        <input id="revision-pages" pInputText [(ngModel)]="form.page_number" class="w-full" placeholder="1-5" />
                        <small *ngIf="submitted && form.set_as_current && !form.page_number.trim()">Page number is required to finalize.</small>
                    </div>
                </div>

                <label *ngIf="!correctionMode" class="inline-flex items-center gap-3 text-sm font-semibold text-slate-700">
                    <p-checkbox [(ngModel)]="form.set_as_current" [binary]="true"></p-checkbox>
                    <span>Finalize as official Controlled Copy</span>
                </label>
            </div>

            <ng-template pTemplate="footer">
                <p-button label="Cancel" severity="secondary" text (onClick)="cancel()" />
                <p-button [label]="correctionMode ? 'Upload corrected file' : 'Upload and finalize'" icon="pi pi-upload" [loading]="saving" (onClick)="submit()" />
            </ng-template>
        </p-dialog>
    `,
    styles: [
        `
            .field {
                display: flex;
                flex-direction: column;
                gap: 0.55rem;
            }

            .field label {
                font-size: 0.9rem;
                font-weight: 700;
                color: #334155;
            }

            .field small {
                color: var(--brand-primary);
                font-size: 0.8rem;
                font-weight: 600;
            }

            .file-input {
                width: 100%;
                border: 1px dashed #cbd5e1;
                border-radius: 1rem;
                padding: 0.85rem 1rem;
                background: #f8fafc;
            }

            :host ::ng-deep .p-dialog {
                border-radius: 1.5rem;
                overflow: hidden;
            }

            :host ::ng-deep .p-dialog .p-dialog-header {
                padding: 1.35rem 1.5rem 1rem;
                border-bottom: 1px solid rgba(148, 163, 184, 0.15);
                background:
                    radial-gradient(circle at top left, rgba(220, 38, 38, 0.08), transparent 35%),
                    linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
            }

            :host ::ng-deep .p-dialog .p-dialog-content {
                padding: 1.5rem;
                background: #ffffff;
            }

            :host ::ng-deep .p-dialog .p-dialog-footer {
                padding: 0 1.5rem 1.5rem;
                background: #ffffff;
                border-top: none;
            }
        `
    ]
})
export class RevisionUploadDialogComponent {
    private _visible = false;

    @Input()
    get visible() {
        return this._visible;
    }
    set visible(value: boolean) {
        this._visible = value;
        if (value) {
            this.submitted = false;
        }
    }

    @Output() visibleChange = new EventEmitter<boolean>();

    @Input() form: RevisionFormValue = {
        uploaded_by: '',
        revision_number: '',
        reason_of_revision: '',
        effective_date: '',
        series_number: '',
        page_number: '',
        set_as_current: true,
        file: null
    };
    @Input() saving = false;
    @Input() documentNumber = '';
    @Input() currentRevision: RevisionSummary | null = null;
    @Input() existingRevisions: RevisionSummary[] = [];
    @Input() documentStatus = '';
    @Input() correctionMode = false;
    @Input() softcopyCategories: SoftcopyCategoryReference[] = [];

    @Output() save = new EventEmitter<RevisionFormValue>();
    @Output() cancelClick = new EventEmitter<void>();

    submitted = false;

    existingRevisionLabels() {
        return this.existingRevisions.map((revision) => revision.revision_number).join(', ');
    }

    onFileChange(event: Event) {
        const input = event.target as HTMLInputElement;
        this.form.file = input.files?.[0] ?? null;
        if (this.form.file && !this.form.revision_number.trim()) {
            const match = this.form.file.name.replace(/\.[^.]+$/, '').match(/\brev(?:ision)?[\s._-]*([A-Z]?\d{1,4})\b/i);
            if (match) this.form.revision_number = match[1];
        }
    }

    submit() {
        this.submitted = true;
        if (!this.form.file) {
            return;
        }

        if (!this.form.softcopy_category_id) return;
        if (this.correctionMode && !this.form.correction_reason?.trim()) return;
        if (this.form.set_as_current && (!this.form.effective_date || !this.form.series_number?.trim() || !this.form.page_number?.trim())) return;
        this.save.emit({ ...this.form, set_as_current: this.correctionMode ? false : this.form.set_as_current, correction_reason: this.form.correction_reason?.trim() || '' });
    }

    cancel() {
        this.cancelClick.emit();
        this.close();
    }

    handleHide() {
        this.close();
    }

    private close() {
        this.visible = false;
        this.visibleChange.emit(false);
    }
}
