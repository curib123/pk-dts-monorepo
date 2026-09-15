import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@/app/auth/auth.service';
import { UserAccountService } from '../user-account/user-account.service';
import { UserAccountDetail, UserAccountFormValue } from '../user-account/user-account.types';

@Component({
    selector: 'app-my-profile-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <section class="profile-page">
            <header class="profile-heading">
                <div>
                    <span class="eyebrow">MY ACCOUNT</span>
                    <h1>My Profile</h1>
                    <p>Update your own account details. Your role and reporting leader are managed by an authorized administrator.</p>
                </div>
                <span class="role-pill" *ngIf="user()">{{ user()!.role.role_name }}</span>
            </header>

            <div *ngIf="error()" class="feedback error"><i class="pi pi-exclamation-triangle"></i><span>{{ error() }}</span></div>
            <div *ngIf="success()" class="feedback success"><i class="pi pi-check-circle"></i><span>{{ success() }}</span></div>

            <div *ngIf="loading()" class="loading"><i class="pi pi-spin pi-spinner"></i> Loading your profile…</div>

            <form *ngIf="!loading() && user()" class="profile-card" (ngSubmit)="save()">
                <section class="identity-card">
                    <div class="avatar"><i class="pi pi-user"></i></div>
                    <div>
                        <strong>{{ displayName() }}</strong>
                        <span>{{ user()!.username }}</span>
                    </div>
                    <dl>
                        <div><dt>Role</dt><dd>{{ user()!.role.role_name }}</dd></div>
                        <div><dt>Leader</dt><dd>{{ leaderName() }}</dd></div>
                    </dl>
                </section>

                <section class="form-section">
                    <div class="section-copy">
                        <h2>Personal information</h2>
                        <p>These fields belong to your own account. Role and leader assignment cannot be changed here.</p>
                    </div>

                    <div class="form-grid">
                        <label>
                            <span>First name</span>
                            <input name="firstname" [(ngModel)]="form.firstname" maxlength="100" required />
                        </label>
                        <label>
                            <span>Middle name</span>
                            <input name="middlename" [(ngModel)]="form.middlename" maxlength="100" />
                        </label>
                        <label>
                            <span>Last name</span>
                            <input name="lastname" [(ngModel)]="form.lastname" maxlength="100" required />
                        </label>
                        <label>
                            <span>Username / email</span>
                            <input name="username" [(ngModel)]="form.username" maxlength="190" required />
                        </label>
                        <label class="wide">
                            <span>Position title</span>
                            <input name="position_title" [(ngModel)]="form.position_title" maxlength="150" />
                        </label>
                        <label class="wide">
                            <span>New password <small>Optional</small></span>
                            <input name="password" [(ngModel)]="form.password" type="password" autocomplete="new-password" placeholder="Leave blank to keep your current password" />
                        </label>
                    </div>

                    <div class="actions">
                        <button type="button" class="secondary" [disabled]="saving()" (click)="resetForm()">Reset changes</button>
                        <button type="submit" class="primary" [disabled]="saving() || !form.firstname.trim() || !form.lastname.trim() || !form.username.trim()">
                            <i class="pi" [ngClass]="saving() ? 'pi-spin pi-spinner' : 'pi-save'"></i>
                            {{ saving() ? 'Saving…' : 'Save profile' }}
                        </button>
                    </div>
                </section>
            </form>
        </section>
    `,
    styles: [`
        :host{display:block}.profile-page{display:grid;gap:1rem;color:#172033}.profile-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;border-radius:1.25rem;background:#fff;padding:1.35rem 1.5rem;box-shadow:0 10px 30px rgba(15,23,42,.06)}.eyebrow{color:#991b1b;font-size:.68rem;font-weight:900;letter-spacing:.14em}.profile-heading h1{margin:.25rem 0 .35rem;font-size:1.8rem}.profile-heading p{max-width:48rem;margin:0;color:#64748b;font-size:.82rem;line-height:1.55}.role-pill{border-radius:999px;background:#fef2f2;padding:.55rem .8rem;color:#991b1b;font-size:.72rem;font-weight:850}.feedback,.loading{display:flex;align-items:center;gap:.6rem;border-radius:.8rem;padding:.8rem 1rem}.feedback.error{background:#fff1f2;color:#991b1b}.feedback.success{background:#ecfdf5;color:#166534}.loading{background:#fff;color:#64748b}.profile-card{display:grid;grid-template-columns:minmax(15rem,19rem) minmax(0,1fr);gap:1rem}.identity-card,.form-section{border-radius:1.25rem;background:#fff;padding:1.25rem;box-shadow:0 10px 30px rgba(15,23,42,.05)}.identity-card{align-self:start;display:grid;gap:1rem}.avatar{display:grid;place-items:center;width:3rem;height:3rem;border-radius:1rem;background:#fef2f2;color:#991b1b;font-size:1.3rem}.identity-card strong{display:block;font-size:1.08rem}.identity-card span{display:block;margin-top:.2rem;color:#64748b;font-size:.78rem}.identity-card dl{display:grid;gap:.7rem;margin:0}.identity-card dl div{border-top:1px solid #eef2f7;padding-top:.7rem}.identity-card dt{color:#94a3b8;font-size:.67rem;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.identity-card dd{margin:.2rem 0 0;color:#334155;font-size:.8rem;font-weight:750}.form-section{display:grid;gap:1rem}.section-copy h2{margin:0;font-size:1.2rem}.section-copy p{margin:.25rem 0 0;color:#64748b;font-size:.78rem}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.form-grid label{display:grid;gap:.35rem}.form-grid label.wide{grid-column:1/-1}.form-grid label>span{color:#475569;font-size:.72rem;font-weight:800}.form-grid small{color:#94a3b8;font-weight:650}.form-grid input{width:100%;box-sizing:border-box;border:1px solid #dbe4ee;border-radius:.75rem;background:#f8fafc;padding:.75rem .8rem;color:#172033;outline:0}.form-grid input:focus{border-color:#991b1b;background:#fff;box-shadow:0 0 0 3px rgba(153,27,27,.08)}.actions{display:flex;justify-content:flex-end;gap:.65rem;border-top:1px solid #eef2f7;padding-top:1rem}.actions button{display:inline-flex;align-items:center;gap:.45rem;border:0;border-radius:.75rem;padding:.7rem .9rem;font-weight:850;cursor:pointer}.actions button:disabled{cursor:not-allowed;opacity:.55}.secondary{background:#eef2f7;color:#475569}.primary{background:#991b1b;color:#fff}@media(max-width:760px){.profile-card{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}.form-grid label.wide{grid-column:auto}.profile-heading{flex-direction:column}}
    `]
})
export class MyProfilePage implements OnInit {
    private readonly usersApi = inject(UserAccountService);
    private readonly auth = inject(AuthService);

    user = signal<UserAccountDetail | null>(null);
    loading = signal(true);
    saving = signal(false);
    error = signal('');
    success = signal('');
    form: UserAccountFormValue = this.emptyForm();

    ngOnInit() {
        this.load();
    }

    load() {
        this.loading.set(true);
        this.error.set('');
        this.usersApi.getCurrentUser().subscribe({
            next: (user) => {
                this.user.set(user);
                if (user) this.populateForm(user);
                else this.error.set('Your signed-in account could not be loaded.');
                this.loading.set(false);
            },
            error: (error) => {
                this.error.set(this.errorText(error));
                this.loading.set(false);
            }
        });
    }

    save() {
        const user = this.user();
        if (!user || this.saving()) return;
        this.saving.set(true);
        this.error.set('');
        this.success.set('');
        this.usersApi.updateUser(user.user_id, this.form).subscribe({
            next: (updated) => {
                this.user.set(updated);
                this.populateForm(updated);
                this.saving.set(false);
                this.success.set('Your profile was updated successfully.');
                this.auth.refreshProfile()?.subscribe({ error: () => undefined });
            },
            error: (error) => {
                this.error.set(this.errorText(error));
                this.saving.set(false);
            }
        });
    }

    resetForm() {
        const user = this.user();
        if (user) this.populateForm(user);
        this.error.set('');
        this.success.set('');
    }

    displayName() {
        const user = this.user();
        return user ? [user.firstname, user.middlename, user.lastname].filter(Boolean).join(' ') : '';
    }

    leaderName() {
        const leader = this.user()?.leader;
        return leader ? [leader.firstname, leader.lastname].filter(Boolean).join(' ') : 'Not assigned';
    }

    private populateForm(user: UserAccountDetail) {
        this.form = {
            firstname: user.firstname ?? '',
            lastname: user.lastname ?? '',
            middlename: user.middlename ?? '',
            username: user.username ?? '',
            position_title: user.position_title ?? '',
            password: '',
            role_id: user.role.role_id,
            leader_id: user.leader_id ?? ''
        };
    }

    private emptyForm(): UserAccountFormValue {
        return { firstname: '', lastname: '', middlename: '', username: '', position_title: '', password: '', role_id: '', leader_id: '' };
    }

    private errorText(error: unknown) {
        const value = error as { error?: { message?: string | string[] }; message?: string };
        const message = value?.error?.message;
        return Array.isArray(message) ? message.join(' ') : message || value?.message || 'Unable to update your profile.';
    }
}
