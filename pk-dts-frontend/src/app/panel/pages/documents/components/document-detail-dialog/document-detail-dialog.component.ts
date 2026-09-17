import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, inject, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TabsModule } from 'primeng/tabs';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { SoftcopyAttachmentSummary, DocumentDetail, DocumentUserSummary, DocumentWorkflowStepSummary, RevisionSummary } from '../../documents.types';
import { DocumentsService } from '../../documents.service';

type PreviewKind = 'idle' | 'loading' | 'image' | 'pdf' | 'office' | 'unsupported' | 'error';

@Component({
    selector: 'app-document-detail-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, DialogModule, TabsModule],
    template: `
        <p-dialog
            [(visible)]="visible"
            [modal]="true"
            [draggable]="false"
            [resizable]="false"
            [dismissableMask]="true"
            [blockScroll]="true"
            [focusOnShow]="true"
            styleClass="document-details-dialog"
            [appendTo]="'body'"
            [style]="{ width: '66rem', maxWidth: '96vw' }"
            [breakpoints]="{ '1100px': '95vw', '640px': '98vw' }"
            header="Document Details"
            (onHide)="handleHide()"
        >
            <ng-container *ngIf="document">
                <div class="document-detail-shell" [class.document-detail-softcopy]="document.document_type === 'SOFTCOPY'">
                <div class="document-hero" [class.hardcopy]="document.document_type === 'HARDCOPY'">
                    <div class="hero-icon"><i [class]="document.document_type === 'SOFTCOPY' ? 'pi pi-file' : 'pi pi-box'"></i></div>
                    <div class="hero-copy">
                        <div class="hero-kicker">{{ document.document_type === 'SOFTCOPY' ? 'Digital document' : 'Physical document' }}</div>
                        <h2>{{ document.document_title }}</h2>
                        <div class="hero-meta">
                            <span *ngIf="document.document_type === 'SOFTCOPY'"><i class="pi pi-hashtag"></i>{{ document.document_number || 'No document number' }}</span>
                            <span><i class="pi pi-calendar" aria-hidden="true"></i>Created {{ formatDate(document.created_at) }}</span>
                        </div>
                    </div>
                    <div class="hero-badges">
                        <span class="status-badge" [attr.data-status]="document.status">{{ statusLabel(document.status) }}</span>
                    </div>
                </div>

                <div class="summary-strip" aria-label="Document ownership and access">
                    <div class="summary-card"><span class="summary-card-icon"><i class="pi pi-user"></i></span><div><span>Created by</span><strong>{{ fullName(document.creator) || 'Unknown' }}</strong></div></div>
                    <div *ngIf="hasRequester()" class="summary-card"><span class="summary-card-icon"><i class="pi pi-send"></i></span><div><span>Requested by</span><strong>{{ document.requested_by_name || fullName(document.requester) }}</strong></div></div>
                    <div *ngIf="document.assignments?.length" class="summary-card"><span class="summary-card-icon"><i class="pi pi-users"></i></span><div><span>Access assignment</span><strong [title]="assignmentUsersLabel()">{{ assignmentUsersLabel() }}</strong><small>{{ assignmentActorLabel() }}</small></div></div>
                    <div *ngIf="document.document_type === 'SOFTCOPY' && document.softcopy?.current_revision?.revision_number" class="summary-card"><span class="summary-card-icon accent"><i class="pi pi-history"></i></span><div><span>Current revision</span><strong>{{ document.softcopy?.current_revision?.revision_number }}</strong></div></div>
                </div>

                <p-tabs [(value)]="activeTab" class="detail-tabs">
                    <p-tablist aria-label="Document sections">
                        <p-tab value="overview"><i class="pi pi-info-circle" aria-hidden="true"></i>Overview</p-tab>
                        <p-tab value="workflow"><i class="pi pi-sitemap" aria-hidden="true"></i>Workflow<span class="tab-count">{{ document.workflow_steps?.length || 0 }}</span></p-tab>
                        <p-tab value="files"><i class="pi pi-folder" aria-hidden="true"></i>Files<span class="tab-count">{{ revisions.length + documentAttachments().length }}</span></p-tab>
                    </p-tablist>
                    <p-tabpanels>
                        <p-tabpanel value="overview">
                <div class="workspace-grid single-column">
                    <section class="info-panel storage-panel">
                        <div class="section-heading">
                            <span class="section-icon"><i class="pi pi-info-circle"></i></span>
                            <div><span>Record overview</span><h3>{{ document.document_type === 'SOFTCOPY' ? 'Current file' : 'Storage location' }}</h3><small class="section-subtitle">{{ document.document_type === 'SOFTCOPY' ? 'Preview or download the current revision.' : 'Use these references to locate the physical document.' }}</small></div>
                        </div>

                        <div *ngIf="document.document_type === 'SOFTCOPY'; else hardcopyInformation" class="digital-visual">
                            <dl class="storage-fields" *ngIf="softcopyJourneySteps().length">
                                <div *ngFor="let step of softcopyJourneySteps()"><dt>{{ step.label }}</dt><dd>{{ step.value }}</dd></div>
                            </dl>
                            <p *ngIf="!document.softcopy?.current_revision" class="empty-state">No current file is available. View uploaded versions in the Files tab.</p>
                            <div *ngIf="document.softcopy?.current_revision as current" class="digital-file-actions">
                                <div class="current-file-name"><i [class]="revisionIcon(current)" aria-hidden="true"></i><strong>{{ displayFileName(current.file_name) }}</strong></div>
                                <button *ngIf="canAccessApprovedFile(current)" type="button" (click)="openRevision(current)"><i class="pi pi-external-link"></i>Open file</button>
                                <button *ngIf="canAccessApprovedFile(current)" type="button" [disabled]="downloadInProgress" (click)="downloadRevision(current)"><i class="pi pi-download"></i>{{ downloadInProgress ? 'Downloading...' : 'Download file' }}</button>
                                <small *ngIf="canAccessApprovedFile(current)" class="file-note">{{ fileAccessNote() }}</small>
                                <small *ngIf="downloadError" class="download-error" role="alert"><i class="pi pi-exclamation-triangle"></i>{{ downloadError }}</small>
                            </div>
                            <p *ngIf="!canAccessFiles" class="access-note"><i class="pi pi-lock" aria-hidden="true"></i> You do not have permission to preview or download files.</p>
                        </div>

                        <ng-template #hardcopyInformation>
                            <div class="physical-visual">
                                <div class="route-content">
                                    <dl *ngIf="hasHardcopyRoute()" class="storage-fields" aria-label="Physical storage location">
                                        <div *ngFor="let step of hardcopyRouteSteps()"><dt>{{ step.label }}</dt><dd>{{ step.value }}</dd></div>
                                    </dl>
                                    <p *ngIf="!hasHardcopyRoute()" class="empty-state">No storage location has been recorded.</p>
                                    <div *ngIf="document.hardcopy?.retention" class="retention-detail" [class.retention-detail-alert]="(document.hardcopy?.retention?.days_remaining ?? 999999) <= 30">
                                        <i class="pi pi-clock"></i>
                                        <div><strong>{{ document.hardcopy?.retention?.label }}</strong><span>{{ document.hardcopy?.retention?.guidance }}</span><small *ngIf="document.hardcopy?.retention?.enabled">{{ formatDate(document.hardcopy?.retention?.start_date || undefined) }} to {{ formatDate(document.hardcopy?.retention?.end_date || undefined) }}</small></div>
                                    </div>
                                </div>
                            </div>
                        </ng-template>

                        <div *ngIf="document.status === 'Disposed'" class="disposal-note">
                            <i class="pi pi-exclamation-triangle"></i>
                            <div><strong>Disposed record</strong><span>{{ document.disposal_remarks || 'No remarks recorded' }}</span><small>{{ document.disposed_by_name || fullName(document.disposer) || 'Unknown' }} · {{ formatDate(document.disposed_at || undefined) }}</small></div>
                        </div>
                    </section>

                </div>

                <details *ngIf="document.document_type === 'SOFTCOPY'" class="softcopy-record-section">
                    <summary class="metadata-section-heading">
                        <div class="section-heading">
                            <span class="section-icon"><i class="pi pi-file-edit"></i></span>
                            <div><span>Complete record</span><h3>Request details</h3><small class="section-subtitle">Request fields and system-recorded control dates</small></div>
                        </div>
                        <i class="pi pi-chevron-down disclosure-icon" aria-hidden="true"></i>
                    </summary>
                    <div class="metadata-grid">
                        <div *ngFor="let item of softcopyDocumentRows()" class="metadata-item" [class.metadata-item-wide]="item.wide">
                            <span>{{ item.label }}</span><strong [class.breakable]="item.breakable">{{ item.value || 'Not recorded' }}</strong>
                        </div>
                    </div>
                </details>

                        </p-tabpanel>
                        <p-tabpanel value="workflow">
                <section *ngIf="document.workflow_steps?.length" class="approval-route-panel">
                    <div class="approval-route-heading">
                        <span class="section-icon"><i class="pi pi-sitemap"></i></span>
                        <div><span>Approval workflow</span><h3>{{ document.approver_configuration?.workflow_name || 'Document approval route' }}</h3><small>Version {{ document.approver_configuration?.workflow_version || 1 }}</small></div>
                    </div>
                    <div class="approval-route-list">
                        <article *ngFor="let step of document.workflow_steps; let index = index" class="approval-route-step" [class.completed]="step.status === 'APPROVED'" [class.current]="step.status === 'PENDING' && isCurrentWorkflowStep(step)">
                            <span class="approval-step-number"><i *ngIf="step.status === 'APPROVED'" class="pi pi-check"></i><ng-container *ngIf="step.status !== 'APPROVED'">{{ index + 1 }}</ng-container></span>
                            <div class="approval-step-copy">
                                <span>{{ step.stage_label || workflowStepLabel(step) }}</span>
                                <strong>{{ workflowStepPerson(step) }}</strong>
                                <small>{{ workflowStepPosition(step) }} · {{ workflowStepStatusLabel(step) }}</small>
                                <small *ngIf="step.acted_at">Acted {{ formatDate(step.acted_at) }}</small>
                                <small *ngIf="step.status === 'RETURNED'">Returned by: {{ workflowStepPerson(step) }}</small>
                                <small *ngIf="step.status === 'RETURNED' && step.comments">Reason: {{ step.comments }}</small>
                            </div>
                            <details *ngIf="canConfigureWorkflow && step.status === 'PENDING'" class="workflow-reassign-controls">
                                <summary>Reassign approver</summary>
                                <label [for]="'approver-' + step.workflow_step_id">Replacement approver</label>
                                <select [id]="'approver-' + step.workflow_step_id" [ngModel]="workflowReassignments[step.workflow_step_id]?.user_id || ''" (ngModelChange)="setWorkflowReassignment(step.workflow_step_id, 'user_id', $event)" class="workflow-select" [disabled]="!!workflowReassignments[step.workflow_step_id]?.saving">
                                    <option value="">Select replacement approver</option>
                                    <option *ngFor="let user of users" [value]="user.user_id">{{ workflowUserOptionLabel(user) }}</option>
                                </select>
                                <label [for]="'reason-' + step.workflow_step_id">Reason for reassignment</label>
                                <input [id]="'reason-' + step.workflow_step_id" [ngModel]="workflowReassignments[step.workflow_step_id]?.reason || ''" (ngModelChange)="setWorkflowReassignment(step.workflow_step_id, 'reason', $event)" placeholder="Reason for reassignment" maxlength="1000" [disabled]="!!workflowReassignments[step.workflow_step_id]?.saving" />
                                <button type="button" [disabled]="!canSubmitWorkflowReassignment(step)" (click)="reassignWorkflowStep(step)"><i class="pi pi-user-edit"></i>{{ workflowReassignments[step.workflow_step_id]?.saving ? 'Saving...' : 'Reassign' }}</button>
                                <small *ngIf="workflowReassignments[step.workflow_step_id]?.error" class="workflow-reassign-error" role="alert">{{ workflowReassignments[step.workflow_step_id]?.error }}</small>
                            </details>
                        </article>
                    </div>
                </section>

                <div *ngIf="!document.workflow_steps?.length" class="no-revisions"><i class="pi pi-sitemap" aria-hidden="true"></i><strong>No approval workflow</strong><span>No approval steps are recorded for this document.</span></div>
                        </p-tabpanel>
                        <p-tabpanel value="files">
                <section *ngIf="selectedRevision" class="file-preview-panel" aria-label="Document file preview">
                    <div class="preview-heading"><div><span class="field-label">File preview</span><h3>{{ displayFileName(selectedRevision.file_name) }}</h3></div><button type="button" class="secondary-action" (click)="closePreview()">Close preview</button></div>
                    <p *ngIf="previewKind === 'loading'" role="status">Loading document preview…</p>
                    <p *ngIf="previewKind === 'error'" role="alert">{{ previewError }}</p>
                    <p *ngIf="previewKind === 'unsupported'">Preview is unavailable for this format. Use Download to inspect the original file.</p>
                    <img *ngIf="previewKind === 'image'" [src]="previewObjectUrl" alt="Document preview" style="max-width:100%" />
                    <iframe *ngIf="previewKind === 'pdf'" [src]="previewResourceUrl" title="Document preview" style="width:100%;height:65vh;border:0"></iframe>
                    <iframe *ngIf="previewKind === 'office'" [srcdoc]="previewHtml" sandbox="" title="Office document preview" style="width:100%;height:65vh;border:1px solid #e5e7eb"></iframe>
                </section>
                <section *ngIf="documentAttachments().length || document.document_type === 'SOFTCOPY'" class="revisions-section">
                    <ng-container *ngIf="documentAttachments().length">
                    <div class="revisions-title"><div class="evidence-heading"><span class="section-icon"><i class="pi pi-paperclip"></i></span><div><span>Supporting evidence</span><h3>Attached scan documents</h3></div></div><strong>{{ documentAttachments().length }} file{{ documentAttachments().length === 1 ? '' : 's' }}</strong></div>
                    <div *ngIf="documentAttachments().length; else noAttachments" class="attachment-list">
                        <div *ngFor="let attachment of documentAttachments()" class="attachment-row">
                            <a [href]="canAccessFiles ? attachment.file_url : null" target="_blank" rel="noopener"
                               [attr.aria-disabled]="!canAccessFiles" [attr.tabindex]="canAccessFiles ? 0 : -1"
                               [class.disabled]="!canAccessFiles" (click)="previewAttachment($event, attachment)">
                                <i class="pi pi-paperclip" aria-hidden="true"></i>
                                <span><strong>{{ attachment.file_name }}</strong><small>{{ attachment.mime_type || 'File' }} · {{ formatDate(attachment.created_at) }}</small><small>{{ attachmentApprovalLabel(attachment) }}</small></span>
                                <i class="pi pi-external-link" aria-hidden="true"></i>
                            </a>
                            <button *ngIf="canDeleteAttachments" type="button" class="delete-attachment" [attr.aria-label]="'Delete attachment ' + attachment.file_name" (click)="attachmentDelete.emit(attachment.attachment_id)"><i class="pi pi-trash" aria-hidden="true"></i></button>
                        </div>
                    </div>
                    <ng-template #noAttachments></ng-template>
                    </ng-container>

                    <ng-container *ngIf="document.document_type === 'SOFTCOPY'">
                    <div class="revisions-title revision-heading"><div><span>Document files</span><h3>Revision history</h3><small class="section-subtitle">Approved versions stay preserved for traceability.</small></div><strong>{{ revisions.length }} file{{ revisions.length === 1 ? '' : 's' }}</strong></div>

                    <div *ngIf="revisions.length; else noRevisions" class="revision-list">
                        <details *ngFor="let revision of revisions; trackBy: trackRevision" class="revision-card">
                            <summary class="revision-summary" [attr.aria-label]="'Open details for revision ' + revision.revision_number">
                            <div class="file-thumbnail" [ngClass]="fileTone(revision)"><i [class]="revisionIcon(revision)"></i><span>{{ fileExtension(revision) }}</span></div>
                            <div class="revision-copy">
                                <div class="revision-title-row">
                                    <div><span>Revision</span><strong>{{ revision.revision_number }}</strong></div>
                                    <span class="revision-state-badge" [class.current]="document.softcopy?.current_revision?.revision_id === revision.revision_id || revision.is_current">{{ revisionStatusLabel(revision) }}</span>
                                </div>
                                <h4>{{ displayFileName(revision.file_name) }}</h4>
                                <div class="revision-meta"><span><i class="pi pi-user"></i>{{ fullName(revision.uploader) || 'Unknown' }}</span><span><i class="pi pi-clock"></i>{{ formatDate(revision.created_at) }}</span></div>
                                <p><i class="pi pi-comment"></i>{{ revision.reason_of_revision || 'No reason provided' }}</p>
                            </div>
                            <i class="pi pi-chevron-down disclosure-icon" aria-hidden="true"></i>
                            </summary>
                            <div class="revision-expanded">
                                <div class="revision-detail-grid">
                                    <div *ngFor="let item of revisionRows(revision)" class="revision-detail-item" [class.revision-detail-wide]="item.wide"><span>{{ item.label }}</span><strong [class.breakable]="item.breakable">{{ item.value || 'Not recorded' }}</strong></div>
                                </div>
                                <p *ngIf="downloadError" class="download-error" role="alert">{{ downloadError }}</p>
                                <div *ngIf="canAccessApprovedFile(revision)" class="revision-actions" (click)="$event.stopPropagation()">
                                    <button type="button" title="Open approved file" (click)="openRevision(revision)"><i class="pi pi-external-link" aria-hidden="true"></i>Open file</button>
                                    <button type="button" title="Download approved file" [disabled]="downloadInProgress" (click)="downloadRevision(revision)"><i class="pi pi-download" aria-hidden="true"></i>{{ downloadInProgress ? 'Downloading…' : 'Download file' }}</button>
                                </div>
                            </div>
                        </details>
                    </div>
                    <ng-template #noRevisions><div class="no-revisions"><i class="pi pi-file-plus"></i><strong>No revisions uploaded</strong><span>The first uploaded softcopy will appear here with its preview and actions.</span></div></ng-template>
                    </ng-container>
                </section>
                <div *ngIf="document.document_type !== 'SOFTCOPY' && !documentAttachments().length" class="no-revisions"><i class="pi pi-paperclip" aria-hidden="true"></i><strong>No attached files</strong><span>Supporting scans will appear here when added.</span></div>
                        </p-tabpanel>
                    </p-tabpanels>
                </p-tabs>
                </div>
            </ng-container>

            <ng-template pTemplate="footer">
                <span class="detail-footer-hint"><kbd>Esc</kbd> to close</span>
                <p-button label="Close" severity="secondary" [outlined]="true" (onClick)="close()" />
            </ng-template>
        </p-dialog>
    `,
    styles: [':host { display: block; }']
})
export class DocumentDetailDialogComponent implements OnChanges, OnDestroy {
    private readonly systemSettings = inject(SystemSettingsService);
    private readonly documentsService = inject(DocumentsService);
    private readonly sanitizer = inject(DomSanitizer);
    private readonly changeDetector = inject(ChangeDetectorRef);
    private previewRequest = 0;

