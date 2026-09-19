import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
    selector: 'app-loading-shimmer',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="shimmer-page" role="status" aria-live="polite" [attr.aria-label]="label" [style.--columns]="columns">
            <span class="sr-only">{{ label }}</span>
            <div class="shimmer-card">
                <div class="shimmer-toolbar">
                    <div class="shimmer-line search"></div>
                    <div class="shimmer-line button"></div>
                </div>
                <div class="shimmer-row header-row">
                    <div class="shimmer-line" *ngFor="let column of columnItems"></div>
                </div>
                <div class="shimmer-row" *ngFor="let row of rowItems">
                    <div class="shimmer-line" *ngFor="let column of columnItems"></div>
                </div>
            </div>
        </section>
    `,
    styles: [`
        :host{display:block}.shimmer-page{display:grid;gap:1rem}.shimmer-card{overflow:hidden;border:1px solid var(--app-border);border-radius:1rem;background:var(--app-surface);box-shadow:var(--app-shadow-sm)}.shimmer-line{position:relative;overflow:hidden;height:.72rem;border-radius:999px;background:var(--app-surface-soft)}.shimmer-line::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.72),transparent);animation:shimmer 1.25s ease-in-out infinite}.shimmer-toolbar{display:flex;justify-content:space-between;gap:1rem;padding:.8rem}.search{width:min(22rem,65%);height:2.6rem;border-radius:.7rem}.button{width:7rem;height:2.6rem;border-radius:.7rem}.shimmer-row{display:grid;grid-template-columns:repeat(var(--columns,6),minmax(0,1fr));gap:1rem;padding:.9rem 1rem;border-top:1px solid var(--app-border)}.shimmer-row .shimmer-line{width:82%}.header-row{background:var(--app-surface-muted)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@keyframes shimmer{100%{transform:translateX(100%)}}@media(max-width:900px){.shimmer-row{grid-template-columns:repeat(3,minmax(0,1fr))}.shimmer-row .shimmer-line:nth-child(n+4){display:none}}@media(max-width:560px){.shimmer-row{grid-template-columns:repeat(2,minmax(0,1fr))}.shimmer-row .shimmer-line:nth-child(n+3){display:none}.button{width:3.5rem}}@media(prefers-reduced-motion:reduce){.shimmer-line::after{animation:none}}
    `]
})
export class LoadingShimmerComponent {
    @Input() label = 'Loading page data';
    @Input() rows = 6;
    @Input() columns = 6;
    @Input() metrics = 0;

    get rowItems() { return Array.from({ length: this.rows }); }
    get columnItems() { return Array.from({ length: this.columns }); }
}
