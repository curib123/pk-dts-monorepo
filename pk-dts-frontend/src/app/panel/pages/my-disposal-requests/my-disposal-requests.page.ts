import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { TableModule } from 'primeng/table';
import { LoadingShimmerComponent } from '@/app/shared/components/loading-shimmer/loading-shimmer.component';
import { DocumentsService } from '../documents/documents.service';
import { DisposalRequestSummary } from '../documents/documents.types';
import { WorkspacePageComponent } from '@/app/shared/components/workspace-ui/workspace-ui.component';

@Component({
    selector: 'app-my-disposal-requests-page',
    standalone: true,
    imports: [WorkspacePageComponent, CommonModule, TableModule, LoadingShimmerComponent],
    template: `<app-workspace-page>
        <app-loading-shimmer *ngIf="loading" label="Loading your disposal requests" [columns]="6" />
        <section class="disposal-page" [style.display]="loading ? 'none' : null">
            <header><span>PERSONAL DISPOSAL WORKFLOW</span><h1>Disposal Requests</h1><p>Track the disposal requests submitted by your account and see the latest decision and reviewer remarks.</p></header>
            <div class="request-table"><p-table [value]="requests()" responsiveLayout="scroll">
                <ng-template pTemplate="header"><tr><th>Document</th><th>Requested action</th><th>Reason</th><th>Status</th><th>Submitted</th><th>Decision</th></tr></ng-template>
                <ng-template pTemplate="body" let-item><tr><td><strong>{{ item.document.document_number || item.document.document_title }}</strong><small>{{ item.document.document_title }}</small></td><td>{{ item.disposal_action }}<small *ngIf="item.disposal_action_other">{{ item.disposal_action_other }}</small></td><td>{{ item.disposal_remarks || 'No reason recorded' }}</td><td><span class="status" [attr.data-status]="item.status">{{ statusLabel(item.status) }}</span></td><td>{{ item.created_at | date:'medium' }}</td><td><span *ngIf="item.reviewer">{{ fullName(item.reviewer) }}</span><span *ngIf="!item.reviewer">Awaiting administrator review</span><small *ngIf="item.reviewer_remarks">{{ item.reviewer_remarks }}</small></td></tr></ng-template>
                <ng-template pTemplate="emptymessage"><tr><td colspan="6">You have not submitted any disposal requests.</td></tr></ng-template>
            </p-table></div>
        </section>
    </app-workspace-page>`,
    styles: [`:host{display:block}.disposal-page{display:grid;gap:1.25rem}.disposal-page header,.request-table{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:1.4rem}.disposal-page header{border-left:6px solid var(--brand-primary)}.disposal-page header span{color:var(--brand-primary);font-size:.72rem;font-weight:800;letter-spacing:.14em}.disposal-page h1{margin:.25rem 0;color:#111827}.disposal-page p{margin:0;color:#64748b}.status{display:inline-block;border-radius:999px;background:#f59e0b;color:#fff;padding:.35rem .65rem;font-size:.75rem;font-weight:800}.status[data-status=Approved]{background:#15803d}.status[data-status=Rejected]{background:var(--brand-primary)}.status[data-status=Cancelled]{background:#64748b}td small{display:block;color:#64748b;margin-top:.25rem}:host-context(.app-dark) header,:host-context(.app-dark) .request-table{border-color:#333;background:#171717;color:#e5e5e5}:host-context(.app-dark) h1{color:#f5f5f5}:host-context(.app-dark) td small,:host-context(.app-dark) p{color:#a3a3a3}`]
})
export class MyDisposalRequestsPage implements OnInit {
    private documents = inject(DocumentsService);
    requests = signal<DisposalRequestSummary[]>([]);
    loading = true;
    ngOnInit() { this.documents.listMyDisposalRequests().subscribe({ next: (items) => { this.requests.set(items ?? []); this.loading = false; }, error: () => { this.loading = false; } }); }
    statusLabel(status: string) { return ({ Pending: 'Pending administrator review', Approved: 'Approved', Rejected: 'Rejected', Cancelled: 'Cancelled' } as Record<string, string>)[status] || status; }
    fullName(user?: { firstname?: string; lastname?: string } | null) { return [user?.firstname, user?.lastname].filter(Boolean).join(' ') || 'Administrator'; }
}
