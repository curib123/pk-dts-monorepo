import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { AuditLogsPage } from './audit-logs.page';

describe('AuditLogsPage', () => {
    let fixture: ComponentFixture<AuditLogsPage>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [AuditLogsPage],
            providers: [{ provide: HttpClient, useValue: { get: () => of({ items: [], meta: { total: 0, total_pages: 1 } }) } }]
        }).compileComponents();

        fixture = TestBed.createComponent(AuditLogsPage);
        fixture.detectChanges();
    });

    it('does not repeat the shell page heading inside the audit workspace', () => {
        expect((fixture.nativeElement as HTMLElement).querySelector('h1')).toBeNull();
    });
});
