import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
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

    it('opens the approval summary immediately while full details hydrate', () => {
        const component = fixture.componentInstance;
        const documents = TestBed.inject(DocumentsService) as any;
        const detailRequest = new Subject<any>();
        documents.getApprovalDocument = jasmine.createSpy().and.returnValue(detailRequest);
        const item = {
            document_id: '17',
            document_title: 'QUALITY FORM',
            document_type: 'SOFTCOPY',
            document_number: 'QF-17'
        } as any;

        component.viewDocument(item);

        expect(component.viewVisible).toBeTrue();
        expect(component.viewDocumentDetail).toBe(item);
        expect(component.viewLoadingId).toBe('17');

        detailRequest.next({ ...item, brief_description: 'Hydrated details' });
        detailRequest.complete();

        expect(component.viewDocumentDetail?.brief_description).toBe('Hydrated details');
        expect(component.viewLoadingId).toBe('');
    });

    it('opens one decision remark modal for every workflow decision', () => {
        const component = fixture.componentInstance;
        const item = { document_id: '17' } as any;

        component.openDecision(item, 'approve');

        expect(component.decisionRemarkVisible).toBeTrue();
        expect(component.pendingDecision?.remarks).toBe('');
    });

    it('requires a remark before submitting any workflow decision', () => {
        const component = fixture.componentInstance;
        const documents = TestBed.inject(DocumentsService) as any;
        documents.workflowAction = jasmine.createSpy().and.returnValue(of({}));
        const item = { document_id: '17' } as any;

        for (const action of ['approve', 'request-revision', 'reject', 'complete'] as const) {
            component.openDecision(item, action);
            component.submitDecisionRemark();

            expect(documents.workflowAction).not.toHaveBeenCalled();
            expect(component.decisionRemarkVisible).toBeTrue();
            component.clearDecision();
        }
    });

    it('uses the required audit remark copy for document decisions', () => {
        const component = fixture.componentInstance;
        component.openDecision({ document_id: '17' } as any, 'approve');

        expect(component.decisionRemarkTitle()).toBe('Document decision');
        expect(component.decisionRemarkDescription()).toBe('Add the required decision remark for the audit trail.');
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
