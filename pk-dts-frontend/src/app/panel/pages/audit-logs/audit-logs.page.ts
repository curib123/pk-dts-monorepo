import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { BACKEND_API_BASE_URL } from '@/app/config/api-config';
import { WorkspacePageComponent, WorkspaceSearchComponent } from '@/app/shared/components/workspace-ui/workspace-ui.component';

interface AuditItem {
    audit_log_id: string;
    user_name: string;
    user_username: string;
    role_name: string;
    action: string;
    module: string;
    description: string;
    method: string;
    path: string;
    entity_id?: string;
    ip_address?: string;
    reason?: string | null;
    created_at: string;
}

interface AuditListResponse {
    items?: AuditItem[];
    meta?: {
        page?: number;
        limit?: number;
        has_next?: boolean;
    };
}

@Component({
    selector: 'app-audit-logs-page',
    standalone: true,
    imports: [WorkspaceSearchComponent, WorkspacePageComponent, CommonModule, FormsModule],
    template: `<app-workspace-page>
        <section class="audit-page">
            <div class="workspace-toolbar">
                <div class="workspace-summary">
                    <span>Recent system activity</span>
                    <strong>{{ loading() ? 'Loading activity…' : items().length + ' actions on this page' }}</strong>
                    <small>Only display fields are loaded; large audit snapshots stay on the server.</small>
                </div>
                <button type="button" class="refresh-button" (click)="load()" [disabled]="loading()">
                    <i class="pi pi-refresh" [class.pi-spin]="loading()"></i>
                    <span>{{ loading() ? 'Refreshing' : 'Refresh' }}</span>
                </button>
            </div>

            <section class="filter-panel" aria-label="Audit log filters">
                <app-workspace-search [value]="search" (valueChange)="search = $event" (search)="apply()" label="Search" placeholder="Description, path, reason, or user" />

                <label>
                    <span>Module</span>
                    <select [(ngModel)]="module" (ngModelChange)="apply()">
                        <option value="">All modules</option>
                        <option *ngFor="let value of modules" [value]="value">{{ moduleLabel(value) }}</option>
                    </select>
                </label>

                <label>
                    <span>Action</span>
                    <select [(ngModel)]="action" (ngModelChange)="apply()">
                        <option value="">All actions</option>
                        <option *ngFor="let value of actions" [value]="value">{{ actionLabel(value) }}</option>
                    </select>
                </label>

                <label>
                    <span>User</span>
                    <input [(ngModel)]="user" (keyup.enter)="apply()" placeholder="Name, username, or ID" />
                </label>

                <label>
                    <span>Document ID</span>
                    <input [(ngModel)]="document" (keyup.enter)="apply()" placeholder="Optional" inputmode="numeric" />
                </label>

                <label>
                    <span>From</span>
                    <input type="date" [(ngModel)]="from" (change)="apply()" />
                </label>

                <label>
                    <span>To</span>
                    <input type="date" [(ngModel)]="to" (change)="apply()" />
                </label>

                <div class="filter-actions">
                    <button type="button" class="search-button" (click)="apply()"><i class="pi pi-search"></i> Apply</button>
                    <button type="button" *ngIf="hasFilters()" class="clear-button" (click)="clearFilters()">Clear</button>
                </div>
            </section>

            <div *ngIf="errorMessage()" class="error-panel" role="alert">
                <i class="pi pi-exclamation-triangle"></i>
                <div>
                    <strong>Audit activity could not be loaded.</strong>
                    <span>{{ errorMessage() }}</span>
                </div>
                <button type="button" (click)="load()">Retry</button>
            </div>

            <section *ngIf="timelineDocument" class="timeline-panel">
                <div class="panel-heading">
                    <div>
                        <span>Document timeline</span>
                        <strong>Document #{{ timelineDocument }}</strong>
                    </div>
                    <button type="button" class="quiet-button" (click)="closeTimeline()">Close</button>
                </div>

                <div *ngIf="timelineLoading" class="inline-loading">
                    <i class="pi pi-spin pi-spinner"></i>
                    <span>Loading workflow history…</span>
                </div>

                <div *ngIf="!timelineLoading" class="timeline-list">
                    <article *ngFor="let event of timelineEvents" class="timeline-event">
                        <div class="timeline-dot"></div>
                        <div>
                            <strong>{{ event.label }}</strong>
                            <span>{{ event.actor }} · {{ event.created_at | date: 'medium' }}</span>
                            <small *ngIf="event.reason">Reason: {{ event.reason }}</small>
                        </div>
                    </article>
                    <div *ngIf="!timelineEvents.length" class="empty compact-empty">No workflow or audit events were found for this document.</div>
                </div>
            </section>

            <section class="activity-panel">
                <div class="panel-heading">
                    <div>
                        <span>Activity log</span>
                        <strong>Newest actions first</strong>
                    </div>
                    <small>Page {{ page() }}</small>
                </div>

                <div *ngIf="loading()" class="skeleton-list" aria-label="Loading audit activity">
                    <div *ngFor="let row of skeletonRows" class="skeleton-row">
                        <span></span><div><b></b><i></i></div><div><b></b><i></i></div>
                    </div>
                </div>

                <div *ngIf="!loading()" class="logs">
                    <article *ngFor="let item of items(); trackBy: trackItem" class="log-entry">
                        <div class="action-icon" [attr.data-action]="item.action">
                            <i [class]="icon(item.action)"></i>
                        </div>

                        <div class="actor">
                            <strong>{{ item.user_name || 'Unknown user' }}</strong>
                            <span>{{ item.role_name || 'No role recorded' }}</span>
                            <small>{{ item.user_username || 'No username' }}</small>
                        </div>

                        <div class="event">
                            <div class="event-title">
                                <em>{{ actionLabel(item.action) }}</em>
                                <strong>{{ item.description }}</strong>
                            </div>
                            <div class="trace">
                                <span><i class="pi pi-box"></i>{{ moduleLabel(item.module) }}</span>
                                <span><i class="pi pi-clock"></i>{{ item.created_at | date: 'medium' }}</span>
                                <span *ngIf="item.ip_address"><i class="pi pi-desktop"></i>{{ item.ip_address }}</span>
                                <button *ngIf="canOpenTimeline(item)" type="button" class="timeline-link" (click)="openTimeline(item.entity_id!)">
                                    <i class="pi pi-history"></i> Timeline
                                </button>
                            </div>
                            <small *ngIf="item.reason" class="reason"><i class="pi pi-comment"></i> {{ item.reason }}</small>
                        </div>
                    </article>

                    <div *ngIf="!items().length && !errorMessage()" class="empty">
                        <i class="pi pi-search"></i>
                        <strong>No matching activity</strong>
                        <span>Try a different search or clear the selected filters.</span>
                        <button *ngIf="hasFilters()" type="button" (click)="clearFilters()">Clear filters</button>
                    </div>
                </div>
            </section>

            <footer class="pagination" *ngIf="page() > 1 || hasNext()">
                <span>Page {{ page() }}</span>
                <div>
                    <button type="button" [disabled]="page() === 1 || loading()" (click)="move(-1)">
                        <i class="pi pi-angle-left"></i> Previous
                    </button>
                    <button type="button" [disabled]="!hasNext() || loading()" (click)="move(1)">
                        Next <i class="pi pi-angle-right"></i>
                    </button>
                </div>
            </footer>
        </section>
    </app-workspace-page>`,
    styles: [
        `
            :host { display: block; }

            .audit-page {
                display: grid;
                gap: 1rem;
                color: var(--app-text, #172033);
            }

            button, input, select { font: inherit; }

            .workspace-toolbar,
            .filter-panel,
            .activity-panel,
            .timeline-panel,
            .error-panel {
                border: 1px solid var(--app-border, #e2e8f0);
                border-radius: 1rem;
                background: var(--app-surface, #fff);
                box-shadow: 0 4px 16px rgba(15, 23, 42, .045);
            }

            .workspace-toolbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                padding: .9rem 1rem;
            }

            .workspace-summary { min-width: 0; display: grid; gap: .12rem; }
            .workspace-summary > span,
            .panel-heading > div > span,
            .filter-panel label > span {
                color: var(--app-text-muted, #667085);
                font-size: .66rem;
                font-weight: 850;
                letter-spacing: .08em;
                text-transform: uppercase;
            }
            .workspace-summary strong { color: var(--app-heading, #101828); font-size: .9rem; }
            .workspace-summary small { color: var(--app-text-muted, #667085); font-size: .7rem; }

            .refresh-button,
            .search-button,
            .clear-button,
            .quiet-button,
            .pagination button,
            .error-panel button,
            .empty button {
                border: 0;
                border-radius: .65rem;
                min-height: 2.5rem;
                padding: .55rem .8rem;
                font-weight: 750;
                cursor: pointer;
            }

            .refresh-button,
            .search-button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: .45rem;
                color: #fff;
                background: var(--brand-primary-deep);
            }

            .filter-panel {
                display: grid;
                grid-template-columns: minmax(15rem, 1.7fr) repeat(2, minmax(9rem, .8fr)) minmax(10rem, 1fr) minmax(8rem, .7fr) minmax(9rem, .7fr) minmax(9rem, .7fr) auto;
                align-items: end;
                gap: .7rem;
                padding: 1rem;
            }

            .filter-panel label { min-width: 0; display: grid; gap: .35rem; }
            .search-field > div { position: relative; }
            .search-field > div > i {
                position: absolute;
                left: .75rem;
                top: 50%;
                color: #98a2b3;
                transform: translateY(-50%);
                pointer-events: none;
            }
            .filter-panel input,
            .filter-panel select {
                width: 100%;
                min-width: 0;
                height: 2.55rem;
                border: 1px solid #d0d5dd;
                border-radius: .65rem;
                background: var(--app-surface, #fff);
                padding: 0 .7rem;
                color: var(--app-text, #172033);
                outline: 0;
            }
            .search-field input { padding-left: 2.2rem; }
            .filter-panel input:focus,
            .filter-panel select:focus {
                border-color: var(--brand-primary);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-primary) 11%, transparent);
            }

            .filter-actions { display: flex; gap: .4rem; }
            .clear-button, .quiet-button {
                border: 1px solid var(--app-border, #e2e8f0);
                background: var(--app-surface-muted, #f8fafc);
                color: var(--app-text, #344054);
            }

            .error-panel {
                display: grid;
                grid-template-columns: auto minmax(0, 1fr) auto;
                align-items: center;
                gap: .75rem;
                padding: .85rem 1rem;
                border-color: #fecaca;
                background: #fff7f7;
                color: #991b1b;
            }
            .error-panel > div { display: grid; gap: .15rem; }
            .error-panel span { font-size: .75rem; }
            .error-panel button { background: #991b1b; color: #fff; }

            .activity-panel, .timeline-panel { overflow: hidden; }
            .panel-heading {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                padding: .85rem 1rem;
                border-bottom: 1px solid var(--app-border, #e2e8f0);
            }
            .panel-heading strong { display: block; margin-top: .16rem; color: var(--app-heading, #101828); font-size: .86rem; }
            .panel-heading small { color: var(--app-text-muted, #667085); font-size: .7rem; }

            .log-entry {
                display: grid;
                grid-template-columns: 2.5rem 11rem minmax(0, 1fr);
                align-items: center;
                gap: .85rem;
                padding: .85rem 1rem;
                border-bottom: 1px solid color-mix(in srgb, var(--app-border, #e2e8f0) 72%, transparent);
            }
            .log-entry:last-child { border-bottom: 0; }
            .log-entry:hover { background: var(--app-surface-muted, #f8fafc); }

            .action-icon {
                width: 2.5rem;
                height: 2.5rem;
                display: grid;
                place-items: center;
                border-radius: .7rem;
                background: #f2f4f7;
                color: var(--brand-primary-deep);
            }
            .action-icon[data-action='CREATE'],
            .action-icon[data-action='APPROVE'] { background: #ecfdf3; color: #047857; }
            .action-icon[data-action='DELETE'],
            .action-icon[data-action='REJECT'],
            .action-icon[data-action='LOGIN_FAILED'] { background: #fff1f2; color: #be123c; }

            .actor { min-width: 0; display: grid; gap: .12rem; }
            .actor strong, .actor small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .actor strong { font-size: .78rem; }
            .actor span {
                width: max-content;
                max-width: 100%;
                padding: .1rem .38rem;
                border-radius: 999px;
                background: #f2f4f7;
                color: #475467;
                font-size: .58rem;
                font-weight: 750;
            }
            .actor small { color: #667085; font-size: .64rem; }

            .event { min-width: 0; }
            .event-title { display: flex; align-items: center; gap: .45rem; min-width: 0; }
            .event-title em {
                flex: 0 0 auto;
                padding: .18rem .4rem;
                border-radius: .4rem;
                background: var(--brand-soft);
                color: var(--brand-primary-deep);
                font-size: .58rem;
                font-style: normal;
                font-weight: 850;
            }
            .event-title strong {
                overflow: hidden;
                min-width: 0;
                color: var(--app-heading, #101828);
                font-size: .78rem;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .trace {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: .35rem .75rem;
                margin-top: .38rem;
                color: #667085;
                font-size: .64rem;
            }
            .trace span { display: inline-flex; align-items: center; gap: .25rem; }
            .timeline-link {
                border: 0;
                background: transparent;
                padding: 0;
                color: var(--brand-primary-deep);
                font-size: .64rem;
                font-weight: 800;
                cursor: pointer;
            }
            .reason { display: block; margin-top: .38rem; color: #92400e; font-size: .67rem; }

            .skeleton-list { display: grid; }
            .skeleton-row {
                min-height: 4.2rem;
                display: grid;
                grid-template-columns: 2.5rem 11rem minmax(0, 1fr);
                align-items: center;
                gap: .85rem;
                padding: .85rem 1rem;
                border-bottom: 1px solid var(--app-border, #e2e8f0);
            }
            .skeleton-row > span,
            .skeleton-row b,
            .skeleton-row i {
                display: block;
                border-radius: .45rem;
                background: linear-gradient(90deg, #eef2f6 25%, #f8fafc 50%, #eef2f6 75%);
                background-size: 200% 100%;
                animation: shimmer 1.2s linear infinite;
            }
            .skeleton-row > span { width: 2.5rem; height: 2.5rem; }
            .skeleton-row > div { display: grid; gap: .35rem; }
            .skeleton-row b { width: 68%; height: .7rem; }
            .skeleton-row i { width: 45%; height: .55rem; }
            @keyframes shimmer { to { background-position: -200% 0; } }

            .timeline-list { display: grid; gap: .7rem; padding: 1rem 1.2rem 1.2rem; }
            .timeline-event { position: relative; display: grid; grid-template-columns: .8rem minmax(0,1fr); gap: .7rem; }
            .timeline-event:not(:last-child)::before {
                content: '';
                position: absolute;
                left: .34rem;
                top: .85rem;
                bottom: -.8rem;
                width: 1px;
                background: var(--app-border, #e2e8f0);
            }
            .timeline-dot { position: relative; z-index: 1; width: .7rem; height: .7rem; margin-top: .25rem; border-radius: 50%; background: var(--brand-primary-deep); }
            .timeline-event strong, .timeline-event span, .timeline-event small { display: block; }
            .timeline-event strong { font-size: .78rem; }
            .timeline-event span { margin-top: .15rem; color: #667085; font-size: .68rem; }
            .timeline-event small { margin-top: .25rem; color: #92400e; font-size: .68rem; }
            .inline-loading { display: flex; align-items: center; justify-content: center; gap: .55rem; min-height: 5rem; color: #667085; font-size: .75rem; }

            .empty {
                min-height: 14rem;
                display: grid;
                place-items: center;
                align-content: center;
                gap: .4rem;
                padding: 2rem;
                color: #667085;
                text-align: center;
            }
            .compact-empty { min-height: 5rem; padding: 1rem; }
            .empty > i {
                width: 2.8rem;
                height: 2.8rem;
                display: grid;
                place-items: center;
                border-radius: 50%;
                background: var(--brand-soft);
                color: var(--brand-primary-deep);
            }
            .empty strong { color: var(--app-heading, #101828); }
            .empty span { font-size: .75rem; }
            .empty button { margin-top: .25rem; background: var(--brand-primary-deep); color: #fff; }

            .pagination {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                color: #667085;
                font-size: .72rem;
            }
            .pagination > div { display: flex; gap: .5rem; }
            .pagination button {
                display: inline-flex;
                align-items: center;
                gap: .3rem;
                border: 1px solid var(--app-border, #e2e8f0);
                background: var(--app-surface, #fff);
                color: var(--app-text, #344054);
            }

            button:disabled { cursor: not-allowed; opacity: .5; }

            @media (max-width: 1180px) {
                .filter-panel { grid-template-columns: repeat(4, minmax(0, 1fr)); }
                .search-field { grid-column: span 2; }
                .filter-actions { justify-content: flex-end; }
            }

            @media (max-width: 760px) {
                .workspace-toolbar { align-items: stretch; flex-direction: column; }
                .refresh-button { width: 100%; }
                .filter-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .search-field { grid-column: 1 / -1; }
                .filter-actions { grid-column: 1 / -1; }
                .filter-actions > button { flex: 1; }

                .log-entry,
                .skeleton-row {
                    grid-template-columns: 2.5rem minmax(0, 1fr);
                    align-items: start;
                }
                .event { grid-column: 1 / -1; }
                .event-title { align-items: flex-start; }
                .event-title strong { white-space: normal; }
                .pagination { align-items: stretch; flex-direction: column; }
                .pagination > div { width: 100%; }
                .pagination button { flex: 1; justify-content: center; }
            }

            @media (max-width: 480px) {
                .filter-panel { grid-template-columns: 1fr; }
                .search-field, .filter-actions { grid-column: auto; }
                .panel-heading { align-items: flex-start; }
            }

            @media (prefers-reduced-motion: reduce) {
                .skeleton-row > span, .skeleton-row b, .skeleton-row i { animation: none; }
            }
        `
    ]
})
export class AuditLogsPage implements OnInit, OnDestroy {
    private http = inject(HttpClient);
    private loadSubscription?: Subscription;
    private timelineSubscription?: Subscription;

