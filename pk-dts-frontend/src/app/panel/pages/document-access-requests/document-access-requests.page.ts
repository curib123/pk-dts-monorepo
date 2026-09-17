import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '@/app/auth/auth.service';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import { ConfirmationDialogComponent } from '@/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { LoadingShimmerComponent } from '@/app/shared/components/loading-shimmer/loading-shimmer.component';
import { SearchableDropdownComponent, SearchableDropdownOption, SearchableDropdownValue } from '@/app/shared/components/searchable-dropdown/searchable-dropdown.component';
import { DocumentAccessRequestsService } from './document-access-requests.service';
import { AccessRequestDocument, DocumentAccessRequest, DocumentAccessRequestStatus } from './document-access-requests.types';

type ViewTab = 'catalog' | 'mine' | 'pending';
type AccessPageMode = 'requester' | 'reviewer' | 'all';
type PendingDecision = { request: DocumentAccessRequest; status: 'APPROVED' | 'REJECTED' | 'RETURNED' };

@Component({
    selector: 'app-document-access-requests-page',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, ConfirmationDialogComponent, LoadingShimmerComponent, SearchableDropdownComponent],
    template: `
        <app-loading-shimmer *ngIf="loading()" label="Loading document access requests" [columns]="5" />
        <section class="access-page" [style.display]="loading() ? 'none' : null">
            <style>.access-page .document-card-title h3{margin:0;color:var(--brand-primary-deep);font-size:1.05rem;font-weight:900}.request-row .request-number,.request-row>div:first-child small,.requested-document strong,.requested-document small{display:none}.request-row>div:first-child strong,.requested-document p{color:var(--brand-primary-deep);font-size:.9rem;font-weight:900}.requested-document p{margin:0}</style>
            <header class="access-hero">
                <div>
                    <span class="eyebrow">CONTROLLED DOCUMENT ACCESS</span>
                    <h1>{{ pageHeading() }}</h1>
                    <p>{{ pageDescription() }}</p>
                </div>
                <div class="hero-status"><i class="pi pi-shield"></i><span>Approval required</span></div>
            </header>

            <div *ngIf="errorMessage()" class="feedback error"><i class="pi pi-exclamation-triangle"></i><span>{{ errorMessage() }}</span></div>

            <nav class="access-tabs" aria-label="Document access request sections">
                <button *ngIf="canUseCatalog()" type="button" [class.active]="activeTab() === 'catalog'" (click)="selectTab('catalog')"><i class="pi pi-search"></i> Find documents</button>
                <button *ngIf="canViewOwn()" type="button" [class.active]="activeTab() === 'mine'" (click)="selectTab('mine')"><i class="pi pi-clock"></i> My requests <span>{{ myRequests().length }}</span></button>
                <button *ngIf="canReview()" type="button" [class.active]="activeTab() === 'pending'" (click)="selectTab('pending')"><i class="pi pi-check-square"></i> Approval queue <span>{{ pendingRequests().length }}</span></button>
            </nav>

            <article *ngIf="activeTab() === 'catalog' && canUseCatalog()" class="workspace">
                <div class="workspace-head"><div><h2>Find a document</h2><p>Only approved metadata is shown here. Files, attachments, revisions, and document details stay protected.</p></div></div>
                <div class="catalog-tools">
                    <label class="search-box"><i class="pi pi-search"></i><input [(ngModel)]="search" (keyup.enter)="searchCatalog()" placeholder="Search document number or title" /><button *ngIf="search" type="button" (click)="search=''; searchCatalog()"><i class="pi pi-times"></i></button></label>
                    <select [(ngModel)]="documentType" (ngModelChange)="setDocumentType($event)"><option value="">All document types</option><option value="SOFTCOPY">Softcopy</option><option value="HARDCOPY">Hardcopy</option></select>
                    <app-searchable-dropdown inputId="access-location" [value]="locationId" [options]="locationOptions()" placeholder="All locations" filterPlaceholder="Search locations" emptyMessage="No document locations available." emptyFilterMessage="No matching location found." [showClear]="true" (valueChange)="setLocation($event)" />
                    <button class="search-action" type="button" (click)="searchCatalog()"><i class="pi pi-search"></i> Search</button>
                </div>

                <div class="catalog-grid" *ngIf="catalog().length; else emptyCatalog">
                    <article class="document-card" *ngFor="let document of catalog(); trackBy: trackDocument">
                        <div class="document-card-title"><h3>{{ document.document_title }}</h3></div>
                        <label class="reason-field"><span>Reason <small>Required</small></span><textarea [(ngModel)]="requestReasons[document.document_id]" maxlength="1000" rows="2" placeholder="Why do you need access?" required></textarea></label>
                        <div class="request-state" *ngIf="document.access_request as request" [attr.data-status]="request.status"><i class="pi" [ngClass]="request.status === 'ForAccessApproval' || request.status === 'PENDING' ? 'pi-clock' : request.status === 'APPROVED' || request.status === 'AccessGranted' ? 'pi-check-circle' : 'pi-info-circle'"></i><span>{{ requestStatusLabel(request.status) }}</span></div>
                        <p-button label="Request access" icon="pi pi-send" [loading]="actingId() === document.document_id" [disabled]="!hasRequestReason(document) || document.access_request?.status === 'PENDING' || document.access_request?.status === 'ForAccessApproval'" (onClick)="requestAccess(document)" />
                    </article>
                </div>
                <ng-template #emptyCatalog><div class="empty-state"><i class="pi pi-search"></i><strong>No available documents found</strong><span>Try another search, or every matching document may already be assigned to you.</span></div></ng-template>
                <div class="pager" *ngIf="catalogPages() > 1"><button type="button" [disabled]="catalogPage() <= 1" (click)="changeCatalogPage(-1)"><i class="pi pi-chevron-left"></i> Previous</button><span>Page {{ catalogPage() }} of {{ catalogPages() }}</span><button type="button" [disabled]="catalogPage() >= catalogPages()" (click)="changeCatalogPage(1)">Next <i class="pi pi-chevron-right"></i></button></div>
            </article>

            <article *ngIf="activeTab() === 'mine' && canViewOwn()" class="workspace">
                <div class="workspace-head"><div><h2>My access requests</h2><p>Track pending, approved, rejected, and cancelled requests. Approved documents appear automatically in your document workspace.</p></div><button class="refresh" type="button" (click)="loadMine()"><i class="pi pi-refresh"></i> Refresh</button></div>
                <div class="request-list" *ngIf="myRequests().length; else emptyMine">
                    <article class="request-row" *ngFor="let request of myRequests(); trackBy: trackRequest">
                        <div><span class="request-number">{{ request.document.document_type === 'HARDCOPY' ? request.document.document_title : (request.document.document_number || 'No document number') }}</span><strong>{{ request.document.document_title }}</strong><small>{{ request.document.document_type }} · Requested {{ request.created_at | date:'medium' }}</small></div>
                        <div><span class="label">Your reason</span><p>{{ request.request_reason || 'No reason provided.' }}</p></div>
                        <div><span class="status-pill" [attr.data-status]="request.status">{{ requestStatusLabel(request.status) }}</span><small *ngIf="request.reviewer_remarks">Approver note: {{ request.reviewer_remarks }}</small><p-button *ngIf="(request.status === 'PENDING' || request.status === 'ForAccessApproval') && canCancelOwn()" label="Cancel request" icon="pi pi-times" severity="warn" size="small" [outlined]="true" [loading]="actingId() === request.access_request_id" (onClick)="openCancellation(request)" /></div>
                    </article>
                </div>
                <ng-template #emptyMine><div class="empty-state"><i class="pi pi-inbox"></i><strong>No access requests yet</strong><span>Use Find documents to submit your first request.</span></div></ng-template>
            </article>

            <article *ngIf="activeTab() === 'pending' && canReview()" class="workspace">
                <div class="workspace-head"><div><h2>Access approval and granting</h2><p>Approval records the decision first. Grant Access is a separate action that assigns the document to the requester.</p></div><button class="refresh" type="button" (click)="loadPending()"><i class="pi pi-refresh"></i> Refresh</button></div>
                <div class="approval-list" *ngIf="pendingRequests().length; else emptyPending">
                    <article class="approval-card" *ngFor="let request of pendingRequests(); trackBy: trackRequest">
                        <div class="applicant"><span class="avatar"><i class="pi pi-user"></i></span><div><strong>{{ userName(request) }}</strong><small>{{ request.requester.username }}</small><small>{{ request.requester.position_title || 'No position title' }}</small></div></div>
                        <div class="requested-document"><span class="label">Requested document</span><strong>{{ request.document.document_type === 'HARDCOPY' ? request.document.document_title : (request.document.document_number || 'No document number') }}</strong><p>{{ request.document.document_title }}</p><small>{{ request.document.document_type }} · {{ request.created_at | date:'medium' }}</small></div>
                        <div class="reason-copy"><span class="label">Staff reason</span><p>{{ request.request_reason || 'No reason provided.' }}</p></div>
                        <label class="review-note"><span>Reviewer note <small>Optional</small></span><textarea [(ngModel)]="reviewRemarks[request.access_request_id]" maxlength="1000" rows="2" placeholder="Note shown to the requester"></textarea></label>
                        <div class="decision-actions"><p-button *ngIf="request.status === 'APPROVED'" label="Grant Access" icon="pi pi-key" severity="success" [disabled]="actingId() === request.access_request_id || !canGrant()" (onClick)="grantAccess(request)" /><ng-container *ngIf="request.status !== 'APPROVED'"><p-button label="Return" icon="pi pi-replay" severity="warn" [outlined]="true" [disabled]="actingId() === request.access_request_id || !canReject()" (onClick)="openDecision(request, 'RETURNED')" /><p-button label="Reject" icon="pi pi-times" severity="danger" [outlined]="true" [disabled]="actingId() === request.access_request_id || !canReject()" (onClick)="openDecision(request, 'REJECTED')" /><p-button label="Approve" icon="pi pi-check" [disabled]="actingId() === request.access_request_id || !canApprove()" (onClick)="openDecision(request, 'APPROVED')" /></ng-container></div>
                    </article>
                </div>
                <ng-template #emptyPending><div class="empty-state"><i class="pi pi-check-circle"></i><strong>No pending access requests</strong><span>New access requests will appear here.</span></div></ng-template>
            </article>
        </section>

        <app-confirmation-dialog [(visible)]="decisionVisible" [title]="decisionTitle()" [message]="decisionMessage()" [confirmLabel]="decisionLabel()" [tone]="pendingDecision?.status === 'APPROVED' ? 'primary' : pendingDecision?.status === 'RETURNED' ? 'warning' : 'danger'" (confirm)="confirmDecision()" (cancel)="clearDecision()" />
        <app-confirmation-dialog [(visible)]="cancelVisible" title="Cancel access request?" [message]="cancellationMessage()" confirmLabel="Cancel request" tone="warning" (confirm)="confirmCancellation()" (cancel)="clearCancellation()" />
    `,
    styles: [`
        :host{display:block}.access-page{display:grid;gap:1.15rem;color:#172033}.access-hero{display:flex;justify-content:space-between;align-items:center;gap:1rem;border-radius:1.3rem;background:linear-gradient(135deg,#fff 0%,var(--brand-soft) 100%);padding:1.4rem 1.5rem;box-shadow:0 12px 32px rgba(15,23,42,.06)}.eyebrow{color:var(--brand-primary);font-size:.68rem;font-weight:900;letter-spacing:.14em}.access-hero h1{margin:.25rem 0;color:#111827;font-size:1.8rem}.access-hero p{max-width:48rem;margin:0;color:#64748b;font-size:.82rem;line-height:1.55}.hero-status{display:flex;align-items:center;gap:.55rem;border-radius:999px;background:#fff;padding:.65rem .9rem;color:var(--brand-primary-deep);font-size:.75rem;font-weight:850;box-shadow:0 5px 16px rgba(153,27,27,.1)}.feedback{display:flex;gap:.6rem;border-radius:.85rem;padding:.8rem 1rem}.feedback.error{background:var(--brand-soft);color:var(--brand-primary-deep)}.access-tabs{display:flex;gap:.45rem;width:max-content;max-width:100%;border-radius:1rem;background:#eef2f7;padding:.35rem}.access-tabs button{border:0;border-radius:.75rem;background:transparent;padding:.7rem .9rem;color:#64748b;font-size:.76rem;font-weight:850;cursor:pointer}.access-tabs button.active{background:#fff;color:var(--brand-primary);box-shadow:0 4px 12px rgba(15,23,42,.08)}.access-tabs button span{margin-left:.3rem;border-radius:999px;background:#e2e8f0;padding:.12rem .4rem;font-size:.66rem}.workspace{display:grid;gap:1rem;border-radius:1.25rem;background:#fff;padding:1.25rem;box-shadow:0 10px 28px rgba(15,23,42,.05)}.workspace-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.workspace h2{margin:0;color:#111827;font-size:1.25rem}.workspace-head p{margin:.25rem 0 0;color:#64748b;font-size:.78rem}.refresh{border:0;border-radius:.7rem;background:#f1f5f9;padding:.6rem .75rem;color:#475569;font-weight:800;cursor:pointer}.catalog-tools{display:grid;grid-template-columns:minmax(15rem,1fr) 11rem minmax(12rem,16rem) auto;gap:.65rem}.search-box{display:flex;align-items:center;gap:.55rem;border-radius:.8rem;background:#f8fafc;padding:0 .75rem}.search-box>i{color:var(--brand-primary)}.search-box input{min-width:0;height:2.8rem;flex:1;border:0;background:transparent;outline:0}.search-box button{border:0;background:transparent;color:#64748b}.catalog-tools select{border:0;border-radius:.8rem;background:#f8fafc;padding:0 .7rem;color:#334155}.search-action{border:0;border-radius:.8rem;background:var(--brand-primary-deep);padding:0 .9rem;color:#fff;font-weight:850}.catalog-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem}.document-card{display:grid;gap:.8rem;border-radius:1rem;background:#fff;padding:1rem;box-shadow:0 5px 18px rgba(15,23,42,.09)}.document-top{display:flex;align-items:center;justify-content:space-between}.type-icon{display:grid;place-items:center;width:2.3rem;height:2.3rem;border-radius:.7rem;background:#fef3c7;color:#92400e}.type-icon.softcopy{background:#dbeafe;color:#1d4ed8}.type-pill{color:#64748b;font-size:.65rem;font-weight:850;text-transform:uppercase}.document-number{color:var(--brand-primary-deep);font-size:.72rem}.document-card h3{margin:.25rem 0;color:#172033;font-size:.98rem}.document-card p{margin:0;color:#64748b;font-size:.72rem}.reason-field,.review-note{display:grid;gap:.35rem}.reason-field span,.review-note span,.label{color:#94a3b8;font-size:.65rem;font-weight:850;text-transform:uppercase;letter-spacing:.07em}.reason-field textarea,.review-note textarea{width:100%;resize:vertical;border:0;border-radius:.7rem;background:#f8fafc;padding:.65rem;color:#334155;outline:0}.request-state{display:flex;align-items:center;gap:.4rem;color:#64748b;font-size:.72rem;font-weight:800}.request-state[data-status=PENDING]{color:#b45309}.request-state[data-status=REJECTED]{color:var(--brand-primary)}.request-list,.approval-list{display:grid;gap:.7rem}.request-row{display:grid;grid-template-columns:1.1fr 1fr .7fr;gap:1rem;align-items:center;border-radius:.9rem;background:#f8fafc;padding:.9rem}.request-row>div{min-width:0}.request-row strong,.request-row small{display:block}.request-row small{margin-top:.2rem;color:#64748b;font-size:.68rem}.request-number{color:var(--brand-primary-deep);font-size:.68rem;font-weight:850}.request-row p,.reason-copy p,.requested-document p{margin:.25rem 0 0;color:#475569;font-size:.75rem;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}.status-pill{display:inline-flex;border-radius:999px;background:#fef3c7;padding:.3rem .55rem;color:#92400e;font-size:.68rem;font-weight:900}.status-pill[data-status=APPROVED]{background:#dcfce7;color:#166534}.status-pill[data-status=REJECTED]{background:var(--brand-soft-strong);color:var(--brand-primary-deep)}.approval-card{display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:1rem;align-items:end;border-radius:1rem;background:#fff;padding:1rem;box-shadow:0 5px 18px rgba(15,23,42,.08)}.applicant{display:flex;align-items:center;gap:.7rem}.avatar{display:grid;place-items:center;width:2.5rem;height:2.5rem;border-radius:.7rem;background:var(--brand-soft-strong);color:var(--brand-primary-deep)}.applicant strong,.applicant small,.requested-document strong,.requested-document small{display:block}.applicant small,.requested-document small{margin-top:.15rem;color:#64748b;font-size:.68rem}.decision-actions{display:flex;gap:.45rem;white-space:nowrap}.empty-state{display:grid;place-items:center;gap:.4rem;min-height:11rem;border-radius:1rem;background:#f8fafc;color:#64748b;text-align:center}.empty-state i{color:var(--brand-primary-deep);font-size:1.5rem}.empty-state span{font-size:.75rem}.pager{display:flex;align-items:center;justify-content:center;gap:1rem;color:#64748b;font-size:.75rem}.pager button{border:0;border-radius:.7rem;background:#f1f5f9;padding:.55rem .75rem;color:#475569;font-weight:800}.pager button:disabled{opacity:.45}@media(max-width:1180px){.catalog-tools{grid-template-columns:minmax(15rem,1fr) 11rem}.catalog-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.approval-card{grid-template-columns:1fr 1fr}.decision-actions{grid-column:1/-1;justify-content:flex-end}}@media(max-width:720px){.access-hero{align-items:flex-start}.hero-status{display:none}.catalog-tools,.catalog-grid,.request-row,.approval-card{grid-template-columns:1fr}.decision-actions{grid-column:1}.workspace-head{align-items:flex-start}.access-tabs{width:100%;overflow-x:auto}.access-tabs button{white-space:nowrap}}
    `]
})
export class DocumentAccessRequestsPage implements OnInit {
    private api = inject(DocumentAccessRequestsService);
    private auth = inject(AuthService);
    private alerts = inject(AlertDialogService);
    private route = inject(ActivatedRoute);
    mode: AccessPageMode = (this.route.snapshot.data['mode'] as AccessPageMode | undefined) ?? 'all';
    loading = signal(true);
    errorMessage = signal('');
    catalog = signal<AccessRequestDocument[]>([]);
    myRequests = signal<DocumentAccessRequest[]>([]);
    pendingRequests = signal<DocumentAccessRequest[]>([]);
    activeTab = signal<ViewTab>('catalog');
    actingId = signal('');
    catalogPage = signal(1);
    catalogPages = signal(1);
    locationOptions = signal<SearchableDropdownOption[]>([]);
    search = '';
    documentType = '';
    locationId = '';
    requestReasons: Record<string, string> = {};
    reviewRemarks: Record<string, string> = {};
    decisionVisible = false;
    pendingDecision: PendingDecision | null = null;
    cancelVisible = false;
    pendingCancellation: DocumentAccessRequest | null = null;
    canUseCatalog = computed(() => this.mode !== 'reviewer' && this.auth.hasPermission('document-access-requests.catalog'));
    canViewOwn = computed(() => this.mode !== 'reviewer' && this.auth.hasPermission('document-access-requests.view-own'));
    canCancelOwn = computed(() => this.mode !== 'reviewer' && this.auth.hasPermission('document-access-requests.cancel-own'));
    canReview = computed(() => this.mode !== 'requester' && this.auth.hasPermission('document-access-requests.review'));
    canApprove = computed(() => this.mode !== 'requester' && this.auth.hasPermission('document-access-requests.approve'));
    canReject = computed(() => this.mode !== 'requester' && this.auth.hasPermission('document-access-requests.reject'));
    canGrant = computed(() => this.mode !== 'requester' && this.auth.hasAnyPermission('document-access-requests.grant', 'document-access-requests.approve'));

