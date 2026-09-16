import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PaginatorModule } from 'primeng/paginator';
import type { PaginatorState } from 'primeng/types/paginator';

@Component({
    selector: 'app-pagination',
    standalone: true,
    imports: [CommonModule, PaginatorModule],
    template: `
        <div class="pagination-shell">
            <p-paginator
                [first]="first"
                [rows]="rows"
                [totalRecords]="totalRecords"
                [rowsPerPageOptions]="rowsPerPageOptions"
                [showCurrentPageReport]="showCurrentPageReport"
                [currentPageReportTemplate]="currentPageReportTemplate"
                [pageLinkSize]="pageLinkSize"
                styleClass="brand-paginator"
                (onPageChange)="pageChange.emit($event)"
            ></p-paginator>
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
            }

            .pagination-shell {
                display: flex;
                justify-content: center;
                padding: 0.25rem 0;
            }

            :host ::ng-deep .brand-paginator {
                width: 100%;
                border: 1px solid rgba(148, 163, 184, 0.18);
                border-radius: 1.25rem;
                background: rgba(255, 255, 255, 0.94);
                padding: 0.35rem 0.5rem;
                color: #334155;
                box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
            }

            :host ::ng-deep .brand-paginator .p-paginator-pages .p-paginator-page {
                border-radius: 9999px;
            }

            :host ::ng-deep .brand-paginator .p-paginator-pages .p-paginator-page.p-highlight,
            :host ::ng-deep .brand-paginator .p-paginator-pages .p-paginator-page.p-paginator-page-selected {
                background: var(--dts-accent, var(--brand-primary));
                color: #ffffff;
            }

            :host ::ng-deep .brand-paginator .p-paginator-first,
            :host ::ng-deep .brand-paginator .p-paginator-prev,
            :host ::ng-deep .brand-paginator .p-paginator-next,
            :host ::ng-deep .brand-paginator .p-paginator-last {
                border-radius: 9999px;
            }

            :host ::ng-deep .brand-paginator .p-dropdown {
                border-radius: 9999px;
            }

            :host ::ng-deep .brand-paginator .p-paginator-current {
                color: #64748b;
            }

            :host-context(.app-dark) ::ng-deep .brand-paginator {
                border-color: #333333;
                background: #171717;
                color: #d4d4d4;
                box-shadow: none;
            }

            :host-context(.app-dark) ::ng-deep .brand-paginator .p-paginator-page,
            :host-context(.app-dark) ::ng-deep .brand-paginator .p-paginator-first,
            :host-context(.app-dark) ::ng-deep .brand-paginator .p-paginator-prev,
            :host-context(.app-dark) ::ng-deep .brand-paginator .p-paginator-next,
            :host-context(.app-dark) ::ng-deep .brand-paginator .p-paginator-last {
                color: #d4d4d4;
            }

            :host-context(.app-dark) ::ng-deep .brand-paginator .p-paginator-page:not(.p-highlight):not(.p-paginator-page-selected):hover,
            :host-context(.app-dark) ::ng-deep .brand-paginator .p-paginator-first:hover,
            :host-context(.app-dark) ::ng-deep .brand-paginator .p-paginator-prev:hover,
            :host-context(.app-dark) ::ng-deep .brand-paginator .p-paginator-next:hover,
            :host-context(.app-dark) ::ng-deep .brand-paginator .p-paginator-last:hover {
                background: #27272a;
                color: #ffffff;
            }

            :host-context(.app-dark) ::ng-deep .brand-paginator .p-select,
            :host-context(.app-dark) ::ng-deep .brand-paginator .p-dropdown {
                border-color: #3f3f46;
                background: #101010;
                color: #f5f5f5;
            }

            :host-context(.app-dark) ::ng-deep .brand-paginator .p-paginator-current {
                color: #a3a3a3;
            }
        `
    ]
})
export class PaginationComponent {
    @Input() first = 0;
    @Input() rows = 10;
    @Input() totalRecords = 0;
    @Input() rowsPerPageOptions: number[] = [5, 10, 20];
    @Input() pageLinkSize = 5;
    @Input() showCurrentPageReport = true;
    @Input() currentPageReportTemplate = 'Showing {first} to {last} of {totalRecords}';

    @Output() pageChange = new EventEmitter<PaginatorState>();
}
