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
            <div class="shimmer-card shimmer-header">
                <div class="shimmer-line kicker"></div>
                <div class="shimmer-line title"></div>
                <div class="shimmer-line copy"></div>
            </div>

            <div class="shimmer-metrics">
                <div class="shimmer-card metric" *ngFor="let item of metricItems">
                    <div class="shimmer-line short"></div>
                    <div class="shimmer-line value"></div>
                    <div class="shimmer-line medium"></div>
                </div>
            </div>

            <div class="shimmer-card shimmer-table">
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
        :host{display:block}.shimmer-page{display:grid;gap:1.25rem}.shimmer-card{overflow:hidden;border:1px solid #e5e7eb;border-radius:18px;background:#fff;padding:1.4rem}.shimmer-header{border-left:6px solid var(--brand-primary)}.shimmer-line{position:relative;overflow:hidden;height:.85rem;border-radius:999px;background:#e5e7eb}.shimmer-line::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);animation:shimmer 1.35s ease-in-out infinite}.kicker{width:7rem;height:.65rem;background:var(--brand-border)}.title{width:min(22rem,72%);height:1.8rem;margin-top:.8rem;background:#d1d5db}.copy{width:min(34rem,90%);margin-top:.8rem}.shimmer-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem}.metric{display:grid;gap:.85rem}.short{width:42%}.value{width:28%;height:1.7rem;background:#d1d5db}.medium{width:70%}.shimmer-table{padding:0}.shimmer-toolbar{display:flex;justify-content:space-between;gap:1rem;padding:1.25rem}.search{width:min(22rem,65%);height:2.6rem;border-radius:12px}.button{width:7rem;height:2.6rem;border-radius:12px;background:#d1d5db}.shimmer-row{display:grid;grid-template-columns:repeat(var(--columns,6),minmax(0,1fr));gap:1rem;padding:1.05rem 1.25rem;border-top:1px solid #f1f5f9}.shimmer-row .shimmer-line{width:82%}.header-row{background:#f8fafc}.header-row .shimmer-line{height:.7rem;background:#d1d5db}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@keyframes shimmer{100%{transform:translateX(100%)}}@media(max-width:900px){.shimmer-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.shimmer-row{grid-template-columns:repeat(3,minmax(0,1fr))}.shimmer-row .shimmer-line:nth-child(n+4){display:none}}@media(max-width:560px){.shimmer-metrics{grid-template-columns:1fr}.shimmer-row{grid-template-columns:repeat(2,minmax(0,1fr))}.shimmer-row .shimmer-line:nth-child(n+3){display:none}.button{width:3.5rem}}@media(prefers-reduced-motion:reduce){.shimmer-line::after{animation:none}}
    `]
})
export class LoadingShimmerComponent {
    @Input() label = 'Loading page data';
    @Input() rows = 6;
    @Input() columns = 6;
    @Input() metrics = 4;

    get rowItems() { return Array.from({ length: this.rows }); }
    get columnItems() { return Array.from({ length: this.columns }); }
    get metricItems() { return Array.from({ length: this.metrics }); }
}
