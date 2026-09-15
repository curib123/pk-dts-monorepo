import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { StorageClassificationService } from '../storage-classification/storage-classification.service';
import { SoftcopyFoldersPage } from './softcopy-folders.page';

describe('SoftcopyFoldersPage', () => {
    let fixture: ComponentFixture<SoftcopyFoldersPage>;
    const storage = jasmine.createSpyObj<StorageClassificationService>('StorageClassificationService', [
        'listSoftcopyCategories',
        'createSoftcopyCategory',
        'updateSoftcopyCategory',
        'deleteSoftcopyCategory'
    ]);
    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['hasAnyPermission']);

    beforeEach(async () => {
        storage.listSoftcopyCategories.and.returnValue(of({
            items: [
                { softcopy_category_id: '1', category_name: 'Policies', folder_name: 'policies', parent_category_id: null },
                { softcopy_category_id: '2', category_name: 'Forms', folder_name: 'forms', parent_category_id: '1' }
            ],
            meta: { total: 2, page: 1, limit: 1000, total_pages: 1 }
        }));
        auth.hasAnyPermission.and.callFake((...permissions: string[]) => permissions.includes('softcopy-folders.view'));

        await TestBed.configureTestingModule({
            imports: [SoftcopyFoldersPage],
            providers: [
                { provide: StorageClassificationService, useValue: storage },
                { provide: AuthService, useValue: auth }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(SoftcopyFoldersPage);
        fixture.detectChanges();
    });

    afterEach(() => {
        storage.listSoftcopyCategories.calls.reset();
        auth.hasAnyPermission.calls.reset();
    });

    it('loads only softcopy folder data', () => {
        expect(storage.listSoftcopyCategories).toHaveBeenCalledTimes(1);
        expect(fixture.componentInstance.categories().length).toBe(2);
    });

    it('does not expose storage-location administration concepts', () => {
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('Softcopy Folders');
        expect(text).not.toContain('Asset Numbers');
        expect(text).not.toContain('Locations');
        expect(text).not.toContain('Sequences');
    });
});
