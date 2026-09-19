import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DEFAULT_SYSTEM_SETTINGS, SystemSettings, SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { WorkspacePageComponent, WorkspaceTabsComponent, WorkspaceToolbarComponent } from '@/app/shared/components/workspace-ui/workspace-ui.component';

@Component({
    selector: 'app-system-settings-page',
    standalone: true,
    imports: [WorkspaceToolbarComponent, WorkspacePageComponent, WorkspaceTabsComponent, CommonModule, FormsModule, ButtonModule],
    template: `<app-workspace-page>
        <section class="settings-page">
            <div *ngIf="saved" class="saved-message"><i class="pi pi-check-circle"></i> Settings saved and applied.</div>
            <div *ngIf="saveError()" class="saved-message error"><i class="pi pi-exclamation-circle"></i> {{ saveError() }}</div>

            <app-workspace-toolbar>
                <app-workspace-tabs ariaLabel="System settings sections">
                    <button type="button" [class.active]="activeTab() === 'branding'" (click)="activeTab.set('branding')"><i class="pi pi-palette"></i> Branding</button>
                    <button type="button" [class.active]="activeTab() === 'login'" (click)="activeTab.set('login')"><i class="pi pi-image"></i> Login page</button>
                    <button type="button" [class.active]="activeTab() === 'infrastructure'" (click)="activeTab.set('infrastructure')"><i class="pi pi-server"></i> Connections</button>
                </app-workspace-tabs>
                <div workspace-actions class="top-actions" aria-label="System settings actions">
                    <p-button styleClass="settings-reset" label="Defaults" icon="pi pi-refresh" severity="secondary" [outlined]="true" [disabled]="saving()" (onClick)="restoreDefaults()" />
                    <p-button styleClass="settings-save" label="Save changes" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
                </div>
            </app-workspace-toolbar>

            <div class="settings-grid">
                <article *ngIf="activeTab() === 'branding'" id="branding" class="setting-card span-2">
                    <div class="card-heading">
                        <div class="card-icon"><i class="pi pi-palette"></i></div>
                        <div>
                            <h2>System identity</h2>
                            <p>Used by the browser title, panel sidebar, logo, favicon, and other shared brand surfaces.</p>
                        </div>
                    </div>
                    <div class="form-grid">
                        <div class="field span-2"><label for="system-title">System title</label><input id="system-title" [(ngModel)]="form.systemTitle" maxlength="100" /></div>
                        <div class="field"><label for="short-title">Short panel title</label><input id="short-title" [(ngModel)]="form.systemShortTitle" maxlength="50" /></div>
                        <div class="field"><label for="brand-eyebrow">Panel eyebrow</label><input id="brand-eyebrow" [(ngModel)]="form.brandEyebrow" maxlength="40" /></div>
                        <div class="field span-2">
                            <label for="logo-url">Logo image path or URL</label>
                            <input id="logo-url" [(ngModel)]="form.logoUrl" placeholder="/images/company-logo.png" />
                            <label class="image-upload" for="logo-upload"><i class="pi pi-upload"></i><span>Upload system logo</span><small>PNG, JPG, WebP, GIF or SVG · up to 750 KB</small></label>
                            <input id="logo-upload" class="file-picker" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" (change)="uploadImage($event, 'logoUrl', 768000)" />
                        </div>
                        <div class="field">
                            <label for="favicon-url">Favicon path or URL</label>
                            <input id="favicon-url" [(ngModel)]="form.faviconUrl" placeholder="/images/favicon.png" />
                            <label class="image-upload compact" for="favicon-upload"><i class="pi pi-upload"></i><span>Upload favicon</span><small>Image file · up to 256 KB</small></label>
                            <input id="favicon-upload" class="file-picker" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon" (change)="uploadImage($event, 'faviconUrl', 262144)" />
                        </div>
                        <div class="field"><label for="footer-text">Static footer text</label><input id="footer-text" [(ngModel)]="form.footerText" maxlength="100" /></div>
                    </div>
                    <div class="brand-preview">
                        <div class="preview-logo"><img class="dts-brand-logo" [src]="form.logoUrl" alt="Logo preview" /></div>
                        <div><span>{{ form.brandEyebrow }}</span><strong>{{ form.systemShortTitle }}</strong><small>{{ form.footerText }}</small></div>
                    </div>
                </article>

                <article *ngIf="activeTab() === 'login'" id="static-content" class="setting-card span-2">
                    <div class="card-heading">
                        <div class="card-icon"><i class="pi pi-image"></i></div>
                        <div>
                            <h2>Login cover and static content</h2>
                            <p>Customize the cover image and fixed copy shown before users sign in.</p>
                        </div>
                    </div>
                    <div class="form-grid">
                        <div class="field span-2">
                            <label for="cover-url">Login cover image path or URL</label>
                            <input id="cover-url" [(ngModel)]="form.loginCoverUrl" placeholder="/images/building.jpg" />
                            <label class="image-upload" for="cover-upload"><i class="pi pi-images"></i><span>Upload login cover</span><small>PNG, JPG, WebP, GIF or SVG · up to 2 MB</small></label>
                            <input id="cover-upload" class="file-picker" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" (change)="uploadImage($event, 'loginCoverUrl', 2097152)" />
                        </div>
                        <div class="field"><label for="login-kicker">Cover label</label><input id="login-kicker" [(ngModel)]="form.loginKicker" maxlength="60" /></div>
                        <div class="field"><label for="welcome-title">Login card title</label><input id="welcome-title" [(ngModel)]="form.loginWelcomeTitle" maxlength="60" /></div>
                        <div class="field span-2"><label for="login-headline">Cover headline</label><input id="login-headline" [(ngModel)]="form.loginHeadline" maxlength="120" /></div>
                        <div class="field span-2"><label for="login-description">Cover description</label><textarea id="login-description" [(ngModel)]="form.loginDescription" rows="3" maxlength="500"></textarea></div>
                        <div class="field span-2"><label for="welcome-subtitle">Login card subtitle</label><input id="welcome-subtitle" [(ngModel)]="form.loginWelcomeSubtitle" maxlength="140" /></div>
                    </div>
                    <div *ngIf="imageMessage()" class="image-message" [class.error]="imageError()"><i [class]="imageError() ? 'pi pi-exclamation-circle' : 'pi pi-check-circle'"></i>{{ imageMessage() }}</div>
                    <div class="cover-preview" [style.backgroundImage]="coverPreviewImage()">
                        <div><span>{{ form.loginKicker }}</span><strong>{{ form.loginHeadline }}</strong><small>{{ form.loginDescription }}</small></div>
                    </div>
                </article>

                <article *ngIf="activeTab() === 'infrastructure'" class="setting-card span-2">
                    <div class="card-heading">
                        <div class="card-icon"><i class="pi pi-server"></i></div>
                        <div>
                            <h2>System API</h2>
                            <p>Set the API addresses used by this deployment. Values are saved with the system settings.</p>
                        </div>
                    </div>
                    <div class="form-grid">
                        <div class="field"><label for="backend-api-url">Backend API base URL</label><input id="backend-api-url" type="url" [(ngModel)]="form.backendApiUrl" placeholder="/api/v1" /></div>
                        <div class="field"><label for="backup-api-url">Backup and restore API</label><input id="backup-api-url" type="url" [(ngModel)]="form.backupApiUrl" placeholder="/api/v1/backup-restore" /></div>
                    </div>
                    <div class="security-note"><i class="pi pi-info-circle"></i><span>Use a relative path when the API is behind the same domain. External API URLs must allow this frontend origin through CORS.</span></div>
                </article>
            </div>
        </section>
    </app-workspace-page>`,
    styles: [
        `
            .settings-page { display: grid; gap: 1.25rem; color: #111827; }
            .settings-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border: 1px solid #e5e7eb; border-radius: 1.15rem; background: #fff; padding: .45rem; box-shadow: 0 8px 24px rgba(15,23,42,.05); }
            .section-nav { display: flex; gap: .25rem; flex-wrap: wrap; }
            .section-nav button { display: inline-flex; align-items: center; gap: .45rem; border: 0; border-radius: .8rem; background: transparent; padding: .72rem .9rem; color: #64748b; font-weight: 800; cursor: pointer; }
            .section-nav button.active { background: var(--dts-accent-soft); color: var(--dts-accent-deep); }
            .top-actions { display: flex; justify-content: flex-end; gap: .65rem; flex-wrap: wrap; }
            .saved-message { display: flex; align-items: center; gap: .55rem; border: 1px solid #bbf7d0; border-radius: 1rem; background: #f0fdf4; padding: .85rem 1rem; color: #166534; font-weight: 800; }
            .saved-message.error { border-color: var(--brand-border); background: var(--brand-soft); color: var(--brand-primary-deep); }
            .settings-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 1.25rem; }
            .setting-card { display: grid; align-content: start; gap: 1rem; border: 1px solid #e5e7eb; border-radius: 1.25rem; background: #fff; padding: 1.4rem; }
            .span-2 { grid-column: 1/-1; }
            .card-heading { display: flex; align-items: flex-start; gap: .85rem; }
            .card-icon { display: grid; place-items: center; width: 3rem; height: 3rem; flex: 0 0 auto; border-radius: 1rem; background: var(--dts-accent-deep); color: #fff; font-size: 1.15rem; }
            .setting-card h2 { margin: 0 0 .3rem; color: #111827; font-size: 1.15rem; }
            p { margin: 0; color: #64748b; line-height: 1.6; }
            .form-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 1rem; }
            .field { display: grid; align-content: start; gap: .45rem; }
            .field.span-2 { grid-column: 1/-1; }
            .field label { color: #374151; font-size: .7rem; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
            .field input, .field select, .field textarea { width: 100%; border: 1px solid #d1d5db; border-radius: .8rem; background: #fff; padding: .75rem .85rem; color: #111827; outline: none; resize: vertical; }
            .field input:focus, .field select:focus, .field textarea:focus { border-color: var(--dts-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dts-accent) 16%, transparent); }
            .image-upload { display: grid !important; grid-template-columns: 2.25rem minmax(0,1fr); align-items: center; gap: .15rem .7rem; border: 1px dashed #cbd5e1; border-radius: .85rem; background: #f8fafc; padding: .7rem .8rem !important; color: #334155 !important; cursor: pointer; text-transform: none !important; letter-spacing: normal !important; }
            .image-upload i { grid-row: 1/3; display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: .65rem; background: var(--dts-accent); color: #fff; }
            .image-upload span { font-size: .75rem; font-weight: 850; }
            .image-upload small { color: #64748b; font-size: .65rem; font-weight: 500; }
            .file-picker { position: absolute; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0 !important; }
            .brand-preview { display: flex; align-items: center; gap: 1rem; border-radius: 1rem; background: var(--dts-accent-deep); padding: 1rem; color: #fff; }
            .preview-logo { display: grid; place-items: center; width: 6rem; height: 4rem; overflow: hidden; border-radius: 1rem; background: #fff; }
            .preview-logo img { width: 100%; height: 100%; object-fit: contain; }
            .brand-preview span, .brand-preview small { display: block; color: rgba(255,255,255,.76); font-size: .7rem; }
            .brand-preview strong { display: block; margin: .2rem 0; font-size: 1rem; }
            .cover-preview { position: relative; overflow: hidden; min-height: 14rem; border-radius: 1.15rem; background-position: center; background-size: cover; }
            .cover-preview::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(128,0,0,.78), rgba(17,24,39,.65)); }
            .cover-preview > div { position: relative; z-index: 1; display: flex; flex-direction: column; justify-content: flex-end; min-height: 14rem; max-width: 38rem; padding: 1.25rem; color: #fff; }
            .cover-preview span { font-size: .68rem; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
            .cover-preview strong { margin: .45rem 0; font-size: 1.35rem; }
            .cover-preview small { color: #e2e8f0; line-height: 1.55; }
            .security-note { display: flex; align-items: flex-start; gap: .65rem; border: 1px solid #e5e7eb; border-radius: .9rem; background: #f8fafc; padding: .8rem; color: #475569; font-size: .72rem; line-height: 1.55; }
            .security-note i { margin-top: .15rem; color: var(--dts-accent-deep); }
            .image-message { display: flex; align-items: center; gap: .5rem; border: 1px solid #bbf7d0; border-radius: .8rem; background: #f0fdf4; padding: .7rem .85rem; color: #166534; font-size: .75rem; font-weight: 800; }
            .image-message.error { border-color: var(--brand-border); background: var(--brand-soft); color: var(--brand-primary-deep); }
            :host ::ng-deep .settings-save.p-button { border-color: var(--dts-accent); background: var(--dts-accent); }
            @media (max-width: 900px) { .settings-toolbar { align-items: stretch; flex-direction: column; } .top-actions { justify-content: flex-end; } }
            @media (max-width: 800px) { .settings-grid, .form-grid { grid-template-columns: 1fr; } .span-2, .field.span-2 { grid-column: auto; } }
            @media (max-width: 520px) { .top-actions, .top-actions p-button { width: 100%; } :host ::ng-deep .top-actions .p-button { width: 100%; justify-content: center; } }
        `
    ]
})
export class SystemSettingsPage {
    private readonly settingsService = inject(SystemSettingsService);
    form: SystemSettings = { ...this.settingsService.settings(), themeScope: 'shared', colorMode: 'light', colorTheme: DEFAULT_SYSTEM_SETTINGS.colorTheme };
    saved = false;
    saving = signal(false);
    saveError = signal('');
    imageMessage = signal('');
    imageError = signal(false);
    activeTab = signal<'branding' | 'login' | 'infrastructure'>('branding');

