import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DEFAULT_SYSTEM_SETTINGS, SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { RegistrationService } from './registration.service';
import { Register } from './register';

describe('Register', () => {
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [Register],
            providers: [
                provideRouter([]),
                { provide: RegistrationService, useValue: { roles: () => of([]) } },
                { provide: SystemSettingsService, useValue: { settings: signal({ ...DEFAULT_SYSTEM_SETTINGS }) } }
            ]
        }).compileComponents();
    });

    it('uses the login composition while rendering the registration form', () => {
        const fixture = TestBed.createComponent(Register);
        fixture.detectChanges();

        const element = fixture.nativeElement as HTMLElement;

        expect(element.querySelector('.login-shell')).not.toBeNull();
        expect(element.querySelector('.login-panel')).not.toBeNull();
        expect(element.querySelector('.login-hero')).not.toBeNull();
        expect(element.querySelector('.login-card')).not.toBeNull();
        expect(element.querySelector('form.form-grid')).not.toBeNull();
    });
});
