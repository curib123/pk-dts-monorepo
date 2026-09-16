import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SearchableDropdownComponent, SearchableDropdownOption, SearchableDropdownValue } from '@/app/shared/components/searchable-dropdown/searchable-dropdown.component';
import { DisposalActionValue, DocumentSummary, DocumentUserSummary } from '../../documents.types';

@Component({
    selector: 'app-document-status-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, DialogModule, SearchableDropdownComponent],
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
            [style]="{ width: '34rem', maxWidth: '94vw' }"
            header="Document Disposal"
            (onHide)="handleHide()"
        >
            <div *ngIf="document" class="space-y-4 pt-2">
                <div class="status-card">
                    <div class="status-kicker">{{ nextStatusLabel }}</div>
                    <div class="status-title">{{ document.document_type === 'HARDCOPY' ? document.document_title : (document.document_number || 'No document number') }}</div>
                    <div class="status-copy">{{ document.document_title }}</div>
                </div>

                <div *ngIf="mode === 'dispose'" class="field">
                    <label for="disposal-action">How will it be disposed? <span class="text-red-500">*</span></label>
                    <select id="disposal-action" [(ngModel)]="disposalAction" class="text-field">
                        <option *ngFor="let action of disposalActions" [value]="action.value">{{ action.label }}</option>
                    </select>
                </div>

                <div *ngIf="mode === 'dispose' && disposalAction === 'Other'" class="field">
                    <label for="disposal-action-other">Describe the disposal method <span class="text-red-500">*</span></label>
                    <input id="disposal-action-other" [(ngModel)]="disposalActionOther" class="text-field" maxlength="150" placeholder="Describe how the document will be disposed." />
                    <small *ngIf="submitted && !disposalActionOther.trim()">Describe the disposal method when Other is selected.</small>
                </div>

                <div *ngIf="mode === 'dispose'; else activateCopy" class="field">
                    <label for="disposal-remarks">Remarks / reason <span class="text-red-500">*</span></label>
                    <textarea
                        id="disposal-remarks"
                        [(ngModel)]="remarks"
                        class="textarea-field"
                        rows="5"
                        placeholder="State why this document should be disposed."
                    ></textarea>
                    <small *ngIf="submitted && !remarks.trim()">A disposal remark is required before {{ administrator ? 'disposing' : 'requesting disposal of' }} this document.</small>
                </div>

                <div *ngIf="mode === 'dispose'" class="field">
                    <label for="disposed-by-user">{{ administrator ? 'Disposed by' : 'Requested by' }} <span class="text-red-500">*</span></label>
                    <app-searchable-dropdown
                        inputId="disposed-by-user"
                        [value]="disposedByUserId"
                        (valueChange)="setDisposedByUser($event)"
                        [options]="userOptions"
                        [disabled]="!administrator"
                        [showClear]="false"
                        [invalid]="submitted && !disposedByUserId"
                        placeholder="Select a user"
                        filterPlaceholder="Search by name or username"
                        emptyMessage="No users are available."
                    />
                    <small class="field-help" *ngIf="!administrator">Your signed-in account is recorded automatically. An administrator must approve this request before the document is disposed.</small>
                    <small *ngIf="submitted && !disposedByUserId">Select the account responsible for this disposal.</small>
                </div>

                <ng-template #activateCopy>
                    <div class="status-note">
                        This will restore the document to its previous workflow status and clear the stored disposal remarks, responsible name, and disposal date.
                    </div>
                </ng-template>
            </div>

            <ng-template pTemplate="footer">
                <p-button label="Cancel" severity="secondary" text (onClick)="close()" />
                <p-button [label]="mode === 'dispose' ? (administrator ? 'Dispose document' : 'Request disposal') : 'Restore document'" icon="pi pi-check" [loading]="saving" (onClick)="submit()" />
            </ng-template>
        </p-dialog>
    `,
    styles: [
        `
            .status-card,
            .status-note {
                border: 1px solid #e2e8f0;
                border-radius: 1.25rem;
                background: #ffffff;
                padding: 1rem;
            }

            .status-kicker {
                font-size: 0.72rem;
                font-weight: 800;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                color: #64748b;
            }

            .status-title {
                margin-top: 0.55rem;
                font-size: 1.15rem;
                font-weight: 900;
                color: #0f172a;
            }

            .status-copy,
            .status-note {
                margin-top: 0.35rem;
                color: #475569;
                line-height: 1.6;
            }

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

            .textarea-field {
                width: 100%;
                border-radius: 0.95rem;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                padding: 0.85rem 0.9rem;
                color: #0f172a;
                outline: none;
                resize: vertical;
            }

            .text-field {
                width: 100%;
                min-height: 2.85rem;
                border-radius: 0.95rem;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                padding: 0.75rem 0.9rem;
                color: #0f172a;
                outline: none;
            }

            .textarea-field:focus {
                border-color: #0f172a;
            }

            .text-field:focus {
                border-color: #0f172a;
            }

            :host ::ng-deep .p-dialog {
                border-radius: 1.5rem;
                overflow: hidden;
            }
        `
    ]
})
export class DocumentStatusDialogComponent {
    private _visible = false;

    @Input()
    get visible() {
        return this._visible;
    }
    set visible(value: boolean) {
        this._visible = value;
        if (value) {
            this.submitted = false;
            this.remarks = this.mode === 'dispose' ? this.document?.disposal_remarks || '' : '';
            this.disposedByUserId = this.mode === 'dispose' ? this.currentUser?.user_id || '' : '';
            this.disposalAction = this.document?.disposal_action || 'Shred';
            this.disposalActionOther = this.document?.disposal_action_other || '';
        }
    }

    @Output() visibleChange = new EventEmitter<boolean>();

    @Input() document: DocumentSummary | null = null;
    @Input() mode: 'dispose' | 'restore' = 'dispose';
    @Input() saving = false;
    @Input() administrator = false;
    @Input() users: DocumentUserSummary[] = [];
    @Input() currentUser: DocumentUserSummary | null = null;

    @Output() save = new EventEmitter<{ action: 'dispose' | 'restore'; disposal_action: DisposalActionValue; disposal_action_other: string; disposal_remarks: string; disposed_by_user_id: string }>();

    submitted = false;
    remarks = '';
    disposedByUserId = '';
    disposalAction: DisposalActionValue = 'Shred';
    disposalActionOther = '';
    disposalActions: Array<{ value: DisposalActionValue; label: string }> = [
        { value: 'Shred', label: 'Shred' },
        { value: 'Scratch', label: 'Scratch' },
        { value: 'Reuse', label: 'Reuse' },
        { value: 'Other', label: 'Other' }
    ];

    get userOptions(): SearchableDropdownOption[] {
        const source = this.administrator ? this.users : this.currentUser ? [this.currentUser] : [];
        return source.map((user) => ({ label: `${user.firstname} ${user.lastname} — ${user.username}`.trim(), value: user.user_id }));
    }

    setDisposedByUser(value: SearchableDropdownValue) {
        this.disposedByUserId = value === null ? '' : String(value);
    }

    get nextStatusLabel() {
        return this.mode === 'dispose' ? 'Dispose document' : 'Restore document';
    }

    submit() {
        this.submitted = true;

        if (this.mode === 'dispose' && (!this.remarks.trim() || !this.disposedByUserId || (this.disposalAction === 'Other' && !this.disposalActionOther.trim()))) {
            return;
        }

        this.save.emit({
            action: this.mode,
            disposal_action: this.mode === 'dispose' ? this.disposalAction : 'Other',
            disposal_action_other: this.mode === 'dispose' ? this.disposalActionOther.trim() : '',
            disposal_remarks: this.mode === 'dispose' ? this.remarks.trim() : '',
            disposed_by_user_id: this.mode === 'dispose' ? this.disposedByUserId : '',
        });
    }

    close() {
        this.visible = false;
        this.visibleChange.emit(false);
    }

    handleHide() {
        this.close();
    }
}
