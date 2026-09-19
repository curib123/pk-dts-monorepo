import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { AuditLogsPage } from './audit-logs.page';

describe('AuditLogsPage', () => {
    let fixture: ComponentFixture<AuditLogsPage>;
    let http: jasmine.SpyObj<HttpClient>;

    beforeEach(async () => {
        http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get']);
        http.get.and.returnValue(of({ items: [], meta: { page: 1, limit: 20, has_next: false } }));

        await TestBed.configureTestingModule({
            imports: [AuditLogsPage],
            providers: [{ provide: HttpClient, useValue: http }]
        }).compileComponents();

        fixture = TestBed.createComponent(AuditLogsPage);
        fixture.detectChanges();
    });

    it('loads a lightweight first audit page without requesting an exact total', () => {
        expect(http.get).toHaveBeenCalledTimes(1);

        const options = http.get.calls.mostRecent().args[1] as { params: Record<string, unknown> };
        expect(options.params['limit']).toBe(20);
        expect(options.params['include_total']).toBeFalse();
        expect(fixture.componentInstance.page()).toBe(1);
        expect(fixture.componentInstance.hasNext()).toBeFalse();
    });

    it('does not repeat the panel page title or legacy audit hero', () => {
        const element = fixture.nativeElement as HTMLElement;

        expect(element.querySelector('h1')).toBeNull();
        expect(element.querySelector('.audit-hero')).toBeNull();
        expect(element.querySelector('.workspace-toolbar')).not.toBeNull();
        expect(element.querySelector('.activity-panel')).not.toBeNull();
    });

    it('only offers a document timeline for numeric document audit entries', () => {
        const page = fixture.componentInstance;

        expect(
            page.canOpenTimeline({
                audit_log_id: '1',
                user_name: 'Jane',
                user_username: 'jane',
                role_name: 'Staff',
                action: 'VIEW',
                module: 'documents',
                description: 'Viewed document',
                method: 'GET',
                path: '/documents/12',
                entity_id: '12',
                created_at: '2026-09-19T00:00:00.000Z'
            })
        ).toBeTrue();

        expect(
            page.canOpenTimeline({
                audit_log_id: '2',
                user_name: 'Jane',
                user_username: 'jane',
                role_name: 'Staff',
                action: 'UPDATE',
                module: 'users',
                description: 'Updated user',
                method: 'PATCH',
                path: '/users/admin',
                entity_id: 'admin',
                created_at: '2026-09-19T00:00:00.000Z'
            })
        ).toBeFalse();
    });
});
