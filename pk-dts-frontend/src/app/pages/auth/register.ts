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
        <main class="login-shell registration-shell" [style.--registration-cover]="coverImage()">
            <div class="login-cover registration-cover" aria-hidden="true"></div>
            <div class="login-overlay registration-overlay"></div>

            <div class="login-panel registration-panel">
                <section class="login-card registration-card">
                    <div class="registration-content">
                        <nav class="mode-tabs registration-tabs" aria-label="Registration options">
                            <button type="button" [class.active]="mode() === 'register'" (click)="setMode('register')"><i class="pi pi-user-plus"></i><span>New request</span></button>
                            <button type="button" [class.active]="mode() === 'status'" (click)="setMode('status')"><i class="pi pi-clock"></i><span>Check status</span></button>
                        </nav>

                <form *ngIf="mode() === 'register' && !receipt()" [formGroup]="registerForm" (ngSubmit)="submitRegistration()" class="registration-form">
                    <section class="form-section">
                        <div class="form-section-heading">
                            <i class="pi pi-user" aria-hidden="true"></i>
                            <div class="form-section-copy">
                                <strong>Personal details</strong>
                                <small>Tell us who you are</small>
                            </div>
                        </div>

                        <div class="form-section-fields three-columns">
                            <label class="form-field" [class.field-invalid]="isRegisterFieldInvalid('firstname')">
                                <span class="field-label">First name</span>
                                <input formControlName="firstname" autocomplete="given-name" maxlength="100" required />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('firstname')">{{ registerFieldError('firstname') }}</small>
                            </label>

                            <label class="form-field" [class.field-invalid]="isRegisterFieldInvalid('lastname')">
                                <span class="field-label">Last name</span>
                                <input formControlName="lastname" autocomplete="family-name" maxlength="100" required />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('lastname')">{{ registerFieldError('lastname') }}</small>
                            </label>

                            <label class="form-field" [class.field-invalid]="isRegisterFieldInvalid('middlename')">
                                <span class="field-label">Middle name <small class="optional-tag">Optional</small></span>
                                <input formControlName="middlename" autocomplete="additional-name" maxlength="100" />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('middlename')">{{ registerFieldError('middlename') }}</small>
                            </label>
                        </div>
                    </section>

                    <section class="form-section">
                        <div class="form-section-heading">
                            <i class="pi pi-briefcase" aria-hidden="true"></i>
                            <div class="form-section-copy">
                                <strong>Work and access</strong>
                                <small>Help us assign the right permissions</small>
                            </div>
                        </div>

                        <div class="form-section-fields three-columns">
                            <label class="form-field" [class.field-invalid]="isRegisterFieldInvalid('username')">
                                <span class="field-label">Username</span>
                                <input formControlName="username" type="text" autocomplete="username" maxlength="150" required />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('username')">{{ registerFieldError('username') }}</small>
                            </label>

                            <label class="form-field" [class.field-invalid]="isRegisterFieldInvalid('position_title')">
                                <span class="field-label">Position title <small class="optional-tag">Optional</small></span>
                                <input formControlName="position_title" autocomplete="organization-title" maxlength="100" />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('position_title')">{{ registerFieldError('position_title') }}</small>
                            </label>

                            <label class="form-field" [class.field-invalid]="isRegisterFieldInvalid('requested_role_id')">
                                <span class="field-label">Requested role</span>
                                <select formControlName="requested_role_id" required>
                                    <option value="">{{ rolesLoading() ? 'Loading roles…' : rolesLoadError() ? 'Roles unavailable' : 'Select the access role you need' }}</option>
                                    <option *ngFor="let role of roles()" [value]="role.role_id">{{ role.role_name }}</option>
                                </select>
                                <small class="field-note" *ngIf="!rolesLoadError()">The approver confirms your final role.</small>
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('requested_role_id')">{{ registerFieldError('requested_role_id') }}</small>
                                <span class="role-load-error" *ngIf="rolesLoadError()"><span>{{ rolesLoadError() }}</span><button type="button" (click)="loadRoles()">Retry</button></span>
                            </label>

                            <label class="form-field full-row remarks-field" [class.field-invalid]="isRegisterFieldInvalid('applicant_remarks')">
                                <span class="field-label">Remarks <small class="optional-tag">Optional</small></span>
                                <textarea formControlName="applicant_remarks" rows="2" maxlength="1000" placeholder="Optional note for the account manager"></textarea>
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('applicant_remarks')">{{ registerFieldError('applicant_remarks') }}</small>
                            </label>
                        </div>
                    </section>

                    <section class="form-section">
                        <div class="form-section-heading">
                            <i class="pi pi-lock" aria-hidden="true"></i>
                            <div class="form-section-copy">
                                <strong>Secure your account</strong>
                                <small>Use at least 8 characters</small>
                            </div>
                        </div>

                        <div class="form-section-fields two-columns">
                            <label class="form-field" [class.field-invalid]="isRegisterFieldInvalid('password')">
                                <span class="field-label">Password</span>
                                <input formControlName="password" type="password" autocomplete="new-password" minlength="8" maxlength="72" required />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('password')">{{ registerFieldError('password') }}</small>
                            </label>

                            <label class="form-field" [class.field-invalid]="isRegisterFieldInvalid('confirmPassword') || passwordMismatch()">
                                <span class="field-label">Confirm password</span>
                                <input formControlName="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="72" required />
                                <small class="field-error" *ngIf="isRegisterFieldInvalid('confirmPassword')">{{ registerFieldError('confirmPassword') }}</small>
                                <small class="field-error" *ngIf="!isRegisterFieldInvalid('confirmPassword') && passwordMismatch()">Passwords do not match.</small>
                            </label>
                        </div>
                    </section>

                    <div class="form-actions">
                        <div class="error" *ngIf="errorMessage()" aria-live="polite"><i class="pi pi-exclamation-circle"></i><span>{{ errorMessage() }}</span></div>
                        <button class="primary" type="submit" [disabled]="loading() || rolesLoading() || !!rolesLoadError() || roles().length === 0">
                            <i class="pi" [ngClass]="loading() ? 'pi-spin pi-spinner' : 'pi-send'"></i>
                            <span>{{ loading() ? 'Submitting…' : 'Submit registration request' }}</span>
                        </button>
                    </div>
                </form>
                <section *ngIf="receipt() as result" class="receipt">
                    <i class="pi pi-check-circle"></i><span>Request submitted</span>
                    <h2>Save your private reference code</h2>
                    <code>{{ result.reference_code }}</code>
                    <p>{{ result.message }}</p>
                    <button class="primary" type="button" (click)="checkReceipt(result)">Check request status</button>
                </section>

                <form *ngIf="mode() === 'status' && !statusResult()" [formGroup]="statusForm" (ngSubmit)="checkStatus()" class="status-form">
                    <label><span>Username</span><input formControlName="username" type="text" autocomplete="username" /></label>
                    <div class="lookup-message" [class.found]="referenceLookupState() === 'found'" [class.missing]="referenceLookupState() === 'missing'" *ngIf="referenceLookupState() !== 'idle'" aria-live="polite">
                        <i class="pi" [ngClass]="referenceLookupState() === 'checking' ? 'pi-spin pi-spinner' : referenceLookupState() === 'found' ? 'pi-check-circle' : 'pi-info-circle'"></i>
                        <span>{{ referenceLookupMessage() }}</span>
                    </div>
                    <label><span>Reference code</span><input formControlName="reference_code" placeholder="REG-…" autocomplete="off" /></label>
                    <aside class="status-guide">
                        <i class="pi pi-lightbulb"></i>
                        <div>
                            <strong>How to check your request</strong><span>Enter the same username used during registration. If a request exists, its latest reference code is filled in automatically. Then select <b>Check status</b>.</span>
                        </div>
                    </aside>
                    <div class="error" *ngIf="errorMessage()"><i class="pi pi-exclamation-circle"></i>{{ errorMessage() }}</div>
                    <button class="primary" type="submit" [disabled]="loading() || referenceLookupState() === 'checking' || statusForm.invalid"><i class="pi pi-search"></i>{{ loading() ? 'Checking…' : 'Check status' }}</button>
                </form>

                <section *ngIf="statusResult() as result" class="status-result" [attr.data-status]="result.status">
                    <div class="status-badge"><i class="pi" [ngClass]="result.status === 'APPROVED' ? 'pi-check-circle' : result.status === 'REJECTED' ? 'pi-times-circle' : 'pi-clock'"></i>{{ result.status }}</div>
                    <h2>{{ result.firstname }} {{ result.lastname }}</h2>
                    <p *ngIf="result.status === 'PENDING'">Your request is waiting for an authorized account manager to review it.</p>
                    <p *ngIf="result.status === 'APPROVED'">Your account is approved. You can now sign in using the password you registered.</p>
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
                    <div class="result-actions"><a *ngIf="result.status === 'APPROVED'" routerLink="/auth/login">Go to sign in</a><button type="button" (click)="resetStatus()">Check another request</button></div>
                </section>

                    <footer>Already approved? <a routerLink="/auth/login">Sign in</a></footer>
                </div>

                </section>
            </div>

            <footer class="landing-footer">
                <span>{{ settings().footerText }}</span>
                <span>Corporate IT - System Programmer I - John Paul Curib</span>
                <span>Secure records &middot; Clear ownership &middot; Faster retrieval</span>
            </footer>
        </main>
    `,
    styles: [
        `
            :host {
                display: block;
                min-height: 100vh;
            }
            .registration-shell {
                position: relative;
                min-height: 100vh;
                padding: 4rem 1.25rem;
                display: grid;
                place-items: center;
                background:
                    linear-gradient(135deg, rgba(127, 29, 29, 0.7), rgba(15, 23, 42, 0.56)),
                    var(--registration-cover) center/cover fixed;
                color: #172033;
            }
            .registration-overlay {
                position: absolute;
                inset: 0;
                background: radial-gradient(circle at 10% 10%, rgba(255, 255, 255, 0.18), transparent 34%), linear-gradient(120deg, rgba(255, 255, 255, 0.08), transparent);
            }
            .back-home {
                position: absolute;
                z-index: 2;
                top: 1.5rem;
                left: 1.5rem;
                display: flex;
                gap: 0.55rem;
                align-items: center;
                color: #fff;
                text-decoration: none;
                font-weight: 800;
            }
            .registration-card {
                position: relative;
                z-index: 1;
                width: min(820px, 100%);
                border: 1px solid rgba(255, 255, 255, 0.65);
                border-radius: 2rem;
                background: rgba(255, 255, 255, 0.96);
                padding: 2rem;
                box-shadow: 0 32px 80px rgba(15, 23, 42, 0.28);
                backdrop-filter: blur(16px);
            }
            header {
                display: flex;
                gap: 1rem;
                align-items: flex-start;
            }
            header img {
                width: 4rem;
                height: 4rem;
                object-fit: contain;
                border-radius: 1.2rem;
                background: var(--brand-soft);
                padding: 0.45rem;
            }
            header span {
                color: var(--brand-primary-deep);
                font-size: 0.7rem;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 0.16em;
            }
            h1 {
                margin: 0.25rem 0 0.45rem;
                font-size: 2rem;
                letter-spacing: -0.04em;
            }
            header p {
                max-width: 42rem;
                margin: 0;
                color: #64748b;
                line-height: 1.65;
            }
            .mode-tabs {
                margin: 1.5rem 0;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0.45rem;
                padding: 0.35rem;
                border-radius: 1rem;
                background: #f1f5f9;
            }
            .mode-tabs button {
                border: 0;
                border-radius: 0.75rem;
                padding: 0.8rem;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
                color: #64748b;
                background: transparent;
                font-weight: 850;
                cursor: pointer;
            }
            .mode-tabs button.active {
                color: #fff;
                background: var(--brand-primary-deep);
                box-shadow: 0 8px 18px rgba(153, 27, 27, 0.18);
            }
            .form-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 1rem;
            }
            .wide {
                grid-column: 1/-1;
            }
            label {
                display: flex;
                flex-direction: column;
                gap: 0.45rem;
            }
            label > span {
                font-size: 0.79rem;
                font-weight: 850;
                color: #334155;
            }
            label small {
                color: #94a3b8;
                font-weight: 650;
            }
            input,
            select,
            textarea {
                width: 100%;
                min-height: 3rem;
                border: 1px solid #dbe1e9;
                border-radius: 0.85rem;
                background: #fff;
                padding: 0.7rem 0.85rem;
                color: #172033;
                font: inherit;
                outline: none;
            }
            input:focus,
            select:focus,
            textarea:focus {
                border-color: var(--brand-primary);
                box-shadow: 0 0 0 3px rgba(185, 28, 28, 0.1);
            }
            .field-note {
                color: #7b8495;
                line-height: 1.5;
            }
            .primary {
                min-height: 3.1rem;
                border: 0;
                border-radius: 0.9rem;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.55rem;
                color: #fff;
                background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-deep));
                font-weight: 850;
                cursor: pointer;
            }
            .primary:disabled {
                opacity: 0.65;
            }
            .error {
                padding: 0.8rem 1rem;
                display: flex;
                gap: 0.55rem;
                align-items: center;
                border-radius: 0.8rem;
                color: var(--brand-primary-deep);
                background: var(--brand-soft);
            }
            .status-form {
                display: grid;
                gap: 1rem;
            }
            .lookup-message {
                display: flex;
                align-items: center;
                gap: 0.6rem;
                margin-top: -0.25rem;
                border-radius: 0.75rem;
                background: #f1f5f9;
                padding: 0.7rem 0.85rem;
                color: #64748b;
                font-size: 0.78rem;
                font-weight: 700;
            }
            .lookup-message.found {
                background: #ecfdf5;
                color: #166534;
            }
            .lookup-message.missing {
                background: #fff7ed;
                color: #9a3412;
            }
            .status-guide {
                display: flex;
                align-items: flex-start;
                gap: 0.75rem;
                border: 1px solid #fde68a;
                border-radius: 0.9rem;
                background: #fffbeb;
                padding: 0.9rem;
                color: #854d0e;
            }
            .status-guide > i {
                margin-top: 0.15rem;
            }
            .status-guide div {
                display: grid;
                gap: 0.25rem;
            }
            .status-guide strong {
                font-size: 0.78rem;
            }
            .status-guide span {
                font-size: 0.74rem;
                line-height: 1.55;
            }
            .receipt,
            .status-result {
                text-align: center;
                padding: 1.5rem;
                border-radius: 1.25rem;
                background: #f8fafc;
            }
            .receipt > i {
                font-size: 2.4rem;
                color: #16a34a;
            }
            .receipt > span {
                display: block;
                margin-top: 0.6rem;
                color: #166534;
                font-weight: 850;
            }
            .receipt h2,
            .status-result h2 {
                margin: 0.55rem 0;
            }
            .receipt code {
                display: block;
                margin: 1rem auto;
                padding: 1rem;
                border: 1px dashed #ef9a9a;
                border-radius: 0.85rem;
                color: var(--brand-primary-deep);
                background: #fff;
                font-size: 1.2rem;
                font-weight: 900;
                letter-spacing: 0.08em;
            }
            .receipt .primary {
                width: 100%;
            }
            .status-badge {
                width: max-content;
                margin: auto;
                padding: 0.5rem 0.75rem;
                border-radius: 99px;
                color: #92400e;
                background: #fef3c7;
                font-weight: 900;
            }
            .status-result[data-status='APPROVED'] .status-badge {
                color: #166534;
                background: #dcfce7;
            }
            .status-result[data-status='REJECTED'] .status-badge {
                color: var(--brand-primary-deep);
                background: var(--brand-soft-strong);
            }
            .status-result dl {
                margin: 1.25rem 0;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0.75rem;
                text-align: left;
            }
            .status-result dl div {
                padding: 0.85rem;
                border-radius: 0.8rem;
                background: #fff;
            }
            .status-result dt {
                color: #94a3b8;
                font-size: 0.67rem;
                font-weight: 850;
                text-transform: uppercase;
            }
            .status-result dd {
                margin: 0.3rem 0 0;
                color: #334155;
                font-weight: 750;
            }
            .result-actions {
                display: flex;
                gap: 0.75rem;
                justify-content: center;
            }
            .result-actions a,
            .result-actions button {
                border: 0;
                border-radius: 0.75rem;
                padding: 0.75rem 1rem;
                color: #fff;
                background: var(--brand-primary-deep);
                text-decoration: none;
                font-weight: 800;
                cursor: pointer;
            }
            .result-actions button {
                color: #64748b;
                background: #e2e8f0;
            }
            footer {
                margin-top: 1.4rem;
                text-align: center;
                color: #64748b;
                font-size: 0.85rem;
            }
            footer a {
                color: var(--brand-primary-deep);
                font-weight: 850;
                text-decoration: none;
            }
            @media (max-width: 620px) {
                .registration-shell {
                    padding: 4.5rem 0.75rem 1rem;
                }
                .registration-card {
                    padding: 1.2rem;
                    border-radius: 1.4rem;
                }
                header img {
                    width: 3.3rem;
                    height: 3.3rem;
                }
                h1 {
                    font-size: 1.55rem;
                }
                .form-grid,
                .status-result dl {
                    grid-template-columns: 1fr;
                }
                .wide {
                    grid-column: 1;
                }
                .mode-tabs button {
                    font-size: 0.75rem;
                }
                .back-home {
                    left: 1rem;
                    top: 1rem;
                }
            }
        `,
        `
            :host {
                --registration-brand: var(--dts-accent, #2563eb);
                --registration-brand-deep: var(--dts-accent-deep, #1e3a8a);
                --registration-brand-soft: var(--dts-accent-soft, #dbeafe);
            }

            .registration-shell {
                position: relative;
                min-height: 100svh;
                overflow-x: hidden;
                overflow-y: auto;
                padding: 7rem clamp(1.25rem, 5vw, 5rem) 4.5rem;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: #080c14;
                color: #172033;
            }

            .registration-cover {
                position: absolute;
                inset: 0;
                background: var(--registration-cover) center/cover no-repeat;
            }

            .registration-overlay {
                position: absolute;
                inset: 0;
                background: linear-gradient(90deg, rgba(5, 9, 16, 0.97) 0%, rgba(5, 9, 16, 0.86) 46%, rgba(5, 9, 16, 0.6) 100%), linear-gradient(180deg, rgba(5, 9, 16, 0.25), rgba(5, 9, 16, 0.92));
                pointer-events: none;
            }

            .landing-nav {
                position: absolute;
                z-index: 3;
                inset: 0 0 auto;
                min-height: 5.25rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                padding: 0.9rem clamp(1.25rem, 5vw, 5rem);
                border-bottom: 1px solid rgba(255, 255, 255, 0.12);
                background: rgba(5, 9, 16, 0.78);
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
            }

            .landing-brand,
            .nav-link {
                color: #fff;
                text-decoration: none;
            }

            .landing-brand {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                min-width: 0;
            }

            .brand-mark {
                display: grid;
                place-items: center;
                width: 2.8rem;
                height: 2.8rem;
                flex: 0 0 auto;
                border-radius: 0.85rem;
                background: rgba(255, 255, 255, 0.94);
            }

            .brand-mark img {
                width: 100%;
                height: 100%;
                object-fit: contain;
            }

            .landing-brand > span:last-child {
                display: grid;
                min-width: 0;
            }

            .landing-brand small {
                color: rgba(255, 255, 255, 0.68);
                font-size: 0.62rem;
                font-weight: 800;
                letter-spacing: 0.14em;
                text-transform: uppercase;
            }

            .landing-brand strong {
                overflow: hidden;
                margin-top: 0.15rem;
                font-size: 0.95rem;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .landing-nav-actions {
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }

            .nav-link {
                display: inline-flex;
                align-items: center;
                gap: 0.45rem;
                padding: 0.55rem 0.7rem;
                border-radius: 0.65rem;
                color: rgba(255, 255, 255, 0.76);
                font-size: 0.72rem;
                font-weight: 800;
                transition: background 0.2s ease, color 0.2s ease;
            }

            .nav-link:hover {
                color: #fff;
                background: rgba(255, 255, 255, 0.1);
            }

            .landing-nav-meta {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                border: 1px solid rgba(255, 255, 255, 0.22);
                border-radius: 999px;
                background: rgba(4, 10, 20, 0.45);
                padding: 0.55rem 0.8rem;
                color: #fff;
                font-size: 0.72rem;
                font-weight: 750;
            }

            .landing-nav-meta i {
                color: #93c5fd;
            }

            .registration-card {
                position: relative;
                z-index: 1;
                width: min(1240px, 100%);
                min-height: min(720px, calc(100svh - 11rem));
                display: grid;
                grid-template-columns: minmax(0, 1.35fr) minmax(390px, 0.95fr);
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.25);
                border-radius: 1.5rem;
                background: rgba(15, 23, 42, 0.28);
                box-shadow: 0 32px 90px rgba(0, 0, 0, 0.35);
            }

            .registration-intro {
                position: relative;
                min-height: 720px;
                padding: clamp(2rem, 5vw, 4.75rem);
                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                overflow: hidden;
                color: #fff;
                background: linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.64));
            }

            .registration-intro::after {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(180deg, transparent 20%, rgba(4, 10, 20, 0.68));
                pointer-events: none;
            }

            .registration-intro > header,
            .intro-copy,
            .process-list,
            .privacy-note {
                position: relative;
                z-index: 1;
            }

            .registration-intro > header {
                position: absolute;
                top: clamp(2rem, 5vw, 4.75rem);
                left: clamp(2rem, 5vw, 4.75rem);
                right: clamp(2rem, 5vw, 4.75rem);
                display: flex;
                align-items: center;
                gap: 0.85rem;
            }

            .logo-frame {
                display: grid;
                place-items: center;
                width: 3.5rem;
                height: 3.5rem;
                flex: 0 0 auto;
                border-radius: 1rem;
                background: rgba(255, 255, 255, 0.96);
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
            }

            .registration-intro .logo-frame img {
                width: 100%;
                height: 100%;
                object-fit: contain;
            }

            .brand-copy {
                display: grid;
                gap: 0.2rem;
                min-width: 0;
            }

            .brand-copy strong {
                line-height: 1.25;
                font-size: 0.88rem;
            }

            .brand-copy span {
                color: rgba(255, 255, 255, 0.66);
                font-size: 0.67rem;
                font-weight: 800;
                letter-spacing: 0.13em;
                text-transform: uppercase;
            }

            .intro-copy {
                max-width: 44rem;
            }

            .eyebrow {
                display: inline-flex;
                align-items: center;
                padding: 0.45rem 0.9rem;
                border-radius: 0.55rem;
                color: #fff;
                background: var(--registration-brand);
                font-size: 0.7rem;
                font-weight: 900;
                letter-spacing: 0.16em;
                text-transform: uppercase;
            }

            .intro-copy h1 {
                max-width: 46rem;
                margin: 1.25rem 0 0;
                color: #fff;
                font-size: clamp(2.7rem, 4.6vw, 4.8rem);
                line-height: 1.01;
                font-weight: 900;
                letter-spacing: -0.04em;
            }

            .intro-copy p {
                max-width: 41rem;
                margin: 1.5rem 0 0;
                color: rgba(255, 255, 255, 0.84);
                font-size: 1.03rem;
                line-height: 1.8;
            }

            .process-list {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 0.65rem;
                margin-top: 2rem;
            }

            .process-list > div {
                display: grid;
                grid-template-columns: 2.25rem minmax(0, 1fr);
                align-items: center;
                gap: 0.65rem;
                border-top: 1px solid rgba(255, 255, 255, 0.32);
                padding: 0.9rem 0 0;
            }

            .process-list b {
                display: grid;
                place-items: center;
                width: 2.25rem;
                height: 2.25rem;
                border-radius: 0.65rem;
                color: var(--registration-brand-deep);
                background: rgba(255, 255, 255, 0.92);
                font-size: 0.75rem;
            }

            .process-list span,
            .privacy-note span {
                display: grid;
                gap: 0.16rem;
            }

            .process-list strong,
            .privacy-note strong {
                font-size: 0.75rem;
            }

            .process-list small,
            .privacy-note small {
                color: rgba(255, 255, 255, 0.64);
                font-size: 0.62rem;
                line-height: 1.35;
            }

            .privacy-note {
                display: flex;
                align-items: flex-start;
                gap: 0.45rem;
                margin-top: 1rem;
                color: rgba(255, 255, 255, 0.66);
                font-size: 0.68rem;
                line-height: 1.5;
            }

            .privacy-note i {
                margin-top: 0.08rem;
                color: #93c5fd;
            }

            .registration-content {
                min-width: 0;
                max-height: calc(100svh - 11rem);
                overflow-y: auto;
                padding: clamp(1.75rem, 3vw, 2.75rem);
                background: rgba(255, 255, 255, 0.97);
            }

            .content-heading > span {
                color: var(--registration-brand-deep);
                font-size: 0.66rem;
                font-weight: 900;
                letter-spacing: 0.13em;
                text-transform: uppercase;
            }

            .content-heading h2 {
                margin: 0.3rem 0 0;
                color: #172033;
                font-size: 1.65rem;
                letter-spacing: -0.03em;
            }

            .content-heading p {
                margin: 0.45rem 0 0;
                color: #64748b;
                font-size: 0.86rem;
                line-height: 1.6;
            }

            .mode-tabs {
                margin: 1.35rem 0 1.5rem;
                padding: 0.3rem;
                border-radius: 0.85rem;
                background: #f3f5f8;
            }

            .mode-tabs button {
                min-height: 2.8rem;
                border-radius: 0.65rem;
                padding: 0.65rem;
                transition: background 0.2s ease, color 0.2s ease;
            }

            .mode-tabs button.active {
                color: #fff;
                background: var(--registration-brand-deep);
                box-shadow: 0 8px 18px color-mix(in srgb, var(--registration-brand-deep) 20%, transparent);
            }

            .form-grid,
            .status-form {
                gap: 0.9rem 1rem;
            }

            .section-label {
                margin-top: 0.25rem;
                padding-top: 0.9rem;
                border-top-color: #edf0f4;
            }

            .section-label > i {
                color: var(--registration-brand-deep);
                background: var(--registration-brand-soft);
            }

            .section-label strong {
                color: #273449;
            }

            .registration-content label > span {
                color: #334155;
                font-size: 0.75rem;
            }

            .registration-content input,
            .registration-content select,
            .registration-content textarea {
                min-height: 2.85rem;
                border-color: #dfe4eb;
                border-radius: 0.72rem;
                background: #fbfcfd;
                transition: border-color 0.16s, box-shadow 0.16s, background 0.16s;
            }

            .registration-content input:hover,
            .registration-content select:hover,
            .registration-content textarea:hover {
                border-color: #c4cbd5;
                background: #fff;
            }

            .registration-content input:focus,
            .registration-content select:focus,
            .registration-content textarea:focus {
                border-color: var(--registration-brand);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--registration-brand) 12%, transparent);
                outline: none;
            }

            .primary {
                min-height: 3.2rem;
                border-radius: 0.75rem;
                background: linear-gradient(135deg, var(--registration-brand), var(--registration-brand-deep));
                box-shadow: 0 10px 22px color-mix(in srgb, var(--registration-brand-deep) 22%, transparent);
                transition: transform 0.16s, box-shadow 0.16s;
            }

            .primary:not(:disabled):hover {
                transform: translateY(-1px);
                box-shadow: 0 13px 28px color-mix(in srgb, var(--registration-brand-deep) 28%, transparent);
            }

            .registration-content > footer {
                padding-top: 1rem;
                border-top: 1px solid #edf0f4;
                color: #64748b;
                font-size: 0.8rem;
            }

            .registration-content > footer a {
                color: var(--registration-brand-deep);
                font-weight: 850;
            }

            @media (max-width: 960px) {
                .registration-shell {
                    justify-content: flex-start;
                    padding: 6.25rem 1rem 1.25rem;
                }

                .registration-card {
                    grid-template-columns: 1fr;
                    min-height: auto;
                }

                .registration-intro {
                    min-height: 390px;
                    padding: 2.5rem 2rem;
                }

                .registration-intro > header {
                    top: 2.5rem;
                    left: 2rem;
                    right: 2rem;
                }

                .intro-copy h1 {
                    font-size: clamp(2.25rem, 7vw, 3.4rem);
                }

                .registration-content {
                    max-height: none;
                }
            }

            @media (max-width: 640px) {
                .registration-shell {
                    padding: 5.75rem 0.75rem 1rem;
                }

                .landing-nav {
                    min-height: 5rem;
                    padding: 0.75rem 1rem;
                }

                .landing-nav-actions {
                    gap: 0.35rem;
                }

                .nav-link span,
                .landing-nav-meta span {
                    display: none;
                }

                .nav-link,
                .landing-nav-meta {
                    width: 2.5rem;
                    height: 2.5rem;
                    justify-content: center;
                    padding: 0;
                }

                .registration-card {
                    border-radius: 1.1rem;
                }

                .registration-intro {
                    min-height: 430px;
                    padding: 2rem 1.25rem;
                }

                .registration-intro > header {
                    top: 2rem;
                    left: 1.25rem;
                    right: 1.25rem;
                }

                .intro-copy h1 {
                    font-size: 2.35rem;
                }

                .process-list {
                    grid-template-columns: 1fr;
                    gap: 0.5rem;
                }

                .process-list > div {
                    grid-template-columns: 2rem minmax(0, 1fr);
                    padding-top: 0.55rem;
                }

                .process-list b {
                    width: 2rem;
                    height: 2rem;
                }

                .process-list small {
                    display: none;
                }

                .registration-content {
                    padding: 1.5rem 1.15rem;
                }

                .content-heading h2 {
                    font-size: 1.5rem;
                }

                .form-section-fields.three-columns,
                .form-section-fields.two-columns,
                .form-grid,
                .status-result dl {
                    grid-template-columns: 1fr;
                }

                .form-field.full-row {
                    grid-column: 1;
                }

                .form-section-heading {
                    align-items: flex-start;
                }

                .wide {
                    grid-column: 1;
                }
            }

            /* The supplied PK mark is a compact icon; retain the adjacent system identity copy. */
            .landing-brand .brand-mark { width: 4.2rem; height: 2.8rem; padding: 0; overflow: hidden; background: #070707; }
            .landing-brand > span:last-child { display: grid; }
            .registration-intro .logo-frame { width: 4.5rem; height: 3rem; padding: 0; overflow: hidden; border-radius: .7rem; background: #070707; }
            .registration-intro .brand-copy { display: grid; }
            :host-context(.app-dark) .landing-brand .brand-mark,
            :host-context(.app-dark) .registration-intro .logo-frame { background: #070707; }

            @media (max-width: 640px) {
                .landing-brand .brand-mark { width: 3.75rem; height: 2.5rem; }
                .registration-intro .logo-frame { width: 4.05rem; height: 2.7rem; }
            }
        `
        ,`
            /* Keep registration visually aligned with the focused login shell. */
            .registration-shell {
                min-height: 100svh;
                padding: 7rem clamp(1.25rem, 5vw, 5rem) 4.5rem;
                background: #080c14;
            }

            .registration-cover {
                inset: 0;
                width: auto;
                background-position: center;
                opacity: 1;
            }

            .registration-overlay {
                inset: 0;
                width: auto;
                background:
                    linear-gradient(90deg, rgba(5, 9, 16, 0.97) 0%, rgba(5, 9, 16, 0.88) 46%, rgba(5, 9, 16, 0.62) 100%),
                    linear-gradient(180deg, rgba(5, 9, 16, 0.28) 0%, rgba(5, 9, 16, 0.24) 55%, rgba(5, 9, 16, 0.92) 100%);
            }

            .registration-card {
                width: min(1120px, 100%);
                min-height: 620px;
                display: grid;
                grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
                padding: 0;
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.8);
                border-radius: 1.65rem;
                background: transparent;
                box-shadow: 0 26px 70px rgba(15, 23, 42, 0.16), 0 2px 8px rgba(15, 23, 42, 0.06);
                backdrop-filter: none;
            }

            .registration-intro {
                min-height: 620px;
                padding: clamp(2rem, 5vw, 4rem);
                display: flex;
                align-items: flex-start;
                justify-content: center;
                background: linear-gradient(160deg, rgba(15, 23, 42, 0.34), rgba(15, 23, 42, 0.9));
            }

            .intro-copy { max-width: 30rem; margin: 0; padding: 0; }
            .intro-copy .eyebrow { border-radius: 0.55rem; background: rgba(255, 255, 255, 0.14); }
            .intro-copy h1 { max-width: 27rem; margin-top: 1.1rem; font-size: clamp(2.4rem, 4vw, 4rem); line-height: 1.02; }
            .intro-copy p { max-width: 27rem; color: rgba(255, 255, 255, 0.78); font-size: 0.96rem; line-height: 1.7; }

            .registration-content {
                min-width: 0;
                padding: clamp(2rem, 4vw, 3.3rem);
                background: #fff;
            }

            .content-heading > span { display: none; }
            .content-heading h2 { margin-top: 0; color: #172033; font-size: 1.75rem; letter-spacing: -0.035em; }
            .content-heading p { color: #7b8495; font-size: 0.86rem; line-height: 1.6; }
            .mode-tabs { margin: 1.35rem 0 1.65rem; border: 1px solid #e6eaf0; border-radius: 0.8rem; background: #f8fafc; padding: 0.25rem; }
            .mode-tabs button { min-height: 2.7rem; border-radius: 0.58rem; color: #7b8495; font-size: 0.78rem; }
            .mode-tabs button.active { color: #fff; background: var(--registration-brand-deep); box-shadow: 0 8px 16px color-mix(in srgb, var(--registration-brand-deep) 18%, transparent); }

            .form-grid { gap: 0.85rem; }
            .section-label { margin-top: 0.55rem; border-top-color: #edf0f4; padding-top: 0.9rem; }
            .section-label strong { color: #334155; font-size: 0.78rem; }
            .section-label small { color: #94a3b8; font-size: 0.68rem; }
            .form-grid input, .form-grid select, .form-grid textarea, .status-form input {
                min-height: 2.95rem;
                border: 1px solid #dbe1e9;
                border-radius: 0.7rem;
                background: #fbfcfe;
                box-shadow: none;
            }
            .form-grid input:focus, .form-grid select:focus, .form-grid textarea:focus, .status-form input:focus { border-color: color-mix(in srgb, var(--registration-brand) 58%, #cbd5e1); box-shadow: 0 0 0 3px color-mix(in srgb, var(--registration-brand) 12%, transparent); }
            .primary { min-height: 3.1rem; border-radius: 0.7rem; background: var(--registration-brand-deep); box-shadow: 0 12px 24px color-mix(in srgb, var(--registration-brand-deep) 18%, transparent); }
            .primary:hover { background: var(--registration-brand); }
            .error { border: 1px solid #fee2e2; border-radius: 0.75rem; background: #fff5f5; color: #b91c1c; }
            .status-guide { border-color: #dbeafe; border-radius: 0.8rem; background: #eff6ff; color: #1e40af; }
            .receipt, .status-result { border: 1px solid #e6eaf0; border-radius: 1rem; background: #f8fafc; }
            .status-result dl div { border: 1px solid #edf0f4; background: #fff; }
            .registration-content > footer { border-top: 1px solid #edf0f4; padding-top: 1rem; }

            @media (max-width: 900px) {
                .registration-cover, .registration-overlay { inset: 0; width: auto; height: auto; }
                .registration-card { grid-template-columns: 1fr; width: min(700px, 100%); }
                .registration-intro { min-height: 300px; padding: 2.4rem 2rem; }
                .registration-content { padding: 2rem; }
            }

            @media (max-width: 620px) {
                .registration-shell { padding: 1rem 0.75rem; }
                .registration-card { border-radius: 1.15rem; }
                .registration-intro { min-height: 260px; padding: 2rem 1.25rem; }
                .intro-copy h1 { font-size: 2.15rem; }
                .registration-content { padding: 1.55rem 1.15rem; }
                .form-grid { grid-template-columns: 1fr; }
                .wide { grid-column: 1; }
                .status-result dl { grid-template-columns: 1fr; }
                .result-actions { flex-direction: column; }
            }
        `
        ,`
            /* Full-screen registration: wide on desktop, compact and scroll-safe on smaller screens. */
            :host {
                min-height: 100svh;
            }

            .registration-shell {
                min-height: 100svh;
                padding: clamp(.75rem, 1.6vh, 1.25rem);
                display: flex;
                align-items: center;
                justify-content: center;
                overflow-x: hidden;
                overflow-y: auto;
                background: #080c14;
            }

            .registration-cover,
            .registration-overlay {
                inset: 0;
                width: auto;
                height: auto;
            }

            .registration-overlay {
                background:
                    linear-gradient(90deg, rgba(5, 9, 16, .95) 0%, rgba(5, 9, 16, .82) 52%, rgba(5, 9, 16, .62) 100%),
                    linear-gradient(180deg, rgba(5, 9, 16, .25), rgba(5, 9, 16, .86));
            }

            .registration-panel {
                position: relative;
                z-index: 1;
                width: min(1380px, calc(100vw - 2rem));
                display: block;
            }

            .registration-card {
                width: 100%;
                max-height: calc(100svh - 1.5rem);
                overflow-y: auto;
                padding: clamp(1.15rem, 1.8vw, 1.75rem);
                border: 1px solid rgba(255, 255, 255, .72);
                border-radius: 1.15rem;
                background: rgba(255, 255, 255, .98);
                box-shadow: 0 24px 64px rgba(0, 0, 0, .34);
                scrollbar-gutter: stable;
            }

            .registration-tabs {
                width: min(420px, 100%);
                margin: 0 0 .9rem;
            }

            .mode-tabs {
                margin: 0;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: .3rem;
                padding: .25rem;
                border: 1px solid #e3e8ef;
                border-radius: .7rem;
                background: #f8fafc;
            }

            .mode-tabs button {
                min-height: 2.45rem;
                border-radius: .5rem;
                padding: .5rem .7rem;
                font-size: .75rem;
            }

            .mode-tabs button.active {
                color: #fff;
                background: var(--registration-brand-deep);
                box-shadow: none;
            }

            .registration-content {
                min-width: 0;
                padding: 0;
                background: transparent;
            }

            .registration-form {
                display: grid;
                gap: 1rem;
                min-width: 0;
            }

            .form-section {
                display: grid;
                gap: .7rem;
                min-width: 0;
                padding-top: .85rem;
                border-top: 1px solid #e8edf3;
            }

            .form-section:first-child {
                padding-top: 0;
                border-top: 0;
            }

            .form-section-heading {
                display: flex;
                align-items: center;
                gap: .65rem;
                min-width: 0;
            }

            .form-section-heading > i {
                width: 1.9rem;
                height: 1.9rem;
                display: grid;
                place-items: center;
                flex: 0 0 auto;
                border-radius: .5rem;
                color: var(--registration-brand-deep);
                background: var(--registration-brand-soft);
                font-size: .82rem;
            }

            .form-section-copy {
                display: grid;
                gap: .08rem;
                min-width: 0;
            }

            .form-section-copy strong {
                display: block;
                color: #26354a;
                font-size: .8rem;
                line-height: 1.25;
            }

            .form-section-copy small {
                display: block;
                color: #8793a5;
                font-size: .66rem;
                line-height: 1.3;
            }

            .form-section-fields {
                display: grid;
                gap: .7rem .85rem;
                min-width: 0;
            }

            .form-section-fields.three-columns {
                grid-template-columns: repeat(3, minmax(0, 1fr));
            }

            .form-section-fields.two-columns {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .form-field {
                display: grid;
                align-content: start;
                gap: .32rem;
                min-width: 0;
            }

            .form-field.full-row {
                grid-column: 1 / -1;
            }

            .field-label {
                display: flex !important;
                align-items: center;
                flex-wrap: wrap;
                gap: .35rem;
                min-height: 1rem;
                color: #334155 !important;
                font-size: .72rem !important;
                font-weight: 800 !important;
                line-height: 1.3;
            }

            .optional-tag {
                display: inline-flex;
                align-items: center;
                width: max-content;
                border-radius: 999px;
                background: #f1f5f9;
                padding: .08rem .38rem;
                color: #8490a1 !important;
                font-size: .58rem !important;
                font-weight: 750 !important;
                line-height: 1.35;
            }

            .form-field .field-note,
            .form-field .field-error {
                display: block;
                margin: 0;
            }

            .form-actions {
                display: grid;
                gap: .65rem;
                padding-top: .1rem;
            }

            .form-actions .error {
                display: flex;
                align-items: center;
                gap: .5rem;
            }

            .form-actions .primary {
                width: 100%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: .5rem;
            }

            .registration-tabs {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: .45rem;
            }

            .registration-tabs button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: .45rem;
                border: 1px solid transparent;
                white-space: nowrap;
            }

            .registration-tabs button:not(.active) {
                border-color: #e3e8ef;
                background: #fff;
            }

            .registration-content > footer {
                display: flex;
                align-items: center;
                justify-content: center;
                flex-wrap: wrap;
                gap: .35rem;
            }

            .form-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: .7rem .85rem;
            }

            .wide {
                grid-column: 1 / -1;
            }

            .section-label {
                min-height: 2rem;
                margin: .05rem 0 0;
                padding: .45rem 0 .25rem;
                display: flex;
                align-items: center;
                gap: .55rem;
                border-top: 1px solid #eef2f6;
            }

            .section-label:first-child {
                padding-top: 0;
                border-top: 0;
            }

            .section-label > i {
                width: 1.7rem;
                height: 1.7rem;
                display: grid;
                place-items: center;
                flex: 0 0 auto;
                border-radius: .45rem;
                color: var(--registration-brand-deep);
                background: var(--registration-brand-soft);
                font-size: .78rem;
            }

            .section-label > span {
                display: flex;
                align-items: baseline;
                gap: .5rem;
                min-width: 0;
            }

            .section-label strong {
                color: #334155;
                font-size: .75rem;
            }

            .section-label small {
                color: #94a3b8;
                font-size: .64rem;
                font-weight: 650;
            }

            .registration-content label {
                gap: .3rem;
            }

            .registration-content label > span {
                color: #334155;
                font-size: .72rem;
                font-weight: 800;
            }

            .registration-content input,
            .registration-content select,
            .registration-content textarea {
                min-height: 2.55rem;
                border: 1px solid #dbe1e9;
                border-radius: .62rem;
                background: #fbfcfe;
                padding: .55rem .7rem;
                font-size: .82rem;
                box-shadow: none;
            }

            .registration-content textarea {
                min-height: 3.35rem;
                resize: vertical;
            }

            .registration-content input:hover,
            .registration-content select:hover,
            .registration-content textarea:hover {
                border-color: #c4cbd5;
                background: #fff;
            }

            .registration-content input:focus,
            .registration-content select:focus,
            .registration-content textarea:focus {
                border-color: var(--registration-brand);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--registration-brand) 11%, transparent);
                outline: none;
            }

            .field-note {
                color: #8490a1;
                font-size: .64rem;
                line-height: 1.3;
            }

            .remarks-field textarea {
                min-height: 3.2rem;
            }

            .primary {
                min-height: 2.8rem;
                border-radius: .65rem;
                background: var(--registration-brand-deep);
                box-shadow: 0 8px 18px color-mix(in srgb, var(--registration-brand-deep) 18%, transparent);
            }

            .primary:not(:disabled):hover {
                transform: none;
                background: var(--registration-brand);
            }

            .error {
                padding: .65rem .8rem;
                border: 1px solid #fee2e2;
                border-radius: .65rem;
                background: #fff5f5;
                color: #b91c1c;
                font-size: .76rem;
            }

            .field-invalid input,
            .field-invalid select,
            .field-invalid textarea {
                border-color: #dc2626;
                background: #fffafa;
            }

            .field-invalid input:focus,
            .field-invalid select:focus,
            .field-invalid textarea:focus {
                border-color: #dc2626;
                box-shadow: 0 0 0 3px rgba(220, 38, 38, .1);
            }

            .field-error {
                color: #b91c1c !important;
                font-size: .64rem;
                font-weight: 700 !important;
                line-height: 1.25;
            }

            .role-load-error {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: .5rem;
                color: #b91c1c;
                font-size: .64rem;
                font-weight: 700;
            }

            .role-load-error button {
                border: 0;
                border-radius: .4rem;
                background: #fee2e2;
                padding: .25rem .5rem;
                color: #991b1b;
                font: inherit;
                font-weight: 800;
                cursor: pointer;
            }

            .status-form {
                width: min(720px, 100%);
                margin-inline: auto;
                display: grid;
                gap: .8rem;
            }

            .receipt,
            .status-result {
                width: min(760px, 100%);
                margin-inline: auto;
            }

            .registration-content > footer {
                margin-top: .8rem;
                padding-top: .7rem;
                border-top: 1px solid #eef2f6;
                font-size: .75rem;
            }

            /* The registration form is the primary task; decorative footer copy should not consume viewport height. */
            .landing-footer {
                display: none;
            }

            @media (min-width: 961px) and (max-height: 760px) {
                .registration-shell {
                    align-items: flex-start;
                    padding: .55rem;
                }

                .registration-panel {
                    width: min(1400px, calc(100vw - 1.1rem));
                }

                .registration-card {
                    max-height: calc(100svh - 1.1rem);
                    padding: .85rem 1.1rem;
                    border-radius: .9rem;
                }

                .registration-tabs {
                    margin-bottom: .55rem;
                }

                .mode-tabs button {
                    min-height: 2.15rem;
                    padding: .38rem .6rem;
                }

                .registration-form {
                    gap: .65rem;
                }

                .form-section {
                    gap: .45rem;
                    padding-top: .55rem;
                }

                .form-section-fields {
                    gap: .5rem .7rem;
                }

                .form-section-heading > i {
                    width: 1.65rem;
                    height: 1.65rem;
                }

                .form-grid {
                    gap: .5rem .7rem;
                }

                .section-label {
                    min-height: 1.65rem;
                    padding: .25rem 0 .1rem;
                }

                .registration-content input,
                .registration-content select {
                    min-height: 2.25rem;
                    padding: .42rem .62rem;
                }

                .registration-content textarea,
                .remarks-field textarea {
                    min-height: 2.7rem;
                }

                .primary {
                    min-height: 2.45rem;
                }

                .registration-content > footer {
                    margin-top: .55rem;
                    padding-top: .5rem;
                }
            }

            @media (max-width: 1100px) {
                .registration-panel {
                    width: min(920px, calc(100vw - 2rem));
                }

                .form-section-fields.three-columns {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                .form-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                .wide {
                    grid-column: 1 / -1;
                }
            }

            @media (max-width: 760px) {
                .registration-shell {
                    align-items: flex-start;
                    padding: .65rem;
                }

                .registration-panel {
                    width: 100%;
                }

                .registration-card {
                    max-height: none;
                    overflow: visible;
                    padding: 1rem;
                    border-radius: .9rem;
                }

                .registration-tabs {
                    width: 100%;
                    margin-bottom: .75rem;
                }

                .form-grid,
                .status-result dl {
                    grid-template-columns: 1fr;
                }

                .wide {
                    grid-column: 1;
                }

                .section-label > span {
                    display: grid;
                    gap: .05rem;
                }

                .result-actions {
                    flex-direction: column;
                }
            }

            @media (max-width: 420px) {
                .registration-shell {
                    padding: .4rem;
                }

                .registration-card {
                    padding: .85rem .8rem;
                }

                .registration-tabs {
                    margin-bottom: .65rem;
                }

                .mode-tabs button {
                    font-size: .7rem;
                    padding-inline: .4rem;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .primary {
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
