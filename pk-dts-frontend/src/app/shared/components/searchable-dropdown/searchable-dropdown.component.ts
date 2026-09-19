import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';

export type SearchableDropdownValue = string | number | null;

export interface SearchableDropdownOption {
    label: string;
    value: string | number;
}

export const SEARCHABLE_DROPDOWN_THRESHOLD = 10;

@Component({
    selector: 'app-searchable-dropdown',
    standalone: true,
    imports: [CommonModule, FormsModule, SelectModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="searchable-dropdown-shell" [class.searchable-dropdown-invalid]="invalid">
            <p-select
                [inputId]="inputId"
                [options]="options"
                [ngModel]="value"
                (ngModelChange)="handleValueChange($event)"
                [optionLabel]="'label'"
                [optionValue]="'value'"
                [placeholder]="placeholder"
                [disabled]="disabled"
                [loading]="loading"
                [showClear]="showClear && !disabled"
                [filter]="true"
                [filterBy]="'label'"
                [filterFields]="['label']"
                [filterPlaceholder]="filterPlaceholder"
                [emptyMessage]="emptyMessage"
                [emptyFilterMessage]="emptyFilterMessage"
                [appendTo]="appendTo"
                [panelStyleClass]="panelStyleClass"
                [ariaLabel]="ariaLabel || placeholder"
                class="w-full searchable-dropdown-control"
            ></p-select>
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
            }

            .searchable-dropdown-shell :is(.searchable-dropdown-control, .p-select) {
                width: 100%;
            }

            .searchable-dropdown-shell ::ng-deep .p-select {
                min-height: 2.6rem;
                border-radius: 0.7rem;
                border: 1px solid var(--app-border-strong);
                background: var(--app-surface);
                color: var(--app-text);
                transition:
                    border-color 0.2s ease,
                    box-shadow 0.2s ease;
            }

            .searchable-dropdown-shell ::ng-deep .p-select:not(.p-disabled):hover {
                border-color: var(--app-text-faint);
            }

            .searchable-dropdown-shell ::ng-deep .p-select.p-focus {
                border-color: var(--brand-primary);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-primary) 11%, transparent);
            }

            .searchable-dropdown-shell ::ng-deep .p-select-label {
                padding: 0.63rem 0.75rem;
            }

            .searchable-dropdown-shell ::ng-deep .p-select-dropdown,
            .searchable-dropdown-shell ::ng-deep .p-select-clear-icon,
            .searchable-dropdown-shell ::ng-deep .p-select-dropdown-icon {
                color: var(--app-text-muted);
            }

            .searchable-dropdown-invalid ::ng-deep .p-select {
                border-color: var(--brand-primary);
            }
        `
    ]
})
export class SearchableDropdownComponent {
    @Input() inputId = '';
    @Input() value: SearchableDropdownValue = null;
    @Input() options: SearchableDropdownOption[] = [];
    @Input() placeholder = 'Select an option';
    @Input() filterPlaceholder = 'Search options';
    @Input() emptyMessage = 'No options available.';
    @Input() emptyFilterMessage = 'No matching options found.';
    @Input() disabled = false;
    @Input() loading = false;
    @Input() invalid = false;
    @Input() required = false;
    @Input() showClear = true;
    @Input() clearValue: SearchableDropdownValue = '';
    @Input() appendTo: 'body' | HTMLElement = 'body';
    @Input() panelStyleClass = 'searchable-dropdown-panel';
    @Input() ariaLabel = '';

    @Output() valueChange = new EventEmitter<SearchableDropdownValue>();

    handleValueChange(value: SearchableDropdownValue) {
        const nextValue = value ?? this.clearValue;
        this.valueChange.emit(nextValue);
    }
}
