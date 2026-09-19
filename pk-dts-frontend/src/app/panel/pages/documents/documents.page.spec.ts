import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { DocumentsPage } from './documents.page';
import { DocumentsService } from './documents.service';
import { DocumentSummary } from './documents.types';

describe('DocumentsPage hardcopy transfer actions', () => {
    let documentsService: jasmine.SpyObj<DocumentsService>;
    let router: jasmine.SpyObj<Router>;

    const hardcopyDocument: DocumentSummary = {
        document_id: '42',
        document_number: null,
        document_title: 'Hardcopy test document',
        document_type: 'HARDCOPY',
        status: 'Approved',
        created_at: '2026-09-19T00:00:00.000Z',
        hardcopy: {
            area: { area_id: '1', area_name: 'Admin' },
            location: { location_id: '2', location_name: 'Cabinet A' },
            asset: { asset_id: '3', asset_number: 'ASSET-001' },
            specific: { specific_id: '4', specific_name: 'Records' },
            sequence: { sequence_id: '5', sequence_code: 'SEQ-001' }
        },
        assignments: []
    };

    beforeEach(async () => {
        documentsService = jasmine.createSpyObj<DocumentsService>('DocumentsService', [
            'listDocuments',
            'listUsers',
            'listAreas',
            'listAssetNumbers',
            'listSpecifics',
            'listLocations',
            'listSequences',
            'listSoftcopyCategories'
        ]);
        documentsService.listDocuments.and.returnValue(of([]));
        documentsService.listUsers.and.returnValue(of([]));
        documentsService.listAreas.and.returnValue(of([]));
        documentsService.listAssetNumbers.and.returnValue(of([]));
        documentsService.listSpecifics.and.returnValue(of([]));
        documentsService.listLocations.and.returnValue(of([]));
        documentsService.listSequences.and.returnValue(of([]));
        documentsService.listSoftcopyCategories.and.returnValue(of([]));

        router = jasmine.createSpyObj<Router>('Router', ['navigate']);

        await TestBed.configureTestingModule({
            imports: [DocumentsPage],
            providers: [
                { provide: DocumentsService, useValue: documentsService },
                {
                    provide: AuthService,
                    useValue: {
                        user: () => ({ user_id: '10', firstname: 'Test', lastname: 'User' }),
                        hasPermission: (permission: string) => permission === 'hardcopy-transfers.create',
                        hasAnyPermission: () => false
                    }
                },
                {
                    provide: ActivatedRoute,
                    useValue: {
                        snapshot: { data: { documentType: 'HARDCOPY' } },
                        queryParamMap: of(convertToParamMap({}))
                    }
                },
                { provide: Router, useValue: router },
                {
                    provide: SystemSettingsService,
                    useValue: {
                        settings: () => ({ defaultDocumentView: 'list', documentRowsPerPage: 10 })
                    }
                },
                { provide: AlertDialogService, useValue: { show: () => undefined } }
            ]
        }).compileComponents();
    });

    it('renders exactly one hardcopy transfer action in list, grid, and folder views', () => {
        const fixture = TestBed.createComponent(DocumentsPage);
        fixture.detectChanges();

        const page = fixture.componentInstance;
        page.documents.set([hardcopyDocument]);
        page.isLoading.set(false);

        page.setViewMode('list');
        fixture.detectChanges();
        expect(transferButtons(fixture.nativeElement)).toBe(1);

        page.setViewMode('grid');
        fixture.detectChanges();
        expect(transferButtons(fixture.nativeElement)).toBe(1);

        page.setViewMode('folder');
        const roots = page.documentFolders();
        expect(roots.length).toBe(1);
        page.toggleFolder(roots[0].id);
        page.toggleFolder(roots[0].children[0].id);
        fixture.detectChanges();
        expect(transferButtons(fixture.nativeElement)).toBe(1);
    });

    function transferButtons(element: HTMLElement) {
        return element.querySelectorAll('button[title="Request hardcopy transfer"]').length;
    }
});
