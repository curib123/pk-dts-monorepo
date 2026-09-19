import { DocumentDetailDialogComponent } from "../documents/components/document-detail-dialog/document-detail-dialog.component";
import { DocumentDetail } from "../documents/documents.types";
import { Subscription, finalize } from "rxjs";
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ConfirmationDialogComponent } from '@/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { LoadingShimmerComponent } from '@/app/shared/components/loading-shimmer/loading-shimmer.component';
import { DataViewMode, DataViewSwitchComponent } from '@/app/shared/components/data-view-switch/data-view-switch.component';
import { RecordCardComponent, RecordGridComponent } from '@/app/shared/components/record-grid/record-grid.component';
import { DocumentsService } from '../documents/documents.service';
import { DisposalRequestSummary, DocumentSummary } from '../documents/documents.types';
import { AuthService } from '@/app/auth/auth.service';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { WorkspacePageComponent, WorkspaceTabsComponent } from '@/app/shared/components/workspace-ui/workspace-ui.component';

@Component({
    selector: 'app-approval-review-page', standalone: true, imports: [WorkspacePageComponent, WorkspaceTabsComponent, DocumentDetailDialogComponent, CommonModule, FormsModule, ButtonModule, DialogModule, InputTextModule, TableModule, DataViewSwitchComponent, RecordGridComponent, RecordCardComponent, ConfirmationDialogComponent, LoadingShimmerComponent],
    template: `<app-workspace-page><app-loading-shimmer *ngIf="loading" label="Loading approval requests" [columns]="6" />
    <app-document-detail-dialog *ngIf="viewDocumentDetail" [(visible)]="viewVisible" [document]="viewDocumentDetail" [loading]="!!viewLoadingId" [revisions]="viewDocumentDetail.softcopy?.revisions || []" [canAccessFiles]="true" />
    <section class="review-page" [style.display]="loading ? 'none' : null">
    <div class="feedback error" *ngIf="errorMessage()">{{errorMessage()}}</div>
    <app-workspace-tabs ariaLabel="Approval type"><button type="button" [class.active]="activeTab === 'documents'" (click)="activeTab='documents'"><i class="pi pi-file-check"></i> Document Approvals <span>{{requests().length}}</span></button><button *ngIf="canReviewDisposals()" type="button" [class.active]="activeTab === 'disposals'" (click)="activeTab='disposals'"><i class="pi pi-trash"></i> Disposal Approvals <span>{{disposalRequests().length}}</span></button></app-workspace-tabs>
    <ng-container *ngIf="activeTab === 'documents'">
    <app-data-view-switch [(mode)]="viewMode" title="Document approval results" />
    <p-table *ngIf="viewMode === 'list'" [value]="requests()" [loading]="loading" responsiveLayout="scroll"><ng-template pTemplate="header"><tr><th>Document</th><th>Approval stage</th><th>Created by</th><th>Requester</th><th>Submitted</th><th>Decision</th></tr></ng-template>
    <ng-template pTemplate="body" let-item><tr><td><strong>{{item.document_type === 'HARDCOPY' ? item.document_title : (item.document_number || 'No document number')}}</strong><small *ngIf="item.source_document_id">Hardcopy edit request · Source #{{item.source_document_id}}</small><small *ngIf="!item.source_document_id">{{item.document_title}}</small></td><td><span class="stage-pill">{{stageLabel(item)}}</span></td><td>{{name(item.creator)}}</td><td>{{item.requested_by_name || name(item.requester)}}</td><td>{{item.updated_at || item.created_at | date:'medium'}}</td><td class="actions"><p-button label="View" icon="pi pi-eye" size="small" [outlined]="true" (onClick)="viewDocument(item)" /><p-button *ngIf="item.status === 'Approved' && canComplete()" label="Complete / Release" icon="pi pi-send" size="small" severity="success" [disabled]="acting" (onClick)="openDecision(item,'complete')"/><ng-container *ngIf="item.status !== 'Approved'"><p-button *ngIf="canApprove(item)" label="Approve" size="small" [disabled]="acting" (onClick)="openDecision(item,'approve')"/><p-button *ngIf="canRequestRevision(item)" label="Return for revision" size="small" [outlined]="true" [disabled]="acting" (onClick)="openDecision(item,'request-revision')"/><p-button *ngIf="canReject(item)" label="Reject" size="small" severity="danger" [disabled]="acting" (onClick)="openDecision(item,'reject')"/></ng-container></td></tr></ng-template>
    <ng-template pTemplate="emptymessage"><tr><td colspan="6">No requests are awaiting approval.</td></tr></ng-template></p-table>
    <app-record-grid *ngIf="viewMode === 'grid'" [empty]="!requests().length && !loading" emptyTitle="No pending approvals" emptyMessage="No requests are awaiting approval.">
        <app-record-card *ngFor="let item of requests()" icon="pi pi-verified" [eyebrow]="item.source_document_id ? 'Hardcopy edit request' : 'Approval request'" [title]="item.document_type === 'HARDCOPY' ? item.document_title : (item.document_number || 'No document number')" [subtitle]="item.source_document_id ? 'Proposed changes to controlled Hardcopy #' + item.source_document_id : item.document_title">
            <div record-details>
                <div><span>Created by</span><strong>{{name(item.creator)}}</strong></div>
                <div><span>Requester</span><strong>{{item.requested_by_name || name(item.requester)}}</strong></div>
                <div class="wide"><span>Submitted</span><strong>{{requestUpdatedAt(item) | date:'medium'}}</strong></div>
                <div class="wide"><span>Stage</span><strong>{{stageLabel(item)}}</strong></div>
            </div>
            <div record-actions><p-button label="View" icon="pi pi-eye" size="small" [outlined]="true" (onClick)="viewDocument(item)" />
                <p-button *ngIf="item.status === 'Approved' && canComplete()" label="Complete / Release" icon="pi pi-send" size="small" severity="success" [disabled]="acting" (onClick)="openDecision(item,'complete')"/>
                <ng-container *ngIf="item.status !== 'Approved'"><p-button *ngIf="canApprove(item)" label="Approve" size="small" [disabled]="acting" (onClick)="openDecision(item,'approve')"/>
                <p-button *ngIf="canRequestRevision(item)" label="Return for revision" size="small" [outlined]="true" [disabled]="acting" (onClick)="openDecision(item,'request-revision')"/>
                <p-button *ngIf="canReject(item)" label="Reject" size="small" severity="danger" [disabled]="acting" (onClick)="openDecision(item,'reject')"/></ng-container>
            </div>
        </app-record-card>
    </app-record-grid></ng-container>
    <div *ngIf="activeTab === 'disposals'" class="disposal-queue"><h2>Disposal Approval Requests</h2><p>Administrators can review the complete pending, approved, and rejected disposal history.</p><p-table [value]="disposalRequests()" responsiveLayout="scroll"><ng-template pTemplate="header"><tr><th>Document</th><th>Action</th><th>Requested by</th><th>Reason</th><th>Status</th><th>Requested</th><th>Decision</th></tr></ng-template><ng-template pTemplate="body" let-item><tr><td><strong>{{item.document.document_type === 'HARDCOPY' ? item.document.document_title : (item.document.document_number || 'No document number')}}</strong><small>{{item.document.document_title}}</small></td><td><strong>{{item.disposal_action}}</strong><small *ngIf="item.disposal_action_other">{{item.disposal_action_other}}</small></td><td>{{name(item.requester)}}<small>{{item.requester.username || ''}}</small></td><td>{{item.disposal_remarks}}</td><td><strong>{{item.status}}</strong><small *ngIf="item.reviewer">Reviewed by {{name(item.reviewer)}}</small><small *ngIf="item.reviewer_remarks">{{item.reviewer_remarks}}</small></td><td>{{item.created_at | date:'medium'}}<small *ngIf="item.reviewed_at">Reviewed {{item.reviewed_at | date:'medium'}}</small></td><td><ng-container *ngIf="item.status === 'Pending'; else reviewComplete"><input pInputText #disposalRemarks placeholder="Optional remarks" /><div class="actions"><p-button label="Approve disposal" size="small" severity="success" [disabled]="acting" (onClick)="openDisposalDecision(item,'approve',disposalRemarks.value)"/><p-button label="Reject" size="small" severity="danger" [outlined]="true" [disabled]="acting" (onClick)="openDisposalDecision(item,'reject',disposalRemarks.value)"/></div></ng-container><ng-template #reviewComplete><span>Review complete</span></ng-template></td></tr></ng-template><ng-template pTemplate="emptymessage"><tr><td colspan="7">No disposal request records found.</td></tr></ng-template></p-table></div></section>
    <p-dialog [(visible)]="decisionRemarkVisible" [modal]="true" [closable]="false" [draggable]="false" [resizable]="false" [header]="decisionRemarkTitle()" styleClass="return-remark-dialog">
        <div class="return-remark-content">
            <p>{{decisionRemarkDescription()}}</p>
            <label for="decision-remark">Remarks *</label>
            <textarea id="decision-remark" data-decision-remark [(ngModel)]="decisionRemark" rows="5" maxlength="2000" autofocus [placeholder]="pendingDecision?.action === 'request-revision' ? 'Explain the correction needed...' : 'Explain the decision...'" ></textarea>
            <small>Required and recorded with your name.</small>
            <div class="return-remark-actions">
                <p-button label="Cancel" severity="secondary" [outlined]="true" [disabled]="acting" (onClick)="clearDecision()" />
                <p-button [label]="actionText(pendingDecision?.action)" icon="pi pi-check" [disabled]="acting || !decisionRemark.trim()" (onClick)="submitDecisionRemark()" />
            </div>
        </div>
    </p-dialog>
    <app-confirmation-dialog [(visible)]="disposalDecisionVisible" [title]="pendingDisposalDecision?.action === 'approve' ? 'Approve disposal?' : 'Reject disposal request?'" [message]="disposalDecisionMessage()" [confirmLabel]="pendingDisposalDecision?.action === 'approve' ? 'Approve disposal' : 'Reject request'" [tone]="pendingDisposalDecision?.action === 'approve' ? 'primary' : 'danger'" (confirm)="confirmDisposalDecision()" (cancel)="clearDisposalDecision()" /></app-workspace-page>`,
    styles:[`.review-page{display:grid;gap:1.25rem}header,p-table,.disposal-queue{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:1.4rem}header{border-left:6px solid var(--brand-primary)}header span{color:var(--brand-primary);font-size:.72rem;font-weight:800;letter-spacing:.14em}h1{margin:.25rem 0;color:#111827}h2{margin:0 0 .35rem}p{margin:0;color:#64748b}.workflow-tabs{display:flex;gap:.65rem;flex-wrap:wrap;padding:.4rem;border-radius:16px;background:#f1f5f9;width:max-content;max-width:100%}.workflow-tabs button{border:0;background:transparent;border-radius:12px;padding:.8rem 1rem;font-weight:800;color:#64748b;cursor:pointer}.workflow-tabs button.active{background:#fff;color:var(--brand-primary);box-shadow:0 4px 14px rgba(15,23,42,.09)}.workflow-tabs button span{margin-left:.45rem;padding:.15rem .45rem;border-radius:999px;background:#e2e8f0;color:#475569;font-size:.72rem}td small{display:block;color:#64748b}.stage-pill{display:inline-block;border-radius:999px;background:#fff7ed;color:#9a3412;padding:.35rem .6rem;font-size:.74rem;font-weight:800;white-space:nowrap}.actions{display:flex;gap:.4rem;flex-wrap:wrap}.return-remark-content{display:grid;gap:.7rem;min-width:min(32rem,70vw)}.return-remark-content p{line-height:1.5}.return-remark-content label{color:#334155;font-size:.8rem;font-weight:800}.return-remark-content label span{color:var(--brand-primary)}.return-remark-content textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:.75rem;background:#fff;padding:.75rem;color:#172033;font:inherit;resize:vertical}.return-remark-content textarea:focus{border-color:var(--brand-primary);outline:2px solid var(--brand-soft)}.return-remark-content small{color:#64748b}.return-remark-actions{display:flex;justify-content:flex-end;gap:.5rem;margin-top:.35rem}.feedback{border-radius:12px;padding:.85rem 1rem;font-weight:600}.feedback.error{background:var(--brand-soft);color:var(--brand-primary-deep);border:1px solid var(--brand-border)}:host-context(.app-dark) header,:host-context(.app-dark) p-table,:host-context(.app-dark) .disposal-queue{border-color:#333;background:#171717;color:#e5e5e5}:host-context(.app-dark) h1{color:#f5f5f5}:host-context(.app-dark) p,:host-context(.app-dark) td small{color:#a3a3a3}:host-context(.app-dark) ::ng-deep .p-datatable,:host-context(.app-dark) ::ng-deep .p-datatable-table,:host-context(.app-dark) ::ng-deep .p-datatable-tbody>tr,:host-context(.app-dark) ::ng-deep .p-datatable-tbody>tr>td{border-color:#333!important;background:#171717!important;color:#e5e5e5!important}:host-context(.app-dark) ::ng-deep .p-datatable-thead>tr>th{background:#101010!important;color:#d4d4d4!important}:host-context(.app-dark) ::ng-deep input.p-inputtext{border-color:#3f3f46!important;background:#101010!important;color:#f5f5f5!important}:host-context(.app-dark) ::ng-deep input.p-inputtext::placeholder{color:#737373!important}:host-context(.app-dark) ::ng-deep .return-remark-dialog .p-dialog-content,:host-context(.app-dark) ::ng-deep .return-remark-dialog .p-dialog-header{border-color:#333!important;background:#171717!important;color:#f5f5f5!important}:host-context(.app-dark) ::ng-deep .return-remark-content label{color:#f5f5f5}:host-context(.app-dark) ::ng-deep .return-remark-content textarea{border-color:#3f3f46;background:#101010;color:#f5f5f5}`]
})
export class ApprovalReviewPage implements OnInit, OnDestroy {
    private documents=inject(DocumentsService); private auth=inject(AuthService); private alerts=inject(AlertDialogService); private systemSettings=inject(SystemSettingsService); requests=signal<DocumentSummary[]>([]); disposalRequests=signal<DisposalRequestSummary[]>([]); errorMessage=signal(''); loading=true; acting=false; decisionRemarkVisible=false; disposalDecisionVisible=false; activeTab:'documents'|'disposals'='documents'; viewMode: DataViewMode = 'list';
    viewDocumentDetail: DocumentDetail | null = null;
    viewVisible = false;
    viewLoadingId = '';
    private viewRequest?: Subscription;
    ngOnDestroy() { this.viewRequest?.unsubscribe(); }
    viewDocument(item: DocumentSummary) {
        this.viewRequest?.unsubscribe();
        this.viewDocumentDetail = item;
        this.viewVisible = true;
        this.viewLoadingId = item.document_id;
        this.errorMessage.set('');
        this.viewRequest = this.documents.getApprovalDocument(item.document_id).pipe(
            finalize(() => {
                if (this.viewLoadingId === item.document_id) this.viewLoadingId = '';
            })
        ).subscribe({
            next: detail => {
                if (this.viewLoadingId === item.document_id) this.viewDocumentDetail = detail;
            },
            error: error => {
                const message = error?.error?.message;
                this.errorMessage.set(Array.isArray(message) ? message.join(' ') : message || 'The approval summary is available, but the full document details could not be loaded.');
            }
        });
    }
    canApprove=(item: DocumentSummary)=>this.canActOnStep(item); canRequestRevision=(item: DocumentSummary)=>item.workflow_version_id ? this.canActOnStep(item) : this.isAssignedWorkflowStep(item) || this.auth.hasPermission('document-requests.request-revision'); canReject=(item: DocumentSummary)=>item.workflow_version_id ? this.canActOnStep(item) : this.auth.hasPermission('document-requests.reject'); canComplete=()=>this.auth.hasPermission('document-requests.complete');
    stageLabel(item: DocumentSummary) { return item.workflow_steps?.find(step => step.status === 'PENDING')?.stage_label || this.statusLabel(item.status); }
    private canActOnStep(item: DocumentSummary) {
        const step = item.workflow_steps?.find(step => step.status === 'PENDING');
        if (!step || step.assignee?.user_id !== this.auth.user()?.user_id || item.creator?.user_id === this.auth.user()?.user_id) return false;
        if (step.stage === 'NOTED_BY' && step.assignment_source === 'REQUESTER_LEADER' && step.required_permission === 'document-requests.approve-noted-by') return true;
        return !step.required_permission || this.auth.hasPermission(step.required_permission);
    }
    private isAssignedWorkflowStep(item: DocumentSummary) {
        const step = item.workflow_steps?.find(step => step.status === 'PENDING');
        return !!step && step.assignee?.user_id === this.auth.user()?.user_id && item.creator?.user_id !== this.auth.user()?.user_id;
    }
    statusLabel(status: DocumentSummary['status']) { return status ? (({ Draft: 'Draft', PendingApproval: 'Pending Approval', ForNotedBy: 'For Noted By', ForPlantManagerApproval: 'For Plant Manager Approval', ForDocumentControllerAdmin: 'For Document Controller/Admin Approval', ForApproval: 'For Approval', Approved: 'Approved — Pending Release', Completed: 'Completed / Released', ForRevision: 'For Revision', ReturnedForCorrection: 'For Revision', Rejected: 'Rejected', Cancelled: 'Cancelled', Disposed: 'Disposed' } as Record<string, string>)[status] || status.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')) : 'Unknown stage'; }
    pendingDecision: {item: DocumentSummary; action: 'approve'|'request-revision'|'reject'|'complete'; remarks: string} | null = null;
    pendingDisposalDecision:{item:DisposalRequestSummary;action:'approve'|'reject';remarks:string}|null=null;
    canReviewDisposals=()=>this.auth.isAdministrator()&&this.auth.hasAnyPermission('document-disposal.review','document-disposal.manage');
    ngOnInit(){this.viewMode=this.systemSettings.defaultDataView();this.load();}
    load(showLoading=this.requests().length===0&&(!this.canReviewDisposals()||this.disposalRequests().length===0)){this.loading=showLoading;this.documents.listPendingRequests().subscribe({next:x=>{this.requests.set(x);this.loading=false},error:(error)=>{this.loading=false;this.errorMessage.set(error?.error?.message || "Unable to load the approval queue.")}});if(this.canReviewDisposals())this.documents.listDisposalRequests().subscribe({next:x=>this.disposalRequests.set(x??[]),error:()=>this.disposalRequests.set([])});}
    decisionRemark = '';
    openDecision(item:DocumentSummary,action:'approve'|'request-revision'|'reject'|'complete'){this.errorMessage.set('');this.pendingDecision={item,action,remarks:''};this.decisionRemark='';this.decisionRemarkVisible=true;}
    submitDecisionRemark(){const decision=this.pendingDecision;const remarks=this.decisionRemark.trim();if(!decision||!remarks)return;decision.remarks=remarks;this.decisionRemarkVisible=false;this.confirmDecision();}
    confirmDecision(){const decision=this.pendingDecision;if(!decision||this.acting)return;this.acting=true;this.documents.workflowAction(decision.item.document_id,decision.action,decision.remarks).subscribe({next:()=>{this.requests.update(items=>items.filter(item=>item.document_id!==decision.item.document_id));this.acting=false;this.clearDecision();this.alerts.success('Request updated',`${decision.item.document_number || decision.item.document_title} was ${this.actionOutcome(decision.action)} successfully.`);this.load(false);},error:(error)=>{this.acting=false;const message=error?.error?.message;this.errorMessage.set(Array.isArray(message)?message.join(' '):message||`Unable to ${this.actionText(decision.action).toLowerCase()} this request.`);this.decisionRemarkVisible=true;}});}
    clearDecision(){this.pendingDecision=null;this.decisionRemark='';this.decisionRemarkVisible=false;}
    decisionRemarkTitle(){return 'Document decision';}
    decisionRemarkDescription(){return 'Add the required decision remark for the audit trail.';}
    openDisposalDecision(item:DisposalRequestSummary,action:'approve'|'reject',remarks:string){this.pendingDisposalDecision={item,action,remarks};this.disposalDecisionVisible=true;}
    confirmDisposalDecision(){const decision=this.pendingDisposalDecision;if(!decision||this.acting)return;this.acting=true;this.documents.reviewDisposalRequest(decision.item.disposal_request_id,decision.action,decision.remarks).subscribe({next:()=>{this.acting=false;this.clearDisposalDecision();this.alerts.success(decision.action==='approve'?'Disposal approved':'Disposal rejected',`${decision.item.document.document_number||decision.item.document.document_title} was ${decision.action==='approve'?'disposed':'not disposed'}.`);this.load(false);},error:()=>{this.acting=false;this.errorMessage.set('Unable to review this disposal request.');}});}
    clearDisposalDecision(){this.pendingDisposalDecision=null;this.disposalDecisionVisible=false;}
    disposalDecisionMessage(){const decision=this.pendingDisposalDecision;return `Confirm that you want to ${decision?.action==='approve'?'approve disposal of':'reject the disposal request for'} ${decision?.item.document.document_number||'this document'}.`;}
    actionText(action?:'approve'|'request-revision'|'reject'|'complete'){return action==='approve'?'Approve':action==='complete'?'Complete / Release':action==='request-revision'?'Return for revision':'Reject';}
    private actionOutcome(action:'approve'|'request-revision'|'reject'|'complete'){return action==='approve'?'approved':action==='complete'?'completed and released':action==='request-revision'?'returned for revision':'rejected';}
    requestUpdatedAt(item:DocumentSummary){return (item as DocumentSummary & {updated_at?:string}).updated_at||item.created_at;}
    name(user:DocumentSummary['creator']){return [user?.firstname,user?.lastname].filter(Boolean).join(' ')||'Unknown';}
}
