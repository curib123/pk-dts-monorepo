import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { AuthService } from '@/app/auth/auth.service';
import { SearchableDropdownComponent, SearchableDropdownOption, SearchableDropdownValue } from '@/app/shared/components/searchable-dropdown/searchable-dropdown.component';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import { DocumentsService } from '../documents/documents.service';
import { DocumentSummary, LocationReference, SequenceReference } from '../documents/documents.types';
import { HardcopyTransfersService } from './hardcopy-transfers.service';
import { CreateHardcopyTransferPayload, HardcopyTransfer, TransferWorkflowStep } from './hardcopy-transfers.types';

type TransferAction = 'approve' | 'return' | 'reject' | 'complete';

@Component({
    selector: 'app-hardcopy-transfers-page',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, DialogModule, SearchableDropdownComponent],
    template: `
        <section class="transfer-page">
            <header class="page-heading">
                <div><span class="eyebrow">HARDcopy CONTROL</span><h1>{{ reviewerMode ? 'Hardcopy Transfer Review' : 'Hardcopy Transfer Requests' }}</h1><p>{{ reviewerMode ? 'Review only the transfer stage assigned to your account.' : 'Request and confirm the physical movement of approved hardcopy documents.' }}</p></div>
                <button *ngIf="!reviewerMode" type="button" class="primary" (click)="formOpen = !formOpen"><i class="pi pi-plus"></i> New transfer request</button>
            </header>

            <div *ngIf="error()" class="feedback error"><i class="pi pi-exclamation-triangle"></i>{{ error() }}</div>
            <div *ngIf="message()" class="feedback success"><i class="pi pi-check-circle"></i>{{ message() }}</div>

            <section *ngIf="!reviewerMode && formOpen" class="surface-card request-form">
                <div class="section-heading"><div><span class="eyebrow">NEW REQUEST</span><h2>Move a hardcopy document</h2></div><button type="button" class="quiet" (click)="formOpen = false">Close</button></div>
                <div class="form-grid">
                    <label class="wide"><span>Document title</span><app-searchable-dropdown inputId="hardcopy-transfer-document" [value]="form.document_id" [options]="documentOptions()" placeholder="Select an approved hardcopy document" filterPlaceholder="Search document titles" emptyMessage="No approved hardcopy documents available." emptyFilterMessage="No matching document title found." [loading]="referenceLoading" [disabled]="saving" [showClear]="false" (valueChange)="selectDocument($event)" /></label>
                    <label><span>Destination location</span><app-searchable-dropdown inputId="hardcopy-transfer-location" [value]="form.destination_location_id" [options]="locationOptions()" placeholder="Select destination location" filterPlaceholder="Search locations" emptyMessage="No destination locations available." emptyFilterMessage="No matching location found." [loading]="referenceLoading" [disabled]="saving" [showClear]="true" (valueChange)="selectDestinationLocation($event)" /></label>
                    <div class="derived-field"><span>Destination area</span><strong>{{ selectedDestinationAreaName() }}</strong><small>From the selected location</small></div>
                    <div class="derived-field"><span>Destination specific</span><strong>{{ selectedDestinationSpecificName() }}</strong><small>From the selected location</small></div>
                    <label><span>Destination sequence</span><app-searchable-dropdown inputId="hardcopy-transfer-sequence" [value]="form.destination_sequence_id || ''" [options]="sequenceOptions()" placeholder="Select sequence (optional)" filterPlaceholder="Search sequences" emptyMessage="No sequences available." emptyFilterMessage="No matching sequence found." [loading]="referenceLoading" [disabled]="saving" [showClear]="true" (valueChange)="selectDestinationSequence($event)" /></label>
                    <label><span>Transfer destination location</span><app-searchable-dropdown inputId="hardcopy-transfer-destination" [value]="transferDestinationValue" [options]="locationOptions()" placeholder="Select transfer location (optional)" filterPlaceholder="Search transfer locations" emptyMessage="No transfer locations available." emptyFilterMessage="No matching transfer location found." [loading]="referenceLoading" [disabled]="saving" [showClear]="true" (valueChange)="selectTransferDestination($event)" /></label>
                    <label class="wide"><span>Reason</span><textarea [(ngModel)]="form.reason" rows="3" maxlength="2000" placeholder="Why must this hardcopy be moved?"></textarea></label>
                </div>
                <div class="form-actions"><button type="button" class="quiet" (click)="resetForm()">Clear</button><button type="button" class="primary" [disabled]="saving || !canSubmitForm()" (click)="create()"><i class="pi" [ngClass]="saving ? 'pi-spin pi-spinner' : 'pi-send'"></i>{{ saving ? 'Submitting…' : 'Create request' }}</button></div>
            </section>

            <section class="surface-card transfer-list">
                <div class="list-heading"><div><span class="eyebrow">{{ reviewerMode ? 'ASSIGNED QUEUE' : 'MY WORK' }}</span><h2>{{ transfers().length }} transfer{{ transfers().length === 1 ? '' : 's' }}</h2></div><button type="button" class="quiet" [disabled]="loading" (click)="load()"><i class="pi pi-refresh" [class.pi-spin]="loading"></i> Refresh</button></div>
                <div *ngIf="loading" class="empty"><i class="pi pi-spin pi-spinner"></i> Loading transfers…</div>
                <div *ngIf="!loading && !transfers().length" class="empty"><i class="pi pi-inbox"></i><strong>{{ reviewerMode ? 'No assigned transfers' : 'No transfer requests yet' }}</strong><span>{{ reviewerMode ? 'New requests will appear when a workflow stage is assigned to you.' : 'Create a request from an approved hardcopy document when it needs to move.' }}</span></div>
                <article *ngFor="let transfer of transfers(); trackBy: trackTransfer" class="transfer-card">
                    <div class="transfer-card-head"><div><span class="eyebrow">TRANSFER #{{ transfer.transfer_request_id }}</span><h3>{{ transfer.document?.document_title || 'Hardcopy document ' + transfer.document_id }}</h3><p>{{ transfer.transfer_to || destinationLabel(transfer) }}</p></div><span class="status" [attr.data-status]="transfer.status">{{ statusLabel(transfer.status) }}</span></div>
                    <div class="route-summary"><div><span>Current owner</span><strong>{{ currentOwner(transfer) }}</strong></div><div><span>Workflow</span><strong>{{ transfer.workflow_name || 'Awaiting submission' }}<small *ngIf="transfer.workflow_version">Version {{ transfer.workflow_version }}</small></strong></div><div><span>Destination</span><strong>{{ destinationLabel(transfer) }}</strong></div></div>
                    <div *ngIf="transfer.workflow_steps?.length" class="timeline"><div *ngFor="let step of transfer.workflow_steps; trackBy: trackStep" class="timeline-step" [class.active]="step.status === 'PENDING'" [class.done]="step.status === 'APPROVED'"><span class="timeline-marker"><i class="pi" [ngClass]="step.status === 'APPROVED' ? 'pi-check' : step.status === 'PENDING' ? 'pi-clock' : 'pi-minus'"></i></span><div><strong>{{ step.stage_label }}</strong><small>{{ step.assigned_user_name_snapshot }} · {{ step.status }}</small></div></div></div>
                    <div class="transfer-actions"><button *ngIf="transfer.status === 'Draft' && !reviewerMode" type="button" class="primary" (click)="runAction(transfer, 'approve', 'submit')">Submit for approval</button><button *ngIf="transfer.status === 'Returned' && !reviewerMode" type="button" class="primary" (click)="runAction(transfer, 'approve', 'resubmit')">Resubmit</button><button *ngIf="transfer.status === 'ForTransfer' && !reviewerMode && isRequester(transfer)" type="button" class="primary" (click)="openAction(transfer, 'complete')">Complete physical transfer</button><button *ngIf="canReview(transfer)" type="button" class="primary" (click)="openAction(transfer, 'approve')">Approve</button><button *ngIf="canReview(transfer)" type="button" class="outline" (click)="openAction(transfer, 'return')">Return for revision</button><button *ngIf="canReview(transfer)" type="button" class="danger" (click)="openAction(transfer, 'reject')">Reject</button></div>
                </article>
            </section>

            <p-dialog [(visible)]="actionModal" [modal]="true" [closable]="false" [draggable]="false" header="Transfer decision" styleClass="remarks-dialog"><div class="remarks-form"><p>{{ actionDescription() }}</p><label><span>Remarks <b>*</b></span><textarea [(ngModel)]="remarks" rows="5" maxlength="2000" autofocus placeholder="Explain the decision or physical transfer confirmation"></textarea></label><div class="form-actions"><button type="button" class="quiet" (click)="closeAction()">Cancel</button><button type="button" [class.danger]="pendingAction === 'return' || pendingAction === 'reject'" class="primary" [disabled]="saving || !remarks.trim()" (click)="confirmAction()">{{ actionLabel() }}</button></div></div></p-dialog>
        </section>
    `,
    styles: [`:host{display:block}.transfer-page{display:grid;gap:1rem;color:#172033}.page-heading,.surface-card{border:1px solid #e5eaf0;border-radius:1.25rem;background:#fff;padding:1.25rem 1.4rem;box-shadow:0 10px 30px rgba(15,23,42,.05)}.page-heading{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.eyebrow{color:var(--brand-primary-deep);font-size:.67rem;font-weight:900;letter-spacing:.14em}.page-heading h1,.section-heading h2,.list-heading h2{margin:.28rem 0 .35rem;color:#172033}.page-heading p,.transfer-card-head p{margin:0;color:#64748b;line-height:1.5}.primary,.quiet,.outline,.danger{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;border:0;border-radius:.72rem;padding:.7rem .9rem;font-weight:850;cursor:pointer}.primary{background:var(--brand-primary-deep);color:#fff}.quiet{background:#eef2f7;color:#475569}.outline{border:1px solid var(--brand-primary);background:#fff;color:var(--brand-primary-deep)}.danger{background:var(--brand-primary);color:#fff}.primary:disabled,.quiet:disabled{opacity:.55;cursor:not-allowed}.feedback{display:flex;gap:.55rem;align-items:center;border-radius:.8rem;padding:.85rem 1rem}.feedback.error{background:var(--brand-soft);color:var(--brand-primary-deep)}.feedback.success{background:#ecfdf5;color:#166534}.request-form,.transfer-list{display:grid;gap:1rem}.section-heading,.list-heading,.transfer-card-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.form-grid label,.remarks-form label,.derived-field{display:grid;gap:.35rem}.form-grid label span,.remarks-form label span,.route-summary span,.derived-field>span{font-size:.72rem;color:#475569;font-weight:800}.form-grid input,.form-grid textarea,.remarks-form textarea{width:100%;box-sizing:border-box;border:1px solid #dbe3ec;border-radius:.7rem;background:#f8fafc;color:#172033;padding:.7rem;font:inherit}.derived-field{min-height:2.75rem;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:.7rem;background:#f8fafc;padding:.55rem .7rem}.derived-field strong{color:#334155;font-size:.86rem}.derived-field small{color:#94a3b8;font-size:.68rem}.wide{grid-column:1/-1}.form-actions{display:flex;justify-content:flex-end;gap:.55rem}.transfer-card{display:grid;gap:.9rem;border:1px solid #e5eaf0;border-radius:1rem;padding:1rem}.transfer-card h3{margin:.3rem 0 .25rem;color:#172033}.status{display:inline-flex;border-radius:999px;padding:.38rem .65rem;background:#eef2f7;color:#475569;font-size:.7rem;font-weight:900;white-space:nowrap}.status[data-status=ForApproval]{background:#fff7ed;color:#9a3412}.status[data-status=ForTransfer]{background:#eff6ff;color:#1d4ed8}.status[data-status=Completed]{background:#ecfdf5;color:#166534}.status[data-status=Returned],.status[data-status=Rejected]{background:var(--brand-soft);color:var(--brand-primary-deep)}.route-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem;border-radius:.8rem;background:#f8fafc;padding:.75rem}.route-summary strong,.route-summary small{display:block;margin-top:.2rem}.route-summary small{font-size:.67rem;color:#64748b;font-weight:500}.timeline{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.6rem}.timeline-step{display:flex;gap:.5rem;align-items:flex-start;color:#94a3b8}.timeline-step.active{color:#9a3412}.timeline-step.done{color:#166534}.timeline-marker{display:grid;place-items:center;flex:0 0 1.55rem;height:1.55rem;border-radius:50%;background:#eef2f7}.timeline-step strong,.timeline-step small{display:block}.timeline-step strong{font-size:.74rem;color:#334155}.timeline-step small{margin-top:.18rem;font-size:.65rem}.transfer-actions{display:flex;justify-content:flex-end;gap:.5rem;flex-wrap:wrap}.empty{display:grid;place-items:center;gap:.35rem;min-height:9rem;color:#64748b;text-align:center}.empty i{font-size:1.8rem;color:#94a3b8}.remarks-form{display:grid;gap:.9rem;min-width:min(34rem,70vw)}.remarks-form p{margin:0;color:#64748b;line-height:1.5}.remarks-form b{color:var(--brand-primary)}@media(max-width:720px){.page-heading,.section-heading,.list-heading,.transfer-card-head{flex-direction:column}.form-grid,.route-summary,.timeline{grid-template-columns:1fr}.wide{grid-column:auto}.transfer-actions{justify-content:stretch}.transfer-actions>*{flex:1 1 100%}}`]
})
export class HardcopyTransfersPage implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly service = inject(HardcopyTransfersService);
    private readonly auth = inject(AuthService);
    private readonly alerts = inject(AlertDialogService);
    private readonly documentsService = inject(DocumentsService);

    reviewerMode = false;
    loading = true;
    saving = false;
    formOpen = false;
    actionModal = false;
    pendingTransfer: HardcopyTransfer | null = null;
    pendingAction: TransferAction | null = null;
    remarks = '';
    transfers = signal<HardcopyTransfer[]>([]);
    documents = signal<DocumentSummary[]>([]);
    locations = signal<LocationReference[]>([]);
    sequences = signal<SequenceReference[]>([]);
    referenceLoading = false;
    error = signal('');
    message = signal('');
    form: CreateHardcopyTransferPayload = { document_id: '', destination_location_id: '', reason: '' };

    ngOnInit() {
        this.reviewerMode = this.route.snapshot.data['mode'] === 'reviewer';
        const documentId = this.route.snapshot.queryParamMap.get('document');
        if (!this.reviewerMode && documentId) {
            this.form.document_id = documentId;
            this.formOpen = true;
        }
        if (!this.reviewerMode) this.loadReferenceData();
        this.load();
    }

    loadReferenceData() {
        this.referenceLoading = true;
        this.documentsService.listDocuments().subscribe({
            next: documents => this.documents.set((documents ?? []).filter(document => document.document_type === 'HARDCOPY' && !!document.hardcopy && ['Approved', 'Completed'].includes(document.status || ''))),
            error: error => this.error.set(this.errorText(error))
        });
        this.documentsService.listLocations().subscribe({
            next: locations => { this.locations.set((locations ?? []).filter(location => location.is_active !== false)); this.referenceLoading = false; },
            error: error => { this.referenceLoading = false; this.error.set(this.errorText(error)); }
        });
        this.documentsService.listSequences().subscribe({
            next: sequences => this.sequences.set(sequences ?? []),
            error: error => this.error.set(this.errorText(error))
        });
    }

    load() {
        this.loading = true;
        this.error.set('');
        const request = this.reviewerMode ? this.service.listPending() : this.service.listMine();
        request.subscribe({ next: items => { this.transfers.set(items ?? []); this.loading = false; }, error: error => { this.error.set(this.errorText(error)); this.loading = false; } });
    }

    create() {
        if (!this.canSubmitForm() || this.saving) return;
        this.saving = true;
        this.service.create({ ...this.form, document_id: this.form.document_id.trim(), destination_location_id: this.form.destination_location_id.trim(), reason: this.form.reason.trim(), transfer_to: this.form.transfer_to?.trim() || undefined }).subscribe({
            next: () => { this.saving = false; this.formOpen = false; this.message.set('Transfer request created. Submit it when the destination details are ready.'); this.resetForm(); this.load(); },
            error: error => { this.saving = false; this.error.set(this.errorText(error)); }
        });
    }

    runAction(transfer: HardcopyTransfer, _displayAction: TransferAction, action: 'submit' | 'resubmit') {
        if (this.saving) return;
        this.saving = true;
        this.service.action(transfer.transfer_request_id, action).subscribe({ next: () => { this.saving = false; this.message.set(action === 'submit' ? 'Transfer submitted for approval.' : 'Transfer resubmitted for approval.'); this.load(); }, error: error => { this.saving = false; this.error.set(this.errorText(error)); } });
    }

    openAction(transfer: HardcopyTransfer, action: TransferAction) {
        this.pendingTransfer = transfer;
        this.pendingAction = action;
        this.remarks = '';
        this.error.set('');
        this.actionModal = true;
    }

    confirmAction() {
        if (!this.pendingTransfer || !this.pendingAction || !this.remarks.trim() || this.saving) return;
        this.saving = true;
        const action = this.pendingAction;
        this.service.action(this.pendingTransfer.transfer_request_id, action, this.remarks.trim()).subscribe({
            next: () => { this.saving = false; this.closeAction(); this.message.set(`${this.actionLabel()} completed.`); this.load(); },
            error: error => { this.saving = false; this.error.set(this.errorText(error)); }
        });
    }

    closeAction() { this.actionModal = false; this.pendingTransfer = null; this.pendingAction = null; this.remarks = ''; }
    resetForm() { this.form = { document_id: '', destination_location_id: '', reason: '' }; this.transferDestinationId = ''; }
    canSubmitForm() { return !!this.form.document_id.trim() && !!this.form.destination_location_id.trim() && !!this.form.reason.trim(); }
    documentOptions(): SearchableDropdownOption[] { return this.documents().map(document => ({ label: document.document_title, value: document.document_id })); }
    locationOptions(): SearchableDropdownOption[] { return this.locations().map(location => ({ label: [location.location_code, location.location_name].filter(Boolean).join(' · '), value: location.location_id })); }
    sequenceOptions(): SearchableDropdownOption[] { return this.sequences().map(sequence => ({ label: sequence.sequence_code, value: sequence.sequence_id })); }
    get transferDestinationValue() { return this.transferDestinationId; }
    private transferDestinationId = '';
    selectDocument(value: SearchableDropdownValue) { this.form.document_id = value === null ? '' : String(value); }
    selectDestinationLocation(value: SearchableDropdownValue) {
        this.form.destination_location_id = value === null ? '' : String(value);
        const location = this.selectedDestinationLocation();
        const specific = location?.specific;
        this.form.destination_area_id = specific?.area?.area_id || '';
        this.form.destination_specific_id = specific?.specific_id || location?.specific_id || '';
    }
    selectDestinationSequence(value: SearchableDropdownValue) { this.form.destination_sequence_id = value === null ? '' : String(value); }
    selectTransferDestination(value: SearchableDropdownValue) {
        this.transferDestinationId = value === null ? '' : String(value);
        const location = this.locations().find(item => item.location_id === this.transferDestinationId);
        this.form.transfer_to = location?.location_name || '';
    }
    selectedDestinationLocation() { return this.locations().find(location => location.location_id === this.form.destination_location_id); }
    selectedDestinationAreaName() { return this.selectedDestinationLocation()?.specific?.area?.area_name || 'Will be derived from location'; }
    selectedDestinationSpecificName() { return this.selectedDestinationLocation()?.specific?.specific_name || 'Will be derived from location'; }
    isRequester(transfer: HardcopyTransfer) { return transfer.requested_by_user_id === this.auth.user()?.user_id; }
    canReview(transfer: HardcopyTransfer) { const step = transfer.current_workflow_step || transfer.workflow_steps?.find(item => item.status === 'PENDING'); return this.reviewerMode && transfer.status === 'ForApproval' && step?.assigned_user_id === this.auth.user()?.user_id; }
    currentOwner(transfer: HardcopyTransfer) { const step = transfer.current_workflow_step || transfer.workflow_steps?.find(item => item.status === 'PENDING'); return step?.assigned_user_name_snapshot || (transfer.status === 'ForTransfer' ? 'Requester' : 'Not assigned'); }
    destinationLabel(transfer: HardcopyTransfer) { return [transfer.destination_area?.area_name, transfer.destination_location?.location_name, transfer.destination_sequence?.sequence_code].filter(Boolean).join(' / ') || 'Destination pending'; }
    statusLabel(status: HardcopyTransfer['status']) { return status.replace(/([a-z])([A-Z])/g, '$1 $2'); }
    actionLabel() { return this.pendingAction === 'approve' ? 'Approve' : this.pendingAction === 'return' ? 'Return for revision' : this.pendingAction === 'reject' ? 'Reject' : 'Confirm physical transfer'; }
    actionDescription() { return this.pendingAction === 'return' ? 'Explain what the requester must correct before resubmission.' : this.pendingAction === 'complete' ? 'Confirm that the hardcopy was physically moved to the destination shown on this request.' : 'Add the required decision remark for the audit trail.'; }
    trackTransfer(_index: number, transfer: HardcopyTransfer) { return transfer.transfer_request_id; }
    trackStep(_index: number, step: TransferWorkflowStep) { return step.workflow_step_id; }
    private errorText(error: any) { const message = error?.error?.message || error?.message; return Array.isArray(message) ? message.join(' ') : message || 'Unable to load or update hardcopy transfers.'; }
}
