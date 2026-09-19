import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-workspace-page',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="workspace-page-shell" [class.workspace-page-shell--compact]="compact">
            <ng-content></ng-content>
        </section>
    `
})
export class WorkspacePageComponent {
    @Input() compact = false;
}

@Component({
    selector: 'app-workspace-toolbar',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="workspace-toolbar-shell" [class.workspace-toolbar-shell--stacked]="stacked">
            <div class="workspace-toolbar-main"><ng-content></ng-content></div>
            <div class="workspace-toolbar-actions"><ng-content select="[workspace-actions]"></ng-content></div>
        </section>
    `
})
export class WorkspaceToolbarComponent {
    @Input() stacked = false;
}

@Component({
    selector: 'app-workspace-tabs',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <nav class="workspace-tabs-shell" [attr.aria-label]="ariaLabel">
            <ng-content></ng-content>
        </nav>
    `
})
export class WorkspaceTabsComponent {
    @Input() ariaLabel = 'Workspace sections';
}

@Component({
    selector: 'app-workspace-section',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="workspace-section-shell" [class.workspace-section-shell--flush]="flush">
            <header *ngIf="title || description || eyebrow" class="workspace-section-heading">
                <div class="workspace-section-copy">
                    <span *ngIf="eyebrow" class="workspace-section-eyebrow">{{ eyebrow }}</span>
                    <h2 *ngIf="title">{{ title }}</h2>
                    <p *ngIf="description">{{ description }}</p>
                </div>
                <div class="workspace-section-actions"><ng-content select="[workspace-actions]"></ng-content></div>
            </header>
            <div class="workspace-section-body"><ng-content></ng-content></div>
        </section>
    `
})
export class WorkspaceSectionComponent {
    @Input() eyebrow = '';
    @Input() title = '';
    @Input() description = '';
    @Input() flush = false;
}

@Component({
    selector: 'app-workspace-search',
    standalone: true,
    imports: [CommonModule, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <label class="workspace-search-shell">
            <span *ngIf="label" class="workspace-control-label">{{ label }}</span>
            <span class="workspace-search-control">
                <i class="pi pi-search" aria-hidden="true"></i>
                <input
                    type="search"
                    [ngModel]="value"
                    (ngModelChange)="handleValueChange($event)"
                    (keyup.enter)="search.emit(value)"
                    [placeholder]="placeholder"
                    [disabled]="disabled"
                    [attr.aria-label]="ariaLabel || label || placeholder"
                />
                <button *ngIf="value && clearable && !disabled" type="button" class="workspace-search-clear" aria-label="Clear search" (click)="clear()">
                    <i class="pi pi-times"></i>
                </button>
                <i *ngIf="loading" class="pi pi-spin pi-spinner workspace-search-loading" aria-hidden="true"></i>
            </span>
        </label>
    `
})
export class WorkspaceSearchComponent {
    @Input() value = '';
    @Input() label = '';
    @Input() placeholder = 'Search';
    @Input() ariaLabel = '';
    @Input() disabled = false;
    @Input() loading = false;
    @Input() clearable = true;
    @Output() valueChange = new EventEmitter<string>();
    @Output() search = new EventEmitter<string>();

    handleValueChange(value: string) {
        this.value = value;
        this.valueChange.emit(value);
    }

    clear() {
        this.value = '';
        this.valueChange.emit('');
        this.search.emit('');
    }
}
