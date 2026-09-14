import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import {
    SEARCHABLE_DROPDOWN_THRESHOLD,
    SearchableDropdownComponent,
    SearchableDropdownOption,
    SearchableDropdownValue
} from '@/app/shared/components/searchable-dropdown/searchable-dropdown.component';
import { AreaReference, AssetReference, DocumentFormValue, DocumentStatusValue, DocumentTypeValue, DocumentUserSummary, LocationReference, SequenceReference, SoftcopyCategoryReference, SpecificReference, WorkflowPlanStepValue } from '../../documents.types';
import { DocumentsService } from '../../documents.service';
import { WorkflowBuilderService } from '../../../workflow-builder/workflow-builder.service';
import { PublishedWorkflowOption } from '../../../workflow-builder/workflow-builder.types';

@Component({
    selector: 'app-document-form-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, DialogModule, InputTextModule, MultiSelectModule, SearchableDropdownComponent],
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
            [style]="{ width: '62rem', maxWidth: '94vw' }"
            [breakpoints]="{ '960px': '92vw', '640px': '96vw' }"
            [header]="isHardcopy() ? (mode === 'create' ? 'Create Hardcopy Document' : 'Update Hardcopy Document') : (mode === 'create' ? 'Document Control Request' : 'Update Document Control Request')"
            (onHide)="handleHide()"
        >
            <div *ngIf="isHardcopy()" class="hardcopy-form-note">
                <i class="pi pi-shield"></i>
                <span><strong>Direct hardcopy approval</strong><small>This record uses only hardcopy details and goes directly to the configured Plant Manager, Document Controller Officer, or Admin approver. It does not use the Softcopy Noted By stage.</small></span>
            </div>
            <div class="grid gap-4 pt-2 md:grid-cols-2">
                <div class="field" *ngIf="!isHardcopy()">
                    <label for="request-date">Date of Request</label>
                    <div id="request-date" class="system-generated-field"><i class="pi pi-calendar-clock"></i><span>{{ form.request_date || 'Set automatically when submitted' }}</span></div>
                    <small class="field-note">Set automatically by the system when the request is created. It cannot be changed manually.</small>
                </div>
                <div class="field" *ngIf="!isHardcopy()">
                    <label for="department">Department</label>
                    <input id="department" pInputText [(ngModel)]="form.department" class="w-full" />
                </div>
                <div class="field" *ngIf="!isHardcopy()">
                    <label for="document-number">Document Number <span class="text-red-500">*</span></label>
                    <input id="document-number" pInputText [(ngModel)]="form.document_number" class="w-full" placeholder="Enter the document number" maxlength="100" />
                    <small *ngIf="submitted && !form.document_number.trim()">Document Number is required for Softcopy documents.</small>
                    <small class="field-note">A Document Number may be reused only with a different Series Number.</small>
                </div>

                <div class="field md:col-span-2 direct-create-panel" *ngIf="!isHardcopy() && mode === 'create' && canDirectCreate">
                    <label class="direct-create-toggle"><input type="checkbox" [(ngModel)]="form.direct_create" [disabled]="saving" /><span><strong>Create directly as Controlled Copy</strong><small>This bypasses a DCR and is restricted to authorized Plant Managers and Administrators. A reason, complete revision metadata, and the file are required.</small></span></label>
                    <input *ngIf="form.direct_create" pInputText [(ngModel)]="form.direct_creation_reason" maxlength="2000" placeholder="Required reason for direct creation" [disabled]="saving" />
                </div>

                <div class="field softcopy-upload md:col-span-2" *ngIf="reviewFileApplies()">
                    <label for="softcopy-file">{{ reviewFileLabel() }}</label>
                    <input id="softcopy-file" type="file" class="file-field" [disabled]="saving" (change)="selectInitialFile($event)" />
                    <div class="attachment-selection" *ngIf="form.initial_file">
                        <span><i class="pi pi-file"></i>{{ form.initial_file.name }}</span>
                    </div>
                    <small class="field-note" *ngIf="analyzingFile">Reading document information from the file…</small>
                    <small class="field-note" *ngIf="!analyzingFile">{{ fileAnalysisMessage || reviewFileGuidance() }}</small>
                </div>

                <div class="field" *ngIf="!isHardcopy() && reviewFileApplies()">
                    <label for="initial-revision-number">{{ form.direct_create ? 'Initial revision number' : 'Revision number' }}</label>
                    <input id="initial-revision-number" pInputText [(ngModel)]="form.initial_revision_number" class="w-full" placeholder="000 (automatic when empty)" maxlength="50" />
                    <small class="field-note">Enter the revision number, or leave blank to use the next automatic number.</small>
                </div>

                <div class="field" *ngIf="!isHardcopy()">
                    <label for="business-document-type">Document category</label>
                    <select id="business-document-type" [(ngModel)]="form.business_document_type" class="select-field">
                        <option value="">Select category</option>
                        <option *ngFor="let type of businessDocumentTypes" [value]="type">{{ type }}</option>
                    </select>
                </div>

                <div class="field" *ngIf="!isHardcopy()">
                    <label for="action-requested">Action Requested</label>
                    <select id="action-requested" [(ngModel)]="form.action_requested" (ngModelChange)="onActionRequestedChange()" class="select-field">
                        <option value="CREATE">Create Document</option>
                        <option value="REVISE">Revise Document</option>
                        <option value="CANCELLATION">Cancellation</option>
                    </select>
                </div>

                <div class="field softcopy-upload md:col-span-2" *ngIf="!isHardcopy()">
                    <label for="attached-scan-files">Attached scan documents</label>
                    <input id="attached-scan-files" type="file" class="file-field" multiple [disabled]="saving" (change)="selectScanFiles($event)" />
                    <small class="field-note">Uploaded separately from the review Softcopy. These remain request/support attachments and never become the approved controlled file automatically.</small>
                    <div class="attachment-selection" *ngIf="form.attached_scan_files.length">
                        <span *ngFor="let file of form.attached_scan_files"><i class="pi pi-paperclip"></i>{{ file.name }}</span>
                    </div>
                </div>

                <div class="field md:col-span-2" *ngIf="!isHardcopy() && mode === 'create' && canAssignUsers">
                    <label for="assigned-users">Assign document access</label>
                    <p-multiselect inputId="assigned-users" [(ngModel)]="form.assigned_user_ids" [options]="userOptions" optionLabel="label" optionValue="value" display="chip" [filter]="true" filterBy="label" filterPlaceholder="Search staff by name or username" placeholder="Search and select staff" emptyMessage="No staff accounts available." emptyFilterMessage="No matching staff found." [showClear]="true" [disabled]="saving || referenceLoading" [loading]="referenceLoading" appendTo="body" styleClass="w-full assignment-multiselect" />
                    <small class="field-note">Admin-created documents are assigned only to the selected staff. Search and select one or more users.</small>
                </div>

                <div class="field md:col-span-2 workflow-builder" *ngIf="mode === 'create'">
                    <div class="workflow-builder-heading">
                        <div><label for="published-workflow">Published approval workflow</label><small class="field-note">The published system-default workflow from Workflow Builder is saved with this request.</small></div>
                        <span *ngIf="selectedPublishedWorkflow() as selected">Version {{ selected.version_number }}</span>
                    </div>
                    <select id="published-workflow" [(ngModel)]="form.workflow_version_id" (ngModelChange)="selectPublishedWorkflow($event)" class="select-field" [disabled]="saving || workflowsLoading">
                        <option value="" disabled>Select the published system-default workflow</option>
                        <option *ngIf="form.workflow_version_id && !selectedPublishedWorkflow()" [value]="form.workflow_version_id">{{ form.workflow_name }} ? Version {{ form.workflow_version }} (saved on this draft)</option>
                        <option *ngFor="let workflow of publishedWorkflows" [value]="workflow.workflow_version_id">{{ workflow.workflow_definition.name }} · Version {{ workflow.version_number }}</option>
                    </select>
                    <small *ngIf="workflowLoadError" class="field-note text-red-500">{{ workflowLoadError }} <button type="button" (click)="loadPublishedWorkflows()">Retry</button></small>
                    <small *ngIf="workflowsLoading" class="field-note">Loading published workflows…</small>
                    <small *ngIf="!workflowsLoading && !publishedWorkflows.length" class="field-note">No system-default workflow is published. Ask an administrator to publish it in Workflow Builder.</small>
                    <div *ngIf="selectedPublishedWorkflow() as selected" class="system-generated-field"><i class="pi pi-sitemap"></i><span><strong>{{ selected.workflow_definition.name }}</strong><small class="field-note">Published system-default workflow</small></span></div>
                </div>

                <div class="field md:col-span-2 workflow-builder" *ngIf="false">
                    <div class="workflow-builder-heading">
                        <div><label for="workflow-preset">Approval workflow</label><small class="field-note">The route is saved with this request. Named users are snapshotted when submitted, while the actual person and position are recorded when they act.</small></div>
                        <span>Version {{ form.workflow_version }}</span>
                    </div>
                    <select id="workflow-preset" [ngModel]="selectedWorkflowPreset" (ngModelChange)="applyWorkflowPreset($event)" class="select-field" [disabled]="saving">
                        <option value="RECOMMENDED">Recommended for this request</option>
                        <option *ngIf="!isHardcopy()" value="STANDARD_SOFTCOPY">Noted By → Plant Manager → Document Controller</option>
                        <option *ngIf="!isHardcopy()" value="CANCELLATION_SOFTCOPY">Noted By → Document Controller</option>
                        <option *ngIf="!isHardcopy()" value="DIRECT_CONTROLLER">Direct Document Controller approval</option>
                        <option *ngIf="isHardcopy()" value="DIRECT_HARDCOPY">Direct Hardcopy approval</option>
                        <option value="CUSTOM" disabled>Custom request workflow</option>
                    </select>
                    <input pInputText [(ngModel)]="form.workflow_name" class="w-full" maxlength="150" placeholder="Workflow name" />
                    <div class="workflow-step-list">
                        <div *ngFor="let step of form.workflow_steps; let index = index" class="workflow-step-row">
                            <span class="workflow-sequence">{{ index + 1 }}</span>
                            <div><strong>{{ workflowStageLabel(step.stage) }}</strong><small>{{ workflowAssignmentGuidance(step.stage) }}</small></div>
                            <select [(ngModel)]="step.assigned_user_id" class="select-field" [disabled]="saving || referenceLoading">
                                <option value="">Automatic eligible approver</option>
                                <option *ngFor="let option of approverOptions(step)" [value]="option.value">{{ option.label }}</option>
                            </select>
                            <div class="workflow-order-actions">
                                <button type="button" title="Move earlier" [disabled]="index === 0" (click)="moveWorkflowStep(index, -1)"><i class="pi pi-arrow-up"></i></button>
                                <button type="button" title="Move later" [disabled]="index === form.workflow_steps.length - 1" (click)="moveWorkflowStep(index, 1)"><i class="pi pi-arrow-down"></i></button>
                                <button type="button" title="Remove stage" [disabled]="form.workflow_steps.length === 1" (click)="removeWorkflowStep(index)"><i class="pi pi-times"></i></button>
                            </div>
                        </div>
                    </div>
                    <small class="field-note">Automatic assignment uses the requestor's Leader/Noted By or the configured role fallback. Selecting a name is recommended whenever several eligible officers exist.</small>
                </div>

                <div class="field">
                    <label for="document-title">Document title <span class="text-red-500">*</span></label>
                    <input id="document-title" pInputText [(ngModel)]="form.document_title" class="w-full uppercase-input" placeholder="QUALITY MANUAL" />
                    <small *ngIf="submitted && !form.document_title.trim()">Document title is required.</small>
                </div>

                <div class="field" *ngIf="!isHardcopy() && mode === 'update'">
                    <label for="from-party">{{ isRevisionAction() ? 'Document Title From' : 'From' }}</label>
                    <input id="from-party" pInputText [(ngModel)]="form.from_party" class="w-full" [placeholder]="isRevisionAction() ? 'Previous document title' : ''" />
                </div>
                <div class="field" *ngIf="!isHardcopy() && mode === 'update'">
                    <label for="to-party">{{ isRevisionAction() ? 'Document Title To' : 'To' }}</label>
                    <input id="to-party" pInputText [(ngModel)]="form.to_party" class="w-full" [placeholder]="isRevisionAction() ? 'Updated document title' : ''" />
                </div>
                <div class="field" *ngIf="!isHardcopy() && (isRevisionAction() || form.direct_create)">
                    <label for="reason-for-change">Reason for Change</label>
                    <select id="reason-for-change" [(ngModel)]="form.reason_for_change" class="select-field">
                        <option value="">Select reason</option>
                        <option value="Improvement">Improvement</option>
                        <option value="CorrectionOfPreviousReleases">Correction of Previous Releases</option>
                        <option value="Others">Others</option>
                    </select>
                </div>
                <div class="field" *ngIf="!isHardcopy() && (isRevisionAction() || form.direct_create)">
                    <label for="revision-level-from">Revision Level From</label>
                    <input id="revision-level-from" pInputText [(ngModel)]="form.revision_level_from" class="w-full" />
                </div>
                <div class="field" *ngIf="!isHardcopy() && (isRevisionAction() || form.direct_create)">
                    <label for="revision-level-to">Revision Level To</label>
                    <input id="revision-level-to" pInputText [(ngModel)]="form.revision_level_to" class="w-full" />
                </div>
                <div class="field" *ngIf="!isHardcopy()">
                    <label for="series-number">Series Number <span class="text-red-500">*</span></label>
                    <input id="series-number" pInputText [(ngModel)]="form.series_number" class="w-full" />
                    <small *ngIf="submitted && !form.series_number?.trim()">Series Number is required for Softcopy documents.</small>
                    <small class="field-note">This Series Number must be unique for the entered Document Number.</small>
                </div>
                <div class="field" *ngIf="!isHardcopy()">
                    <label for="page-number">Page Number</label>
                    <input id="page-number" pInputText [(ngModel)]="form.page_number" class="w-full" placeholder="1-5" />
                </div>
                <div class="field" *ngIf="!isHardcopy() && (isRevisionAction() || form.direct_create)">
                    <label for="previous-effective-date">Previous Effective Date</label>
                    <input id="previous-effective-date" type="date" [(ngModel)]="form.previous_effective_date" class="select-field" />
                </div>
                <div class="field" *ngIf="!isHardcopy() && (isRevisionAction() || form.direct_create)">
                    <label for="new-effective-date">New Effective Date</label>
                    <input id="new-effective-date" type="date" [(ngModel)]="form.new_effective_date" class="select-field" />
                </div>
                <div class="field md:col-span-2" *ngIf="!isHardcopy() && (isRevisionAction() || form.direct_create)">
                    <div class="system-generated-field"><i class="pi pi-calendar-clock"></i><span><strong>Control dates are automatic</strong><small class="field-note">Date Received, Approval Date, and Date Released are recorded by the workflow.</small></span></div>
                </div>
                <div class="field md:col-span-2" *ngIf="!isHardcopy() && (isRevisionAction() || form.direct_create)">
                    <label for="brief-description">Brief Description of Changes</label>
                    <textarea id="brief-description" [(ngModel)]="form.brief_description" class="select-field" rows="3"></textarea>
                </div>
                <div class="field md:col-span-2" *ngIf="!isHardcopy() && (isRevisionAction() || form.direct_create)">
                    <label for="proposed-change">Proposed Change</label>
                    <textarea id="proposed-change" [(ngModel)]="form.proposed_change" class="select-field" rows="3"></textarea>
                </div>
                <div class="field" *ngIf="!isHardcopy()">
                    <label for="document-type">Document type <span class="text-red-500">*</span></label>
                    <select id="document-type" [(ngModel)]="form.document_type" (ngModelChange)="onDocumentTypeChange()" class="select-field">
                        <option *ngFor="let type of documentTypes" [value]="type">{{ type }}</option>
                    </select>
                </div>

                <div class="field" *ngIf="!isHardcopy()">
                    <label for="requester-type">Requester</label>
                    <select id="requester-type" [(ngModel)]="form.requester_type" class="select-field">
                        <option value="CURRENT_USER">Current user{{ currentUserName ? ' — ' + currentUserName : '' }}</option>
                        <option value="MANUAL_NAME">Requested by name</option>
                    </select>
                    <small class="current-user-note" *ngIf="form.requester_type === 'CURRENT_USER'">
                        This request will be recorded for <strong>{{ currentUserName || 'the currently logged-in user' }}</strong>.
                    </small>
                </div>

                <div class="field" *ngIf="!isHardcopy() && form.requester_type === 'MANUAL_NAME'">
                    <label for="requested-by-name">Requested by name <span class="text-red-500">*</span></label>
                    <input id="requested-by-name" pInputText [(ngModel)]="form.requested_by_name" class="w-full" placeholder="Write a manual requestor name if needed" />
                    <small *ngIf="submitted && !form.requested_by_name.trim()">Requester name is required.</small>
                </div>

                <div class="field" *ngIf="isHardcopy()">
                    <label for="asset-id">Asset number</label>
                    <ng-container *ngIf="assets.length > searchableThreshold; else defaultAssetSelect">
                        <app-searchable-dropdown
                            inputId="asset-id"
                            [value]="form.asset_id"
                            [options]="assetOptions"
                            placeholder="No asset number"
                            [disabled]="saving || referenceLoading"
                            [loading]="referenceLoading"
                            [clearValue]="''"
                            (valueChange)="selectAsset(normalizeSelectValue($event))"
                        />
                    </ng-container>
                    <ng-template #defaultAssetSelect>
                        <select id="asset-id" [ngModel]="form.asset_id" (ngModelChange)="selectAsset($event)" class="select-field" [disabled]="saving || referenceLoading">
                            <option value="">No asset number</option>
                            <option *ngFor="let asset of filteredAssets; trackBy: trackAsset" [value]="asset.asset_id">{{ asset.asset_number }}</option>
                        </select>
                    </ng-template>
                </div>

                <div class="field" *ngIf="isHardcopy()">
                    <label for="area-id">Area <span class="text-red-500">*</span></label>
                    <ng-container *ngIf="areas.length > searchableThreshold; else defaultAreaSelect">
                        <app-searchable-dropdown
                            inputId="area-id"
                            [value]="form.area_id"
                            [options]="areaOptions"
                            placeholder="Select area"
                            [disabled]="saving || referenceLoading"
                            [loading]="referenceLoading"
                            [invalid]="submitted && isHardcopy() && !form.area_id"
                            [required]="true"
                            [clearValue]="''"
                            (valueChange)="selectArea(normalizeSelectValue($event))"
                        />
                    </ng-container>
                    <ng-template #defaultAreaSelect>
                        <select id="area-id" [ngModel]="form.area_id" (ngModelChange)="selectArea($event)" class="select-field" [disabled]="saving || referenceLoading">
                            <option value="">Select area</option>
                            <option *ngFor="let area of areas; trackBy: trackArea" [value]="area.area_id">{{ area.area_name }}</option>
                        </select>
                    </ng-template>
                    <small *ngIf="submitted && isHardcopy() && !form.area_id">Area is required for hardcopy documents.</small>
                </div>

                <div class="field" *ngIf="isHardcopy()">
                    <label for="specific-id">Specific</label>
                    <ng-container *ngIf="specifics.length > searchableThreshold; else defaultSpecificSelect">
                        <app-searchable-dropdown
                            inputId="specific-id"
                            [value]="form.specific_id"
                            [options]="specificOptions"
                            placeholder="No specific"
                            [disabled]="saving || referenceLoading"
                            [loading]="referenceLoading"
                            [clearValue]="''"
                            (valueChange)="selectSpecific(normalizeSelectValue($event))"
                        />
                    </ng-container>
                    <ng-template #defaultSpecificSelect>
                        <select id="specific-id" [ngModel]="form.specific_id" (ngModelChange)="selectSpecific($event)" class="select-field" [disabled]="saving || referenceLoading">
                            <option value="">No specific</option>
                            <option *ngFor="let specific of filteredSpecifics; trackBy: trackSpecific" [value]="specific.specific_id">{{ specific.specific_name }}</option>
                        </select>
                    </ng-template>
                </div>

                <div class="field" *ngIf="isHardcopy()">
                    <label for="location-id">Location <span class="text-red-500">*</span></label>
                    <ng-container *ngIf="locations.length > searchableThreshold; else defaultLocationSelect">
                        <app-searchable-dropdown
                            inputId="location-id"
                            [value]="form.location_id"
                            [options]="locationOptions"
                            placeholder="Select location"
                            [disabled]="saving || referenceLoading"
                            [loading]="referenceLoading"
                            [invalid]="submitted && isHardcopy() && !form.location_id"
                            [required]="true"
                            [clearValue]="''"
                            (valueChange)="selectLocation(normalizeSelectValue($event))"
                        />
                    </ng-container>
                    <ng-template #defaultLocationSelect>
                        <select id="location-id" [ngModel]="form.location_id" (ngModelChange)="selectLocation($event)" class="select-field" [disabled]="saving || referenceLoading">
                            <option value="">Select location</option>
                            <option *ngFor="let location of filteredLocations; trackBy: trackLocation" [value]="location.location_id">{{ location.location_name }}</option>
                        </select>
                    </ng-template>
                    <small *ngIf="submitted && isHardcopy() && !form.location_id">Location is required for hardcopy documents.</small>
                </div>

                <div class="field" *ngIf="isHardcopy()">
                    <label for="sequence-id">Sequence</label>
                    <ng-container *ngIf="sequences.length > searchableThreshold; else defaultSequenceSelect">
                        <app-searchable-dropdown
                            inputId="sequence-id"
                            [value]="form.sequence_id"
                            [options]="sequenceOptions"
                            placeholder="No sequence"
                            [disabled]="saving || referenceLoading"
                            [loading]="referenceLoading"
                            [clearValue]="''"
                            (valueChange)="form.sequence_id = normalizeSelectValue($event)"
                        />
                    </ng-container>
                    <ng-template #defaultSequenceSelect>
                        <select id="sequence-id" [(ngModel)]="form.sequence_id" class="select-field" [disabled]="saving || referenceLoading">
                            <option value="">No sequence</option>
                            <option *ngFor="let sequence of sequences; trackBy: trackSequence" [value]="sequence.sequence_id">{{ sequence.sequence_code }}</option>
                        </select>
                    </ng-template>
                </div>

                <div *ngIf="isHardcopy()" class="field md:col-span-2 retention-panel">
                    <label class="retention-toggle" for="retention-enabled">
                        <input id="retention-enabled" type="checkbox" [(ngModel)]="form.retention_enabled" [disabled]="saving" />
                        <span><strong>Retention period applies</strong><small>No retention is the default. Enable this only when this physical copy has a defined retention period.</small></span>
                    </label>
                    <div *ngIf="form.retention_enabled" class="grid gap-4 md:grid-cols-2">
                        <div class="field">
                            <label for="retention-start-date">Retention starts</label>
                            <input id="retention-start-date" type="date" [(ngModel)]="form.retention_start_date" class="select-field" [disabled]="saving" />
                        </div>
                        <div class="field">
                            <label for="retention-end-date">Retention ends</label>
                            <input id="retention-end-date" type="date" [(ngModel)]="form.retention_end_date" class="select-field" [disabled]="saving" />
                        </div>
                    </div>
                    <small *ngIf="submitted && form.retention_enabled && (!form.retention_start_date || !form.retention_end_date)" class="field-error">Enter both retention dates, or turn retention off.</small>
                </div>
            </div>

            <ng-template pTemplate="footer">
                <p-button label="Cancel" severity="secondary" text (onClick)="cancel()" />
                <p-button *ngIf="mode === 'create' && !form.direct_create" label="Save as Draft" [outlined]="true" [loading]="saving" [disabled]="analyzingFile" (onClick)="submit('DRAFT')" />
                <p-button [label]="mode === 'create' ? (isHardcopy() ? 'Send for Approval' : 'Submit Request') : (isHardcopy() ? 'Save and Send for Approval' : 'Save changes')" icon="pi pi-check" [loading]="saving" [disabled]="analyzingFile" (onClick)="submit('SUBMIT')" />
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
                color: #dc2626;
                font-size: 0.8rem;
                font-weight: 600;
            }

            .field .field-note {
                color: #64748b;
                font-weight: 500;
            }

            .system-generated-field { display: flex; align-items: center; gap: .55rem; min-height: 2.75rem; border: 1px solid #e2e8f0; border-radius: .85rem; background: #f8fafc; padding: .75rem .9rem; color: #334155; font-size: .88rem; font-weight: 700; }
            .system-generated-field i { color: #991b1b; }

            .hardcopy-form-note { display: flex; align-items: flex-start; gap: .75rem; margin: .15rem 0 1rem; border: 1px solid #fecaca; border-radius: 1rem; background: linear-gradient(135deg, #fff7f7, #fff); padding: .85rem 1rem; color: #7f1d1d; }
            .direct-create-panel { display: grid; gap: .7rem; border: 1px solid #bbf7d0; border-radius: 1rem; background: #f0fdf4; padding: .9rem 1rem; }
            .direct-create-toggle { display: flex; align-items: flex-start; gap: .65rem; cursor: pointer; }
            .direct-create-toggle input { margin-top: .2rem; accent-color: #15803d; }
            .direct-create-toggle span { display: grid; gap: .2rem; }
            .direct-create-toggle strong { color: #166534; font-size: .82rem; }
            .direct-create-toggle small { color: #166534; font-size: .72rem; line-height: 1.4; }
            .hardcopy-form-note > i { display: grid; place-items: center; width: 2rem; height: 2rem; flex: 0 0 2rem; border-radius: .65rem; background: #991b1b; color: #fff; }
            .hardcopy-form-note span { display: grid; gap: .2rem; }
            .hardcopy-form-note strong { color: #450a0a; font-size: .82rem; }
            .hardcopy-form-note small { color: #7f1d1d; font-size: .72rem; line-height: 1.45; }

            .retention-panel {
                border: 1px solid #e2e8f0;
                border-radius: 1rem;
                background: #f8fafc;
                padding: 1rem;
            }

            .retention-toggle {
                display: flex;
                align-items: flex-start;
                gap: 0.7rem;
                cursor: pointer;
            }

            .retention-toggle input {
                margin-top: 0.2rem;
                accent-color: #991b1b;
            }

            .retention-toggle span {
                display: grid;
                gap: 0.25rem;
            }

            .retention-toggle small {
                color: #64748b;
                font-weight: 500;
                line-height: 1.45;
            }

            .field-error {
                color: #dc2626;
                font-size: 0.8rem;
                font-weight: 600;
            }

            .file-field {
                width: 100%;
                border: 1px dashed #94a3b8;
                border-radius: 0.85rem;
                padding: 0.75rem;
                background: #f8fafc;
            }

            .attachment-selection { display: flex; flex-wrap: wrap; gap: 0.45rem; }
            .attachment-selection span { display: inline-flex; align-items: center; gap: 0.35rem; border-radius: 999px; background: #f1f5f9; padding: 0.4rem 0.65rem; color: #334155; font-size: 0.78rem; }

            .workflow-builder { display: grid; gap: .75rem; border: 1px solid #dbe4ee; border-radius: 1rem; background: linear-gradient(180deg,#f8fafc,#fff); padding: 1rem; }
            .workflow-builder-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
            .workflow-builder-heading > div { display: grid; gap: .2rem; }
            .workflow-builder-heading > span { border-radius: 999px; background: #e2e8f0; padding: .3rem .55rem; color: #475569; font-size: .65rem; font-weight: 800; white-space: nowrap; }
            .workflow-step-list { display: grid; gap: .55rem; }
            .workflow-step-row { display: grid; grid-template-columns: 2rem minmax(10rem,.8fr) minmax(13rem,1.2fr) auto; align-items: center; gap: .65rem; border: 1px solid #e2e8f0; border-radius: .85rem; background: #fff; padding: .65rem; }
            .workflow-step-row > div { display: grid; gap: .12rem; }
            .workflow-step-row strong { color: #0f172a; font-size: .76rem; }
            .workflow-step-row small { color: #64748b; font-size: .65rem; line-height: 1.35; }
            .workflow-sequence { display: grid; place-items: center; width: 1.8rem; height: 1.8rem; border-radius: 50%; background: #991b1b; color: #fff; font-size: .7rem; font-weight: 900; }
            .workflow-order-actions { display: flex!important; grid-auto-flow: column; gap: .25rem!important; }
            .workflow-order-actions button { display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border: 1px solid #cbd5e1; border-radius: .5rem; background: #fff; color: #475569; cursor: pointer; }
            .workflow-order-actions button:hover:not(:disabled) { border-color: #991b1b; background: #991b1b; color: #fff; }
            .workflow-order-actions button:disabled { cursor: not-allowed; opacity: .35; }
            @media(max-width:760px){.workflow-step-row{grid-template-columns:2rem minmax(0,1fr)}.workflow-step-row>select,.workflow-order-actions{grid-column:2}.workflow-builder-heading{flex-direction:column}}

            .uppercase-input {
                text-transform: uppercase;
            }

            .field .current-user-note {
                color: #475569;
                font-weight: 500;
            }

            .select-field {
                min-height: 2.75rem;
                width: 100%;
                border-radius: 0.85rem;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                padding: 0.75rem 0.9rem;
                color: #0f172a;
                outline: none;
            }

            .select-field:focus {
                border-color: #0f172a;
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
export class DocumentFormDialogComponent implements OnChanges {
    @Input() users: DocumentUserSummary[] = [];
    @Input() canAssignUsers = false;
    @Input() canDirectCreate = false;
    private documentsService = inject(DocumentsService);
    private workflowBuilderService = inject(WorkflowBuilderService);
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

    @Input() mode: 'create' | 'update' = 'create';
    @Input() form: DocumentFormValue = {
        document_number: '',
        document_title: '',
        document_type: 'HARDCOPY',
        action: 'DRAFT',
        requester_type: 'CURRENT_USER',
        requested_by_name: '',
        asset_id: '',
        area_id: '',
        specific_id: '',
        location_id: '',
        sequence_id: ''
        ,softcopy_category_id: '',
        initial_revision_number: '',
        initial_file: null,
        attached_scan_files: [],
            assigned_user_ids: []
        ,retention_enabled: false
        ,retention_start_date: ''
        ,retention_end_date: ''
        ,request_date: ''
        ,business_document_type: 'Forms'
        ,action_requested: 'CREATE'
        ,series_number: ''
        ,page_number: ''
        ,department: ''
        ,from_party: ''
        ,to_party: ''
        ,reason_for_change: 'Improvement'
        ,brief_description: ''
        ,proposed_change: ''
        ,revision_level_from: ''
        ,revision_level_to: ''
        ,previous_effective_date: ''
        ,new_effective_date: ''
        ,workflow_name: ''
        ,workflow_version: 1
        ,workflow_steps: []
    };
    @Input() areas: AreaReference[] = [];
    @Input() assets: AssetReference[] = [];
    @Input() specifics: SpecificReference[] = [];
    @Input() locations: LocationReference[] = [];
    @Input() sequences: SequenceReference[] = [];
    @Input() softcopyCategories: SoftcopyCategoryReference[] = [];
    @Input() currentUserName = '';
    @Input() saving = false;
    @Input() referenceLoading = false;

    @Output() save = new EventEmitter<DocumentFormValue>();
    @Output() cancelClick = new EventEmitter<void>();

    submitted = false;
    analyzingFile = false;
    fileAnalysisMessage = '';
    documentTypes: DocumentTypeValue[] = ['HARDCOPY', 'SOFTCOPY'];
    businessDocumentTypes = ['Forms', 'Manual', 'Procedures', 'WorkInstruction', 'Monitoring', 'Others'];
    readonly searchableThreshold = SEARCHABLE_DROPDOWN_THRESHOLD;
    selectedWorkflowPreset = 'RECOMMENDED';
    publishedWorkflows: PublishedWorkflowOption[] = [];
    workflowsLoading = false;
    workflowLoadError = '';
    private workflowLoadId = 0;

    ngOnChanges(changes: SimpleChanges) {
        if (this.visible && this.mode === 'create' && (changes['visible'] || changes['form'] || changes['mode'])) this.loadPublishedWorkflows();
    }

    onDocumentTypeChange() {
        this.form.workflow_version_id = '';
        this.form.workflow_editable = false;
        this.applyWorkflowPreset('RECOMMENDED');
        this.loadPublishedWorkflows();
    }

    submit(action: 'DRAFT' | 'SUBMIT') {
        this.submitted = true;
        if (this.mode === 'create' && (this.workflowsLoading || this.workflowLoadError || !this.form.workflow_version_id)) return;
        if (this.mode === 'create' && this.canAssignUsers && !this.form.workflow_version_id && !this.form.workflow_steps.length) {
            this.applyWorkflowPreset('RECOMMENDED');
        }
        this.form.document_title = this.form.document_title.trim().toUpperCase();
        if (!this.form.document_title.trim()) {
            return;
        }

        if (this.isHardcopy() && (!this.form.area_id || !this.form.location_id)) {
            return;
        }

        if (this.form.direct_create && (!this.form.direct_creation_reason?.trim() || !this.form.initial_file)) return;
        if (this.isHardcopy() && this.form.retention_enabled && (!this.form.retention_start_date || !this.form.retention_end_date)) {
            return;
        }
        if (!this.isHardcopy() && (!this.form.document_number.trim() || !this.form.series_number?.trim())) return;
        if (this.form.requester_type === 'MANUAL_NAME' && !this.form.requested_by_name.trim()) return;

        const requesterType = this.isHardcopy() ? 'CURRENT_USER' : this.form.requester_type;
        this.save.emit({
            ...this.form,
            workflow_editable: this.mode === 'create',
            action,
            requester_type: requesterType,
            requested_by_name: requesterType === 'MANUAL_NAME' ? this.form.requested_by_name : '',
            workflow_steps: this.form.workflow_version_id ? [] : (this.canAssignUsers ? this.form.workflow_steps : [])
        });
    }

    isHardcopy() {
        return this.form.document_type === 'HARDCOPY';
    }

    reviewFileApplies() {
        return !this.isHardcopy() && (this.form.direct_create || this.form.action_requested !== 'CANCELLATION');
    }

    reviewFileLabel() {
        if (this.form.direct_create) return 'Controlled Softcopy file';
        return this.isRevisionAction() ? 'Revised Softcopy for approver review' : 'New Softcopy for approver review';
    }

    reviewFileGuidance() {
        if (this.form.direct_create) {
            return 'Required for direct controlled-copy creation.';
        }
        return 'Attach the exact Softcopy file the selected approvers must review. After final approval, this same file becomes the approved/current revision; no second upload is required after Document Controller approval.';
    }

    selectInitialFile(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0] ?? null;
        this.form.initial_file = file;
        if (file) {
            this.form.attached_scan_files = this.form.attached_scan_files.filter((attachment) => !this.isSameFile(attachment, file));
        }
        if (!file) return;

        const baseName = file.name.replace(/\.[^.]+$/, '').trim();
        const revisionMatch = baseName.match(/\brev(?:ision)?[\s._-]*([A-Z]?\d{1,4})\b/i);

        if (!this.form.initial_revision_number.trim() && revisionMatch) {
            this.form.initial_revision_number = revisionMatch[1];
        }
        if (!this.form.document_title.trim()) {
            const withoutMetadata = baseName
                .replace(/(?:^|[\s_-])rev(?:ision)?[\s._-]*[A-Z]?\d{1,4}(?:$|[\s_-])/i, ' ')
                .replace(/[_-]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (withoutMetadata) {
                this.form.document_title = withoutMetadata.toUpperCase();
            }
        }

        this.analyzingFile = true;
        this.fileAnalysisMessage = '';
        this.documentsService.analyzeDocumentFile(file).subscribe({
            next: (analysis) => {
                this.analyzingFile = false;
                this.fileAnalysisMessage = analysis.message;
                if (analysis.document_number) this.form.document_number = analysis.document_number;
                if (analysis.document_title && !this.form.document_title.trim()) this.form.document_title = analysis.document_title;
            },
            error: () => {
                this.analyzingFile = false;
                this.fileAnalysisMessage = 'The file content could not be analyzed. Enter the required Document Number manually.';
            }
        });
    }

    onActionRequestedChange() {
        if (this.form.action_requested === 'CANCELLATION') {
            this.form.initial_file = null;
            this.fileAnalysisMessage = '';
        }
        if (!this.isRevisionAction() && !this.form.direct_create) {
            this.form.initial_revision_number = '';
            this.form.reason_for_change = undefined;
            this.form.revision_level_from = '';
            this.form.revision_level_to = '';
            this.form.previous_effective_date = '';
            this.form.new_effective_date = '';
            this.form.brief_description = '';
            this.form.proposed_change = '';
        }
        this.form.workflow_version_id = '';
        this.loadPublishedWorkflows();
    }

    isRevisionAction() {
        return this.form.action_requested === 'REVISE' || this.form.action_requested === 'CREATE_REVISE';
    }

    loadPublishedWorkflows() {
        const loadId = ++this.workflowLoadId;
        this.workflowsLoading = true;
        this.workflowLoadError = '';
        this.workflowBuilderService.publishedDefault(this.form.document_type, this.form.action_requested || "CREATE").subscribe({
            next: (workflows) => {
                if (loadId !== this.workflowLoadId) return;
                this.publishedWorkflows = workflows;
                this.workflowsLoading = false;
                if (!this.form.workflow_version_id) {
                    const key = this.isHardcopy() ? 'system-hardcopy-direct-approval' : this.form.action_requested === 'CANCELLATION' ? 'system-softcopy-cancellation' : 'system-softcopy-standard';
                    const recommended = workflows.find(workflow => workflow.workflow_definition.workflow_key === key);
                    if (recommended) this.selectPublishedWorkflow(recommended.workflow_version_id);
                }
            },
            error: () => { if (loadId !== this.workflowLoadId) return; this.publishedWorkflows = []; this.workflowsLoading = false; this.workflowLoadError = 'Unable to load approval workflows. Retry before saving this request.'; }
        });
    }

    selectedPublishedWorkflow() {
        return this.publishedWorkflows.find((workflow) => workflow.workflow_version_id === this.form.workflow_version_id);
    }

    selectPublishedWorkflow(versionId: string) {
        this.form.workflow_version_id = versionId;
        const selected = this.selectedPublishedWorkflow();
        if (!selected) return;
        this.form.workflow_name = selected.workflow_definition.name;
        this.form.workflow_version = selected.version_number;
        this.form.workflow_steps = [];
    }

    applyWorkflowPreset(preset: string) {
        this.selectedWorkflowPreset = preset;
        const resolvedPreset = preset === 'RECOMMENDED'
            ? this.isHardcopy()
                ? 'DIRECT_HARDCOPY'
                : this.form.action_requested === 'CANCELLATION'
                    ? 'CANCELLATION_SOFTCOPY'
                    : 'STANDARD_SOFTCOPY'
            : preset;
        const stages: WorkflowPlanStepValue['stage'][] = resolvedPreset === 'STANDARD_SOFTCOPY'
            ? ['NOTED_BY', 'PLANT_MANAGER', 'DOCUMENT_CONTROLLER_ADMIN']
            : resolvedPreset === 'CANCELLATION_SOFTCOPY'
                ? ['NOTED_BY', 'DOCUMENT_CONTROLLER_ADMIN']
                : resolvedPreset === 'DIRECT_CONTROLLER'
                    ? ['DOCUMENT_CONTROLLER_ADMIN']
                    : ['HARDCOPY_APPROVAL'];
        const existingAssignees = new Map(this.form.workflow_steps.map((step) => [step.stage, step.assigned_user_id]));
        this.form.workflow_steps = stages.map((stage) => ({ stage, assigned_user_id: existingAssignees.get(stage) || '' }));
        this.form.workflow_name = resolvedPreset === 'STANDARD_SOFTCOPY'
            ? 'Standard Softcopy Approval'
            : resolvedPreset === 'CANCELLATION_SOFTCOPY'
                ? 'Softcopy Cancellation Approval'
                : resolvedPreset === 'DIRECT_CONTROLLER'
                    ? 'Direct Document Controller Approval'
                    : 'Direct Hardcopy Approval';
        this.form.workflow_version = 1;
    }

    workflowStageLabel(stage: WorkflowPlanStepValue['stage']) {
        return ({
            NOTED_BY: 'Leader / Noted By',
            PLANT_MANAGER: 'Plant Manager Approval',
            DOCUMENT_CONTROLLER_ADMIN: 'Document Controller Approval',
            HARDCOPY_APPROVAL: 'Hardcopy Approval'
        } as const)[stage];
    }

    workflowAssignmentGuidance(stage: WorkflowPlanStepValue['stage']) {
        if (stage === 'NOTED_BY') return "Defaults to the requestor's configured leader";
        if (stage === 'PLANT_MANAGER') return 'Requires Plant Manager approval permission';
        if (stage === 'DOCUMENT_CONTROLLER_ADMIN') return 'Requires Document Controller approval permission';
        return 'Requires Hardcopy approval permission';
    }

    approverOptions(step: WorkflowPlanStepValue): SearchableDropdownOption[] {
        return this.users
            .filter((user) => this.isLikelyWorkflowApprover(user, step.stage))
            .map((user) => ({
                label: [this.fullName(user) || user.username || user.user_id, user.position_title, user.role?.role_name].filter(Boolean).join(' · '),
                value: user.user_id
            }));
    }

    moveWorkflowStep(index: number, direction: -1 | 1) {
        const target = index + direction;
        if (target < 0 || target >= this.form.workflow_steps.length) return;
        const reordered = [...this.form.workflow_steps];
        [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
        this.form.workflow_steps = reordered;
        this.selectedWorkflowPreset = 'CUSTOM';
        this.form.workflow_name = 'Custom Request Workflow';
        this.form.workflow_version = 1;
    }

    removeWorkflowStep(index: number) {
        if (this.form.workflow_steps.length <= 1) return;
        this.form.workflow_steps = this.form.workflow_steps.filter((_step, stepIndex) => stepIndex !== index);
        this.selectedWorkflowPreset = 'CUSTOM';
        this.form.workflow_name = 'Custom Request Workflow';
    }

    private isLikelyWorkflowApprover(user: DocumentUserSummary, stage: WorkflowPlanStepValue['stage']) {
        if (stage === 'NOTED_BY') return true;
        const identity = `${user.position_title || ''} ${user.role?.role_name || ''}`.toLowerCase();
        if (stage === 'PLANT_MANAGER') return /plant[ _-]*manager|admin/.test(identity);
        if (stage === 'DOCUMENT_CONTROLLER_ADMIN') return /document[ _-]*controller|admin/.test(identity);
        return /document[ _-]*controller|plant[ _-]*manager|admin/.test(identity);
    }

    selectScanFiles(event: Event) {
        const input = event.target as HTMLInputElement;
        const revisionFile = this.form.initial_file;
        this.form.attached_scan_files = Array.from(input.files ?? [])
            .filter((file) => !revisionFile || !this.isSameFile(file, revisionFile))
            .slice(0, 10);
    }

    private isSameFile(left: File, right: File) {
        return left.name.trim().toLowerCase() === right.name.trim().toLowerCase() && left.size === right.size;
    }

    trackSoftcopyCategory = (_index: number, category: SoftcopyCategoryReference) => category.softcopy_category_id;

    get assetOptions(): SearchableDropdownOption[] {
        return this.filteredAssets.map((asset) => ({
            label: asset.asset_number,
            value: asset.asset_id
        }));
    }

    get userOptions(): SearchableDropdownOption[] {
        return this.users.map((user) => ({
            label: this.fullName(user) || user.username || user.user_id,
            value: user.user_id
        }));
    }

    get areaOptions(): SearchableDropdownOption[] {
        return this.areas.map((area) => ({
            label: area.area_name,
            value: area.area_id
        }));
    }

    get specificOptions(): SearchableDropdownOption[] {
        return this.filteredSpecifics.map((specific) => ({
            label: specific.specific_name,
            value: specific.specific_id
        }));
    }

    get locationOptions(): SearchableDropdownOption[] {
        return this.filteredLocations.map((location) => ({
            label: location.location_name,
            value: location.location_id
        }));
    }

    get sequenceOptions(): SearchableDropdownOption[] {
        return this.sequences.map((sequence) => ({
            label: sequence.sequence_code,
            value: sequence.sequence_id
        }));
    }

    trackAsset = (_index: number, asset: AssetReference) => asset.asset_id;
    trackArea = (_index: number, area: AreaReference) => area.area_id;
    trackSpecific = (_index: number, specific: SpecificReference) => specific.specific_id;
    trackLocation = (_index: number, location: LocationReference) => location.location_id;
    trackSequence = (_index: number, sequence: SequenceReference) => sequence.sequence_id;
    trackUser = (_index: number, user: DocumentUserSummary) => user.user_id;

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

    normalizeSelectValue(value: SearchableDropdownValue) {
        return value === null || value === undefined ? '' : String(value);
    }

    get filteredSpecifics() { return this.form.area_id ? this.specifics.filter((item) => item.area_id === this.form.area_id) : this.specifics; }
    get filteredAssets() { return this.form.specific_id ? this.assets.filter((item) => item.specific_id === this.form.specific_id) : this.assets; }
    get filteredLocations() { return this.form.asset_id ? this.locations.filter((item) => item.asset_id === this.form.asset_id) : this.locations; }

    selectArea(value: string) {
        this.form.area_id = value || '';
        if (this.form.specific_id && !this.filteredSpecifics.some((item) => item.specific_id === this.form.specific_id)) this.form.specific_id = '';
        if (this.form.asset_id && !this.filteredAssets.some((item) => item.asset_id === this.form.asset_id)) this.form.asset_id = '';
        if (this.form.location_id && !this.filteredLocations.some((item) => item.location_id === this.form.location_id)) this.form.location_id = '';
    }
    selectSpecific(value: string) {
        this.form.specific_id = value || '';
        const specific = this.specifics.find((item) => item.specific_id === this.form.specific_id);
        if (specific?.area_id) this.form.area_id = specific.area_id;
        if (this.form.asset_id && !this.filteredAssets.some((item) => item.asset_id === this.form.asset_id)) this.form.asset_id = '';
        if (this.form.location_id && !this.filteredLocations.some((item) => item.location_id === this.form.location_id)) this.form.location_id = '';
    }
    selectAsset(value: string) {
        this.form.asset_id = value || '';
        const asset = this.assets.find((item) => item.asset_id === this.form.asset_id);
        if (asset?.specific_id) this.selectSpecific(asset.specific_id);
        if (this.form.location_id && !this.filteredLocations.some((item) => item.location_id === this.form.location_id)) this.form.location_id = '';
    }
    selectLocation(value: string) {
        this.form.location_id = value || '';
        const location = this.locations.find((item) => item.location_id === this.form.location_id);
        if (location?.asset_id) this.selectAsset(location.asset_id);
        else if (location?.specific_id) {
            this.selectSpecific(location.specific_id);
            this.form.asset_id = '';
        }
        this.form.location_id = value || '';
    }

    fullName(user: DocumentUserSummary) {
        return [user.firstname, user.lastname].filter(Boolean).join(' ');
    }
}
