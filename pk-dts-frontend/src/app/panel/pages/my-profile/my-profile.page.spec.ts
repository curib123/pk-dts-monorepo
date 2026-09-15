import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { UserAccountService } from '../user-account/user-account.service';
import { MyProfilePage } from './my-profile.page';

describe('MyProfilePage', () => {
    let fixture: ComponentFixture<MyProfilePage>;
    const currentUser = {
        user_id: '7',
        firstname: 'Jane',
        lastname: 'Doe',
        middlename: null,
        username: 'jane@example.com',
        position_title: 'Clerk',
        role: { role_id: '4', role_name: 'Staff' },
        leader_id: '2',
        leader: { user_id: '2', firstname: 'Maria', lastname: 'Santos' }
    };
    const users = jasmine.createSpyObj<UserAccountService>('UserAccountService', ['getCurrentUser', 'updateUser']);
    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['refreshProfile']);

    beforeEach(async () => {
        users.getCurrentUser.and.returnValue(of(currentUser));
        users.updateUser.and.returnValue(of(currentUser));
        auth.refreshProfile.and.returnValue(of({} as never));

        await TestBed.configureTestingModule({
            imports: [MyProfilePage],
            providers: [
                { provide: UserAccountService, useValue: users },
                { provide: AuthService, useValue: auth }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(MyProfilePage);
        fixture.detectChanges();
    });

    afterEach(() => {
        users.getCurrentUser.calls.reset();
        users.updateUser.calls.reset();
        auth.refreshProfile.calls.reset();
    });

    it('loads only the signed-in account instead of the user-management list', () => {
        expect(users.getCurrentUser).toHaveBeenCalledTimes(1);
        expect(fixture.componentInstance.user()?.user_id).toBe('7');
    });

    it('keeps role and leader identity out of editable profile controls', () => {
        const element = fixture.nativeElement as HTMLElement;
        expect(element.querySelector('[name="role_id"]')).toBeNull();
        expect(element.querySelector('[name="leader_id"]')).toBeNull();
        expect(element.textContent).toContain('Staff');
        expect(element.textContent).toContain('Maria Santos');
    });
});
