import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BACKEND_API_BASE_URL } from '@/app/config/api-config';

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
    before_state?: unknown;
    after_state?: unknown;
    workflow_context?: unknown;
    created_at: string;
}

@Component({
    selector: 'app-audit-logs-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: ` <section class="audit-page">
        <header class="audit-hero">
            <div class="hero-mark"><i class="pi pi-shield"></i></div>
            <div class="hero-copy">
                <span>System accountability</span>
                <h1>Audit and activity logs</h1>
                <p>Review who performed each authenticated document and administration action.</p>
            </div>
            <div class="hero-stat">
                <strong>{{ total() }}</strong
                ><span>Recorded actions</span>
            </div>
            <button class="refresh-button" (click)="load()" [disabled]="loading()"><i class="pi pi-refresh" [class.pi-spin]="loading()"></i>{{ loading() ? 'Refreshing' : 'Refresh' }}</button>
        </header>
        <section class="filter-panel" aria-label="Audit log filters">
            <label class="search-field"><span>Search activity</span><div><i class="pi pi-search"></i><input [(ngModel)]="search" (keyup.enter)="apply()" placeholder="Description, path, reason" /></div></label>
            <label><span>Module</span><select [(ngModel)]="module" (ngModelChange)="apply()"><option value="">All modules</option><option *ngFor="let value of modules" [value]="value">{{ moduleLabel(value) }}</option></select></label>
            <label><span>Action</span><select [(ngModel)]="action" (ngModelChange)="apply()"><option value="">All actions</option><option *ngFor="let value of actions" [value]="value">{{ actionLabel(value) }}</option></select></label>
            <label><span>User or username</span><input [(ngModel)]="user" (keyup.enter)="apply()" placeholder="Name, username, or ID" /></label>
            <label><span>Document ID</span><input [(ngModel)]="document" (keyup.enter)="apply()" placeholder="Affected record" /></label>
            <label><span>From</span><input type="date" [(ngModel)]="from" (change)="apply()" /></label>
            <label><span>To</span><input type="date" [(ngModel)]="to" (change)="apply()" /></label>
            <button class="search-button" (click)="apply()"><i class="pi pi-search"></i> Search</button><button *ngIf="hasFilters()" class="clear-button" (click)="clearFilters()">Clear filters</button>
        </section>
        <section *ngIf="timelineDocument" class="timeline-panel">
            <div class="list-heading"><div><span>Investigation timeline</span><strong>Document #{{ timelineDocument }}</strong></div><button class="clear-button" (click)="closeTimeline()">Close</button></div>
            <div *ngIf="timelineLoading" class="empty">Loading workflow history…</div>
            <div *ngIf="!timelineLoading" class="timeline-list"><article *ngFor="let event of timelineEvents" class="timeline-event"><div class="timeline-dot"></div><div><strong>{{ event.label }}</strong><span>{{ event.actor }} · {{ event.created_at | date: 'medium' }}</span><small *ngIf="event.reason">Reason: {{ event.reason }}</small></div></article><div *ngIf="!timelineEvents.length" class="empty">No workflow or audit events were found for this document.</div></div>
        </section>
        <section class="activity-panel">
            <div class="list-heading">
                <div>
                    <span>Activity stream</span><strong>{{ loading() ? 'Loading authenticated actions…' : total() + ' results' }}</strong>
                </div>
                <small>Newest activity first</small>
            </div>
            <div class="logs" [class.loading]="loading()">
                <article *ngFor="let item of items()" class="log-entry">
                    <div class="action-icon" [attr.data-action]="item.action"><i [class]="icon(item.action)"></i></div>
                    <div class="actor">
                        <strong>{{ item.user_name || 'Unknown user' }}</strong
                        ><span>{{ item.role_name || 'No role recorded' }}</span
                        ><small>{{ item.user_username }}</small>
                    </div>
                    <div class="event">
                        <div class="event-title">
                            <em>{{ item.action }}</em
                            ><strong>{{ item.description }}</strong>
                        </div>
                        <div class="trace">
                            <span><i class="pi pi-box"></i>{{ moduleLabel(item.module) }}</span
                            ><span><i class="pi pi-clock"></i>{{ item.created_at | date: 'medium' }}</span
                            ><span *ngIf="item.ip_address"><i class="pi pi-desktop"></i>{{ item.ip_address }}</span><button *ngIf="item.entity_id" class="timeline-link" (click)="openTimeline(item.entity_id)"><i class="pi pi-clock"></i> Document timeline</button>
                        </div>
                        <small *ngIf="item.reason" class="reason"><i class="pi pi-comment"></i> {{ item.reason }}</small>
                    </div>
                </article>
                <div *ngIf="!items().length && !loading()" class="empty">
                    <i class="pi pi-search"></i><strong>No matching activity</strong><span>Try a different search term or clear the selected filters.</span><button *ngIf="hasFilters()" (click)="clearFilters()">Clear filters</button>
                </div>
            </div>
        </section>
        <footer *ngIf="total()">
            <span>Showing page {{ page() }} of {{ pages() }}</span>
            <div>
                <button [disabled]="page() === 1" (click)="move(-1)"><i class="pi pi-angle-left"></i> Previous</button><strong>{{ page() }} / {{ pages() }}</strong
                ><button [disabled]="page() >= pages()" (click)="move(1)">Next <i class="pi pi-angle-right"></i></button>
            </div>
        </footer>
    </section>`,
    styles: [
        `
            :host {
                display: block;
            }
            .audit-page {
                display: grid;
                gap: 0.9rem;
                color: var(--text-color, #171717);
            }
            button {
                border: 0;
                font: inherit;
                font-weight: 800;
                cursor: pointer;
            }
            .audit-hero {
                position: relative;
                overflow: hidden;
                display: grid;
                grid-template-columns: auto minmax(0, 1fr) auto auto;
                align-items: center;
                gap: 1rem;
                border-radius: 1.25rem;
                background: linear-gradient(120deg, #171717 0%, #292524 62%, var(--brand-primary-deep) 100%);
                padding: 1.25rem 1.4rem;
                color: #fff;
                box-shadow: 0 14px 32px rgba(17, 24, 39, 0.14);
            }
            .audit-hero:after {
                content: '';
                position: absolute;
                right: 12%;
                top: -7rem;
                width: 16rem;
                height: 16rem;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 50%;
            }
            .hero-mark {
                display: grid;
                place-items: center;
                width: 3.2rem;
                height: 3.2rem;
                border-radius: 0.85rem;
                background: rgba(255, 255, 255, 0.1);
                font-size: 1.35rem;
            }
            .hero-copy {
                position: relative;
                z-index: 1;
            }
            .hero-copy > span,
            .filter-panel label > span,
            .list-heading > div > span {
                display: block;
                color: var(--brand-border);
                font-size: 0.64rem;
                font-weight: 900;
                letter-spacing: 0.13em;
                text-transform: uppercase;
            }
            .hero-copy h1 {
                margin: 0.2rem 0;
                font-size: 1.45rem;
                letter-spacing: -0.02em;
            }
            .hero-copy p {
                margin: 0;
                color: #d6d3d1;
                font-size: 0.8rem;
            }
            .hero-stat {
                z-index: 1;
                border-left: 1px solid rgba(255, 255, 255, 0.18);
                padding: 0 1.1rem;
                text-align: center;
            }
            .hero-stat strong {
                display: block;
                font-size: 1.45rem;
            }
            .hero-stat span {
                color: #d6d3d1;
                font-size: 0.65rem;
            }
            .refresh-button {
                z-index: 1;
                display: flex;
                align-items: center;
                gap: 0.45rem;
                border-radius: 0.65rem;
                background: #fff;
                padding: 0.65rem 0.8rem;
                color: var(--brand-primary-deep);
            }
            .filter-panel {
                display: grid;
                grid-template-columns: minmax(16rem, 1.5fr) repeat(4, minmax(9rem, 1fr)) auto;
                align-items: end;
                gap: 0.65rem;
                border-radius: 1rem;
                background: var(--surface-card, #fff);
                padding: 0.9rem 1rem;
                box-shadow: 0 5px 18px rgba(17, 24, 39, 0.05);
            }
            .filter-panel label > span {
                margin-bottom: 0.35rem;
                color: #78716c;
            }
            .search-field div {
                position: relative;
            }
            .search-field i {
                position: absolute;
                left: 0.75rem;
                top: 50%;
                color: #a8a29e;
                transform: translateY(-50%);
            }
            .filter-panel input,
            .filter-panel select {
                width: 100%;
                min-height: 2.6rem;
                border: 1px solid rgba(148, 163, 184, 0.35);
                border-radius: 0.65rem;
                background: var(--surface-ground, #fff);
                padding: 0.6rem 0.7rem;
                color: var(--text-color, #171717);
                outline: 0;
            }
            .filter-panel input {
                padding-left: 2.25rem;
            }
            .filter-panel input:focus,
            .filter-panel select:focus {
                border-color: var(--brand-primary-deep);
                box-shadow: 0 0 0 3px rgba(153, 27, 27, 0.1);
            }
            .search-button {
                min-height: 2.6rem;
                border-radius: 0.65rem;
                background: var(--brand-primary-deep);
                padding: 0.6rem 0.9rem;
                color: #fff;
            }
            .clear-button {
                min-height: 2.6rem;
                background: transparent;
                color: #78716c;
            }
            .activity-panel {
                overflow: hidden;
                border-radius: 1rem;
                background: var(--surface-card, #fff);
                box-shadow: 0 5px 18px rgba(17, 24, 39, 0.05);
            }
            .list-heading {
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid rgba(148, 163, 184, 0.18);
                padding: 0.85rem 1rem;
            }
            .list-heading > div > span {
                color: var(--brand-primary-deep);
            }
            .list-heading strong {
                display: block;
                margin-top: 0.18rem;
                font-size: 0.9rem;
            }
            .list-heading small {
                color: #78716c;
            }
            .logs.loading {
                opacity: 0.65;
            }
            .log-entry {
                display: grid;
                grid-template-columns: 2.5rem 12rem minmax(0, 1fr) auto;
                align-items: center;
                gap: 0.9rem;
                border-bottom: 1px solid rgba(148, 163, 184, 0.16);
                padding: 0.85rem 1rem;
                transition: 0.16s;
            }
            .log-entry:hover {
                background: rgba(153, 27, 27, 0.025);
            }
            .action-icon {
                display: grid;
                place-items: center;
                width: 2.5rem;
                height: 2.5rem;
                border-radius: 0.7rem;
                background: #f5f5f4;
                color: var(--brand-primary-deep);
            }
            .action-icon[data-action='CREATE'] {
                background: #ecfdf5;
                color: #047857;
            }
            .action-icon[data-action='DELETE'] {
                background: var(--brand-soft);
                color: var(--brand-primary);
            }
            .actor {
                display: grid;
                min-width: 0;
            }
            .actor strong,
            .actor small {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .actor strong {
                font-size: 0.78rem;
            }
            .actor span {
                width: max-content;
                margin: 0.2rem 0;
                border-radius: 999px;
                background: #f5f5f4;
                padding: 0.12rem 0.38rem;
                color: #57534e;
                font-size: 0.57rem;
                font-weight: 800;
            }
            .actor small {
                color: #78716c;
                font-size: 0.63rem;
            }
            .event {
                min-width: 0;
            }
            .event-title {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            .event-title em {
                border-radius: 0.35rem;
                background: var(--brand-soft-strong);
                padding: 0.18rem 0.38rem;
                color: var(--brand-primary-deep);
                font-size: 0.58rem;
                font-style: normal;
                font-weight: 900;
            }
            .event-title strong {
                overflow: hidden;
                font-size: 0.8rem;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .trace {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 0.35rem 0.75rem;
                margin-top: 0.4rem;
                color: #78716c;
                font-size: 0.64rem;
            }
            .trace span {
                display: flex;
                align-items: center;
                gap: 0.25rem;
            }
            .trace i {
                color: #a8a29e;
            }
            .timeline-link { border: 0; background: transparent; color: var(--brand-primary-deep); font-size: .64rem; font-weight: 800; cursor: pointer; }
            .reason { display: block; margin-top: .45rem; color: #92400e; font-size: .68rem; }
            .timeline-panel { overflow: hidden; border-radius: 1rem; background: var(--surface-card, #fff); box-shadow: 0 5px 18px rgba(17,24,39,.05); }
            .timeline-list { display: grid; gap: .7rem; padding: 1rem 1.25rem 1.25rem; }
            .timeline-event { display: grid; grid-template-columns: .8rem 1fr; gap: .75rem; position: relative; }
            .timeline-event:not(:last-child)::before { content: ''; position: absolute; left: .34rem; top: .8rem; bottom: -.8rem; width: 1px; background: var(--brand-border); }
            .timeline-dot { position: relative; z-index: 1; width: .7rem; height: .7rem; margin-top: .25rem; border-radius: 50%; background: var(--brand-primary-deep); }
            .timeline-event strong,.timeline-event span,.timeline-event small { display: block; }
            .timeline-event strong { font-size: .78rem; }
            .timeline-event span { margin-top: .15rem; color: #78716c; font-size: .68rem; }
            .timeline-event small { margin-top: .25rem; color: #92400e; font-size: .68rem; }
            .empty {
                display: grid;
                place-items: center;
                gap: 0.4rem;
                padding: 3rem;
                color: #78716c;
                text-align: center;
            }
            .empty > i {
                display: grid;
                place-items: center;
                width: 3rem;
                height: 3rem;
                border-radius: 50%;
                background: var(--brand-soft);
                color: var(--brand-primary-deep);
                font-size: 1.2rem;
            }
            .empty strong {
                color: var(--text-color, #171717);
            }
            .empty span {
                font-size: 0.75rem;
            }
            .empty button {
                margin-top: 0.35rem;
                border-radius: 0.6rem;
                background: var(--brand-primary-deep);
                padding: 0.55rem 0.7rem;
                color: #fff;
            }
            footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.15rem 0.2rem;
                color: #78716c;
                font-size: 0.72rem;
            }
            footer div {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            footer button {
                display: flex;
                align-items: center;
                gap: 0.3rem;
                border-radius: 0.6rem;
                background: var(--surface-card, #fff);
                padding: 0.55rem 0.7rem;
                color: var(--text-color, #171717);
                box-shadow: 0 2px 8px rgba(17, 24, 39, 0.05);
            }
            button:disabled {
                cursor: not-allowed;
                opacity: 0.4;
            }
            @media (max-width: 950px) {
                .audit-hero {
                    grid-template-columns: auto 1fr auto;
                }
                .hero-stat {
                    display: none;
                }
                .filter-panel {
                    grid-template-columns: 1fr 12rem auto;
                }
                .clear-button {
                    grid-column: 1/-1;
                    justify-self: end;
                }
                .log-entry {
                    grid-template-columns: 2.5rem 10rem minmax(0, 1fr);
                }
            }
            @media (max-width: 680px) {
                .audit-hero {
                    grid-template-columns: auto 1fr;
                    padding: 1rem;
                }
                .refresh-button {
                    grid-column: 1/-1;
                    justify-content: center;
                }
                .filter-panel {
                    grid-template-columns: 1fr;
                }
                .clear-button {
                    grid-column: auto;
                    justify-self: stretch;
                }
                .log-entry {
                    grid-template-columns: 2.5rem minmax(0, 1fr);
                    align-items: start;
                }
                .actor {
                    padding-top: 0.15rem;
                }
                .event {
                    grid-column: 1/-1;
                }
                .event-title {
                    align-items: flex-start;
                }
                .event-title strong {
                    white-space: normal;
                }
                .trace {
                    display: grid;
                    gap: 0.35rem;
                }
                footer {
                    align-items: flex-start;
                    gap: 0.75rem;
                    flex-direction: column;
                }
                footer div {
                    width: 100%;
                    justify-content: space-between;
                }
            }
            .audit-hero {
                background: linear-gradient(120deg, #fff 0%, var(--brand-soft) 68%, var(--brand-soft-strong) 100%);
                color: #171717;
                box-shadow: 0 10px 28px rgba(127, 29, 29, 0.08);
            }
            .audit-hero:after {
                border-color: rgba(153, 27, 27, 0.1);
            }
            .hero-mark {
                background: var(--brand-primary-deep);
                color: #fff;
                box-shadow: 0 8px 18px rgba(153, 27, 27, 0.2);
            }
            .hero-copy > span {
                color: var(--brand-primary-deep);
            }
            .hero-copy h1 {
                color: #171717;
            }
            .hero-copy p {
                color: #57534e;
            }
            .hero-stat {
                border-left-color: var(--brand-border);
            }
            .hero-stat strong {
                color: var(--brand-primary-deep);
            }
            .hero-stat span {
                color: #78716c;
            }
            .refresh-button {
                background: var(--brand-primary-deep);
                color: #fff;
                box-shadow: 0 6px 14px rgba(153, 27, 27, 0.16);
            }
        `
    ]
})
export class AuditLogsPage implements OnInit {
    private http = inject(HttpClient);
    items = signal<AuditItem[]>([]);
    loading = signal(false);
    total = signal(0);
    page = signal(1);
    pages = signal(1);
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
    actions = ['LOGIN', 'LOGIN_FAILED', 'CREATE', 'UPDATE', 'UPLOAD_FILE', 'CORRECT_FILE', 'FINALIZE_FILE', 'APPROVE', 'REJECT', 'RETURN', 'DOWNLOAD', 'VIEW', 'DELETE'];
    modules = ['documents', 'users', 'roles', 'role-permissions', 'areas', 'specifics', 'asset-numbers', 'locations', 'softcopy-categories', 'backup-restore', 'system-settings', 'notifications'];
    ngOnInit() {
        this.load();
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
        this.page.update((v) => v + delta);
        this.load();
    }
    load() {
        this.loading.set(true);
        this.http.get<any>(`${BACKEND_API_BASE_URL}/audit-logs`, { params: { search: this.search, module: this.module, action: this.action, user: this.user, document: this.document, from: this.from, to: this.to, page: this.page(), limit: 20 } }).subscribe({
            next: (r) => {
                const d = r?.data ?? r;
                this.items.set(d.items ?? []);
                this.total.set(d.meta?.total ?? 0);
                this.pages.set(Math.max(1, d.meta?.total_pages ?? 1));
                this.loading.set(false);
            },
            error: () => this.loading.set(false)
        });
    }
    hasFilters() { return !!(this.search || this.module || this.action || this.user || this.document || this.from || this.to); }
    actionLabel(value: string) { return value.split('_').map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(' '); }
    openTimeline(documentId: string) {
        this.timelineDocument = documentId;
        this.timelineLoading = true;
        this.http.get<any>(`${BACKEND_API_BASE_URL}/audit-logs/documents/${documentId}/timeline`).subscribe({
            next: (response) => {
                const data = response?.data ?? response;
                const audit = (data.audit ?? []).map((item: AuditItem) => ({ label: item.description, actor: item.user_name || 'Unknown user', created_at: item.created_at, reason: item.reason }));
                const history = (data.workflow_history ?? []).map((item: { action: string; new_status: string; actor?: { firstname?: string; lastname?: string }; created_at: string; remarks?: string | null }) => ({ label: `${item.action} → ${item.new_status}`, actor: `${item.actor?.firstname || ''} ${item.actor?.lastname || ''}`.trim() || 'Unknown user', created_at: item.created_at, reason: item.remarks }));
                this.timelineEvents = [...audit, ...history].sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
                this.timelineLoading = false;
            },
            error: () => { this.timelineEvents = []; this.timelineLoading = false; }
        });
    }
    closeTimeline() { this.timelineDocument = ''; this.timelineEvents = []; }
    moduleLabel(value: string) {
        return value
            .split('-')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }
    icon(action: string) {
        return ['UPLOAD_FILE', 'CORRECT_FILE', 'FINALIZE_FILE'].includes(action) ? 'pi pi-file-edit' : action === 'APPROVE' ? 'pi pi-check' : action === 'REJECT' ? 'pi pi-times' : action === 'RETURN' ? 'pi pi-undo' : action === 'LOGIN' ? 'pi pi-sign-in' : action === 'LOGIN_FAILED' ? 'pi pi-lock' : action === 'CREATE' ? 'pi pi-plus' : action === 'DELETE' ? 'pi pi-trash' : action === 'VIEW' ? 'pi pi-eye' : action === 'DOWNLOAD' ? 'pi pi-download' : 'pi pi-pencil';
    }
}
