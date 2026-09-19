import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { RegistrationReceipt, RegistrationRole, RegistrationService, RegistrationStatusResult } from './registration.service';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterModule],
    template: `
        <main class="registration-page" [style.--registration-cover]="coverImage()">
            <div class="registration-backdrop" aria-hidden="true"></div>

            <section class="registration-card">
                <nav class="registration-tabs" aria-label="Registration options">
                    <button type="button" [class.active]="mode() === 'register'" (click)="setMode('register')">
                        <i class="pi pi-user-plus" aria-hidden="true"></i>
                        <span>New request</span>
                    </button>
                    <button type="button" [class.active]="mode() === 'status'" (click)="setMode('status')">
                        <i class="pi pi-clock" aria-hidden="true"></i>
                        <span>Check status</span>
                    </button>
                </nav>

                <form
                    *ngIf="mode() === 'register' && !receipt()"
                    [formGroup]="registerForm"
                    (ngSubmit)="submitRegistration()"
                    class="registration-form"
                >
                    <section class="form-section">
                        <header class="section-heading">
                            <div>
                                <h2>Personal details</h2>
                                <p>Tell us who you are</p>
                            </div>
                        </header>

                        <div class="field-grid field-grid-3">
                            <label class="form-field" [class.invalid]="isRegisterFieldInvalid('firstname')">
                                <span class="field-label">First name</span>
                                <input formControlName="firstname" autocomplete="given-name" maxlength="100" required />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('firstname')">{{ registerFieldError('firstname') }}</small>
                            </label>

                            <label class="form-field" [class.invalid]="isRegisterFieldInvalid('lastname')">
                                <span class="field-label">Last name</span>
                                <input formControlName="lastname" autocomplete="family-name" maxlength="100" required />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('lastname')">{{ registerFieldError('lastname') }}</small>
                            </label>

                            <label class="form-field" [class.invalid]="isRegisterFieldInvalid('middlename')">
                                <span class="field-label">Middle name <small>Optional</small></span>
                                <input formControlName="middlename" autocomplete="additional-name" maxlength="100" />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('middlename')">{{ registerFieldError('middlename') }}</small>
                            </label>
                        </div>
                    </section>

                    <section class="form-section">
                        <header class="section-heading">
                            <div>
                                <h2>Work and access</h2>
                                <p>Help us assign the right permissions</p>
                            </div>
                        </header>

                        <div class="field-grid field-grid-3">
                            <label class="form-field" [class.invalid]="isRegisterFieldInvalid('username')">
                                <span class="field-label">Username</span>
                                <input formControlName="username" type="text" autocomplete="username" maxlength="150" required />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('username')">{{ registerFieldError('username') }}</small>
                            </label>

                            <label class="form-field" [class.invalid]="isRegisterFieldInvalid('position_title')">
                                <span class="field-label">Position title <small>Optional</small></span>
                                <input formControlName="position_title" autocomplete="organization-title" maxlength="100" />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('position_title')">{{ registerFieldError('position_title') }}</small>
                            </label>

                            <label class="form-field" [class.invalid]="isRegisterFieldInvalid('requested_role_id')">
                                <span class="field-label">Requested role</span>
                                <select formControlName="requested_role_id" required>
                                    <option value="">{{ rolesLoading() ? 'Loading roles…' : rolesLoadError() ? 'Roles unavailable' : 'Select the access role you need' }}</option>
                                    <option *ngFor="let role of roles()" [value]="role.role_id">{{ role.role_name }}</option>
                                </select>
                                <small class="field-help" *ngIf="!rolesLoadError()">The approver confirms your final role.</small>
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('requested_role_id')">{{ registerFieldError('requested_role_id') }}</small>
                                <span class="role-error" *ngIf="rolesLoadError()">
                                    <span>{{ rolesLoadError() }}</span>
                                    <button type="button" (click)="loadRoles()">Retry</button>
                                </span>
                            </label>

                            <label class="form-field full-row" [class.invalid]="isRegisterFieldInvalid('applicant_remarks')">
                                <span class="field-label">Remarks <small>Optional</small></span>
                                <textarea formControlName="applicant_remarks" rows="3" maxlength="1000" placeholder="Optional note for the account manager"></textarea>
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('applicant_remarks')">{{ registerFieldError('applicant_remarks') }}</small>
                            </label>
                        </div>
                    </section>

                    <section class="form-section">
                        <header class="section-heading">
                            <div>
                                <h2>Secure your account</h2>
                                <p>Use at least 8 characters</p>
                            </div>
                        </header>

                        <div class="field-grid field-grid-2">
                            <label class="form-field" [class.invalid]="isRegisterFieldInvalid('password')">
                                <span class="field-label">Password</span>
                                <input formControlName="password" type="password" autocomplete="new-password" minlength="8" maxlength="72" required />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('password')">{{ registerFieldError('password') }}</small>
                            </label>

                            <label class="form-field" [class.invalid]="isRegisterFieldInvalid('confirmPassword') || passwordMismatch()">
                                <span class="field-label">Confirm password</span>
                                <input formControlName="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="72" required />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('confirmPassword')">{{ registerFieldError('confirmPassword') }}</small>
                                <small class="field-error" *ngIf="!isRegisterFieldInvalid('confirmPassword') && passwordMismatch()">Passwords do not match.</small>
                            </label>
                        </div>
                    </section>

                    <div class="form-actions">
                        <div class="form-error" *ngIf="errorMessage()" aria-live="polite">
                            <i class="pi pi-exclamation-circle" aria-hidden="true"></i>
                            <span>{{ errorMessage() }}</span>
                        </div>

                        <button
                            class="primary-button"
                            type="submit"
                            [disabled]="loading() || rolesLoading() || !!rolesLoadError() || roles().length === 0"
                        >
                            <i class="pi" [ngClass]="loading() ? 'pi-spin pi-spinner' : 'pi-send'" aria-hidden="true"></i>
                            <span>{{ loading() ? 'Submitting…' : 'Submit registration request' }}</span>
                        </button>
                    </div>
                </form>

                <section *ngIf="receipt() as result" class="result-panel receipt-panel">
                    <i class="pi pi-check-circle result-icon" aria-hidden="true"></i>
                    <h2>Request submitted</h2>
                    <p>Save your private reference code.</p>
                    <code>{{ result.reference_code }}</code>
                    <p>{{ result.message }}</p>
                    <button class="primary-button" type="button" (click)="checkReceipt(result)">Check request status</button>
                </section>

                <form
                    *ngIf="mode() === 'status' && !statusResult()"
                    [formGroup]="statusForm"
                    (ngSubmit)="checkStatus()"
                    class="status-form"
                >
                    <div class="status-heading">
                        <h2>Check registration status</h2>
                        <p>Enter the username used during registration.</p>
                    </div>

                    <label class="form-field">
                        <span class="field-label">Username</span>
                        <input formControlName="username" type="text" autocomplete="username" />
                    </label>

                    <div
                        class="lookup-message"
                        [class.found]="referenceLookupState() === 'found'"
                        [class.missing]="referenceLookupState() === 'missing'"
                        *ngIf="referenceLookupState() !== 'idle'"
                        aria-live="polite"
                    >
                        <i class="pi" [ngClass]="referenceLookupState() === 'checking' ? 'pi-spin pi-spinner' : referenceLookupState() === 'found' ? 'pi-check-circle' : 'pi-info-circle'"></i>
                        <span>{{ referenceLookupMessage() }}</span>
                    </div>

                    <label class="form-field">
                        <span class="field-label">Reference code</span>
                        <input formControlName="reference_code" placeholder="REG-…" autocomplete="off" />
                    </label>

                    <div class="form-error" *ngIf="errorMessage()" aria-live="polite">
                        <i class="pi pi-exclamation-circle"></i>
                        <span>{{ errorMessage() }}</span>
                    </div>

                    <button
                        class="primary-button"
                        type="submit"
                        [disabled]="loading() || referenceLookupState() === 'checking' || statusForm.invalid"
                    >
                        <i class="pi pi-search" aria-hidden="true"></i>
                        <span>{{ loading() ? 'Checking…' : 'Check status' }}</span>
                    </button>
                </form>

                <section *ngIf="statusResult() as result" class="result-panel status-result" [attr.data-status]="result.status">
                    <div class="status-badge">{{ result.status }}</div>
                    <h2>{{ result.firstname }} {{ result.lastname }}</h2>
                    <p *ngIf="result.status === 'PENDING'">Your request is waiting for review.</p>
                    <p *ngIf="result.status === 'APPROVED'">Your account is approved. You can now sign in.</p>
                    <p *ngIf="result.status === 'REJECTED'">Your request was not approved. Review the note below before submitting another request.</p>

                    <dl>
                        <div>
                            <dt>Requested role</dt>
                            <dd>{{ result.requested_role.role_name }}</dd>
                        </div>
                        <div>
                            <dt>Assigned role</dt>
                            <dd>{{ result.assigned_role?.role_name || 'Not assigned yet' }}</dd>
                        </div>
                        <div>
                            <dt>Decision</dt>
                            <dd>{{ result.reviewed_at ? (result.reviewed_at | date: 'medium') : 'Pending review' }}</dd>
                        </div>
                        <div *ngIf="result.review_remarks">
                            <dt>Reviewer note</dt>
                            <dd>{{ result.review_remarks }}</dd>
                        </div>
                    </dl>

                    <div class="result-actions">
                        <a *ngIf="result.status === 'APPROVED'" routerLink="/auth/login">Go to sign in</a>
                        <button type="button" (click)="resetStatus()">Check another request</button>
                    </div>
                </section>

                <footer class="registration-footer">
                    Already approved? <a routerLink="/auth/login">Sign in</a>
                </footer>
            </section>
        </main>
    `,
    styles: [
        `
            :host {
                display: block;
                min-height: 100vh;
            }

            * {
                box-sizing: border-box;
            }

            .registration-page {
                position: relative;
                min-height: 100svh;
                padding: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--registration-cover) center / cover no-repeat fixed;
                color: #172033;
            }

            .registration-backdrop {
                position: absolute;
                inset: 0;
                background: rgba(15, 23, 42, .56);
            }

            .registration-card {
                position: relative;
                z-index: 1;
                width: min(1180px, 100%);
                padding: 28px 32px;
                border: 1px solid rgba(255, 255, 255, .72);
                border-radius: 18px;
                background: rgba(255, 255, 255, .98);
                box-shadow: 0 24px 70px rgba(15, 23, 42, .28);
            }

            .registration-tabs {
                width: min(360px, 100%);
                margin: 0 0 22px;
                padding: 4px;
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 6px;
                border: 1px solid #dfe5ec;
                border-radius: 10px;
                background: #f7f9fc;
            }

            .registration-tabs button {
                min-height: 40px;
                border: 0;
                border-radius: 7px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 8px 14px;
                color: #5f6b7a;
                background: transparent;
                font: inherit;
                font-size: 13px;
                font-weight: 700;
                white-space: nowrap;
                cursor: pointer;
            }

            .registration-tabs button.active {
                color: #fff;
                background: var(--brand-primary-deep);
            }

            .registration-form {
                display: grid;
                gap: 24px;
            }

            .form-section {
                display: grid;
                gap: 14px;
            }

            .form-section + .form-section {
                padding-top: 22px;
                border-top: 1px solid #e7ebf0;
            }

            .section-heading {
                margin: 0;
            }

            .section-heading h2,
            .status-heading h2 {
                margin: 0;
                color: #1f2937;
                font-size: 16px;
                font-weight: 800;
                line-height: 1.3;
            }

            .section-heading p,
            .status-heading p {
                margin: 3px 0 0;
                color: #7a8697;
                font-size: 12px;
                line-height: 1.4;
            }

            .field-grid {
                display: grid;
                gap: 16px;
            }

            .field-grid-3 {
                grid-template-columns: repeat(3, minmax(0, 1fr));
            }

            .field-grid-2 {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .form-field {
                min-width: 0;
                display: grid;
                gap: 7px;
            }

            .form-field.full-row {
                grid-column: 1 / -1;
            }

            .field-label {
                color: #344054;
                font-size: 13px;
                font-weight: 700;
                line-height: 1.35;
            }

            .field-label small {
                margin-left: 5px;
                color: #8a94a3;
                font-size: 11px;
                font-weight: 600;
            }

            .form-field input,
            .form-field select,
            .form-field textarea {
                width: 100%;
                min-width: 0;
                border: 1px solid #cfd6df;
                border-radius: 8px;
                background: #fff;
                color: #172033;
                font: inherit;
                font-size: 14px;
                outline: none;
                transition: border-color .15s ease, box-shadow .15s ease;
            }

            .form-field input,
            .form-field select {
                height: 44px;
                padding: 0 12px;
            }

            .form-field textarea {
                min-height: 82px;
                padding: 11px 12px;
                resize: vertical;
            }

            .form-field input:focus,
            .form-field select:focus,
            .form-field textarea:focus {
                border-color: var(--brand-primary);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-primary) 12%, transparent);
            }

            .form-field.invalid input,
            .form-field.invalid select,
            .form-field.invalid textarea {
                border-color: #dc2626;
            }

            .field-help {
                color: #7a8697;
                font-size: 11px;
                line-height: 1.35;
            }

            .field-error {
                color: #b42318;
                font-size: 11px;
                font-weight: 650;
                line-height: 1.35;
            }

            .role-error {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                color: #b42318;
                font-size: 11px;
                font-weight: 650;
            }

            .role-error button {
                border: 1px solid #fecaca;
                border-radius: 6px;
                padding: 4px 8px;
                color: #991b1b;
                background: #fff5f5;
                font: inherit;
                font-weight: 700;
                cursor: pointer;
            }

            .form-actions {
                display: grid;
                gap: 10px;
                padding-top: 2px;
            }

            .form-error {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                border: 1px solid #fecaca;
                border-radius: 8px;
                color: #b42318;
                background: #fff5f5;
                font-size: 12px;
            }

            .primary-button {
                width: 100%;
                min-height: 44px;
                border: 0;
                border-radius: 8px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 16px;
                color: #fff;
                background: var(--brand-primary-deep);
                font: inherit;
                font-size: 14px;
                font-weight: 750;
                cursor: pointer;
            }

            .primary-button:disabled {
                opacity: .58;
                cursor: not-allowed;
            }

            .status-form,
            .result-panel {
                width: min(680px, 100%);
                margin: 0 auto;
            }

            .status-form {
                display: grid;
                gap: 16px;
            }

            .status-heading {
                margin-bottom: 2px;
            }

            .lookup-message {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                border-radius: 8px;
                color: #475467;
                background: #f2f4f7;
                font-size: 12px;
            }

            .lookup-message.found {
                color: #166534;
                background: #ecfdf3;
            }

            .lookup-message.missing {
                color: #9a3412;
                background: #fff7ed;
            }

            .result-panel {
                padding: 24px;
                border: 1px solid #e4e7ec;
                border-radius: 12px;
                background: #f9fafb;
                text-align: center;
            }

            .result-panel h2 {
                margin: 10px 0 6px;
                color: #1f2937;
            }

            .result-panel p {
                color: #667085;
            }

            .result-icon {
                color: #16a34a;
                font-size: 36px;
            }

            .receipt-panel code {
                display: block;
                margin: 16px 0;
                padding: 12px;
                border: 1px dashed #d0d5dd;
                border-radius: 8px;
                background: #fff;
                font-size: 16px;
                font-weight: 800;
                overflow-wrap: anywhere;
            }

            .status-badge {
                width: max-content;
                margin: 0 auto 8px;
                padding: 5px 10px;
                border-radius: 999px;
                background: #fef3c7;
                color: #92400e;
                font-size: 12px;
                font-weight: 800;
            }

            .status-result[data-status='APPROVED'] .status-badge {
                background: #dcfce7;
                color: #166534;
            }

            .status-result[data-status='REJECTED'] .status-badge {
                background: #fee2e2;
                color: #991b1b;
            }

            .status-result dl {
                margin: 18px 0;
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
                text-align: left;
            }

            .status-result dl div {
                padding: 12px;
                border-radius: 8px;
                background: #fff;
            }

            .status-result dt {
                color: #8a94a3;
                font-size: 11px;
                font-weight: 700;
            }

            .status-result dd {
                margin: 4px 0 0;
                color: #344054;
                font-size: 13px;
                font-weight: 700;
            }

            .result-actions {
                display: flex;
                justify-content: center;
                gap: 10px;
                flex-wrap: wrap;
            }

            .result-actions a,
            .result-actions button {
                min-height: 40px;
                border: 1px solid #d0d5dd;
                border-radius: 8px;
                padding: 8px 14px;
                color: #344054;
                background: #fff;
                font: inherit;
                font-size: 13px;
                font-weight: 700;
                text-decoration: none;
                cursor: pointer;
            }

            .registration-footer {
                margin-top: 20px;
                padding-top: 16px;
                border-top: 1px solid #e7ebf0;
                color: #667085;
                font-size: 12px;
                text-align: center;
            }

            .registration-footer a {
                color: var(--brand-primary-deep);
                font-weight: 750;
                text-decoration: none;
            }

            @media (max-width: 900px) {
                .registration-page {
                    align-items: flex-start;
                }

                .registration-card {
                    padding: 24px;
                }

                .field-grid-3 {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
            }

            @media (max-width: 640px) {
                .registration-page {
                    padding: 12px;
                }

                .registration-card {
                    padding: 18px 16px;
                    border-radius: 12px;
                }

                .registration-tabs {
                    width: 100%;
                    margin-bottom: 18px;
                }

                .field-grid-3,
                .field-grid-2,
                .status-result dl {
                    grid-template-columns: 1fr;
                }

                .form-field.full-row {
                    grid-column: 1;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .form-field input,
                .form-field select,
                .form-field textarea {
                    transition: none;
                }
            }
        `
    ]
})
export class Register implements OnInit {
    private fb = inject(FormBuilder);
    private registration = inject(RegistrationService);
    private systemSettings = inject(SystemSettingsService);
    private destroyRef = inject(DestroyRef);
    settings = this.systemSettings.settings;
    mode = signal<'register' | 'status'>('register');
    roles = signal<RegistrationRole[]>([]);
    rolesLoading = signal(false);
    rolesLoadError = signal('');
    loading = signal(false);
    errorMessage = signal('');
    receipt = signal<RegistrationReceipt | null>(null);
    statusResult = signal<RegistrationStatusResult | null>(null);
    referenceLookupState = signal<'idle' | 'checking' | 'found' | 'missing'>('idle');
    referenceLookupMessage = signal('');
    registerForm = this.fb.group({
        firstname: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
        lastname: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
        middlename: ['', Validators.maxLength(100)],
        username: ['', [Validators.required, Validators.maxLength(150), Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9._@+-]{0,149}$/)]],
        position_title: ['', Validators.maxLength(100)],
        applicant_remarks: ['', Validators.maxLength(1000)],
        requested_role_id: [{ value: '', disabled: true }, Validators.required],
        password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
        confirmPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]]
    });
    statusForm = this.fb.group({ username: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9._@+-]{0,149}$/)]], reference_code: ['', Validators.required] });
    ngOnInit() {
        this.loadRoles();
        this.statusForm.controls.username.valueChanges.pipe(debounceTime(600), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe((username) => this.lookupReference(username ?? ''));
    }
    loadRoles() {
        if (this.rolesLoading()) return;
        this.rolesLoading.set(true);
        this.rolesLoadError.set('');
        this.registerForm.controls.requested_role_id.disable({ emitEvent: false });
        this.registration.roles().subscribe({
            next: (roles) => {
                this.roles.set(roles);
                this.rolesLoading.set(false);
                if (roles.length) {
                    this.registerForm.controls.requested_role_id.enable({ emitEvent: false });
                } else {
                    this.rolesLoadError.set('No registration roles are currently available.');
                }
            },
            error: () => {
                this.roles.set([]);
                this.rolesLoading.set(false);
                this.rolesLoadError.set('Registration roles could not be loaded.');
            }
        });
    }
    coverImage() {
        const url = this.settings().loginCoverUrl.replace(/["'()]/g, '');
        return `url("${url}")`;
    }
    setMode(mode: 'register' | 'status') {
        this.mode.set(mode);
        this.errorMessage.set('');
        this.statusResult.set(null);
        if (mode === 'status' && !this.statusForm.controls.username.value) {
            const username = this.registerForm.controls.username.value ?? '';
            if (username) this.statusForm.controls.username.setValue(username);
        }
    }
    isRegisterFieldInvalid(controlName: keyof typeof this.registerForm.controls) {
        const control = this.registerForm.controls[controlName];
        return control.invalid && (control.dirty || control.touched);
    }
    registerFieldError(controlName: keyof typeof this.registerForm.controls) {
        const control = this.registerForm.controls[controlName];
        if (control.hasError('required')) return 'This field is required.';
        if (control.hasError('minlength')) return 'Use at least 8 characters.';
        if (control.hasError('maxlength')) {
            const max = control.getError('maxlength')?.requiredLength;
            return `Use no more than ${max} characters.`;
        }
        if (control.hasError('pattern')) {
            return controlName === 'username'
                ? 'Use letters, numbers, dots, underscores, @, +, or -; start with a letter or number.'
                : 'Enter a value that is not only spaces.';
        }
        return 'Check this field.';
    }
    passwordMismatch() {
        const confirm = this.registerForm.controls.confirmPassword;
        const password = this.registerForm.controls.password.value ?? '';
        const confirmation = confirm.value ?? '';
        return !!confirmation && (confirm.dirty || confirm.touched) && password !== confirmation;
    }
    private normalizeRegisterTextFields() {
        const fields = ['firstname', 'lastname', 'middlename', 'username', 'position_title', 'applicant_remarks'] as const;
        for (const field of fields) {
            const control = this.registerForm.controls[field];
            const value = control.value;
            if (typeof value === 'string') control.setValue(value.trim(), { emitEvent: false });
        }
        this.registerForm.updateValueAndValidity({ emitEvent: false });
    }
    submitRegistration() {
        this.normalizeRegisterTextFields();
        this.registerForm.markAllAsTouched();
        const value = this.registerForm.getRawValue();
        if (this.rolesLoading() || this.rolesLoadError() || !this.roles().length) {
            this.errorMessage.set('A registration role must be available before you can submit this request.');
            return;
        }
        if (this.registerForm.invalid) {
            this.errorMessage.set('Review the highlighted fields and correct the form before submitting.');
            return;
        }
        if (value.password !== value.confirmPassword) {
            this.errorMessage.set('Passwords do not match.');
            return;
        }
        this.loading.set(true);
        this.errorMessage.set('');
        const payload = {
            firstname: value.firstname ?? '',
            lastname: value.lastname ?? '',
            middlename: value.middlename || undefined,
            username: value.username ?? '',
            position_title: value.position_title || undefined,
            applicant_remarks: value.applicant_remarks || undefined,
            requested_role_id: value.requested_role_id ?? '',
            password: value.password ?? ''
        };
        this.registration.register(payload).subscribe({
            next: (r) => {
                this.receipt.set(r);
                this.loading.set(false);
            },
            error: (e) => {
                this.errorMessage.set(this.message(e));
                this.loading.set(false);
            }
        });
    }
    checkReceipt(result: RegistrationReceipt) {
        this.statusForm.setValue({ username: this.registerForm.value.username ?? '', reference_code: result.reference_code }, { emitEvent: false });
        this.receipt.set(null);
        this.setMode('status');
        this.checkStatus();
    }
    private lookupReference(username: string) {
        const usernameControl = this.statusForm.controls.username;
        if (!username || usernameControl.invalid) {
            this.referenceLookupState.set('idle');
            this.referenceLookupMessage.set('');
            return;
        }
        this.errorMessage.set('');
        this.referenceLookupState.set('checking');
        this.referenceLookupMessage.set('Looking for an existing registration request…');
        this.statusForm.controls.reference_code.setValue('');
        this.registration.reference(username).subscribe({
            next: (r) => {
                if (this.statusForm.controls.username.value?.trim().toLowerCase() !== username.trim().toLowerCase()) return;
                this.statusForm.controls.reference_code.setValue(r.reference_code);
                this.referenceLookupState.set('found');
                this.referenceLookupMessage.set(`Registration found (${r.status.toLowerCase()}). The reference code was filled in automatically.`);
            },
            error: () => {
                if (this.statusForm.controls.username.value?.trim().toLowerCase() !== username.trim().toLowerCase()) return;
                this.referenceLookupState.set('missing');
                this.referenceLookupMessage.set('No registration request was found for this username. Check the spelling or submit a new request.');
            }
        });
    }
    checkStatus() {
        this.statusForm.markAllAsTouched();
        if (this.statusForm.invalid) {
            this.errorMessage.set('Enter the registration username and reference code.');
            return;
        }
        this.loading.set(true);
        this.errorMessage.set('');
        const v = this.statusForm.getRawValue();
        this.registration.status(v.username ?? '', v.reference_code ?? '').subscribe({
            next: (r) => {
                this.statusResult.set(r);
                this.loading.set(false);
            },
            error: (e) => {
                this.errorMessage.set(this.message(e));
                this.loading.set(false);
            }
        });
    }
    resetStatus() {
        this.statusResult.set(null);
        this.errorMessage.set('');
    }
    private message(error: any) {
        const value = error?.error?.message;
        return Array.isArray(value) ? value.join(', ') : value || 'The request could not be completed.';
    }
}
