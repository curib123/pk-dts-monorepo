import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@/app/auth/auth.service';
import { StorageClassificationService } from '../storage-classification/storage-classification.service';
import { SoftcopyCategorySummary } from '../storage-classification/storage-classification.types';

@Component({
    selector: 'app-softcopy-folders-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <section class="folders-page">
            <header class="folders-heading">
                <div>
                    <span class="eyebrow">DOCUMENTS</span>
                    <h1>Softcopy Folders</h1>
                    <p>Browse the digital filing hierarchy available to your account. Folder actions appear only when your role has the matching permission.</p>
                </div>
                <button *ngIf="canCreate()" type="button" class="primary" (click)="beginCreate()"><i class="pi pi-plus"></i> New folder</button>
            </header>

            <div *ngIf="error()" class="feedback error"><i class="pi pi-exclamation-triangle"></i><span>{{ error() }}</span></div>
            <div *ngIf="message()" class="feedback success"><i class="pi pi-check-circle"></i><span>{{ message() }}</span></div>

            <section *ngIf="editorOpen()" class="editor-card">
                <div class="editor-copy">
                    <strong>{{ editingId() ? 'Rename or move folder' : 'Create folder' }}</strong>
                    <span>Choose an optional parent to place this folder inside another folder.</span>
                </div>
                <div class="editor-grid">
                    <label><span>Folder name</span><input [(ngModel)]="folderName" maxlength="150" placeholder="Example: Monitoring Forms" /></label>
                    <label><span>Parent folder</span><select [(ngModel)]="parentId"><option value="">Top level</option><option *ngFor="let category of parentOptions()" [value]="category.softcopy_category_id">{{ category.category_name }}</option></select></label>
                </div>
                <div class="editor-actions">
                    <button type="button" class="secondary" [disabled]="saving()" (click)="closeEditor()">Cancel</button>
                    <button type="button" class="primary" [disabled]="saving() || !folderName.trim()" (click)="saveFolder()"><i class="pi" [ngClass]="saving() ? 'pi-spin pi-spinner' : 'pi-save'"></i>{{ saving() ? 'Saving…' : 'Save folder' }}</button>
                </div>
            </section>

            <section class="folder-card">
                <div class="folder-toolbar">
                    <label class="search"><i class="pi pi-search"></i><input [(ngModel)]="search" placeholder="Search folders" /><button *ngIf="search" type="button" (click)="search=''" aria-label="Clear search"><i class="pi pi-times"></i></button></label>
                    <button type="button" class="refresh" (click)="load()" [disabled]="loading()"><i class="pi pi-refresh" [class.pi-spin]="loading()"></i> Refresh</button>
                </div>

                <div *ngIf="loading()" class="loading"><i class="pi pi-spin pi-spinner"></i> Loading folders…</div>

                <div *ngIf="!loading() && filteredCategories().length" class="folder-list">
                    <article *ngFor="let category of filteredCategories(); trackBy: trackCategory" class="folder-row">
                        <span class="folder-icon"><i class="pi pi-folder"></i></span>
                        <div class="folder-copy">
                            <strong>{{ category.category_name }}</strong>
                            <span>{{ parentLabel(category) }}</span>
                            <small>{{ category._count?.softcopies ?? 0 }} document(s) · {{ category._count?.subcategories ?? category.subcategories?.length ?? 0 }} subfolder(s)</small>
                        </div>
                        <span class="status" [class.inactive]="category.is_active === false">{{ category.is_active === false ? 'Inactive' : 'Active' }}</span>
                        <div class="row-actions">
                            <button *ngIf="canEdit()" type="button" class="icon-button" title="Edit folder" (click)="beginEdit(category)"><i class="pi pi-pencil"></i></button>
                            <button *ngIf="canDelete()" type="button" class="icon-button danger" title="Delete folder" (click)="requestDelete(category)"><i class="pi pi-trash"></i></button>
                        </div>
                    </article>
                </div>

                <div *ngIf="!loading() && !filteredCategories().length" class="empty-state"><i class="pi pi-folder-open"></i><strong>No folders found</strong><span>{{ search ? 'Try another folder name.' : 'No softcopy folders are available to this account.' }}</span></div>
            </section>

            <section *ngIf="pendingDelete()" class="delete-confirm" role="alert">
                <div><strong>Delete “{{ pendingDelete()!.category_name }}”?</strong><span>The server will block deletion when the folder still contains records or protected child folders.</span></div>
                <div><button type="button" class="secondary" (click)="pendingDelete.set(null)">Cancel</button><button type="button" class="danger-button" [disabled]="saving()" (click)="confirmDelete()">Delete folder</button></div>
            </section>
        </section>
    `,
    styles: [`
        :host{display:block}.folders-page{display:grid;gap:1rem;color:#172033}.folders-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;border-radius:1.25rem;background:#fff;padding:1.35rem 1.5rem;box-shadow:0 10px 30px rgba(15,23,42,.06)}.eyebrow{color:#0369a1;font-size:.68rem;font-weight:900;letter-spacing:.14em}.folders-heading h1{margin:.25rem 0 .35rem;font-size:1.8rem}.folders-heading p{max-width:48rem;margin:0;color:#64748b;font-size:.82rem;line-height:1.55}.primary,.secondary,.danger-button,.refresh,.icon-button{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;border:0;border-radius:.72rem;font-weight:850;cursor:pointer}.primary{background:#991b1b;color:#fff;padding:.7rem .9rem}.secondary,.refresh{background:#eef2f7;color:#475569;padding:.7rem .85rem}.danger-button{background:#b91c1c;color:#fff;padding:.7rem .85rem}.feedback,.loading{display:flex;align-items:center;gap:.6rem;border-radius:.8rem;padding:.8rem 1rem}.feedback.error{background:#fff1f2;color:#991b1b}.feedback.success{background:#ecfdf5;color:#166534}.editor-card,.folder-card,.delete-confirm{border-radius:1.25rem;background:#fff;padding:1.1rem 1.2rem;box-shadow:0 10px 30px rgba(15,23,42,.05)}.editor-card{display:grid;gap:.9rem}.editor-copy strong,.editor-copy span{display:block}.editor-copy span{margin-top:.2rem;color:#64748b;font-size:.76rem}.editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}.editor-grid label{display:grid;gap:.35rem}.editor-grid label span{color:#475569;font-size:.72rem;font-weight:800}.editor-grid input,.editor-grid select{width:100%;box-sizing:border-box;border:1px solid #dbe4ee;border-radius:.72rem;background:#f8fafc;padding:.72rem .75rem;color:#172033}.editor-actions{display:flex;justify-content:flex-end;gap:.6rem}.folder-card{display:grid;gap:.9rem}.folder-toolbar{display:flex;justify-content:space-between;gap:.75rem}.search{display:flex;align-items:center;gap:.5rem;min-width:min(28rem,75%);border-radius:.75rem;background:#f8fafc;padding:0 .75rem}.search i{color:#64748b}.search input{width:100%;height:2.7rem;border:0;background:transparent;outline:0}.search button{border:0;background:transparent;color:#64748b}.folder-list{display:grid;gap:.55rem}.folder-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:.8rem;border:1px solid #e7edf4;border-radius:.9rem;padding:.8rem .9rem}.folder-icon{display:grid;place-items:center;width:2.5rem;height:2.5rem;border-radius:.75rem;background:#eff6ff;color:#0369a1}.folder-copy strong,.folder-copy span,.folder-copy small{display:block}.folder-copy span{margin-top:.12rem;color:#64748b;font-size:.72rem}.folder-copy small{margin-top:.2rem;color:#94a3b8;font-size:.67rem}.status{border-radius:999px;background:#ecfdf5;padding:.3rem .55rem;color:#166534;font-size:.65rem;font-weight:850}.status.inactive{background:#f1f5f9;color:#64748b}.row-actions{display:flex;gap:.35rem}.icon-button{width:2.2rem;height:2.2rem;background:#f8fafc;color:#475569}.icon-button.danger{color:#b91c1c}.empty-state{display:grid;place-items:center;gap:.35rem;min-height:13rem;color:#64748b;text-align:center}.empty-state i{font-size:2rem;color:#94a3b8}.empty-state span{font-size:.76rem}.delete-confirm{display:flex;align-items:center;justify-content:space-between;gap:1rem;border:1px solid #fecaca;background:#fff7f7}.delete-confirm strong,.delete-confirm span{display:block}.delete-confirm span{margin-top:.2rem;color:#7f1d1d;font-size:.72rem}.delete-confirm>div:last-child{display:flex;gap:.5rem}.primary:disabled,.secondary:disabled,.danger-button:disabled,.refresh:disabled{cursor:not-allowed;opacity:.55}@media(max-width:720px){.folders-heading,.folder-toolbar,.delete-confirm{flex-direction:column}.editor-grid{grid-template-columns:1fr}.search{min-width:0;width:100%;box-sizing:border-box}.folder-row{grid-template-columns:auto 1fr}.status,.row-actions{grid-column:2}}
    `]
})
export class SoftcopyFoldersPage implements OnInit {
    private readonly storageApi = inject(StorageClassificationService);
    private readonly auth = inject(AuthService);

    categories = signal<SoftcopyCategorySummary[]>([]);
    loading = signal(true);
    saving = signal(false);
    error = signal('');
    message = signal('');
    editorOpen = signal(false);
    editingId = signal('');
    pendingDelete = signal<SoftcopyCategorySummary | null>(null);
    search = '';
    folderName = '';
    parentId = '';

    canCreate = computed(() => this.auth.hasAnyPermission('softcopy-folders.create', 'softcopy-folders.manage'));
    canEdit = computed(() => this.auth.hasAnyPermission('softcopy-folders.edit', 'softcopy-folders.manage'));
    canDelete = computed(() => this.auth.hasAnyPermission('softcopy-folders.delete', 'softcopy-folders.manage'));
    parentOptions = computed(() => this.categories().filter((category) => category.softcopy_category_id !== this.editingId()));

    ngOnInit() {
        this.load();
    }

    filteredCategories() {
        const query = this.search.trim().toLowerCase();
        if (!query) return this.categories();
        return this.categories().filter((category) =>
            category.category_name.toLowerCase().includes(query) || category.folder_name.toLowerCase().includes(query)
        );
    }

    load() {
        this.loading.set(true);
        this.error.set('');
        this.storageApi.listSoftcopyCategories(1, 1000).subscribe({
            next: (response) => {
                this.categories.set(response.items ?? []);
                this.loading.set(false);
            },
            error: (error) => {
                this.error.set(this.errorText(error));
                this.loading.set(false);
            }
        });
    }

    beginCreate() {
        if (!this.canCreate()) return;
        this.editingId.set('');
        this.folderName = '';
        this.parentId = '';
        this.editorOpen.set(true);
        this.clearFeedback();
    }

    beginEdit(category: SoftcopyCategorySummary) {
        if (!this.canEdit()) return;
        this.editingId.set(category.softcopy_category_id);
        this.folderName = category.category_name;
        this.parentId = category.parent_category_id ?? '';
        this.editorOpen.set(true);
        this.clearFeedback();
    }

    closeEditor() {
        this.editorOpen.set(false);
        this.editingId.set('');
        this.folderName = '';
        this.parentId = '';
    }

    saveFolder() {
        const name = this.folderName.trim();
        if (!name || this.saving()) return;
        const id = this.editingId();
        this.saving.set(true);
        this.clearFeedback();
        const request = id
            ? this.storageApi.updateSoftcopyCategory(id, { category_name: name, parent_category_id: this.parentId })
            : this.storageApi.createSoftcopyCategory({ category_name: name, parent_category_id: this.parentId || undefined });
        request.subscribe({
            next: () => {
                this.saving.set(false);
                this.message.set(id ? 'Folder updated.' : 'Folder created.');
                this.closeEditor();
                this.load();
            },
            error: (error) => {
                this.error.set(this.errorText(error));
                this.saving.set(false);
            }
        });
    }

    requestDelete(category: SoftcopyCategorySummary) {
        if (!this.canDelete()) return;
        this.pendingDelete.set(category);
        this.clearFeedback();
    }

    confirmDelete() {
        const category = this.pendingDelete();
        if (!category || this.saving()) return;
        this.saving.set(true);
        this.storageApi.deleteSoftcopyCategory(category.softcopy_category_id).subscribe({
            next: () => {
                this.pendingDelete.set(null);
                this.saving.set(false);
                this.message.set('Folder deleted.');
                this.load();
            },
            error: (error) => {
                this.error.set(this.errorText(error));
                this.saving.set(false);
            }
        });
    }

    parentLabel(category: SoftcopyCategorySummary) {
        if (category.parent?.category_name) return `Inside ${category.parent.category_name}`;
        if (!category.parent_category_id) return 'Top-level folder';
        const parent = this.categories().find((candidate) => candidate.softcopy_category_id === category.parent_category_id);
        return parent ? `Inside ${parent.category_name}` : 'Nested folder';
    }

    trackCategory = (_index: number, category: SoftcopyCategorySummary) => category.softcopy_category_id;

    private clearFeedback() {
        this.error.set('');
        this.message.set('');
    }

    private errorText(error: unknown) {
        const value = error as { error?: { message?: string | string[] }; message?: string };
        const message = value?.error?.message;
        return Array.isArray(message) ? message.join(' ') : message || value?.message || 'The folder operation failed.';
    }
}
