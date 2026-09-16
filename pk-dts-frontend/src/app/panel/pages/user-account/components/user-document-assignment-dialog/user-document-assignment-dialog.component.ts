import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { UserAccountSummary, UserDocumentAssignmentOption } from '../../user-account.types';

type AssignmentGroupKind = 'folder' | 'area' | 'location' | 'specific' | 'asset' | 'sequence';

@Component({
    selector: 'app-user-document-assignment-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, DialogModule],
    template: `
        <p-dialog [(visible)]="visible" [modal]="true" [draggable]="false" [resizable]="false" [dismissableMask]="!saving" [style]="{ width: '52rem', maxWidth: '96vw' }" header="Assign documents to user" (onHide)="close()">
            <div class="assignment-dialog">
                <div class="person-card">
                    <span class="person-icon"><i class="pi pi-user"></i></span>
                    <div><strong>{{ fullName() }}</strong><span>{{ user?.username }}</span></div>
                    <span class="count-pill">{{ selected.size }} assigned</span>
                </div>

                <section class="group-assignment">
                    <div class="group-heading"><div><strong>Auto-assign by document group</strong><span>Select a storage classification or softcopy folder. Parent folders include every nested subfolder.</span></div><span class="match-count">{{ groupDocuments().length }} matches</span></div>
                    <div class="group-controls">
                        <select [(ngModel)]="groupKind" (ngModelChange)="groupValue = ''">
                            <option value="folder">Softcopy folder / subfolder</option>
                            <option value="area">Hardcopy area</option>
                            <option value="location">Hardcopy location</option>
                            <option value="specific">Hardcopy specific</option>
                            <option value="asset">Hardcopy asset number</option>
                            <option value="sequence">Hardcopy sequence</option>
                        </select>
                        <select [(ngModel)]="groupValue">
                            <option value="">Select {{ groupKindLabel() }}</option>
                            <option *ngFor="let option of groupOptions(); trackBy: trackGroup" [value]="option.value">{{ option.label }} ({{ option.count }})</option>
                        </select>
                        <button type="button" class="group-add" [disabled]="!groupValue" (click)="assignGroup()"><i class="pi pi-plus"></i> Assign group</button>
                        <button type="button" class="group-clear" [disabled]="!groupValue" (click)="clearGroup()">Clear group</button>
                    </div>
                </section>

                <div class="toolbar">
                    <div class="search-box"><i class="pi pi-search"></i><input type="search" [(ngModel)]="search" placeholder="Search document number or title" /></div>
                    <select [(ngModel)]="type"><option value="">All types</option><option value="HARDCOPY">Hardcopy</option><option value="SOFTCOPY">Softcopy</option></select>
                    <label class="assigned-filter"><input type="checkbox" [(ngModel)]="assignedOnly" /> Assigned only</label>
                </div>

                <div class="selection-tools">
                    <span>{{ filteredDocuments().length }} document{{ filteredDocuments().length === 1 ? '' : 's' }} shown</span>
                    <div><button type="button" (click)="selectFiltered()">Select shown</button><button type="button" (click)="clearFiltered()">Clear shown</button></div>
                </div>

                <div *ngIf="loading" class="state"><i class="pi pi-spin pi-spinner"></i><strong>Loading documents</strong></div>
                <div *ngIf="!loading && error" class="state error"><i class="pi pi-exclamation-circle"></i><strong>{{ error }}</strong></div>
                <div *ngIf="!loading && !error" class="document-list">
                    <label *ngFor="let document of filteredDocuments(); trackBy: trackDocument" class="document-option" [class.selected]="selected.has(document.document_id)">
                        <input type="checkbox" [checked]="selected.has(document.document_id)" (change)="toggle(document.document_id)" />
                        <span class="type-icon" [class.softcopy]="document.document_type === 'SOFTCOPY'"><i class="pi" [ngClass]="document.document_type === 'SOFTCOPY' ? 'pi-file' : 'pi-box'"></i></span>
                        <span class="document-copy"><strong>{{ document.document_type === 'HARDCOPY' ? 'Hardcopy record' : (document.document_number || 'No document number') }}</strong><span>{{ document.document_title }}</span></span>
                        <span class="document-meta"><strong>{{ document.document_type }}</strong><small>{{ documentGroupLabel(document) }}</small><small>{{ statusLabel(document.status) }}</small></span>
                    </label>
                    <div *ngIf="!filteredDocuments().length" class="state"><i class="pi pi-search"></i><strong>No matching documents</strong></div>
                </div>
            </div>
            <ng-template pTemplate="footer"><p-button label="Cancel" severity="secondary" [outlined]="true" [disabled]="saving" (onClick)="close()" /><p-button label="Save document access" icon="pi pi-check" [loading]="saving" [disabled]="loading || !!error" (onClick)="save.emit(selectedIds())" /></ng-template>
        </p-dialog>
    `,
    styles: [`
        .assignment-dialog{display:grid;gap:1rem}.person-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:.8rem;border:1px solid var(--brand-border);border-radius:1rem;background:var(--brand-soft);padding:.85rem}.person-icon{display:grid;place-items:center;width:2.6rem;height:2.6rem;border-radius:.75rem;background:var(--brand-primary-deep);color:#fff}.person-card strong,.person-card span{display:block}.person-card>div>span{margin-top:.15rem;color:#64748b;font-size:.78rem}.count-pill{border-radius:999px;background:#fff;padding:.35rem .6rem;color:var(--brand-primary-deep);font-size:.7rem;font-weight:900}.group-assignment{display:grid;gap:.65rem;border:1px solid #bfdbfe;border-radius:.9rem;background:#eff6ff;padding:.75rem}.group-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.group-heading strong,.group-heading span{display:block}.group-heading strong{color:#172033;font-size:.82rem}.group-heading div>span{margin-top:.15rem;color:#64748b;font-size:.7rem}.match-count{border-radius:999px;background:#fff;padding:.25rem .5rem;color:#1d4ed8;font-size:.67rem;font-weight:900;white-space:nowrap}.group-controls{display:grid;grid-template-columns:11rem minmax(12rem,1fr) auto auto;gap:.45rem}.group-controls select,.group-controls button{min-height:2.35rem;border:1px solid #cbd5e1;border-radius:.65rem;padding:0 .6rem;font-size:.72rem}.group-controls select{background:#fff;color:#172033}.group-controls button{font-weight:850;cursor:pointer}.group-controls button:disabled{cursor:not-allowed;opacity:.45}.group-add{border-color:var(--brand-primary-deep)!important;background:var(--brand-primary-deep);color:#fff}.group-clear{background:#fff;color:var(--brand-primary-deep)}.toolbar{display:grid;grid-template-columns:minmax(0,1fr) 9rem auto;gap:.65rem;align-items:center}.search-box{display:flex;align-items:center;gap:.55rem;border:1px solid #cbd5e1;border-radius:.75rem;background:#fff;padding:0 .7rem}.search-box i{color:var(--brand-primary-deep)}.search-box input,.toolbar select{width:100%;height:2.65rem;border:0;outline:0;background:transparent}.toolbar select{border:1px solid #cbd5e1;border-radius:.75rem;padding:0 .6rem}.assigned-filter{display:flex;align-items:center;gap:.4rem;color:#475569;font-size:.78rem;font-weight:800;white-space:nowrap}.selection-tools{display:flex;align-items:center;justify-content:space-between;gap:1rem;color:#64748b;font-size:.75rem}.selection-tools div{display:flex;gap:.35rem}.selection-tools button{border:0;background:transparent;color:var(--brand-primary-deep);font-weight:900;cursor:pointer}.document-list{overflow-y:auto;display:grid;gap:.45rem;max-height:20rem;padding-right:.2rem}.document-option{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;align-items:center;gap:.7rem;border:1px solid #e2e8f0;border-radius:.85rem;background:#fff;padding:.7rem;cursor:pointer}.document-option:hover,.document-option.selected{border-color:var(--brand-border);background:var(--brand-soft)}.type-icon{display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:.65rem;background:#fef3c7;color:#92400e}.type-icon.softcopy{background:#dbeafe;color:#1d4ed8}.document-copy{min-width:0}.document-copy strong,.document-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.document-copy strong{color:#0f172a;font-size:.8rem}.document-copy span{margin-top:.15rem;color:#64748b;font-size:.74rem}.document-meta{text-align:right}.document-meta strong,.document-meta small{display:block}.document-meta strong{color:#334155;font-size:.65rem}.document-meta small{margin-top:.15rem;color:#64748b}.state{display:grid;place-items:center;gap:.4rem;min-height:8rem;color:#64748b;text-align:center}.state i{color:var(--brand-primary-deep);font-size:1.4rem}.state.error{color:var(--brand-primary)}@media(max-width:760px){.group-controls{grid-template-columns:1fr 1fr}.toolbar{grid-template-columns:1fr}.person-card{grid-template-columns:auto 1fr}.count-pill{grid-column:1/-1;width:max-content}}@media(max-width:640px){.group-controls{grid-template-columns:1fr}.document-option{grid-template-columns:auto auto minmax(0,1fr)}.document-meta{grid-column:2/-1;text-align:left}}
    `]
})
export class UserDocumentAssignmentDialogComponent {
    @Input() visible = false;
    @Output() visibleChange = new EventEmitter<boolean>();
    @Input() user: UserAccountSummary | null = null;
    @Input() documents: UserDocumentAssignmentOption[] = [];
    @Input() loading = false;
    @Input() saving = false;
    @Input() error = '';
    @Output() save = new EventEmitter<string[]>();
    search = '';
    type: '' | 'HARDCOPY' | 'SOFTCOPY' = '';
    assignedOnly = false;
    selected = new Set<string>();
    groupKind: AssignmentGroupKind = 'folder';
    groupValue = '';