    coverPreviewImage() {
        const safeUrl = this.form.loginCoverUrl.replace(/["'()]/g, '');
        return `linear-gradient(135deg, rgba(127,29,29,.2), rgba(17,24,39,.18)), url("${safeUrl}")`;
    }

    uploadImage(event: Event, field: 'logoUrl' | 'faviconUrl' | 'loginCoverUrl', maxBytes: number) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;

        const extension = file.name.split('.').pop()?.toLowerCase() || '';
        const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico'];
        if (!file.type.startsWith('image/') && !imageExtensions.includes(extension)) {
            this.showImageMessage('Choose a valid image file.', true);
            return;
        }
        if (file.size > maxBytes) {
            this.showImageMessage(`The selected image is too large. Maximum size is ${this.formatBytes(maxBytes)}.`, true);
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            if (!dataUrl.startsWith('data:image/')) {
                this.showImageMessage('The selected image could not be read.', true);
                return;
            }
            this.form[field] = dataUrl;
            this.showImageMessage(`${file.name} is ready. Select Save changes to apply it across the system.`, false);
        };
        reader.onerror = () => this.showImageMessage('The selected image could not be read.', true);
        reader.readAsDataURL(file);
    }

    save() {
        try {
            this.saving.set(true);
            this.saveError.set('');
            this.form = {
                ...this.form,
                themeScope: 'shared',
                colorMode: 'light',
                colorTheme: DEFAULT_SYSTEM_SETTINGS.colorTheme
            };
            this.settingsService.save(this.form);
            this.settingsService.updateAppearanceScope(this.form).subscribe({
                next: () => {
                    this.saving.set(false);
                    this.form = { ...this.settingsService.settings() };
                    this.imageMessage.set('');
                    this.showSaved();
                },
                error: () => {
                    this.saving.set(false);
                    this.saveError.set('Local preferences were saved, but the shared system settings could not be updated. Check your permission and try again.');
                }
            });
        } catch (error) {
            this.saving.set(false);
            this.showImageMessage(error instanceof Error ? error.message : 'The settings could not be saved.', true);
        }
    }

    restoreDefaults() {
        const workspacePreferences = {
            defaultDocumentView: this.form.defaultDocumentView,
            documentRowsPerPage: this.form.documentRowsPerPage,
            officeOpenMode: this.form.officeOpenMode,
            automaticPrintDialog: this.form.automaticPrintDialog
        };
        this.form = { ...DEFAULT_SYSTEM_SETTINGS, ...workspacePreferences };
        this.save();
    }

    private showSaved() {
        this.saved = true;
        window.setTimeout(() => (this.saved = false), 2500);
    }

    private showImageMessage(message: string, error: boolean) {
        this.imageMessage.set(message);
        this.imageError.set(error);
    }

    private formatBytes(bytes: number) {
        return bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.round(bytes / 1024)} KB`;
    }
}