    @Input() visible = false;
    @Output() visibleChange = new EventEmitter<boolean>();
    @Input() document: DocumentDetail | null = null;
    @Input() revisions: RevisionSummary[] = [];
    @Input() users: DocumentUserSummary[] = [];
    @Input() canConfigureWorkflow = false;
    @Input() canAccessFiles = false;
    @Input() canDeleteAttachments = false;
    @Output() attachmentDelete = new EventEmitter<string>();

    activeTab: string | number = 'overview';
    selectedRevision: RevisionSummary | null = null;
    previewKind: PreviewKind = 'idle';
    previewObjectUrl = '';
    previewResourceUrl: SafeResourceUrl | null = null;
    previewHtml = '';
    previewError = '';
    downloadInProgress = false;
    downloadError = '';
    workflowReassignments: Record<string, { user_id: string; reason: string; saving: boolean; error: string }> = {};
    copiedRoute = false;
    routeJourneyStage = 0;
    routeJourneyComplete = false;
    private routeJourneyTimers: number[] = [];
    digitalJourneyVisible = true;
    digitalJourneyStage = 0;
    digitalJourneyComplete = false;
    private digitalJourneyTimers: number[] = [];
    private readonly journeyStepDuration = 2000;

    ngOnChanges(changes: SimpleChanges) {
        if ((changes['visible'] && this.visible) || (changes['document'] && changes['document'].previousValue?.document_id !== this.document?.document_id)) this.activeTab = 'overview';
        if (changes['visible'] && !this.visible) {
            this.clearRouteJourneyTimers();
            this.clearDigitalJourneyTimers();
        }
        if (!this.canAccessFiles) {
            this.resetPreview();
            return;
        }

        if (changes['revisions'] || changes['document'] || changes['visible'] || changes['canAccessFiles']) this.resetPreview();
        if (changes['document']) this.initializeWorkflowReassignments();
    }