    items = signal<AuditItem[]>([]);
    loading = signal(false);
    errorMessage = signal('');
    page = signal(1);
    hasNext = signal(false);

    search = '';
    module = '';
    action = '';
    user = '';
    document = '';
    from = '';
    to = '';

    timelineDocument = '';
    timelineLoading = false;
    timelineEvents: Array<{ label: string; actor: string; created_at: string; reason?: string | null }> = [];

    readonly skeletonRows = [1, 2, 3, 4, 5, 6];
    readonly actions = ['LOGIN', 'LOGIN_FAILED', 'CREATE', 'UPDATE', 'UPLOAD_FILE', 'CORRECT_FILE', 'FINALIZE_FILE', 'APPROVE', 'REJECT', 'RETURN', 'DOWNLOAD', 'VIEW', 'DELETE'];
    readonly modules = ['documents', 'users', 'roles', 'role-permissions', 'areas', 'specifics', 'asset-numbers', 'locations', 'softcopy-categories', 'backup-restore', 'system-settings', 'notifications'];

    ngOnInit() {
        this.load();
    }

    ngOnDestroy() {
        this.loadSubscription?.unsubscribe();
        this.timelineSubscription?.unsubscribe();
    }

    apply() {
        this.page.set(1);
        this.load();
    }

    clearFilters() {
        this.search = '';
        this.module = '';
        this.action = '';
        this.user = '';
        this.document = '';
        this.from = '';
        this.to = '';
        this.apply();
    }

