import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { AuthUser, LoginResponse } from '@/app/auth/auth.types';
import { DEFAULT_SYSTEM_SETTINGS, SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { Login } from './login';

describe('Login', () => {
    let auth: jasmine.SpyObj<AuthService>;

    beforeEach(async () => {
        auth = jasmine.createSpyObj<AuthService>('AuthService', ['login']);

        await TestBed.configureTestingModule({
            imports: [Login],
            providers: [
                provideRouter([]),
                { provide: AuthService, useValue: auth },
                { provide: SystemSettingsService, useValue: { settings: signal({ ...DEFAULT_SYSTEM_SETTINGS }) } }
            ]
        }).compileComponents();
    });

    it('updates the rendered loading state when login completes asynchronously', () => {
        const request = new Subject<LoginResponse>();
        auth.login.and.returnValue(request.asObservable());
        const fixture = TestBed.createComponent(Login);
        const component = fixture.componentInstance;
        component.form.setValue({ username: 'staff', password: 'secret', rememberMe: false });

        component.submit();

        expect(component.loading()).toBeTrue();

        request.next({ user: {} as AuthUser, token: 'session-token' });
        request.complete();

        expect(component.loading()).toBeFalse();
    });
});
