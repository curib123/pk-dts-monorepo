import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
    selector: 'app-record-grid',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div *ngIf="!empty; else emptyState" class="record-grid"><ng-content /></div>
        <ng-template #emptyState>
            <div class="empty-state">
                <i [class]="emptyIcon"></i>
                <strong>{{ emptyTitle }}</strong>
                <span>{{ emptyMessage }}</span>
            </div>
        </ng-template>
    `,
    styles: [
        `
            :host { display:block;margin-top:1rem; }
            .record-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,19rem),1fr));gap:1rem;align-items:stretch; }
            .empty-state { display:grid;place-items:center;gap:.45rem;border:1px dashed #cbd5e1;border-radius:1rem;background:var(--app-surface-muted);padding:3rem 1.25rem;color:var(--app-text-muted);text-align:center; }
            .empty-state i { font-size:1.75rem;color:var(--brand-primary); }
            .empty-state strong { color:var(--app-heading); }
            .empty-state span { font-size:.78rem; }
        `
    ]
})
export class RecordGridComponent {
    @Input() empty = false;
    @Input() emptyTitle = 'No records found';
    @Input() emptyMessage = 'There are no records to display.';
    @Input() emptyIcon = 'pi pi-search';
}

@Component({
    selector: 'app-record-card',
    standalone: true,
    imports: [CommonModule],
    template: `
        <article class="record-card">
            <div class="card-accent"></div>
            <header>
                <div class="card-icon"><i [class]="icon"></i></div>
                <div class="card-heading">
                    <span>{{ eyebrow }}</span>
                    <h3>{{ title }}</h3>
                    <p *ngIf="subtitle">{{ subtitle }}</p>
                </div>
                <div class="card-badges"><ng-content select="[record-badges]" /></div>
            </header>
            <div class="card-content"><ng-content select="[record-details]" /></div>
            <footer><ng-content select="[record-actions]" /></footer>
        </article>
    `,
    styles: [
        `
            :host { display:block;min-width:0;height:100%; }
            .record-card { position:relative;overflow:hidden;display:flex;flex-direction:column;height:100%;border:1px solid var(--app-border);border-radius:1rem;background:var(--app-surface);box-shadow:var(--app-shadow-sm);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease; }
            .record-card:hover { border-color:var(--brand-border);box-shadow:0 18px 38px rgba(127,29,29,.1);transform:translateY(-2px); }
            .card-accent { height:.28rem;background:linear-gradient(90deg,#111827,var(--brand-primary),var(--brand-primary-deep)); }
            header { display:grid;grid-template-columns:2.65rem minmax(0,1fr) auto;gap:.75rem;align-items:start;padding:1rem 1rem .8rem; }
            .card-icon { display:grid;place-items:center;width:2.65rem;height:2.65rem;border-radius:.8rem;background:#111827;color:#fff; }
            .card-heading { min-width:0; }
            .card-heading>span { display:block;color:var(--brand-primary);font-size:.6rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase; }
            h3 { overflow:hidden;margin:.18rem 0 0;color:var(--app-heading);font-size:.92rem;text-overflow:ellipsis;white-space:nowrap; }
            p { overflow:hidden;margin:.22rem 0 0;color:var(--app-text-muted);font-size:.7rem;text-overflow:ellipsis;white-space:nowrap; }
            .card-badges { display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.35rem; }
            .card-content { flex:1;padding:0 1rem 1rem; }
            footer { display:flex;justify-content:flex-end;gap:.45rem;border-top:1px solid var(--app-border);background:var(--app-surface-muted);padding:.75rem 1rem; }
            footer:empty { display:none; }
            :host ::ng-deep [record-badges] { display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.35rem; }
            :host ::ng-deep [record-badges]>* { display:inline-flex;align-items:center;border-radius:999px;background:#111827;padding:.3rem .55rem;color:#fff;font-size:.62rem;font-weight:800; }
            :host ::ng-deep [record-details] { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem; }
            :host ::ng-deep [record-details]>.wide { grid-column:1/-1; }
            :host ::ng-deep [record-details]>div { min-width:0;border:1px solid #f1f5f9;border-radius:.8rem;background:var(--app-surface-muted);padding:.65rem .7rem; }
            :host ::ng-deep [record-details] span { display:block;color:#94a3b8;font-size:.58rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase; }
            :host ::ng-deep [record-details] strong { display:block;overflow:hidden;margin-top:.2rem;color:#1f2937;font-size:.74rem;line-height:1.4;text-overflow:ellipsis; }
            :host ::ng-deep [record-details] small { display:block;margin-top:.2rem;color:var(--app-text-muted);font-size:.65rem;line-height:1.35; }
            :host ::ng-deep [record-actions] { display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.4rem; }
            @media(max-width:420px) { header { grid-template-columns:2.65rem minmax(0,1fr); }.card-badges { grid-column:1/-1;justify-content:flex-start; } }
        `
    ]
})
export class RecordCardComponent {
    @Input() icon = 'pi pi-file';
    @Input() eyebrow = 'Record';
    @Input() title = '';
    @Input() subtitle = '';
}
