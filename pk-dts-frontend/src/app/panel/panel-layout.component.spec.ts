import { EMPTY, of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@/app/auth/auth.service';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { DashboardService } from './pages/dashboard/dashboard.service';
import { NotificationsService } from './notifications.service';
import { PanelLayoutComponent } from './panel-layout.component';

describe('PanelLayoutComponent', () => {
    it('waits before starting notification polling so the panel can render first', (done) => {
        const auth = {
            refreshProfile: jasmine.createSpy().and.returnValue(of(null)),
            user: jasmine.createSpy().and.returnValue({ firstname: 'Test', lastname: 'User', role: { role_name: 'Staff', permissions: [] } })
        };
        const dashboard = {
            getNavigationCounts: jasmine.createSpy().and.returnValue(of({ approval_review: 0, document_requests: 0, disposal_requests: 0, access_requests: 0, hardcopy_transfers: 0, user_accounts: 0 }))
        };
        const notifications = {
            list: jasmine.createSpy().and.returnValue(of({ items: [], unread_count: 0 }))
        };

        TestBed.configureTestingModule({
            imports: [PanelLayoutComponent],
            providers: [
                { provide: AuthService, useValue: auth },
                { provide: DashboardService, useValue: dashboard },
                { provide: NotificationsService, useValue: notifications },
                { provide: SystemSettingsService, useValue: { settings: () => ({ logoUrl: '', systemTitle: '', brandEyebrow: '', systemShortTitle: '' }) } },
                { provide: Router, useValue: { url: '/panel/dashboard', events: EMPTY, navigate: jasmine.createSpy(), navigateByUrl: jasmine.createSpy() } },
                { provide: ActivatedRoute, useValue: { snapshot: { data: {} }, firstChild: null } }
            ]
        });

        const fixture = TestBed.createComponent(PanelLayoutComponent);
        fixture.detectChanges();

        expect(dashboard.getNavigationCounts).not.toHaveBeenCalled();
        expect(notifications.list).not.toHaveBeenCalled();

        setTimeout(() => {
            expect(dashboard.getNavigationCounts).not.toHaveBeenCalled();
            expect(notifications.list).not.toHaveBeenCalled();

            setTimeout(() => {
                expect(dashboard.getNavigationCounts).toHaveBeenCalledTimes(1);
                expect(notifications.list).toHaveBeenCalledTimes(1);
                fixture.destroy();
                done();
            }, 220);
        }, 50);
    });
});
