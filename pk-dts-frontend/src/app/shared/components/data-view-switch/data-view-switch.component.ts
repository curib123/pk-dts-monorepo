import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type DataViewMode = 'list' | 'grid';

@Component({
    selector: 'app-data-view-switch',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="view-toolbar">
            <div>
                <div class="view-title">{{ title }}</div>
                <div class="view-copy">{{ copy }}</div>
            </div>
            <div class="view-switch" role="group" [attr.aria-label]="title + ' view'">
                <button type="button" [class.active]="mode === 'list'" (click)="select('list')">
                    <i class="pi pi-list"></i><span>Table list</span>
                </button>
                <button type="button" [class.active]="mode === 'grid'" (click)="select('grid')">
                    <i class="pi pi-th-large"></i><span>Card grid</span>
                </button>
            </div>
        </div>
    `,
    styles: [
        `
            :host { display: block; }
            .view-toolbar { display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-top:1.25rem;border:1px solid #e2e8f0;border-radius:1.15rem;background:#f8fafc;padding:.85rem 1rem; }
            .view-title { color:#111827;font-size:.82rem;font-weight:900; }
            .view-copy { margin-top:.2rem;color:#64748b;font-size:.72rem; }
            .view-switch { display:flex;gap:.25rem;border:1px solid #d1d5db;border-radius:.85rem;background:#fff;padding:.25rem; }
            .view-switch button { display:flex;align-items:center;gap:.4rem;border:0;border-radius:.65rem;background:transparent;padding:.55rem .7rem;color:#64748b;font-size:.72rem;font-weight:800;cursor:pointer; }
            .view-switch button.active { background:#111827;color:#fff;box-shadow:0 6px 14px rgba(17,24,39,.16); }
            .view-switch button:hover:not(.active) { background:var(--brand-soft-strong);color:var(--brand-primary-deep); }
            @media (max-width:640px) { .view-toolbar { align-items:stretch;flex-direction:column; }.view-switch { align-self:flex-start; }.view-copy { display:none; } }
        `
    ]
})
export class DataViewSwitchComponent {
    @Input() mode: DataViewMode = 'list';
    @Input() title = 'Results';
    @Input() copy = 'Switch between a detailed table list and a visual card grid.';
    @Output() modeChange = new EventEmitter<DataViewMode>();

    select(mode: DataViewMode) {
        this.modeChange.emit(mode);
    }
}
