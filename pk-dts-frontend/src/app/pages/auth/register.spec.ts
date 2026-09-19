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

    it('renders a normal wide registration form with clear sections', () => {
        const fixture = TestBed.createComponent(Register);
        fixture.detectChanges();

        const element = fixture.nativeElement as HTMLElement;
        const card = element.querySelector('.registration-card') as HTMLElement;
        const tabs = element.querySelector('.registration-tabs') as HTMLElement;
        const form = element.querySelector('form.registration-form') as HTMLElement;

        expect(element.querySelector('.registration-page')).not.toBeNull();
        expect(card).not.toBeNull();
        expect(tabs).not.toBeNull();
        expect(form).not.toBeNull();
        expect(card.firstElementChild).toBe(tabs);

        expect(element.querySelector('.login-shell')).toBeNull();
        expect(element.querySelector('.login-panel')).toBeNull();
        expect(element.querySelector('.login-card')).toBeNull();
        expect(element.querySelector('.registration-content')).toBeNull();
        expect(element.querySelector('.register-header')).toBeNull();
        expect(element.querySelector('.login-logo')).toBeNull();

        expect(element.textContent).not.toContain('Request an account');
        expect(element.textContent).not.toContain('Complete the form below for account review and access approval.');

        const sections = form.querySelectorAll('.form-section');
        expect(sections.length).toBe(3);
        expect(sections[0].querySelector('h2')?.textContent?.trim()).toBe('Personal details');
        expect(sections[0].querySelector('p')?.textContent?.trim()).toBe('Tell us who you are');
        expect(sections[1].querySelector('h2')?.textContent?.trim()).toBe('Work and access');
        expect(sections[2].querySelector('h2')?.textContent?.trim()).toBe('Secure your account');

        expect(form.querySelectorAll('.field-grid-3').length).toBe(2);
        expect(form.querySelectorAll('.field-grid-2').length).toBe(1);
        expect(form.querySelectorAll('.form-field').length).toBe(9);
        expect(form.querySelector('.full-row textarea')).not.toBeNull();
        expect(form.querySelector('.form-actions .primary-button')).not.toBeNull();
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
        expect(element.querySelector('.role-error button')).not.toBeNull();
    });
});