    move(delta: number) {
        const next = Math.max(1, this.page() + delta);
        if (next === this.page()) return;
        this.page.set(next);
        this.load();
    }

    load() {
        this.loadSubscription?.unsubscribe();
        this.loading.set(true);
        this.errorMessage.set('');

        this.loadSubscription = this.http
            .get<AuditListResponse | { data: AuditListResponse }>(`${BACKEND_API_BASE_URL}/audit-logs`, {
                params: {
                    search: this.search.trim(),
                    module: this.module,
                    action: this.action,
                    user: this.user.trim(),
                    document: this.document.trim(),
                    from: this.from,
                    to: this.to,
                    page: this.page(),
                    limit: 20,
                    include_total: false
                }
            })
            .subscribe({
                next: (response) => {
                    const data = 'data' in response ? response.data : response;
                    this.items.set(data.items ?? []);
                    this.hasNext.set(!!data.meta?.has_next);
                    this.loading.set(false);
                },
                error: (error: { error?: { message?: string }; message?: string }) => {
                    this.items.set([]);
                    this.hasNext.set(false);
                    this.errorMessage.set(error?.error?.message || error?.message || 'The audit log request failed.');
                    this.loading.set(false);
                }
            });
    }

    hasFilters() {
        return !!(this.search || this.module || this.action || this.user || this.document || this.from || this.to);
    }

