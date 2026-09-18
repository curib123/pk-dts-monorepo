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
        <main class="registration-shell" [style.--registration-cover]="coverImage()">
            <div class="registration-cover" aria-hidden="true"></div>
            <div class="registration-overlay"></div>
            <section class="registration-card">
                <aside class="registration-intro">
                    <div class="intro-copy">
                        <span class="eyebrow">Secure account request</span>
                        <h1>{{ mode() === 'register' ? 'Join your document workspace.' : 'Follow your request.' }}</h1>
                        <p>{{ mode() === 'register' ? 'Submit your details for review. An authorized account manager will confirm your access and assign the appropriate role.' : 'Use your registration username to retrieve the latest request and see its current approval status.' }}</p>
                    </div>
                </aside>

                <div class="registration-content">
                    <div class="content-heading">
                        <h2>{{ mode() === 'register' ? 'Request an account' : 'Check registration status' }}</h2>
                        <p>{{ mode() === 'register' ? 'Complete the form below. Fields marked required must be provided.' : 'Enter the username used when you registered.' }}</p>
                    </div>
                    <nav class="mode-tabs" aria-label="Registration options">
                        <button type="button" [class.active]="mode() === 'register'" (click)="setMode('register')"><i class="pi pi-user-plus"></i><span>New request</span></button>
                        <button type="button" [class.active]="mode() === 'status'" (click)="setMode('status')"><i class="pi pi-clock"></i><span>Check status</span></button>
                    </nav>

                <form *ngIf="mode() === 'register' && !receipt()" [formGroup]="registerForm" (ngSubmit)="submitRegistration()" class="form-grid">
                    <div class="section-label wide"><i class="pi pi-user"></i><span><strong>Personal details</strong><small>Tell us who you are</small></span></div>
                    <label><span>First name</span><input formControlName="firstname" autocomplete="given-name" /></label>
                    <label><span>Last name</span><input formControlName="lastname" autocomplete="family-name" /></label>
                    <label
                        ><span>Middle name <small>Optional</small></span
                        ><input formControlName="middlename"
                    /></label>
                    <div class="section-label wide"><i class="pi pi-briefcase"></i><span><strong>Work and access</strong><small>Help us assign the right permissions</small></span></div>
                    <label class="wide"><span>Username</span><input formControlName="username" type="text" autocomplete="username" /></label>
                    <label class="wide"
                        ><span>Position title <small>Optional</small></span
                        ><input formControlName="position_title"
                    /></label>
                    <label class="wide"
                        ><span>Remarks <small>Optional</small></span
                        ><textarea formControlName="applicant_remarks" rows="3" maxlength="1000" placeholder="Write an optional message for the account manager"></textarea>
                        <small class="field-note">Add any information that may help the account manager review your request.</small></label
                    >
                    <label class="wide"
                        ><span>Requested role</span
                        ><select formControlName="requested_role_id">
                            <option value="">Select the access role you need</option>
                            <option *ngFor="let role of roles()" [value]="role.role_id">{{ role.role_name }}{{ role.description ? ' — ' + role.description : '' }}</option></select
                        ><small class="field-note">This is a request only. The approver selects your final role.</small></label
                    >
                    <div class="section-label wide"><i class="pi pi-lock"></i><span><strong>Secure your account</strong><small>Use at least 8 characters</small></span></div>
                    <label><span>Password</span><input formControlName="password" type="password" autocomplete="new-password" /></label>
                    <label><span>Confirm password</span><input formControlName="confirmPassword" type="password" autocomplete="new-password" /></label>
                    <div class="wide error" *ngIf="errorMessage()"><i class="pi pi-exclamation-circle"></i>{{ errorMessage() }}</div>
                    <button class="primary wide" type="submit" [disabled]="loading()"><i class="pi" [ngClass]="loading() ? 'pi-spin pi-spinner' : 'pi-send'"></i>{{ loading() ? 'Submitting…' : 'Submit registration request' }}</button>
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

                .form-grid,
                .status-result dl {
                    grid-template-columns: 1fr;
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
                padding: 2rem clamp(1rem, 4vw, 4rem);
                background: #f6f8fb;
            }

            .registration-cover {
                top: 0;
                right: 0;
                bottom: 0;
                left: auto;
                width: 43%;
                background-position: center;
                opacity: 0.9;
            }

            .registration-overlay {
                left: auto;
                width: 43%;
                background: linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(127, 29, 29, 0.68));
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
                .registration-cover, .registration-overlay { width: 100%; }
                .registration-cover { height: 38%; bottom: auto; }
                .registration-overlay { height: 38%; bottom: auto; }
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
    loading = signal(false);
    errorMessage = signal('');
    receipt = signal<RegistrationReceipt | null>(null);
    statusResult = signal<RegistrationStatusResult | null>(null);
    referenceLookupState = signal<'idle' | 'checking' | 'found' | 'missing'>('idle');
    referenceLookupMessage = signal('');
    registerForm = this.fb.group({
        firstname: ['', Validators.required],
        lastname: ['', Validators.required],
        middlename: [''],
        username: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9._@+-]{0,149}$/)]],
        position_title: [''],
        applicant_remarks: [''],
        requested_role_id: ['', Validators.required],
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', Validators.required]
    });
    statusForm = this.fb.group({ username: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9._@+-]{0,149}$/)]], reference_code: ['', Validators.required] });
    ngOnInit() {
        this.registration.roles().subscribe({ next: (r) => this.roles.set(r), error: () => this.errorMessage.set('Registration roles could not be loaded.') });
        this.statusForm.controls.username.valueChanges.pipe(debounceTime(600), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe((username) => this.lookupReference(username ?? ''));
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
    submitRegistration() {
        this.registerForm.markAllAsTouched();
        const value = this.registerForm.getRawValue();
        if (this.registerForm.invalid) {
            this.errorMessage.set('Complete all required fields and use a password with at least 8 characters.');
            return;
        }
        if (value.password !== value.confirmPassword) {
            this.errorMessage.set('Passwords do not match.');
            return;
        }
        this.loading.set(true);
        this.errorMessage.set('');
        const { confirmPassword, ...payload } = value;
        void confirmPassword;
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