    ngOnDestroy() {
        this.clearRouteJourneyTimers();
        this.clearDigitalJourneyTimers();
        this.revokePreviewUrl();
    }

    trackRevision = (_index: number, revision: RevisionSummary) => revision.revision_id;
    documentAttachments() { return this.document?.document_type === 'SOFTCOPY' ? (this.document.softcopy?.attachments || []).filter((attachment) => attachment.status !== 'Rejected' && attachment.status !== 'Cancelled') : (this.document?.hardcopy?.attachments || []); }
    attachmentApprovalLabel(attachment: { status?: string | null }) { return attachment.status === 'Approved' ? 'Approved attachment' : 'Pending Plant Manager approval'; }
    supportingEvidenceCount() { return (this.document?.softcopy?.current_revision ? 1 : 0) + this.documentAttachments().length; }

    isCurrentWorkflowStep(step: DocumentWorkflowStepSummary) {
        return this.document?.workflow_steps?.find((candidate) => candidate.status === 'PENDING')?.workflow_step_id === step.workflow_step_id;
    }
    workflowStepLabel(step: DocumentWorkflowStepSummary) { return ({ NOTED_BY: 'Leader / Noted By', PLANT_MANAGER: 'Plant Manager Approval', DOCUMENT_CONTROLLER_ADMIN: 'Document Controller Approval', HARDCOPY_APPROVAL: 'Hardcopy Approval' } as Record<string, string>)[step.stage] || step.stage; }
    workflowStepPerson(step: DocumentWorkflowStepSummary) { return step.acted_user_name_snapshot || this.fullName(step.actor) || step.assigned_user_name_snapshot || this.fullName(step.assignee) || 'Unassigned'; }
    workflowStepPosition(step: DocumentWorkflowStepSummary) { return step.acted_position_title_snapshot || step.actor?.position_title || step.assigned_position_title_snapshot || step.assignee?.position_title || 'Position not recorded'; }
    workflowStepStatusLabel(step: DocumentWorkflowStepSummary) { return ({ PENDING: this.isCurrentWorkflowStep(step) ? 'Awaiting action' : 'Queued', APPROVED: 'Approved', RETURNED: 'Returned for correction', REJECTED: 'Rejected', CANCELLED: 'Cancelled' } as Record<string, string>)[step.status] || step.status; }
    workflowUserOptionLabel(user: DocumentUserSummary) { return [this.fullName(user) || user.username || user.user_id, user.position_title, user.role?.role_name].filter(Boolean).join(' · '); }
    setWorkflowReassignment(stepId: string, field: 'user_id' | 'reason', value: string) { this.workflowReassignments[stepId] = { ...(this.workflowReassignments[stepId] || { user_id: '', reason: '', saving: false, error: '' }), [field]: value, error: '' }; }
    canSubmitWorkflowReassignment(step: DocumentWorkflowStepSummary) { const form = this.workflowReassignments[step.workflow_step_id]; return !!form?.user_id && !!form.reason.trim() && !form.saving; }
    reassignWorkflowStep(step: DocumentWorkflowStepSummary) {
        if (!this.document || !this.canSubmitWorkflowReassignment(step)) return;
        const form = this.workflowReassignments[step.workflow_step_id];
        form.saving = true; form.error = '';
        this.documentsService.reassignWorkflowStep(this.document.document_id, step.workflow_step_id, form.user_id, form.reason.trim()).subscribe({
            next: (updated) => { Object.assign(step, updated); this.workflowReassignments[step.workflow_step_id] = { user_id: '', reason: '', saving: false, error: '' }; this.changeDetector.markForCheck(); },
            error: (error: unknown) => { form.saving = false; form.error = this.workflowErrorMessage(error); this.changeDetector.markForCheck(); }
        });
    }
    private initializeWorkflowReassignments() { this.workflowReassignments = Object.fromEntries((this.document?.workflow_steps || []).map((step) => [step.workflow_step_id, { user_id: '', reason: '', saving: false, error: '' }])); }
    private workflowErrorMessage(error: unknown) { const candidate = error as { error?: { message?: string | string[] }; message?: string }; const message = candidate?.error?.message; return Array.isArray(message) ? message.join(' ') : message || candidate?.message || 'Unable to reassign this approval step.'; }