    actionLabel(value: string) {
        return value
            .split('_')
            .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
            .join(' ');
    }

    canOpenTimeline(item: AuditItem) {
        return item.module === 'documents' && !!item.entity_id && /^\d+$/.test(item.entity_id);
    }

    openTimeline(documentId: string) {
        this.timelineSubscription?.unsubscribe();
        this.timelineDocument = documentId;
        this.timelineLoading = true;
        this.timelineEvents = [];

        this.timelineSubscription = this.http
            .get<any>(`${BACKEND_API_BASE_URL}/audit-logs/documents/${documentId}/timeline`)
            .subscribe({
                next: (response) => {
                    const data = response?.data ?? response;
                    const audit = (data.audit ?? []).map((item: AuditItem) => ({
                        label: item.description,
                        actor: item.user_name || 'Unknown user',
                        created_at: item.created_at,
                        reason: item.reason
                    }));
                    const history = (data.workflow_history ?? []).map(
                        (item: { action: string; new_status: string; actor?: { firstname?: string; lastname?: string }; created_at: string; remarks?: string | null }) => ({
                            label: `${item.action} → ${item.new_status}`,
                            actor: `${item.actor?.firstname || ''} ${item.actor?.lastname || ''}`.trim() || 'Unknown user',
                            created_at: item.created_at,
                            reason: item.remarks
                        })
                    );
                    this.timelineEvents = [...audit, ...history].sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
                    this.timelineLoading = false;
                },
                error: () => {
                    this.timelineEvents = [];
                    this.timelineLoading = false;
                }
            });
    }

    closeTimeline() {
        this.timelineSubscription?.unsubscribe();
        this.timelineDocument = '';
        this.timelineLoading = false;
        this.timelineEvents = [];
    }

    moduleLabel(value: string) {
        return value
            .split('-')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    icon(action: string) {
        return ['UPLOAD_FILE', 'CORRECT_FILE', 'FINALIZE_FILE'].includes(action)
            ? 'pi pi-file-edit'
            : action === 'APPROVE'
              ? 'pi pi-check'
              : action === 'REJECT'
                ? 'pi pi-times'
                : action === 'RETURN'
                  ? 'pi pi-undo'
                  : action === 'LOGIN'
                    ? 'pi pi-sign-in'
                    : action === 'LOGIN_FAILED'
                      ? 'pi pi-lock'
                      : action === 'CREATE'
                        ? 'pi pi-plus'
                        : action === 'DELETE'
                          ? 'pi pi-trash'
                          : action === 'VIEW'
                            ? 'pi pi-eye'
                            : action === 'DOWNLOAD'
                              ? 'pi pi-download'
                              : 'pi pi-pencil';
    }

    trackItem = (_index: number, item: AuditItem) => item.audit_log_id;
}
