import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import { AuthService } from '@/app/auth/auth.service';
import { DocumentsService } from '../documents/documents.service';
import { HardcopyTransfersService } from './hardcopy-transfers.service';
import { HardcopyTransfersPage } from './hardcopy-transfers.page';

describe('HardcopyTransfersPage', () => {
    let fixture: ComponentFixture<HardcopyTransfersPage>;
    const transfers = jasmine.createSpyObj<HardcopyTransfersService>('HardcopyTransfersService', ['listMine', 'listPending', 'create', 'action']);
    const documents = jasmine.createSpyObj<DocumentsService>('DocumentsService', ['listDocuments', 'listLocations', 'listSequences']);
    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['user']);

    beforeEach(async () => {
        documents.listDocuments.calls.reset();
        documents.listLocations.calls.reset();
        documents.listSequences.calls.reset();
        transfers.listMine.and.returnValue(of([]));
        transfers.listPending.and.returnValue(of([]));
        documents.listDocuments.and.returnValue(of([
            {
                document_id: 'document-1',
                document_number: 'DOC-001',
                document_title: 'Warehouse release form',
                document_type: 'HARDCOPY',
                status: 'Approved',
                hardcopy: {}
            }
        ] as any));
        documents.listLocations.and.returnValue(of([
            {
                location_id: 'location-1',
                location_name: 'Records room',
                specific: { specific_id: 'specific-1', specific_name: 'Operations', area: { area_id: 'area-1', area_name: 'Plant' } }
            }
        ] as any));
        documents.listSequences.and.returnValue(of([{ sequence_id: 'sequence-1', sequence_code: 'A-001' }] as any));
        auth.user.and.returnValue(null);

        await TestBed.configureTestingModule({
            imports: [HardcopyTransfersPage],
            providers: [
                { provide: ActivatedRoute, useValue: { snapshot: { data: {}, queryParamMap: { get: () => null } } } },
                { provide: AlertDialogService, useValue: jasmine.createSpyObj<AlertDialogService>('AlertDialogService', ['success', 'error', 'warning']) },
                { provide: AuthService, useValue: auth },
                { provide: DocumentsService, useValue: documents },
                { provide: HardcopyTransfersService, useValue: transfers }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(HardcopyTransfersPage);
        fixture.detectChanges();
    });

    it('uses friendly searchable selectors instead of raw destination IDs', () => {
        fixture.componentInstance.formOpen = true;
        fixture.detectChanges();

        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('Document title');
        expect(text).toContain('Destination location');
        expect(text).toContain('Transfer destination location');
        expect(text).not.toContain('Destination location ID');
        expect(text).not.toContain('Destination area ID');
        expect(text).not.toContain('Destination specific ID');
        expect(text).not.toContain('Destination sequence ID');
    });

    it('loads document titles, locations, and sequences only when the transfer form opens', () => {
        expect(documents.listDocuments).not.toHaveBeenCalled();
        expect(documents.listLocations).not.toHaveBeenCalled();
        expect(documents.listSequences).not.toHaveBeenCalled();

        fixture.componentInstance.toggleCreateForm();

        expect(documents.listDocuments).toHaveBeenCalledTimes(1);
        expect(documents.listLocations).toHaveBeenCalledTimes(1);
        expect(documents.listSequences).toHaveBeenCalledTimes(1);
    });

    it('derives the destination hierarchy and transfer location label from selections', () => {
        const page = fixture.componentInstance;
        page.toggleCreateForm();

        page.selectDestinationLocation('location-1');
        page.selectTransferDestination('location-1');

        expect(page.form.destination_location_id).toBe('location-1');
        expect(page.form.destination_area_id).toBe('area-1');
        expect(page.form.destination_specific_id).toBe('specific-1');
        expect(page.form.transfer_to).toBe('Records room');
        expect(page.selectedDestinationAreaName()).toBe('Plant');
        expect(page.selectedDestinationSpecificName()).toBe('Operations');
    });

    it('submits a created transfer into the Plant Manager workflow', () => {
        const page = fixture.componentInstance;
        page.form = {
            document_id: 'document-1',
            destination_location_id: 'location-1',
            reason: 'Move to the records room'
        };
        transfers.create.and.returnValue(of({ transfer_request_id: 'transfer-1' } as any));
        transfers.action.and.returnValue(of({} as any));

        page.create();

        expect(transfers.action).toHaveBeenCalledWith('transfer-1', 'submit');
    });
});