    previewAttachment(event: Event, attachment: SoftcopyAttachmentSummary) {
        event.preventDefault();
        void this.selectRevision({ ...attachment, revision_id: `attachment-${attachment.attachment_id}`, revision_number: '', created_at: attachment.created_at || '' } as RevisionSummary);
    }

    async selectRevision(revision: RevisionSummary) {
        if (!this.canAccessFiles) return;
        this.activeTab = 'files';
        if (this.selectedRevision?.revision_id === revision.revision_id && ['loading', 'office', 'pdf', 'image'].includes(this.previewKind)) return;
        this.selectedRevision = revision;
        this.revokePreviewUrl();
        this.previewHtml = '';
        this.previewError = '';
        const link = this.revisionLink(revision);
        if (!link) { this.previewKind = 'error'; this.previewError = 'No served file URL is available for this revision.'; return; }

        const request = ++this.previewRequest;
        this.previewKind = 'loading';
        try {
            const blob = await this.loadOriginalRevision(this.absoluteUrl(link));
            if (request !== this.previewRequest) return;
            const name = revision.file_name || link;

            if (this.isImage(name, blob.type)) {
                this.previewObjectUrl = URL.createObjectURL(blob);
                this.previewKind = 'image';
            } else if (/\.pdf$/i.test(name) || blob.type === 'application/pdf') {
                this.previewObjectUrl = URL.createObjectURL(blob);
                this.previewResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.previewObjectUrl);
                this.previewKind = 'pdf';
            } else if (this.isModernOfficeRevision(revision)) {
                const html = await this.buildOfficePreview(await blob.arrayBuffer(), revision);
                if (request !== this.previewRequest) return;
                this.previewHtml = html;
                this.previewKind = 'office';
            } else {
                this.previewKind = 'unsupported';
            }
        } catch (error) {
            if (request !== this.previewRequest) return;
            this.previewKind = 'error';
            this.previewError = error instanceof Error ? error.message : 'The file could not be previewed.';
        }
    }

    revisionLink(revision: RevisionSummary) { return revision.file_url || revision.file_path || ''; }
    fullName(user?: { firstname?: string; lastname?: string } | null) { return [user?.firstname, user?.lastname].filter(Boolean).join(' '); }
    statusLabel(status?: string | null) { return !status ? 'N/A' : ({ Draft: 'Draft', PendingApproval: 'Pending Approval', ForNotedBy: 'For Noted By', ForPlantManagerApproval: 'For Plant Manager Approval', ForDocumentControllerAdmin: 'For Document Controller/Admin Approval', ForApproval: 'For Approval', Approved: 'Approved — Pending Release', Completed: 'Completed / Released', ForRevision: 'For Revision', ReturnedForCorrection: 'For Revision', Rejected: 'Rejected', Cancelled: 'Cancelled', ForTransfer: 'For Transfer', Transferred: 'Transferred', PendingRecipientAcceptance: 'Pending Recipient Acceptance', Disposed: 'Disposed' } as Record<string, string>)[status] || status.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '); }
    softcopyDocumentRows() {
        const document = this.document;
        if (!document) return [];
        const requester = document.requested_by_name || this.fullName(document.requester) || this.fullName(document.creator);
        return [
            this.detailRow('Document number', document.document_number, false, true),
            this.detailRow('Series No.', document.softcopy?.series_number, false, true),
            this.detailRow('Document title', document.document_title, true, true),
            this.detailRow('Document type', document.document_type),
            this.detailRow('Request status', this.statusLabel(document.status)),
            this.detailRow('Date of request', this.formatDate(document.request_date)),
            this.detailRow('Requestor', requester, false, true),
            this.detailRow('Department', document.department, false, true),
            this.detailRow('Document category', document.business_document_type),
            this.detailRow('Action requested', this.actionRequestedLabel(document.action_requested)),
            this.detailRow('From', document.from_party, false, true),
            this.detailRow('To', document.to_party, false, true),
            this.detailRow('Reason for change', this.changeReasonLabel(document.reason_for_change)),
            this.detailRow('Revision level from', document.revision_level_from),
            this.detailRow('Revision level to', document.revision_level_to),
            this.detailRow('Previous effective date', this.formatDate(document.previous_effective_date || undefined)),
            this.detailRow('New effective date', this.formatDate(document.new_effective_date || undefined)),
            this.detailRow('Date received', this.formatDate(document.date_received || undefined)),
            this.detailRow('Date released', this.formatDate(document.date_released || undefined)),
            this.detailRow('Approval date', this.formatDate(document.approval_date || undefined)),
            this.detailRow('Created', this.formatDate(document.created_at)),
            this.detailRow('Last updated', this.formatDate(document.updated_at)),
            this.detailRow('Brief description of changes', document.brief_description, true, true),
            this.detailRow('Proposed change', document.proposed_change, true, true),
        ];
    }
    revisionRows(revision: RevisionSummary) {
        return [
            this.detailRow('Revision number', revision.revision_number),
            this.detailRow('Revision status', this.revisionStatusLabel(revision)),
            this.detailRow('Document title', revision.document_title, true, true),
            this.detailRow('File name', this.displayFileName(revision.file_name), true, true),
            this.detailRow('File type', revision.mime_type, false, true),
            this.detailRow('Uploaded by', this.fullName(revision.uploader), false, true),
            this.detailRow('Uploaded at', this.formatDate(revision.created_at)),
            this.detailRow('Effective date', this.formatDate(revision.effective_date)),
            this.detailRow('Series number', revision.series_number, false, true),
            this.detailRow('Page number', revision.page_number, false, true),
            this.detailRow('Revision level from', revision.revision_level_from),
            this.detailRow('Revision level to', revision.revision_level_to),
            this.detailRow('Previous effective date', this.formatDate(revision.previous_effective_date || undefined)),
            this.detailRow('New effective date', this.formatDate(revision.new_effective_date || undefined)),
            this.detailRow('Date received', this.formatDate(revision.date_received || undefined)),
            this.detailRow('Date released', this.formatDate(revision.date_released || undefined)),
          this.detailRow('Approval date', this.formatDate(revision.approval_date || revision.approved_at || undefined)),
          this.detailRow('Approved by', this.fullName(revision.approver), false, true),
          this.detailRow('Last updated', this.formatDate(revision.updated_at)),
          this.detailRow('Reason for revision', revision.reason_of_revision, true, true),
        ];
    }
    private detailRow(label: string, value: unknown, wide = false, breakable = false) { return { label, value: value === null || value === undefined ? '' : String(value), wide, breakable }; }
    private actionRequestedLabel(value?: string | null) { return value === 'CREATE' ? 'Create Document' : value === 'REVISE' ? 'Revise Document' : value === 'CREATE_REVISE' ? 'Create / Revise Document (legacy)' : value === 'CANCELLATION' ? 'Cancellation' : value; }
    private changeReasonLabel(value?: string | null) { return value === 'CorrectionOfPreviousReleases' ? 'Correction of Previous Releases' : value; }
    revisionStatusLabel(revision: RevisionSummary) {
        if (this.document?.softcopy?.current_revision?.revision_id === revision.revision_id || revision.is_current) return 'Current revision';
        if (revision.is_historical) return 'Superseded revision';
        if (revision.approved_at) return 'Approved revision';
        return 'Pending approval';
    }
    formatDate(value?: string) { if (!value) return 'N/A'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); }
    hardcopyRouteSteps() {
        return [
            { label: 'Area', value: this.document?.hardcopy?.area?.area_name, icon: 'pi pi-th-large' },
            { label: 'Specific', value: this.document?.hardcopy?.specific?.specific_name, icon: 'pi pi-map' },
            { label: 'Asset', value: this.document?.hardcopy?.asset?.asset_number, icon: 'pi pi-tag' },
            { label: 'Location', value: this.document?.hardcopy?.location?.location_name, icon: 'pi pi-map-marker' },
            { label: 'Sequence', value: this.document?.hardcopy?.sequence?.sequence_code, icon: 'pi pi-sort-numeric-down' }
        ].filter((step): step is { label: string; value: string; icon: string } => Boolean(step.value));
    }
    softcopyJourneySteps() {
        const current = this.document?.softcopy?.current_revision;
        const folder = this.document?.softcopy?.category;
        const folderPath = (folder?.folder_name || folder?.category_name || '').split('/').map((part) => part.trim()).filter(Boolean);
        const mainFolder = folder?.parent?.category_name || folderPath[0] || folder?.category_name;
        const subfolder = folder?.parent_category_id ? folder?.category_name || folderPath.slice(1).join(' / ') : folderPath.length > 1 ? folderPath.slice(1).join(' / ') : '';
        return [
            { label: 'Main folder', value: mainFolder, icon: 'pi pi-folder-open' },
            { label: 'Subfolder', value: subfolder, icon: 'pi pi-folder' },
            { label: 'Revision', value: current?.revision_number ? `Revision ${current.revision_number}` : '', icon: 'pi pi-history' },
            { label: 'Updated', value: current?.created_at ? this.formatDate(current.created_at) : '', icon: 'pi pi-clock' },
            { label: 'Approved file', value: current?.file_name, icon: this.revisionIcon(current || null) }
        ].filter((step): step is { label: string; value: string; icon: string } => Boolean(step.value));
    }
    hasHardcopyRoute() { return this.hardcopyRouteSteps().length > 0; }
    hardcopyRoute() { return this.hardcopyRouteSteps().map((step) => `${step.label}: ${step.value}`).join(' / ') || 'No location mapped'; }
    hasRequester() { return Boolean(this.document?.requested_by_name || this.fullName(this.document?.requester)); }
    async copyHardcopyRoute() {
        if (!this.hasHardcopyRoute()) return;
        try {
            await navigator.clipboard.writeText(this.hardcopyRoute());
            this.copiedRoute = true;
            window.setTimeout(() => this.copiedRoute = false, 1800);
        } catch {
            this.copiedRoute = false;
        }
    }
    replayPhysicalRoute() {
        if (!this.hasHardcopyRoute()) return;
        this.startPhysicalRouteJourney();
    }
    handleShow() {
        window.setTimeout(() => {
            if (this.document?.document_type === 'HARDCOPY') this.startPhysicalRouteJourney();
            if (this.document?.document_type === 'SOFTCOPY') this.startDigitalJourney();
            this.changeDetector.markForCheck();
        });
    }
    routeJourneyProgress() {
        const total = this.hardcopyRouteSteps().length;
        return total > 1 ? Math.round((Math.min(this.routeJourneyStage, total - 1) / (total - 1)) * 100) : total ? 100 : 0;
    }
    routeJourneyStatus() {
        const steps = this.hardcopyRouteSteps();
        if (!steps.length) return 'No route mapped';
        if (this.routeJourneyComplete) return `Arrived at ${steps[steps.length - 1].label}`;
        const currentIndex = Math.min(this.routeJourneyStage, steps.length - 1);
        const current = steps[currentIndex];
        const next = steps[currentIndex + 1];
        return next ? `Traveling from ${current.label} to ${next.label}` : `Confirming destination at ${current.label}`;
    }
    private startPhysicalRouteJourney() {
        this.clearRouteJourneyTimers();
        const steps = this.hardcopyRouteSteps();
        this.routeJourneyStage = 0;
        this.routeJourneyComplete = false;
        this.changeDetector.markForCheck();
        steps.slice(1).forEach((_step, index) => this.routeJourneyTimers.push(window.setTimeout(() => { this.routeJourneyStage = index + 1; this.changeDetector.markForCheck(); }, (index + 1) * this.journeyStepDuration)));
        const arrivalTime = Math.max(1, steps.length) * this.journeyStepDuration;
        this.routeJourneyTimers.push(window.setTimeout(() => { this.routeJourneyComplete = true; this.changeDetector.markForCheck(); }, arrivalTime));
    }
    private clearRouteJourneyTimers() {
        this.routeJourneyTimers.forEach((timer) => window.clearTimeout(timer));
        this.routeJourneyTimers = [];
    }
    replayDigitalJourney() { this.startDigitalJourney(); }
    digitalJourneyProgress() {
        const total = this.softcopyJourneySteps().length;
        return total > 1 ? Math.round((Math.min(this.digitalJourneyStage, total - 1) / (total - 1)) * 100) : total ? 100 : 0;
    }
    digitalJourneyStatus() {
        const steps = this.softcopyJourneySteps();
        if (!steps.length) return 'No digital path available';
        if (this.digitalJourneyComplete) return `Approved file ready: ${steps[steps.length - 1].value}`;
        const currentIndex = Math.min(this.digitalJourneyStage, steps.length - 1);
        const next = steps[currentIndex + 1];
        return next ? `Moving from ${steps[currentIndex].label} to ${next.label}` : `Verifying ${steps[currentIndex].label}`;
    }
    private startDigitalJourney() {
        this.clearDigitalJourneyTimers();
        const steps = this.softcopyJourneySteps();
        if (!steps.length) return;
        this.digitalJourneyStage = 0;
        this.digitalJourneyComplete = false;
        this.digitalJourneyVisible = true;
        this.changeDetector.markForCheck();
        steps.slice(1).forEach((_step, index) => this.digitalJourneyTimers.push(window.setTimeout(() => { this.digitalJourneyStage = index + 1; this.changeDetector.markForCheck(); }, (index + 1) * this.journeyStepDuration)));
        const arrivalTime = Math.max(1, steps.length) * this.journeyStepDuration;
        this.digitalJourneyTimers.push(window.setTimeout(() => { this.digitalJourneyComplete = true; this.changeDetector.markForCheck(); }, arrivalTime));
    }
    private clearDigitalJourneyTimers() {
        this.digitalJourneyTimers.forEach((timer) => window.clearTimeout(timer));
        this.digitalJourneyTimers = [];
    }
    assignmentUsersLabel() { const assignments=this.document?.assignments??[]; if(!assignments.length)return 'Unassigned'; return assignments.map((item)=>this.fullName(item.user)||item.user.username||'User').join(', '); }
    assignmentActorLabel() { const assignments=this.document?.assignments??[]; if(!assignments.length)return 'No user-specific access assigned'; const latest=[...assignments].sort((a,b)=>new Date(b.assigned_at??0).getTime()-new Date(a.assigned_at??0).getTime())[0]; return `Assigned by ${this.fullName(latest.assigner)||latest.assigner?.username||'Administrator'}${latest.assigned_at?` · ${this.formatDate(latest.assigned_at)}`:''}`; }
    fileExtension(revision: RevisionSummary) { const match = (revision.file_name || '').match(/\.([^.]+)$/); return (match?.[1] || 'FILE').toUpperCase(); }
    displayFileName(fileName?: string | null) { return (fileName || '').replace(/-(controlled|uncontrolled|stamped)(?=\.[^.]+$)/i, '') || 'Unnamed file'; }
    revisionIcon(revision: RevisionSummary | null) { const name = revision?.file_name || ''; if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return 'pi pi-image'; if (/\.pdf$/i.test(name)) return 'pi pi-file-pdf'; if (/\.(xlsx|xls|csv)$/i.test(name)) return 'pi pi-table'; if (/\.(docx|doc|rtf)$/i.test(name)) return 'pi pi-file-word'; if (/\.(pptx|ppt)$/i.test(name)) return 'pi pi-desktop'; return 'pi pi-file'; }
    fileTone(revision: RevisionSummary) { const name = revision.file_name || ''; if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return 'image'; if (/\.pdf$/i.test(name)) return 'pdf'; if (/\.(xlsx|xls|docx|doc|pptx|ppt)$/i.test(name)) return 'office'; return 'generic'; }

    close() { this.visible = false; this.visibleChange.emit(false); this.previewRequest++; this.resetPreview(); }
    handleHide() { this.close(); }

    closePreview() { this.resetPreview(); }

    async openRevision(revision: RevisionSummary) {
        // The preview is above history, so bring it into view when opened there.
        const selection = this.selectRevision(revision);
        this.changeDetector.detectChanges();
        window.document.querySelector('.document-details-dialog .file-preview-panel')?.scrollIntoView({ block: 'nearest' });
        await selection;
    }

    canAccessApprovedFile(revision: RevisionSummary) {
        if (!this.canAccessFiles) return false;
        const status = this.document?.status || '';
        const finalized = ['Approved', 'Completed'].includes(status) &&
            (Boolean(revision.approved_at) || revision.is_current === true);
        const pendingApprovalReview = ['PendingApproval', 'ForNotedBy', 'ForPlantManagerApproval', 'ForDocumentControllerAdmin', 'ForApproval'].includes(status) &&
            !revision.approved_at && Boolean(this.revisionLink(revision));
        return finalized || pendingApprovalReview;
    }

    fileAccessNote() {
        return ['Approved', 'Completed'].includes(this.document?.status || '')
            ? 'Only the approved document file is available for opening or download.'
            : 'The submitted document file is available for this approval review.';
    }

    async downloadRevision(revision: RevisionSummary) {
        const link = this.revisionLink(revision);
        if (!link || !this.canAccessApprovedFile(revision)) return;

        this.downloadError = '';
        this.downloadInProgress = true;
        try {
            const blob = await this.loadOriginalRevision(this.absoluteUrl(link));
            const objectUrl = URL.createObjectURL(blob);
            this.triggerDownload(objectUrl, this.displayFileName(revision.file_name || `revision-${revision.revision_number}`));
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        } catch (error) {
            this.downloadError = error instanceof Error ? error.message : 'The file could not be downloaded.';
        } finally {
            this.downloadInProgress = false;
            this.changeDetector.markForCheck();
        }
    }

    private triggerDownload(url: string, fileName: string) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    private isImage(name: string, mime: string) { return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name) || mime.startsWith('image/'); }
    private isExcelRevision(revision: RevisionSummary) { return /\.(xlsx|xls)$/i.test(revision.file_name || this.revisionLink(revision)); }
    private isModernOfficeRevision(revision: RevisionSummary) { return /\.(xlsx|xls|docx|pptx)$/i.test(revision.file_name || this.revisionLink(revision)); }
    private officeProtocol(revision: RevisionSummary) { const name = revision.file_name || this.revisionLink(revision); if (/\.(xlsx|xls|csv)$/i.test(name)) return 'ms-excel'; if (/\.(docx|doc|rtf)$/i.test(name)) return 'ms-word'; if (/\.(pptx|ppt)$/i.test(name)) return 'ms-powerpoint'; return ''; }
    private absoluteUrl(link: string) { return new URL(link, window.location.href).href; }

    private async loadOriginalRevision(link: string) {
        const response = await fetch(link);
        if (!response.ok) throw new Error(`Unable to load file (${response.status}).`);
        return response.blob();
    }

    private async buildOfficePreview(buffer: ArrayBuffer, revision: RevisionSummary) {
        const title = this.escapeHtml(this.displayFileName(revision.file_name || `Revision ${revision.revision_number}`));
        const archive = await JSZip.loadAsync(buffer);
        const stampXml = await archive.file('customXml/dts-stamp.xml')?.async('string');
        const stampNode = stampXml ? new DOMParser().parseFromString(stampXml, 'application/xml').documentElement : null;
        const color = stampNode?.getAttribute('color') || '';
        const stamp = stampNode && /^[0-9A-F]{6}$/i.test(color) ? { text: stampNode.textContent || '', color } : null;
        if (this.isExcelRevision(revision)) {
            const workbook = XLSX.read(buffer, { type: 'array', sheetRows: 200 });
            const sheets = workbook.SheetNames.slice(0, 10).map((name) => `<section><h4>${this.escapeHtml(name)}</h4>${this.buildWorksheetPreview(workbook.Sheets[name])}${this.stampMarkup(stamp)}</section>`).join('');
            return `<h4>${title}</h4>${sheets || '<p>This workbook has no worksheets.</p>'}`;
        }

        const isWord = /\.docx$/i.test(revision.file_name || '');
        const entries = Object.values(archive.files)
            .filter((entry) => !entry.dir && (isWord ? /word\/document\.xml$/i.test(entry.name) : /ppt\/slides\/slide\d+\.xml$/i.test(entry.name)))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        if (!entries.length) throw new Error('No previewable Office content was found.');
        const sections = await Promise.all(entries.slice(0, 10).map(async (entry, index) => {
            const xml = await entry.async('string');
            const parsed = new DOMParser().parseFromString(xml, 'application/xml');
            const text = Array.from(parsed.getElementsByTagName('*')).filter((node) => ['w:t', 'a:t'].includes(node.nodeName)).map((node) => node.textContent || '').filter(Boolean);
            return `<section><h4>${isWord ? title : `Slide ${index + 1}`}</h4>${text.map((value) => `<p>${this.escapeHtml(value)}</p>`).join('')}${isWord ? this.stampMarkup(stamp) : ''}</section>`;
        }));
        return sections.join('');
    }

    private buildWorksheetPreview(sheet: XLSX.WorkSheet | undefined) {
        const reference = sheet?.['!ref'];
        if (!sheet || !reference) return '<p>This worksheet is empty.</p>';

        const range = XLSX.utils.decode_range(reference);
        const lastRow = Math.min(range.e.r, range.s.r + 199);
        const lastColumn = Math.min(range.e.c, range.s.c + 49);
        const rows: string[] = [];

        for (let row = range.s.r; row <= lastRow; row++) {
            const cells: string[] = [];
            for (let column = range.s.c; column <= lastColumn; column++) {
                const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
                const value = cell?.w ?? cell?.v ?? '';
                const tag = row === range.s.r ? 'th' : 'td';
                cells.push(`<${tag}>${this.escapeHtml(String(value))}</${tag}>`);
            }
            rows.push(`<tr>${cells.join('')}</tr>`);
        }

        const truncated = range.e.r > lastRow || range.e.c > lastColumn;
        return `<table><tbody>${rows.join('')}</tbody></table>${truncated ? '<p>Preview limited to the first 200 rows and 50 columns for performance.</p>' : ''}`;
    }

    private async renderModernOfficeRevision(revision: RevisionSummary, target: Window) {
        try {
            const link = this.revisionLink(revision);
            const body = await this.buildOfficePreview(await (await this.loadOriginalRevision(link)).arrayBuffer(), revision);
            const stamp = body.match(/<div class="electronic-stamp inline"[\s\S]*?<\/div>/)?.[0]?.replace('electronic-stamp inline', 'electronic-stamp fixed') || '';
            target.document.open(); target.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${this.escapeHtml(this.displayFileName(revision.file_name || 'Preview'))}</title><style>body{font-family:Arial,sans-serif;color:#111;margin:28px;padding-bottom:46px}h4{border-bottom:2px solid currentColor;padding-bottom:8px}section{margin-bottom:24px;break-after:page}section:last-child{break-after:auto}table{width:max-content;min-width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #aaa;padding:5px 7px}p{margin:5px 0;line-height:1.5}.electronic-stamp.inline{margin-top:18px;padding-top:8px;border-top:2px solid currentColor;text-align:center;font:700 11px Arial,sans-serif}.electronic-stamp.fixed{display:none}@media print{.electronic-stamp.inline{display:none}.electronic-stamp.fixed{display:block;position:fixed;left:0;right:0;bottom:0;margin:0;padding:8px 12px;border-top:2px solid currentColor;background:#fff;text-align:center;font:700 11px Arial,sans-serif}}</style></head><body>${body}${stamp}</body></html>`); target.document.close();
        } catch (error) { this.showPreviewError(target, error); }
    }

    private showLoadingPage(target: Window, title: string) { target.document.open(); target.document.write(`<!doctype html><html><head><title>${this.escapeHtml(title)}</title></head><body style="font-family:Arial,sans-serif;padding:24px">Preparing preview...</body></html>`); target.document.close(); }
    private showPreviewError(target: Window, error: unknown) { const message = error instanceof Error ? error.message : 'Unable to preview this file.'; target.document.open(); target.document.write(`<!doctype html><html><head><title>Preview unavailable</title></head><body style="font-family:Arial,sans-serif;padding:24px"><h1>Preview unavailable</h1><p>${this.escapeHtml(message)}</p></body></html>`); target.document.close(); }
    private stampMarkup(stamp: { color: string; text: string } | null, variant: 'inline' | 'fixed' = 'inline') {
        return stamp ? `<div class="electronic-stamp ${variant}" style="color:#${stamp.color};border-top:2px solid currentColor;margin-top:18px;padding:8px;text-align:center;font:bold 11px Arial">${this.escapeHtml(stamp.text)}</div>` : '';
    }
    private resetPreview() { this.previewRequest++; this.selectedRevision = null; this.previewKind = 'idle'; this.previewHtml = ''; this.previewError = ''; this.copiedRoute = false; this.revokePreviewUrl(); }
    private revokePreviewUrl() { if (this.previewObjectUrl) URL.revokeObjectURL(this.previewObjectUrl); this.previewObjectUrl = ''; this.previewResourceUrl = null; }
    private escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] || character); }
}
