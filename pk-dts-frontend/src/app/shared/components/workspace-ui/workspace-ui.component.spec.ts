import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
    WorkspacePageComponent,
    WorkspaceSearchComponent,
    WorkspaceTabsComponent,
    WorkspaceToolbarComponent
} from './workspace-ui.component';

@Component({
    standalone: true,
    imports: [WorkspacePageComponent, WorkspaceToolbarComponent, WorkspaceTabsComponent, WorkspaceSearchComponent],
    template: `
        <app-workspace-page>
            <app-workspace-toolbar>
                <app-workspace-search
                    [value]="query"
                    (valueChange)="query = $event"
                    placeholder="Search records"
                />
                <button workspace-actions type="button">Create</button>
            </app-workspace-toolbar>
            <app-workspace-tabs ariaLabel="Sections">
                <button type="button" class="active">First <span>2</span></button>
                <button type="button">Second</button>
            </app-workspace-tabs>
        </app-workspace-page>
    `
})
class WorkspaceHostComponent {
    query = '';
}

describe('workspace UI primitives', () => {
    let fixture: ComponentFixture<WorkspaceHostComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({ imports: [WorkspaceHostComponent] }).compileComponents();
        fixture = TestBed.createComponent(WorkspaceHostComponent);
        fixture.detectChanges();
    });

    it('keeps page content inside one centralized workspace shell', () => {
        const element = fixture.nativeElement as HTMLElement;
        expect(element.querySelectorAll('.workspace-page-shell').length).toBe(1);
        expect(element.querySelector('.workspace-toolbar-shell')).not.toBeNull();
        expect(element.querySelector('.workspace-tabs-shell')).not.toBeNull();
    });

    it('projects toolbar actions into the action area instead of the main content area', () => {
        const element = fixture.nativeElement as HTMLElement;
        const action = element.querySelector('.workspace-toolbar-actions button');
        expect(action?.textContent?.trim()).toBe('Create');
        expect(element.querySelector('.workspace-toolbar-main button')).toBeNull();
    });

    it('emits shared search value changes', () => {
        const input = fixture.nativeElement.querySelector('.workspace-search-control input') as HTMLInputElement;
        input.value = 'audit';
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();

        expect(fixture.componentInstance.query).toBe('audit');
    });
});