    ngOnInit() {
        this.activeTab.set(this.canReview() ? 'pending' : this.canUseCatalog() ? 'catalog' : 'mine');
        this.loadAll();
    }
    pageHeading() { return this.mode === 'reviewer' ? 'Access Request Review' : this.mode === 'requester' ? 'My Access Requests' : 'Document Access Requests'; }
    pageDescription() { return this.mode === 'reviewer' ? 'Review access requests and grant approved document assignments using only the actions authorized for your account.' : this.mode === 'requester' ? 'Find controlled documents and track only the access requests submitted by your account.' : 'Search approved document records, request assignment, and review pending approvals when authorized.'; }
    loadAll() {
        this.loading.set(true);
        let remaining = 0;
        const done = () => { remaining -= 1; if (remaining <= 0) this.loading.set(false); };
        if (this.canUseCatalog()) { remaining += 2; this.loadCatalog(done); this.loadLocations(done); }
        if (this.canViewOwn()) { remaining += 1; this.loadMine(done); }
        if (this.canReview()) { remaining += 1; this.loadPending(done); }
        if (!remaining) this.loading.set(false);
    }
    selectTab(tab: ViewTab) {
        if (tab === 'pending' && !this.canReview()) return;
        if (tab === 'catalog' && !this.canUseCatalog()) return;
        if (tab === 'mine' && !this.canViewOwn()) return;
        this.activeTab.set(tab);
        this.errorMessage.set('');
    }
    searchCatalog() { this.catalogPage.set(1); this.loadCatalog(); }
    setDocumentType(type: string) { this.documentType = type; if (type === 'SOFTCOPY') this.locationId = ''; this.searchCatalog(); }
    setLocation(value: SearchableDropdownValue) { this.locationId = value === null ? '' : String(value); if (this.locationId) this.documentType = 'HARDCOPY'; this.searchCatalog(); }
    changeCatalogPage(change: number) { this.catalogPage.update((page) => page + change); this.loadCatalog(); }
    loadCatalog(done?: () => void) { this.api.catalog(this.search, this.documentType, this.locationId, this.catalogPage(), 12).subscribe({ next: (result) => { this.catalog.set(result.items ?? []); this.catalogPages.set(result.meta?.total_pages ?? 1); done?.(); }, error: (error) => { this.errorMessage.set(this.message(error)); done?.(); } }); }
    loadLocations(done?: () => void) { this.api.locations().subscribe({ next: (locations) => { this.locationOptions.set((locations ?? []).map((location) => ({ value: location.location_id, label: location.location_name }))); done?.(); }, error: (error) => { this.errorMessage.set(this.message(error)); done?.(); } }); }
    loadMine(done?: () => void) { this.api.mine().subscribe({ next: (result) => { this.myRequests.set(result.items ?? []); done?.(); }, error: (error) => { this.errorMessage.set(this.message(error)); done?.(); } }); }
    loadPending(done?: () => void) { this.api.pending().subscribe({ next: (result) => { this.pendingRequests.set(result.items ?? []); done?.(); }, error: (error) => { this.errorMessage.set(this.message(error)); done?.(); } }); }
    hasRequestReason(document: AccessRequestDocument) { return !!this.requestReasons[document.document_id]?.trim(); }
    requestAccess(document: AccessRequestDocument) { const reason = this.requestReasons[document.document_id]?.trim() ?? ''; if (!reason) { this.errorMessage.set('A reason is required before requesting document access.'); return; } this.actingId.set(document.document_id); this.errorMessage.set(''); this.api.create(document.document_id, reason).subscribe({ next: (request) => { document.access_request = request; this.catalog.update((items) => [...items]); this.requestReasons[document.document_id] = ''; this.actingId.set(''); this.alerts.success('Access requested', `${document.document_title} was sent for approval.`); if (this.canViewOwn()) this.loadMine(); }, error: (error) => { this.actingId.set(''); this.errorMessage.set(this.message(error)); } }); }
    openCancellation(request: DocumentAccessRequest) { this.pendingCancellation = request; this.cancelVisible = true; }
    confirmCancellation() { const request = this.pendingCancellation; if (!request) return; this.actingId.set(request.access_request_id); this.api.cancel(request.access_request_id).subscribe({ next: (cancelled) => { this.myRequests.update((items) => items.map((item) => item.access_request_id === request.access_request_id ? cancelled : item)); this.catalog.update((items) => items.map((document) => document.document_id === request.document_id ? { ...document, access_request: cancelled } : document)); this.actingId.set(''); this.clearCancellation(); this.alerts.success('Request cancelled', 'The pending access request was cancelled. You may request this document again later.'); }, error: (error) => { this.actingId.set(''); this.clearCancellation(); this.errorMessage.set(this.message(error)); } }); }
    clearCancellation() { this.pendingCancellation = null; this.cancelVisible = false; }
    cancellationMessage() { const request = this.pendingCancellation; return request ? `Cancel your pending request for ${request.document.document_title}? The record will remain in your history.` : ''; }
    openDecision(request: DocumentAccessRequest, status: 'APPROVED' | 'REJECTED' | 'RETURNED') { this.pendingDecision = { request, status }; this.decisionVisible = true; }
    confirmDecision() {
        const decision = this.pendingDecision;
        if (!decision) return;
        this.actingId.set(decision.request.access_request_id);
        this.api.review(decision.request.access_request_id, decision.status, this.reviewRemarks[decision.request.access_request_id] ?? '').subscribe({
            next: () => { this.actingId.set(''); this.clearDecision(); this.alerts.success(decision.status === 'APPROVED' ? 'Access approved' : decision.status === 'RETURNED' ? 'Request returned' : 'Access rejected', decision.status === 'APPROVED' ? 'Use Grant Access to assign the document to the requester.' : 'The document remains unassigned to the requester.'); this.loadPending(); if (this.canViewOwn()) this.loadMine(); },
            error: (error) => { this.actingId.set(''); this.clearDecision(); this.errorMessage.set(this.message(error)); }
        });
    }
    clearDecision() { this.pendingDecision = null; this.decisionVisible = false; }
    grantAccess(request: DocumentAccessRequest) { this.actingId.set(request.access_request_id); this.api.grant(request.access_request_id).subscribe({ next: () => { this.actingId.set(''); this.alerts.success('Access granted', `${this.userName(request)} can now access the document.`); this.loadPending(); }, error: (error) => { this.actingId.set(''); this.errorMessage.set(this.message(error)); } }); }
    decisionTitle() { return this.pendingDecision?.status === 'APPROVED' ? 'Approve document access?' : this.pendingDecision?.status === 'RETURNED' ? 'Return access request?' : 'Reject document access?'; }
    decisionLabel() { return this.pendingDecision?.status === 'APPROVED' ? 'Approve request' : this.pendingDecision?.status === 'RETURNED' ? 'Return request' : 'Reject request'; }
    decisionMessage() { const decision = this.pendingDecision; if (!decision) return ''; const document = decision.request.document.document_title; return decision.status === 'APPROVED' ? `Approve access for ${this.userName(decision.request)} to ${document}? This records approval but does not grant access yet.` : decision.status === 'RETURNED' ? `Return ${this.userName(decision.request)}'s request for ${document} for correction?` : `Reject ${this.userName(decision.request)}'s access request for ${document}?`; }
    documentLocation(document: AccessRequestDocument) { return document.document_type === 'SOFTCOPY' ? document.softcopy?.category?.category_name || 'Softcopy folder not specified' : [document.hardcopy?.area?.area_name, document.hardcopy?.location?.location_name].filter(Boolean).join(' · ') || 'Hardcopy location not specified'; }
    requestStatusLabel(status: DocumentAccessRequestStatus) { return ({ PENDING: 'For access approval', ForAccessApproval: 'For access approval', APPROVED: 'Approved', AccessGranted: 'Access granted', RETURNED: 'Returned for correction', CANCELLED: 'Cancelled — you may request again', REVOKED: 'Access revoked', EXPIRED: 'Access expired', REJECTED: 'Rejected — you may request again' } as Record<string, string>)[status] || status; }
    userName(request: DocumentAccessRequest) { return [request.requester.firstname, request.requester.lastname].filter(Boolean).join(' ') || request.requester.username; }
    trackDocument = (_index: number, document: AccessRequestDocument) => document.document_id;
    trackRequest = (_index: number, request: DocumentAccessRequest) => request.access_request_id;
    private message(error: unknown) { const response = error as HttpErrorResponse; const message = response.error?.message; return Array.isArray(message) ? message.join(' ') : typeof message === 'string' ? message : 'The request could not be completed.'; }
}
