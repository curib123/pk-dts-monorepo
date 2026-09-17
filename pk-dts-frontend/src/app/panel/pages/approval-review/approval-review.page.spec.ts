import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { DocumentsService } from '../documents/documents.service';
import { ApprovalReviewPage } from './approval-review.page';

describe('ApprovalReviewPage', () => {
    let fixture: ComponentFixture<ApprovalReviewPage>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ApprovalReviewPage],
            providers: [
                { provide: DocumentsService, useValue: {} },
                { provide: AuthService, useValue: {} },
                { provide: AlertDialogService, useValue: {} },
                { provide: SystemSettingsService, useValue: { defaultDataView: () => 'list' } }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(ApprovalReviewPage);
    });

    it('opens one decision remark modal for every workflow decision', () => {
        const component = fixture.componentInstance;
        const item = { document_id: '17' } as any;

        component.openDecision(item, 'approve');

        expect(component.decisionRemarkVisible).toBeTrue();
        expect(component.pendingDecision?.remarks).toBe('');
    });

    it('renders no inline decision remark inputs in the table or cards', () => {
        const documents = TestBed.inject(DocumentsService) as jasmine.SpyObj<DocumentsService>;
        const auth = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
        (documents as any).listPendingRequests = jasmine.createSpy().and.returnValue(of([]));
        (auth as any).isAdministrator = jasmine.createSpy().and.returnValue(false);
        (auth as any).hasPermission = jasmine.createSpy().and.returnValue(false);

        fixture.detectChanges();

        const element = fixture.nativeElement as HTMLElement;
        expect(element.querySelector('h1')).toBeNull();
        expect(element.querySelectorAll('input[placeholder="Optional remarks"]').length).toBe(0);
    });
});
