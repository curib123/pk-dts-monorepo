import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { BackupRestorePage } from './backup-restore.page';
import { BackupRestoreService } from './backup-restore.service';

describe('BackupRestorePage', () => {
    let service: jasmine.SpyObj<BackupRestoreService>;

    beforeEach(async () => {
        service = jasmine.createSpyObj<BackupRestoreService>('BackupRestoreService', [
            'listBackups',
            'listLogs',
            'createBackup',
            'restoreBackup',
            'restoreUploadedBackup',
            'factoryReset',
            'deleteBackup'
        ]);
        service.listBackups.and.returnValue(of([]));
        service.listLogs.and.returnValue(of([]));

        await TestBed.configureTestingModule({
            imports: [BackupRestorePage],
            providers: [
                { provide: BackupRestoreService, useValue: service },
                { provide: AuthService, useValue: { hasAnyPermission: () => true } },
                { provide: AlertDialogService, useValue: { show: () => undefined } },
                { provide: SystemSettingsService, useValue: { defaultDataView: () => 'list' } }
            ]
        }).compileComponents();
    });

    it('loads only backup metadata on initial page entry', () => {
        const fixture = TestBed.createComponent(BackupRestorePage);
        fixture.detectChanges();

        expect(service.listBackups).toHaveBeenCalledTimes(1);
        expect(service.listLogs).not.toHaveBeenCalled();
        expect(fixture.componentInstance.activeTab()).toBe('backups');
    });

    it('lazy-loads backup activity only when Activity is opened', () => {
        const fixture = TestBed.createComponent(BackupRestorePage);
        fixture.detectChanges();
        const page = fixture.componentInstance;

        page.selectTab('activity');

        expect(service.listLogs).toHaveBeenCalledTimes(1);
        expect(page.logsLoaded()).toBeTrue();

        page.selectTab('backups');
        page.selectTab('activity');

        expect(service.listLogs).toHaveBeenCalledTimes(1);
    });

    it('renders the workspace immediately instead of hiding the whole page behind a loading screen', () => {
        const fixture = TestBed.createComponent(BackupRestorePage);
        fixture.detectChanges();
        const element = fixture.nativeElement as HTMLElement;

        expect(element.querySelector('.backup-toolbar')).not.toBeNull();
        expect(element.querySelector('app-loading-shimmer')).toBeNull();
    });
});
