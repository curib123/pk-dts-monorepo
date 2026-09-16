import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { BatchSoftcopyFolderImportResponse } from '../../documents.types';

@Component({
    selector: 'app-softcopy-folder-upload-dialog',
    standalone: true,
    imports: [CommonModule, ButtonModule, DialogModule],
    template: `
        <p-dialog [(visible)]="visible" [modal]="true" [draggable]="false" [resizable]="false" [focusOnShow]="false" [appendTo]="'body'" [style]="{ width: '58rem', maxWidth: '95vw' }" header="Upload softcopy folder" (onHide)="close()">
            <div class="folder-upload-shell">
                <section class="folder-help">
                    <i class="pi pi-folder-open"></i>
                    <div><strong>Select one folder</strong><span>Every file becomes an approved softcopy document. Folder levels become categories, and the document number and title are read from supported file contents.</span></div>
                </section>
                <label class="folder-picker">
                    <input type="file" multiple webkitdirectory directory (change)="selectFolder($event)" [disabled]="saving" />
                    <i class="pi pi-cloud-upload"></i>
                    <strong>{{ files.length ? rootFolder : 'Choose a folder' }}</strong>
                    <span>{{ files.length ? files.length + ' file(s) · ' + totalSizeLabel : 'No file-count or file-size limit.' }}</span>
                </label>
                <div class="validation" *ngIf="validationMessage"><i class="pi pi-exclamation-triangle"></i>{{ validationMessage }}</div>
                <div class="folder-summary" *ngIf="files.length">
                    <div><span>Files</span><strong>{{ files.length }}</strong></div>
                    <div><span>Folders/categories</span><strong>{{ folderCount }}</strong></div>
                    <div><span>Total size</span><strong>{{ totalSizeLabel }}</strong></div>
                </div>
                <div class="progress" *ngIf="saving"><span [style.width.%]="progress"></span></div>
                <div class="result" *ngIf="result">
                    <strong>Import complete</strong>
                    <span>{{ result.summary.created }} created · {{ result.summary.errors }} failed</span>
                    <div class="result-list" *ngIf="result.summary.errors">
                        <div *ngFor="let row of errorRows"><strong>{{ row.relative_path }}</strong><span>{{ row.message }}</span></div>
                    </div>
                </div>
            </div>
            <ng-template pTemplate="footer">
                <p-button label="Cancel" severity="secondary" [outlined]="true" [disabled]="saving" (onClick)="close()" />
                <p-button label="Upload folder" icon="pi pi-upload" [loading]="saving" [disabled]="!files.length || !!validationMessage" (onClick)="submit()" />
            </ng-template>
        </p-dialog>
    `,
    styles: [`
        .folder-upload-shell{display:grid;gap:1rem}.folder-help,.folder-summary,.result{border:1px solid #e5e7eb;border-radius:1rem;background:#f8fafc;padding:1rem}.folder-help{display:flex;gap:.9rem;align-items:center}.folder-help>i{font-size:1.6rem;color:var(--dts-accent)}.folder-help div{display:grid;gap:.25rem}.folder-help span,.folder-picker span,.result>span,.result-list span{color:#64748b;font-size:.86rem}.folder-picker{min-height:12rem;border:2px dashed color-mix(in srgb,var(--dts-accent) 40%,#cbd5e1);border-radius:1.2rem;background:color-mix(in srgb,var(--dts-accent-soft) 28%,#fff);display:grid;place-items:center;align-content:center;gap:.5rem;cursor:pointer;text-align:center}.folder-picker input{display:none}.folder-picker>i{font-size:2.2rem;color:var(--dts-accent)}.folder-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem}.folder-summary div{display:grid;gap:.25rem}.folder-summary span{font-size:.72rem;text-transform:uppercase;color:#64748b}.folder-summary strong{font-size:1.15rem}.validation{display:flex;gap:.5rem;border:1px solid var(--brand-border);border-radius:.8rem;background:var(--brand-soft);color:var(--brand-primary-deep);padding:.75rem}.progress{height:.55rem;border-radius:999px;background:#e5e7eb;overflow:hidden}.progress span{display:block;height:100%;background:linear-gradient(90deg,var(--dts-accent),var(--dts-accent-deep));transition:width .2s}.result{display:grid;gap:.35rem}.result-list{max-height:10rem;overflow:auto;display:grid;gap:.5rem;margin-top:.5rem}.result-list div{display:grid;padding:.6rem;border-radius:.6rem;background:#fff}@media(max-width:640px){.folder-summary{grid-template-columns:1fr}}
    `]
})
export class SoftcopyFolderUploadDialogComponent {
    @Input() visible = false;
    @Input() saving = false;
    @Input() progress = 0;
    @Input() result: BatchSoftcopyFolderImportResponse | null = null;
    @Output() visibleChange = new EventEmitter<boolean>();
    @Output() upload = new EventEmitter<{ files: File[]; relativePaths: string[] }>();
    files: File[] = [];
    relativePaths: string[] = [];
    validationMessage = '';
    rootFolder = '';
    folderCount = 0;
    totalSizeLabel = '0 B';

    get errorRows() { return this.result?.results.filter((row) => row.status === 'error') ?? []; }
    selectFolder(event: Event) {
        const selected = Array.from((event.target as HTMLInputElement).files ?? []);
        this.validationMessage = '';
        this.files = selected;
        this.relativePaths = this.files.map((file) => file.webkitRelativePath || file.name);
        this.rootFolder = this.relativePaths[0]?.split('/')[0] || '';
        this.folderCount = new Set(this.relativePaths.map((path) => path.split('/').slice(0, -1).join('/'))).size;
        this.totalSizeLabel = this.formatBytes(this.files.reduce((total, file) => total + file.size, 0));
    }
    submit() { if (this.files.length && !this.validationMessage) this.upload.emit({ files: this.files, relativePaths: this.relativePaths }); }
    close() { if (this.saving) return; this.visible = false; this.visibleChange.emit(false); }
    private formatBytes(bytes: number) { if (!bytes) return '0 B'; const units = ['B', 'KB', 'MB', 'GB']; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
}
