import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { DEFAULT_SYSTEM_SETTINGS, SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { RegistrationService } from './registration.service';
import { Register } from './register';

describe('Register', () => {
    const registration = jasmine.createSpyObj<RegistrationService>('RegistrationService', ['roles', 'register', 'reference', 'status']);

    beforeEach(async () => {
        registration.roles.calls.reset();
        registration.register.calls.reset();
        registration.reference.calls.reset();
        registration.status.calls.reset();
        registration.roles.and.returnValue(of([{ role_id: '2', role_name: 'Staff' }]));

        await TestBed.configureTestingModule({
            imports: [Register],
            providers: [
                provideRouter([]),
                { provide: RegistrationService, useValue: registration },
                { provide: SystemSettingsService, useValue: { settings: signal({ ...DEFAULT_SYSTEM_SETTINGS }) } }
            ]
        }).compileComponents();
    });

    it('renders the wide registration workspace without the separate staff-workspace label', () => {
        const fixture = TestBed.createComponent(Register);
        fixture.detectChanges();

        const element = fixture.nativeElement as HTMLElement;

        expect(element.querySelector('.login-shell')).not.toBeNull();
        expect(element.querySelector('.login-panel')).not.toBeNull();
        expect(element.querySelector('.registration-intro')).toBeNull();
        expect(element.querySelector('.login-card')).not.toBeNull();
        expect(element.querySelector('.register-topbar')).not.toBeNull();
        expect(element.querySelector('.portal-label')).toBeNull();
        expect(element.querySelector('.login-logo img')).not.toBeNull();
        expect(element.querySelector('form.registration-form')).not.toBeNull();

        const sections = element.querySelectorAll('.form-section');
        expect(sections.length).toBe(3);
        expect(element.querySelectorAll('.form-field').length).toBe(9);
        expect(element.querySelectorAll('.form-section-heading').length).toBe(3);
        expect(element.querySelectorAll('.form-section-copy strong').length).toBe(3);
        expect(element.querySelectorAll('.form-section-copy small').length).toBe(3);
        expect(element.querySelectorAll('.optional-tag').length).toBe(3);
        expect(element.querySelector('.form-actions .primary')).not.toBeNull();
    });

    it('rejects whitespace-only required names and overlong passwords before submitting', () => {
        const fixture = TestBed.createComponent(Register);
        fixture.detectChanges();
        const page = fixture.componentInstance;

        page.registerForm.setValue({
            firstname: '   ',
            lastname: 'User',
            middlename: '',
            username: 'test.user',
            position_title: '',
            applicant_remarks: '',
            requested_role_id: '2',
            password: 'x'.repeat(73),
            confirmPassword: 'x'.repeat(73)
        });

        page.submitRegistration();

        expect(page.registerForm.controls.firstname.hasError('required')).toBeTrue();
        expect(page.registerForm.controls.password.hasError('maxlength')).toBeTrue();
        expect(registration.register).not.toHaveBeenCalled();
        expect(page.errorMessage()).toContain('highlighted fields');
    });

    it('shows password mismatch feedback without calling the API', () => {
        const fixture = TestBed.createComponent(Register);
        fixture.detectChanges();
        const page = fixture.componentInstance;

        page.registerForm.setValue({
            firstname: 'Jane',
            lastname: 'Doe',
            middlename: '',
            username: 'jane.doe',
            position_title: '',
            applicant_remarks: '',
            requested_role_id: '2',
            password: 'password123',
            confirmPassword: 'password456'
        });
        page.registerForm.controls.confirmPassword.markAsTouched();

        expect(page.passwordMismatch()).toBeTrue();

        page.submitRegistration();

        expect(registration.register).not.toHaveBeenCalled();
        expect(page.errorMessage()).toBe('Passwords do not match.');
    });

    it('trims submitted text fields while preserving the password', () => {
        registration.register.and.returnValue(of({
            reference_code: 'REG-TEST',
            status: 'PENDING',
            created_at: '2026-09-19T00:00:00.000Z',
            requested_role: { role_name: 'Staff' },
            message: 'Submitted'
        }));

        const fixture = TestBed.createComponent(Register);
        fixture.detectChanges();
        const page = fixture.componentInstance;

        page.registerForm.setValue({
            firstname: '  Jane  ',
            lastname: '  Doe ',
            middlename: '  Q  ',
            username: '  jane.doe  ',
            position_title: '  Clerk  ',
            applicant_remarks: '  Please review  ',
            requested_role_id: '2',
            password: ' password123 ',
            confirmPassword: ' password123 '
        });

        page.submitRegistration();

        expect(registration.register).toHaveBeenCalledOnceWith({
            firstname: 'Jane',
            lastname: 'Doe',
            middlename: 'Q',
            username: 'jane.doe',
            position_title: 'Clerk',
            applicant_remarks: 'Please review',
            requested_role_id: '2',
            password: ' password123 '
        });
        expect(page.receipt()?.reference_code).toBe('REG-TEST');
    });

    it('keeps submission unavailable and offers retry when roles cannot be loaded', () => {
        registration.roles.and.returnValue(throwError(() => new Error('network')));

        const fixture = TestBed.createComponent(Register);
        fixture.detectChanges();
        const page = fixture.componentInstance;
        const element = fixture.nativeElement as HTMLElement;

        expect(page.rolesLoadError()).toContain('could not be loaded');
        expect((element.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBeTrue();
        expect(element.querySelector('.role-load-error button')).not.toBeNull();
    });
});
