import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '@/app/auth/auth.service';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, ButtonModule, CheckboxModule, InputTextModule, PasswordModule, ReactiveFormsModule, RouterModule],
    template: `
        <div class="login-shell" [style.--login-cover]="loginCoverImage()">
            <div class="login-cover" aria-hidden="true"></div>
            <div class="login-overlay"></div>

            <header class="landing-nav">
                <a class="landing-brand" routerLink="/auth/login" aria-label="Document workspace home">
                    <span class="brand-mark"><img class="dts-brand-logo" [src]="settings().logoUrl" [alt]="settings().systemTitle + ' logo'" /></span>
                    <span><small>{{ settings().brandEyebrow }}</small><strong>{{ settings().systemShortTitle }}</strong></span>
                </a>
                <div class="landing-nav-meta"><i class="pi pi-shield"></i><span>Authorized access only</span></div>
            </header>

            <div class="login-panel">
                <section class="login-hero">
                    <div class="hero-copy">
                        <div class="hero-kicker">{{ settings().loginKicker }}</div>
                        <h1>{{ settings().loginHeadline }}</h1>
                        <p>{{ settings().loginDescription }}</p>
                        <div class="workflow-points" aria-label="System capabilities">
                            <div><i class="pi pi-file"></i><span><strong>Track records</strong><small>Softcopy and physical documents</small></span></div>
                            <div><i class="pi pi-map-marker"></i><span><strong>Locate faster</strong><small>Mapped storage and file journeys</small></span></div>
                            <div><i class="pi pi-shield"></i><span><strong>Work securely</strong><small>Role-based access and accountability</small></span></div>
                        </div>
                    </div>
                </section>

                <section class="login-card">
                    <div class="portal-label"><span></span> Staff workspace</div>
                    <div class="login-card-header">
                        <div class="login-logo">
                            <img class="dts-brand-logo" [src]="settings().logoUrl" [alt]="settings().systemTitle + ' logo'" />
                        </div>
                        <div>
                            <div class="login-title">{{ settings().loginWelcomeTitle }}</div>
                            <div class="login-subtitle">{{ settings().loginWelcomeSubtitle }}</div>
                        </div>
                    </div>

                    <form class="login-form" [formGroup]="form" autocomplete="off" (ngSubmit)="submit()">
                        <div class="field">
                            <label>Username</label>
                            <input pInputText formControlName="username" type="text" placeholder="Enter your username" autocomplete="off" />
                            <small *ngIf="isInvalid('username')">Enter a valid username.</small>
                        </div>

                        <div class="field">
                            <label>Password</label>
                            <p-password formControlName="password" placeholder="Enter password" autocomplete="new-password" [toggleMask]="true" [feedback]="false" [fluid]="true"></p-password>
                            <small *ngIf="isInvalid('password')">Password is required.</small>
                        </div>

                        <div class="login-meta">
                            <label class="remember">
                                <p-checkbox formControlName="rememberMe" [binary]="true"></p-checkbox>
                                <span>Remember me</span>
                            </label>
                        </div>

                        <p-button type="submit" [loading]="loading()" label="Sign In" icon="pi pi-arrow-right" styleClass="w-full"></p-button>

                        <p class="error-message" *ngIf="errorMessage()">{{ errorMessage() }}</p>
                    </form>
                    <div class="registration-links">
                        <span>Need an account?</span>
                        <a routerLink="/auth/register">Register or check approval status</a>
                    </div>
                    <p class="access-note"><i class="pi pi-lock"></i> Your activity is protected and recorded for document accountability.</p>
                </section>
            </div>

            <footer class="landing-footer">
                <span>{{ settings().footerText }}</span>
                <span>Created by John Paul Curib, Full-stack Developer</span>
                <span>Secure records &middot; Clear ownership &middot; Faster retrieval</span>
            </footer>
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                min-height: 100vh;
                --login-ink: #0f172a;
                --login-muted: #64748b;
                --login-line: rgba(148, 163, 184, 0.28);
                --login-brand: var(--dts-accent, var(--brand-primary));
                --login-brand-deep: var(--dts-accent-deep, var(--brand-primary-deep));
                --login-brand-soft: var(--dts-accent-soft, var(--brand-soft-strong));
            }

            .login-shell {
                position: relative;
                min-height: 100vh;
                overflow-x: hidden;
                overflow-y: auto;
                padding: 2rem;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            }

            .login-shell::before {
                content: '';
                position: absolute;
                inset: -2rem;
                background:
                    linear-gradient(135deg, rgba(255, 248, 247, 0.76) 0%, rgba(248, 250, 252, 0.68) 45%, rgba(254, 242, 242, 0.78) 100%),
                    var(--login-cover) center/cover no-repeat;
                filter: blur(10px) saturate(0.95);
                transform: scale(1.04);
            }

            .login-overlay {
                position: absolute;
                inset: 0;
                background:
                    linear-gradient(120deg, rgba(255, 255, 255, 0.34), transparent 45%), radial-gradient(circle at top left, rgba(248, 113, 113, 0.16), transparent 28%),
                    radial-gradient(circle at bottom right, color-mix(in srgb, var(--login-brand-deep) 14%, transparent), transparent 22%),
                    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0, rgba(255, 255, 255, 0.06) 1px, transparent 1px, transparent 18px);
                pointer-events: none;
            }

            .login-panel {
                position: relative;
                z-index: 1;
                width: min(1100px, 100%);
                display: grid;
                grid-template-columns: minmax(0, 1.15fr) minmax(360px, 440px);
                border: 1px solid rgba(255, 255, 255, 0.55);
                border-radius: 2rem;
                overflow: hidden;
                background: rgba(255, 255, 255, 0.72);
                box-shadow:
                    0 32px 80px rgba(15, 23, 42, 0.14),
                    0 4px 16px rgba(15, 23, 42, 0.08);
                backdrop-filter: blur(18px);
                -webkit-backdrop-filter: blur(18px);
            }

            .login-hero {
                position: relative;
                padding: 4.5rem 4rem;
                display: flex;
                align-items: flex-end;
                min-height: 680px;
                color: white;
                background: linear-gradient(145deg, color-mix(in srgb, var(--login-brand-deep) 68%, transparent), rgba(15, 23, 42, 0.5)), linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0));
            }

            .login-hero::after {
                content: '';
                position: absolute;
                inset: 0;
                background: radial-gradient(circle at top left, rgba(255, 255, 255, 0.24), transparent 32%), linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.68));
            }

            .hero-copy {
                position: relative;
                z-index: 1;
                max-width: 34rem;
            }

            .hero-kicker {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.45rem 0.9rem;
                border-radius: 999px;
                border: 1px solid rgba(255, 255, 255, 0.24);
                background: rgba(255, 255, 255, 0.12);
                backdrop-filter: blur(8px);
                font-size: 0.75rem;
                font-weight: 800;
                letter-spacing: 0.2em;
                text-transform: uppercase;
            }

            .hero-copy h1 {
                margin: 1.25rem 0 0;
                font-size: clamp(2.6rem, 4vw, 4.2rem);
                line-height: 0.98;
                font-weight: 900;
                letter-spacing: -0.04em;
            }

            .hero-copy p {
                margin: 1.5rem 0 0;
                max-width: 30rem;
                font-size: 1rem;
                line-height: 1.8;
                color: rgba(255, 255, 255, 0.88);
            }

            .login-card {
                padding: 2.5rem;
                display: flex;
                flex-direction: column;
                justify-content: center;
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.92));
                overflow-y: auto;
            }

            .login-card-header {
                display: flex;
                align-items: center;
                gap: 1rem;
                margin-bottom: 2rem;
            }

            .login-logo {
                display: grid;
                place-items: center;
                width: 4.5rem;
                height: 4.5rem;
                border-radius: 1.5rem;
                background: linear-gradient(180deg, #fff 0%, var(--login-brand-soft) 100%);
                border: 1px solid rgba(248, 113, 113, 0.3);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
            }

            .login-logo img {
                width: 3.1rem;
                height: 3.1rem;
                object-fit: contain;
            }

            .login-title {
                color: var(--login-ink);
                font-size: 1.85rem;
                font-weight: 900;
                letter-spacing: -0.03em;
            }

            .login-subtitle {
                margin-top: 0.35rem;
                color: var(--login-muted);
                font-size: 0.95rem;
                line-height: 1.6;
            }

            .login-form {
                display: flex;
                flex-direction: column;
                gap: 1.25rem;
            }

            .field {
                display: flex;
                flex-direction: column;
                gap: 0.55rem;
            }

            .field label {
                color: var(--login-ink);
                font-size: 0.9rem;
                font-weight: 800;
                letter-spacing: 0.01em;
            }

            .field input[pinputtext] {
                width: 100%;
                min-height: 3.25rem;
                border: 1px solid var(--login-line);
                border-radius: 1rem;
                background: rgba(255, 255, 255, 0.96);
                padding: 0.85rem 1rem;
                color: var(--login-ink);
                box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
                transition:
                    border-color 0.2s ease,
                    box-shadow 0.2s ease,
                    transform 0.2s ease;
            }

            .field input[pinputtext]:focus {
                border-color: color-mix(in srgb, var(--login-brand) 55%, transparent);
                box-shadow:
                    0 0 0 4px rgba(239, 68, 68, 0.12),
                    inset 0 1px 2px rgba(15, 23, 42, 0.04);
                outline: none;
                transform: translateY(-1px);
            }

            .field small {
                color: var(--login-brand);
                font-size: 0.8rem;
                font-weight: 700;
            }

            .login-meta {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                color: var(--login-muted);
            }

            .remember {
                display: inline-flex;
                align-items: center;
                gap: 0.75rem;
                color: var(--login-muted);
                font-size: 0.92rem;
                font-weight: 700;
                cursor: pointer;
            }

            .error-message {
                margin: 0;
                border: 1px solid rgba(248, 113, 113, 0.22);
                border-radius: 1rem;
                background: linear-gradient(180deg, #fff 0%, var(--login-brand-soft) 100%);
                padding: 0.85rem 1rem;
                color: var(--login-brand-deep);
                font-size: 0.9rem;
                line-height: 1.6;
            }

            .registration-links {
                margin-top: 1.5rem;
                padding-top: 1.25rem;
                border-top: 1px solid var(--login-line);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.45rem;
                flex-wrap: wrap;
                color: var(--login-muted);
                font-size: 0.86rem;
            }
            .registration-links a {
                color: var(--login-brand);
                font-weight: 850;
                text-decoration: none;
            }

            :host ::ng-deep .login-form .p-password,
            :host ::ng-deep .login-form .p-password-input,
            :host ::ng-deep .login-form .p-button {
                width: 100%;
            }

            :host ::ng-deep .login-form .p-password-input {
                min-height: 3.25rem;
                border-radius: 1rem;
                border-color: var(--login-line);
                background: rgba(255, 255, 255, 0.96);
                padding-inline: 1rem 3rem;
                box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
            }

            :host ::ng-deep .login-form .p-password-input:enabled:focus {
                border-color: color-mix(in srgb, var(--login-brand) 55%, transparent);
                box-shadow:
                    0 0 0 4px rgba(239, 68, 68, 0.12),
                    inset 0 1px 2px rgba(15, 23, 42, 0.04);
            }

            :host ::ng-deep .login-form .p-password-toggle-mask-icon {
                color: #94a3b8;
            }

            :host ::ng-deep .login-form .p-checkbox-box {
                border-radius: 0.5rem;
                border-color: rgba(148, 163, 184, 0.5);
            }

            :host ::ng-deep .login-form .p-checkbox-checked .p-checkbox-box {
                background: var(--login-brand);
                border-color: var(--login-brand);
            }

            :host ::ng-deep .login-form .p-button {
                min-height: 3.4rem;
                border: none;
                border-radius: 1rem;
                background: linear-gradient(135deg, var(--login-brand) 0%, var(--login-brand-deep) 100%);
                box-shadow: 0 18px 30px color-mix(in srgb, var(--login-brand) 22%, transparent);
                font-weight: 800;
                letter-spacing: 0.02em;
            }

            :host ::ng-deep .login-form .p-button:not(:disabled):hover {
                background: linear-gradient(135deg, var(--login-brand) 0%, var(--login-brand-deep) 100%);
            }

            @media (max-width: 960px) {
                .login-shell {
                    padding: 1rem;
                }

                .login-panel {
                    grid-template-columns: 1fr;
                }

                .login-hero {
                    min-height: 320px;
                    padding: 2.5rem 2rem;
                }

                .login-card {
                    padding: 2rem 1.5rem;
                }
            }

            @media (max-width: 640px) {
                .login-title {
                    font-size: 1.55rem;
                }

                .hero-copy h1 {
                    font-size: 2.2rem;
                }

                .hero-copy p {
                    font-size: 0.95rem;
                    line-height: 1.7;
                }

                .login-card-header {
                    align-items: flex-start;
                }
            }

            /* Landing-page composition */
            .login-shell {
                min-height: 100svh;
                padding: 6.75rem clamp(1rem, 4vw, 4rem) 4.5rem;
                align-items: center;
                background: #111827;
            }

            .login-shell::before {
                inset: 0;
                background: var(--login-cover) center 46%/cover no-repeat;
                filter: none;
                transform: none;
            }

            .login-cover {
                position:absolute;
                inset:-2.5%;
                background:var(--login-cover) center 46%/cover no-repeat;
                transform:scale(1.025);
                will-change:transform,background-position;
                animation:cover-breathe 18s cubic-bezier(.45,0,.55,1) infinite alternate;
            }

            .login-overlay {
                background: linear-gradient(90deg, rgba(4, 10, 20, .84) 0%, rgba(4, 10, 20, .58) 48%, rgba(4, 10, 20, .28) 100%), linear-gradient(180deg, rgba(4, 10, 20, .26) 0%, rgba(4, 10, 20, .08) 52%, rgba(4, 10, 20, .78) 100%);
            }

            .landing-nav {
                position: absolute;
                z-index: 3;
                inset: 0 0 auto;
                min-height: 5.5rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                padding: 1rem clamp(1rem, 4vw, 4rem);
                border-bottom: 1px solid rgba(255, 255, 255, .18);
                background: rgba(4, 10, 20, .52);
                animation:nav-reveal .75s cubic-bezier(.16,1,.3,1) both;
            }

            .landing-brand { display:flex;align-items:center;gap:.75rem;color:#fff;text-decoration:none;min-width:0; }
            .brand-mark { display:grid;place-items:center;width:3rem;height:3rem;flex:0 0 auto;border-radius:.85rem;background:rgba(255,255,255,.94); }
            .brand-mark img { width:2.25rem;height:2.25rem;object-fit:contain; }
            .landing-brand>span:last-child { display:grid;min-width:0; }
            .landing-brand small { color:rgba(255,255,255,.68);font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase; }
            .landing-brand strong { overflow:hidden;margin-top:.15rem;font-size:.95rem;text-overflow:ellipsis;white-space:nowrap; }
            .landing-nav-meta { display:inline-flex;align-items:center;gap:.5rem;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(4,10,20,.45);padding:.55rem .8rem;color:#fff;font-size:.72rem;font-weight:750; }
            .landing-nav-meta i { color:#86efac; }

            .login-panel {
                width:min(1240px,100%);
                grid-template-columns:minmax(0,1.35fr) minmax(360px,430px);
                border:1px solid rgba(255,255,255,.25);
                border-radius:1.5rem;
                background:rgba(15,23,42,.28);
                transform-origin:center;
                animation:landing-rise .9s .08s cubic-bezier(.16,1,.3,1) both;
            }

            .login-hero { min-height:clamp(500px,72vh,610px);padding:clamp(2rem,5vw,4.75rem);background:linear-gradient(180deg,rgba(15,23,42,.04),rgba(15,23,42,.58)); }
            .login-hero::after { background:linear-gradient(180deg,transparent 20%,rgba(4,10,20,.64)); }
            .hero-copy h1 { max-width:46rem;font-size:clamp(2.7rem,4.6vw,4.8rem);line-height:1.01; }
            .hero-copy p { max-width:41rem;color:rgba(255,255,255,.84);font-size:1.03rem; }
            .hero-kicker { border-radius:.55rem;background:var(--login-brand);border-color:transparent; }
            .hero-kicker,.hero-copy h1,.hero-copy>p { animation:content-rise .8s cubic-bezier(.16,1,.3,1) both; }
            .hero-kicker { animation-delay:.28s; }
            .hero-copy h1 { animation-delay:.38s; }
            .hero-copy>p { animation-delay:.5s; }

            .workflow-points { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;margin-top:2rem; }
            .workflow-points>div { display:grid;grid-template-columns:2.25rem minmax(0,1fr);align-items:center;gap:.65rem;border-top:1px solid rgba(255,255,255,.32);padding:.9rem 0 0;color:#fff; }
            .workflow-points>div { animation:content-rise .75s cubic-bezier(.16,1,.3,1) both;transition:transform .45s cubic-bezier(.16,1,.3,1),border-color .45s ease; }
            .workflow-points>div:nth-child(1) { animation-delay:.62s; }
            .workflow-points>div:nth-child(2) { animation-delay:.72s; }
            .workflow-points>div:nth-child(3) { animation-delay:.82s; }
            .workflow-points>div:hover { transform:translateY(-3px);border-color:rgba(255,255,255,.72); }
            .workflow-points>div>i { display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:.65rem;background:rgba(255,255,255,.14); }
            .workflow-points span { display:grid;gap:.16rem; }
            .workflow-points strong { font-size:.75rem; }
            .workflow-points small { color:rgba(255,255,255,.64);font-size:.62rem;line-height:1.35; }

            .login-card { padding:clamp(1.75rem,3vw,2.75rem);background:rgba(255,255,255,.97); }
            .login-card>* { animation:form-reveal .7s cubic-bezier(.16,1,.3,1) both; }
            .login-card>.portal-label { animation-delay:.35s; }
            .login-card>.login-card-header { animation-delay:.44s; }
            .login-card>.login-form { animation-delay:.53s; }
            .login-card>.registration-links { animation-delay:.62s; }
            .login-card>.access-note { animation-delay:.7s; }
            .portal-label { display:flex;align-items:center;gap:.45rem;margin-bottom:1.15rem;color:var(--login-brand-deep);font-size:.66rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase; }
            .portal-label span { width:1.6rem;height:2px;background:var(--login-brand); }
            .login-card-header { margin-bottom:1.6rem; }
            .login-logo { width:4rem;height:4rem;border-radius:1rem; }
            .login-logo img { width:2.75rem;height:2.75rem; }
            .login-title { font-size:1.65rem; }
            .access-note { display:flex;align-items:flex-start;justify-content:center;gap:.45rem;margin:1rem 0 0;color:#64748b;font-size:.68rem;line-height:1.5;text-align:center; }
            .access-note i { margin-top:.08rem;color:var(--login-brand); }
            .landing-footer { position:absolute;z-index:2;left:clamp(1rem,4vw,4rem);right:clamp(1rem,4vw,4rem);bottom:1.3rem;display:flex;justify-content:space-between;gap:1rem;color:rgba(255,255,255,.66);font-size:.68rem; }
            .landing-footer { animation:footer-reveal .8s .75s ease both; }

            .login-form .field { transition:transform .35s cubic-bezier(.16,1,.3,1); }
            .login-form .field:focus-within { transform:translateY(-2px); }
            .registration-links a { transition:color .3s ease,transform .3s ease; }
            .registration-links a:hover { transform:translateY(-1px); }

            @keyframes cover-breathe { 0%{transform:scale(1.025);background-position:48% 46%} 100%{transform:scale(1.085);background-position:53% 48%} }
            @keyframes nav-reveal { from{opacity:0;transform:translateY(-18px)} to{opacity:1;transform:translateY(0)} }
            @keyframes landing-rise { from{opacity:0;transform:translateY(24px) scale(.985)} to{opacity:1;transform:translateY(0) scale(1)} }
            @keyframes content-rise { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
            @keyframes form-reveal { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:translateX(0)} }
            @keyframes footer-reveal { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

            :host-context(.app-dark) .login-card { background:rgba(18,18,18,.97); }
            :host-context(.app-dark) .login-title,:host-context(.app-dark) .field label { color:#f5f5f5; }
            :host-context(.app-dark) .login-subtitle,:host-context(.app-dark) .remember,:host-context(.app-dark) .registration-links,:host-context(.app-dark) .access-note { color:#a3a3a3; }
            :host-context(.app-dark) .field input[pinputtext],:host-context(.app-dark) ::ng-deep .login-form .p-password-input { border-color:#404040;background:#202020;color:#f5f5f5; }
            :host-context(.app-dark) .registration-links { border-color:#404040; }

            @media (max-width:960px) {
                .login-shell { justify-content:flex-start;padding:6.25rem 1rem 1.25rem; }
                .login-panel { grid-template-columns:1fr; }
                .login-hero { min-height:390px;padding:2.5rem 2rem; }
                .hero-copy h1 { font-size:clamp(2.25rem,7vw,3.4rem); }
                .workflow-points { margin-top:1.5rem; }
                .landing-footer { position:relative;left:auto;right:auto;bottom:auto;width:min(1240px,100%);margin-top:1.25rem; }
            }

            @media (min-width:961px) and (max-height:760px) {
                .login-shell { justify-content:flex-start;padding-top:6.25rem;padding-bottom:3.5rem; }
                .login-hero { min-height:540px; }
                .login-card { padding:1.75rem 2.25rem; }
                .login-card-header { margin-bottom:1.25rem; }
                .login-form { gap:1rem; }
            }

            @media (max-width:640px) {
                .login-shell { justify-content:flex-start;padding:5.75rem .75rem 1rem; }
                .landing-nav { min-height:5rem;padding:.75rem 1rem; }
                .landing-nav-meta span { display:none; }
                .landing-nav-meta { width:2.5rem;height:2.5rem;justify-content:center;padding:0; }
                .login-panel { border-radius:1.1rem; }
                .login-hero { min-height:430px;padding:2rem 1.25rem; }
                .hero-copy h1 { font-size:2.35rem; }
                .workflow-points { grid-template-columns:1fr;gap:.5rem; }
                .workflow-points>div { grid-template-columns:2rem minmax(0,1fr);padding-top:.55rem; }
                .workflow-points>div>i { width:2rem;height:2rem; }
                .login-card { padding:1.5rem 1.15rem; }
                .landing-footer { flex-direction:column;align-items:center;text-align:center; }
            }

            /* Refined document-workspace login */
            .login-shell {
                padding: 7rem clamp(1.25rem, 5vw, 5rem) 4.5rem;
                background: #080c14;
            }

            .login-cover {
                inset: 0;
                transform: none;
                animation: none;
                background-position: center;
            }

            .login-overlay {
                background:
                    linear-gradient(90deg, rgba(5, 9, 16, .97) 0%, rgba(5, 9, 16, .88) 46%, rgba(5, 9, 16, .62) 100%),
                    linear-gradient(180deg, rgba(5, 9, 16, .28) 0%, rgba(5, 9, 16, .24) 55%, rgba(5, 9, 16, .92) 100%);
            }

            .landing-nav {
                min-height: 5.25rem;
                padding: .9rem clamp(1.25rem, 5vw, 5rem);
                border-color: rgba(255, 255, 255, .12);
                background: rgba(5, 9, 16, .78);
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
            }

            .brand-mark {
                width: 2.8rem;
                height: 2.8rem;
                border-radius: .7rem;
                box-shadow: 0 8px 24px rgba(0, 0, 0, .22);
            }

            .brand-mark img { width: 2.05rem; height: 2.05rem; }
            .landing-brand small { color: var(--brand-border); font-weight: 900; }
            .landing-brand strong { color: #fff; font-size: 1rem; letter-spacing: -.01em; }

            .landing-nav-meta {
                border: 0;
                background: rgba(255, 255, 255, .11);
                padding: .58rem .85rem;
                color: #f8fafc;
            }
            .landing-nav-meta i { color: #86efac; }

            .login-panel {
                width: min(1160px, 100%);
                grid-template-columns: minmax(0, 1fr) minmax(370px, 420px);
                align-items: center;
                gap: clamp(2rem, 6vw, 6.5rem);
                overflow: visible;
                border: 0;
                border-radius: 0;
                background: transparent;
                box-shadow: none;
                backdrop-filter: none;
                -webkit-backdrop-filter: none;
            }

            .login-hero {
                min-height: 540px;
                padding: 2rem 0;
                align-items: center;
                background: transparent;
            }

            .login-hero::after { display: none; }
            .hero-copy { max-width: 39rem; }

            .hero-kicker {
                padding: .48rem .72rem;
                border: 1px solid rgba(255, 255, 255, .2);
                border-radius: .45rem;
                background: var(--brand-primary);
                color: #fff;
                font-size: .65rem;
                letter-spacing: .16em;
                box-shadow: 0 8px 24px rgba(127, 29, 29, .2);
            }

            .hero-copy h1 {
                max-width: 38rem;
                margin-top: 1.35rem;
                font-size: clamp(2.75rem, 4.5vw, 4.6rem);
                line-height: 1.04;
                letter-spacing: -.045em;
                text-wrap: balance;
                text-shadow: 0 3px 24px rgba(0, 0, 0, .35);
                color: #fff;
            }

            .hero-copy p {
                max-width: 35rem;
                margin-top: 1.25rem;
                color: #e2e8f0;
                font-size: 1rem;
                line-height: 1.7;
            }

            .workflow-points { gap: .65rem; margin-top: 2rem; }
            .workflow-points > div {
                grid-template-columns: 2.1rem minmax(0, 1fr);
                gap: .6rem;
                border: 1px solid rgba(255, 255, 255, .2);
                border-radius: .75rem;
                background: rgba(15, 23, 42, .76);
                padding: .72rem;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }
            .workflow-points > div:hover { border-color: rgba(252, 165, 165, .65); background: rgba(15, 23, 42, .9); }
            .workflow-points > div > i { width: 2.1rem; height: 2.1rem; border-radius: .55rem; background: var(--brand-primary-deep); color: #fff; }
            .workflow-points strong { color: #fff; font-size: .74rem; }
            .workflow-points small { color: #cbd5e1; }

            .login-card {
                overflow: visible;
                padding: 2.35rem;
                border: 1px solid rgba(255, 255, 255, .72);
                border-radius: 1.35rem;
                background: rgba(255, 255, 255, .97);
                box-shadow: 0 28px 70px rgba(0, 0, 0, .34), 0 2px 8px rgba(0, 0, 0, .12);
            }

            .portal-label { margin-bottom: 1.35rem; color: var(--brand-primary-deep); }
            .portal-label span { width: 1.25rem; background: var(--brand-primary); }
            .login-card-header { gap: .9rem; margin-bottom: 1.65rem; }
            .login-logo { width: 3.75rem; height: 3.75rem; border-radius: .9rem; }
            .login-logo img { width: 2.55rem; height: 2.55rem; }
            .login-title { font-size: 1.6rem; }
            .login-subtitle { margin-top: .2rem; font-size: .86rem; line-height: 1.45; }
            .login-form { gap: 1.05rem; }
            .field { gap: .45rem; }
            .field label { font-size: .78rem; }
            .field input[pinputtext],
            :host ::ng-deep .login-form .p-password-input { min-height: 3.1rem; border-radius: .7rem; background: #fff; }
            .field input[pinputtext]:focus { transform: none; }
            .login-form .field:focus-within { transform: none; }
            .remember { gap: .55rem; font-size: .82rem; }
            :host ::ng-deep .login-form .p-checkbox-box { width: 1.15rem; height: 1.15rem; border-radius: .3rem; }
            :host ::ng-deep .login-form .p-button { min-height: 3.15rem; border-radius: .7rem; box-shadow: 0 10px 22px rgba(127, 29, 29, .18); }
            .registration-links { margin-top: 1.25rem; padding-top: 1.05rem; font-size: .78rem; }
            .access-note { margin-top: .85rem; font-size: .64rem; }

            .landing-footer {
                left: clamp(1.25rem, 5vw, 5rem);
                right: clamp(1.25rem, 5vw, 5rem);
                color: rgba(255, 255, 255, .48);
            }

            :host-context(.app-dark) .login-card { border-color: #333; background: rgba(18, 18, 18, .98); }

            @media (max-width: 960px) {
                .login-shell { padding: 6.5rem 1rem 1.5rem; }
                .login-panel { grid-template-columns: 1fr; gap: 1.25rem; width: min(620px, 100%); }
                .login-hero { min-height: auto; padding: 2rem 1rem 1rem; text-align: center; }
                .hero-copy { max-width: 36rem; margin-inline: auto; }
                .hero-copy h1 { font-size: clamp(2.2rem, 8vw, 3.25rem); }
                .hero-copy p { margin-inline: auto; }
                .workflow-points { display: none; }
                .landing-footer { width: min(620px, 100%); }
            }

            @media (max-width: 640px) {
                .login-shell { padding: 5.75rem .75rem 1rem; }
                .login-hero { padding: 1.35rem .5rem .5rem; }
                .hero-kicker { font-size: .58rem; }
                .hero-copy h1 { margin-top: .9rem; font-size: 2rem; }
                .hero-copy p { margin-top: .75rem; font-size: .86rem; line-height: 1.55; }
                .login-card { padding: 1.45rem 1.15rem; border-radius: 1rem; }
                .login-card-header { margin-bottom: 1.35rem; }
                .landing-footer { gap: .35rem; }
            }

            @media (prefers-reduced-motion:reduce) {
                .login-cover,.landing-nav,.login-panel,.hero-kicker,.hero-copy h1,.hero-copy>p,.workflow-points>div,.login-card>*,.landing-footer { animation:none!important; }
                .workflow-points>div,.login-form .field,.registration-links a { transition:none!important; }
            }

            /* The supplied PK mark is a compact icon; pair it with the system name instead of treating it as a wordmark. */
            .landing-brand .brand-mark { width: 4.2rem; height: 2.8rem; padding: 0; overflow: hidden; background: #070707; }
            .landing-brand .brand-mark img { width: 100%; height: 100%; object-fit: contain; }
            .landing-brand > span:last-child { display: grid; }
            .login-logo { width: 4.5rem; height: 3rem; padding: 0; overflow: hidden; border-radius: .75rem; background: #070707; }
            .login-logo img { width: 100%; height: 100%; object-fit: contain; }
            :host-context(.app-dark) .landing-brand .brand-mark,
            :host-context(.app-dark) .login-logo { background: #070707; border-color: rgba(248, 113, 113, .38); }

            @media (max-width: 640px) {
                .landing-brand .brand-mark { width: 3.75rem; height: 2.5rem; }
                .login-logo { width: 4.05rem; height: 2.7rem; }
            }
        `
        ,`
            /* SaaS auth refinement: focused form, restrained chrome, responsive split shell. */
            .login-shell {
                min-height: 100svh;
                padding: 6.6rem clamp(1rem, 4vw, 4rem) 2rem;
                background: #f6f8fb;
                color: #172033;
            }

            .login-shell::before {
                inset: 0;
                background:
                    radial-gradient(circle at 82% 12%, rgba(185, 28, 28, 0.08), transparent 24rem),
                    radial-gradient(circle at 12% 90%, rgba(30, 64, 175, 0.06), transparent 28rem),
                    #f6f8fb;
                filter: none;
                transform: none;
            }

            .login-cover {
                top: 0;
                right: 0;
                bottom: 0;
                left: auto;
                width: 43%;
                background-position: center;
                clip-path: inset(0 0 0 0 round 0);
                opacity: 0.9;
            }

            .login-overlay {
                left: auto;
                width: 43%;
                background: linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(127, 29, 29, 0.68));
            }

            .landing-nav {
                min-height: 4.8rem;
                padding: 0.75rem clamp(1rem, 4vw, 4rem);
                border-bottom: 1px solid #e6eaf0;
                background: rgba(255, 255, 255, 0.88);
                box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02);
                backdrop-filter: blur(18px);
                -webkit-backdrop-filter: blur(18px);
            }

            .landing-brand { color: #172033; }
            .landing-brand small { color: #7b8495; }
            .landing-brand strong { color: #172033; }
            .landing-nav-meta {
                border: 1px solid #e2e8f0;
                background: #fff;
                color: #475569;
                box-shadow: 0 6px 16px rgba(15, 23, 42, 0.05);
            }
            .landing-nav-meta i { color: #16a34a; }

            .login-panel {
                width: min(1120px, 100%);
                grid-template-columns: minmax(0, 1.02fr) minmax(390px, 0.98fr);
                align-items: stretch;
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.8);
                border-radius: 1.65rem;
                background: transparent;
                box-shadow: 0 26px 70px rgba(15, 23, 42, 0.16), 0 2px 8px rgba(15, 23, 42, 0.06);
                backdrop-filter: none;
                -webkit-backdrop-filter: none;
            }

            .login-hero {
                min-height: 620px;
                padding: clamp(2rem, 5vw, 4rem);
                align-items: flex-end;
                background: linear-gradient(160deg, rgba(15, 23, 42, 0.34), rgba(15, 23, 42, 0.9));
            }

            .login-hero::after {
                background: linear-gradient(180deg, rgba(15, 23, 42, 0.02) 20%, rgba(15, 23, 42, 0.72));
            }

            .hero-copy { max-width: 32rem; }
            .hero-kicker {
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 0.55rem;
                background: rgba(255, 255, 255, 0.14);
                box-shadow: none;
            }
            .hero-copy h1 {
                max-width: 31rem;
                margin-top: 1.1rem;
                font-size: clamp(2.4rem, 4vw, 4rem);
                line-height: 1.02;
                text-shadow: none;
            }
            .hero-copy p { max-width: 29rem; color: rgba(255, 255, 255, 0.78); }
            .workflow-points { grid-template-columns: 1fr; gap: 0.55rem; margin-top: 1.7rem; }
            .workflow-points > div {
                grid-template-columns: 2.2rem minmax(0, 1fr);
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 0.8rem;
                background: rgba(15, 23, 42, 0.34);
                padding: 0.7rem;
            }
            .workflow-points > div > i { background: rgba(255, 255, 255, 0.14); }

            .login-card {
                min-height: 620px;
                padding: clamp(2rem, 4vw, 3.3rem);
                border-radius: 0;
                background: #fff;
                box-shadow: none;
            }
            .portal-label { margin-bottom: 1rem; color: #7b8495; font-size: 0.62rem; }
            .portal-label span { background: var(--login-brand); }
            .login-card-header { gap: 0.85rem; margin-bottom: 1.8rem; }
            .login-logo { width: 3.8rem; height: 2.55rem; border-radius: 0.7rem; }
            .login-title { color: #172033; font-size: 1.75rem; }
            .login-subtitle { max-width: 18rem; color: #7b8495; font-size: 0.88rem; }
            .login-form { gap: 1rem; }
            .field { gap: 0.42rem; }
            .field label { color: #334155; font-size: 0.78rem; }
            .field input[pinputtext],
            :host ::ng-deep .login-form .p-password-input {
                min-height: 3.05rem;
                border: 1px solid #dbe1e9;
                border-radius: 0.7rem;
                background: #fbfcfe;
                box-shadow: none;
            }
            .field input[pinputtext]:focus,
            :host ::ng-deep .login-form .p-password-input:enabled:focus {
                border-color: color-mix(in srgb, var(--login-brand) 58%, #cbd5e1);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--login-brand) 12%, transparent);
            }
            .login-meta { margin-top: 0.1rem; }
            .remember { color: #64748b; font-size: 0.8rem; }
            :host ::ng-deep .login-form .p-button {
                min-height: 3.15rem;
                border-radius: 0.7rem;
                background: var(--login-brand-deep);
                box-shadow: 0 12px 24px color-mix(in srgb, var(--login-brand-deep) 18%, transparent);
            }
            :host ::ng-deep .login-form .p-button:not(:disabled):hover { background: var(--login-brand); }
            .error-message { border-radius: 0.75rem; background: #fff5f5; color: #b91c1c; }
            .registration-links { margin-top: 1.25rem; padding-top: 1rem; border-color: #edf0f4; font-size: 0.8rem; }
            .registration-links a { color: var(--login-brand-deep); }
            .access-note { color: #94a3b8; font-size: 0.64rem; }
            .landing-footer { color: #94a3b8; }

            @media (max-width: 960px) {
                .login-cover, .login-overlay { width: 100%; }
                .login-cover { height: 46%; bottom: auto; }
                .login-overlay { height: 46%; bottom: auto; }
                .login-panel { grid-template-columns: 1fr; width: min(620px, 100%); }
                .login-hero { min-height: 360px; padding: 2.4rem 2rem; }
                .login-card { min-height: auto; border-radius: 0; }
                .workflow-points { display: none; }
            }

            @media (max-width: 640px) {
                .login-shell { padding: 5.8rem 0.75rem 1rem; }
                .login-panel { border-radius: 1.15rem; }
                .login-hero { min-height: 300px; padding: 2rem 1.25rem; }
                .hero-copy h1 { font-size: 2.15rem; }
                .login-card { padding: 1.55rem 1.15rem; }
                .landing-nav-meta span { display: none; }
                .landing-nav-meta { width: 2.45rem; height: 2.45rem; justify-content: center; padding: 0; }
            }
        `
    ]
})
export class Login {
    private fb = inject(FormBuilder);
    private auth = inject(AuthService);
    private router = inject(Router);
    private systemSettings = inject(SystemSettingsService);
    settings = this.systemSettings.settings;

    loading = signal(false);
    errorMessage = signal('');

    form = this.fb.group({
        username: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9._@+-]{0,149}$/)]],
        password: ['', [Validators.required]],
        rememberMe: [false]
    });

    loginCoverImage() {
        const safeUrl = this.settings().loginCoverUrl.replace(/["'()]/g, '');
        return `url("${safeUrl}")`;
    }

    submit() {
        this.errorMessage.set('');
        this.form.markAllAsTouched();

        if (this.form.invalid || this.loading()) {
            return;
        }

        this.loading.set(true);

        const { username, password, rememberMe } = this.form.getRawValue();

        this.auth.login({ username: username ?? '', password: password ?? '' }, rememberMe ?? false).subscribe({
            next: () => {
                this.router.navigate(['/panel/dashboard']);
            },
            error: (error) => {
                this.errorMessage.set(error?.error?.message || 'Login failed. Please check your credentials and try again.');
            }
        }).add(() => this.loading.set(false));
    }

    isInvalid(controlName: 'username' | 'password') {
        const control = this.form.get(controlName);
        return !!control && control.invalid && (control.dirty || control.touched);
    }
}
