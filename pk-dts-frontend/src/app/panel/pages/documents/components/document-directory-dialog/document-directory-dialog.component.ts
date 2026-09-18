import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import {
    SearchableDropdownComponent,
    SearchableDropdownOption,
    SearchableDropdownValue
} from '@/app/shared/components/searchable-dropdown/searchable-dropdown.component';
import { SoftcopyCategoryReference } from '../../documents.types';

@Component({
    selector: 'app-document-directory-dialog',
    standalone: true,
    imports: [CommonModule, ButtonModule, DialogModule, SearchableDropdownComponent],
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
            [breakpoints]="{ '640px': '96vw' }"
            header="Change directory"
            (onHide)="close()"
        >
            <div class="directory-dialog-content">
                <div class="directory-context">
                    <span class="directory-context-icon"><i class="pi pi-folder-open"></i></span>
                    <span>
                        <small>Controlled file</small>
                        <strong>{{ documentNumber || 'Softcopy document' }}</strong>
                    </span>
                </div>

                <div class="directory-copy">
                    <h3>Move this file to another folder</h3>
                    <p>The controlled file and its revisions will be organized under the selected folder or subfolder.</p>
                </div>

                <div class="field">
                    <label for="directory-folder">Folder or subfolder <span>*</span></label>
                    <app-searchable-dropdown
                        inputId="directory-folder"
                        [value]="selectedCategoryId"
                        [options]="directoryOptions()"
                        placeholder="Select a folder or subfolder"
                        filterPlaceholder="Search folder or subfolder"
                        emptyMessage="No active folders available."
                        emptyFilterMessage="No matching folder found."
                        [showClear]="false"
                        [disabled]="saving"
                        [invalid]="submitted && !selectedCategoryId"
                        (valueChange)="selectCategory($event)"
                    />
                    <small *ngIf="submitted && !selectedCategoryId">A folder or subfolder is required.</small>
                </div>
            </div>

            <ng-template pTemplate="footer">
                <p-button label="Cancel" severity="secondary" text [disabled]="saving" (onClick)="close()" />
                <p-button label="Change directory" icon="pi pi-folder-open" [loading]="saving" (onClick)="submit()" />
            </ng-template>
        </p-dialog>
    `,
    styles: [
        `
            .directory-dialog-content { display: grid; gap: 1.25rem; padding-top: 0.25rem; }
            .directory-context { display: flex; align-items: center; gap: 0.85rem; padding: 0.9rem; border: 1px solid #e2e8f0; border-radius: 1rem; background: #f8fafc; }
            .directory-context-icon { display: grid; place-items: center; width: 2.6rem; height: 2.6rem; border-radius: 0.85rem; background: #fee2e2; color: #b91c1c; }
            .directory-context span:last-child { display: grid; gap: 0.18rem; min-width: 0; }
            .directory-context small { color: #64748b; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
            .directory-context strong { overflow: hidden; color: #0f172a; text-overflow: ellipsis; white-space: nowrap; }
            .directory-copy h3 { margin: 0; color: #0f172a; font-size: 1rem; }
            .directory-copy p { margin: 0.35rem 0 0; color: #64748b; line-height: 1.5; font-size: 0.86rem; }
            .field { display: grid; gap: 0.55rem; }
            .field label { color: #334155; font-size: 0.9rem; font-weight: 700; }
            .field label span, .field small { color: var(--brand-primary); }
            .field small { font-size: 0.8rem; font-weight: 600; }
            :host ::ng-deep .p-dialog { border-radius: 1.5rem; overflow: hidden; }
            :host ::ng-deep .p-dialog .p-dialog-header { padding: 1.35rem 1.5rem 1rem; border-bottom: 1px solid rgba(148, 163, 184, 0.15); background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); }
            :host ::ng-deep .p-dialog .p-dialog-content { padding: 1.5rem; background: #ffffff; }
            :host ::ng-deep .p-dialog .p-dialog-footer { padding: 0 1.5rem 1.5rem; background: #ffffff; border-top: none; }
        `
    ]
})
export class DocumentDirectoryDialogComponent {
    private _visible = false;

    @Input()
    get visible() {
        return this._visible;
    }
    set visible(value: boolean) {
        this._visible = value;
        if (value) {
            this.selectedCategoryId = this.currentCategoryId;
            this.submitted = false;
        }
    }

    @Output() visibleChange = new EventEmitter<boolean>();

    @Input() saving = false;
    @Input() documentNumber = '';
    @Input() currentCategoryId = '';
    @Input() softcopyCategories: SoftcopyCategoryReference[] = [];
    @Output() save = new EventEmitter<string>();

    selectedCategoryId = '';
    submitted = false;

    directoryOptions(): SearchableDropdownOption[] {
        const categories = new Map(this.softcopyCategories.map((category) => [category.softcopy_category_id, category]));
        return this.softcopyCategories
            .filter((category) => category.is_active !== false)
            .map((category) => ({
                value: category.softcopy_category_id,
                label: this.categoryPath(category, categories)
            }))
            .sort((left, right) => left.label.localeCompare(right.label));
    }

    selectCategory(value: SearchableDropdownValue) {
        this.selectedCategoryId = value === null ? '' : String(value);
    }

    submit() {
        this.submitted = true;
        if (!this.selectedCategoryId) return;
        this.save.emit(this.selectedCategoryId);
    }

    close() {
        if (this.saving) return;
        this.visible = false;
        this.visibleChange.emit(false);
    }

    private categoryPath(category: SoftcopyCategoryReference, categories: Map<string, SoftcopyCategoryReference>, seen = new Set<string>()): string {
        if (seen.has(category.softcopy_category_id)) return category.folder_name || category.category_name;
        seen.add(category.softcopy_category_id);
        const name = category.folder_name || category.category_name;
        const parent = category.parent_category_id ? categories.get(category.parent_category_id) : category.parent;
        return parent ? `${this.categoryPath(parent, categories, seen)} / ${name}` : name;
    }
}
