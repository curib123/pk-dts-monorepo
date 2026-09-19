import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export type DataViewMode = 'list' | 'grid';

@Component({
    selector: 'app-data-view-switch',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
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
            :host { display:block;min-width:0;max-width:100%; }
            .view-toolbar { min-width:0;max-width:100%;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem;margin-top:1rem;border:1px solid var(--app-border);border-radius:1rem;background:var(--app-surface);padding:.7rem .8rem;box-shadow:var(--app-shadow-sm); }
            .view-toolbar > div:first-child { min-width:0;flex:1 1 16rem; }
            .view-title { overflow:hidden;color:var(--app-heading);font-size:.76rem;font-weight:850;text-overflow:ellipsis;white-space:nowrap; }
            .view-copy { margin-top:.12rem;color:var(--app-text-muted);font-size:.64rem;line-height:1.4; }
            .view-switch { max-width:100%;display:flex;flex:0 1 auto;gap:.2rem;overflow-x:auto;border:1px solid var(--app-border);border-radius:.72rem;background:var(--app-surface-muted);padding:.2rem;scrollbar-width:none; }
            .view-switch::-webkit-scrollbar { display:none; }
            .view-switch button { min-height:2.2rem;display:flex;align-items:center;gap:.35rem;flex:0 0 auto;border:0;border-radius:.55rem;background:transparent;padding:.45rem .6rem;color:var(--app-text-muted);font-size:.68rem;font-weight:800;cursor:pointer;white-space:nowrap; }
            .view-switch button.active { background:var(--app-surface);color:var(--brand-primary-deep);box-shadow:0 2px 8px rgba(15,23,42,.08); }
            .view-switch button:hover:not(.active) { color:var(--brand-primary-deep); }
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