    initialize(documents: UserDocumentAssignmentOption[]) { this.documents = documents; this.selected = new Set(documents.filter((document) => document.assigned).map((document) => document.document_id)); this.groupValue=''; }
    filteredDocuments() { const term=this.search.trim().toLowerCase(); return this.documents.filter((document)=>(!term||`${document.document_number ?? ''} ${document.document_title}`.toLowerCase().includes(term))&&(!this.type||document.document_type===this.type)&&(!this.assignedOnly||this.selected.has(document.document_id))); }
    toggle(id: string) { const next=new Set(this.selected); next.has(id)?next.delete(id):next.add(id); this.selected=next; }
    selectFiltered() { this.selected=new Set([...this.selected,...this.filteredDocuments().map((document)=>document.document_id)]); }
    clearFiltered() { const filtered=new Set(this.filteredDocuments().map((document)=>document.document_id)); this.selected=new Set([...this.selected].filter((id)=>!filtered.has(id))); }
    groupOptions() {
        const counts = new Map<string, { label: string; count: number }>();
        for (const document of this.documents) {
            const group = this.documentGroup(document, this.groupKind);
            if (!group) continue;
            const existing = counts.get(group.value);
            counts.set(group.value, { label: group.label, count: (existing?.count ?? 0) + 1 });
        }
        return [...counts.entries()].map(([value, item]) => ({ value, ...item })).sort((a,b)=>a.label.localeCompare(b.label));
    }
    groupDocuments() {
        if (!this.groupValue) return [];
        return this.documents.filter((document) => {
            const group = this.documentGroup(document, this.groupKind);
            if (!group) return false;
            return this.groupKind === 'folder'
                ? group.value === this.groupValue || group.value.startsWith(`${this.groupValue}/`)
                : group.value === this.groupValue;
        });
    }
    assignGroup() { this.selected=new Set([...this.selected,...this.groupDocuments().map((document)=>document.document_id)]); }
    clearGroup() { const ids=new Set(this.groupDocuments().map((document)=>document.document_id)); this.selected=new Set([...this.selected].filter((id)=>!ids.has(id))); }
    groupKindLabel() { return ({folder:'folder',area:'area',location:'location',specific:'specific classification',asset:'asset number',sequence:'sequence'} as Record<AssignmentGroupKind,string>)[this.groupKind]; }
    documentGroupLabel(document: UserDocumentAssignmentOption) { return document.document_type==='SOFTCOPY' ? document.softcopy?.category?.folder_name || 'Uncategorized' : [document.hardcopy?.area?.area_name,document.hardcopy?.location?.location_name].filter(Boolean).join(' / ') || 'Unclassified'; }
    trackGroup=(_index:number,group:{value:string})=>group.value;
    selectedIds() { return [...this.selected]; }
    fullName() { return [this.user?.firstname,this.user?.middlename,this.user?.lastname].filter(Boolean).join(' '); }
    statusLabel(status: string) { return ({Draft:'Draft',PendingApproval:'Pending Approval',ForNotedBy:'For Noted By',ForPlantManagerApproval:'For Plant Manager Approval',ForDocumentControllerAdmin:'For Document Controller/Admin Approval',ForApproval:'For Approval',Approved:'Approved — Pending Release',Completed:'Completed / Released',ForRevision:'For Revision',ReturnedForCorrection:'For Revision',Rejected:'Rejected',Cancelled:'Cancelled',Disposed:'Disposed'} as Record<string,string>)[status]||status.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' '); }
    trackDocument=(_index:number,document:UserDocumentAssignmentOption)=>document.document_id;
    close() { if(this.saving)return; this.visible=false; this.visibleChange.emit(false); }

    private documentGroup(document: UserDocumentAssignmentOption, kind: AssignmentGroupKind) {
        if (kind === 'folder') { const value=document.softcopy?.category?.folder_name; return value ? { value, label:value.split('/').join(' / ') } : null; }
        const source = document.hardcopy;
        const values = {
            area: source?.area ? { value:source.area.area_id,label:source.area.area_name } : null,
            location: source?.location ? { value:source.location.location_id,label:source.location.location_name } : null,
            specific: source?.specific ? { value:source.specific.specific_id,label:source.specific.specific_name } : null,
            asset: source?.asset ? { value:source.asset.asset_id,label:source.asset.asset_number } : null,
            sequence: source?.sequence ? { value:source.sequence.sequence_id,label:source.sequence.sequence_code } : null
        };
        return values[kind];
    }
}
