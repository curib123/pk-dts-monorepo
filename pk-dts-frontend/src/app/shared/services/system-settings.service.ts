import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { filter, map, tap } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { BACKEND_API_BASE_URL } from '@/app/config/api-config';

export type DocumentViewMode = 'list' | 'grid' | 'folder';
export type OfficeOpenMode = 'desktop' | 'browser';
export type ColorMode = 'light' | 'dark';
export type ThemeScope = 'shared' | 'device';
export const COLOR_THEME_OPTIONS = [
    { id: 'default', name: 'Ruby Red', description: 'Classic document-control red', accent: '#dc2626', deep: '#991b1b', soft: '#fee2e2' },
    { id: 'crimson', name: 'Deep Crimson', description: 'Dark professional crimson', accent: '#9f1239', deep: '#4c0519', soft: '#ffe4e6' },
    { id: 'monochrome', name: 'Monochrome', description: 'Neutral black and white', accent: '#262626', deep: '#000000', soft: '#e5e5e5' },
    { id: 'ocean', name: 'Ocean Blue', description: 'Clear corporate blue', accent: '#2563eb', deep: '#1e3a8a', soft: '#dbeafe' },
    { id: 'emerald', name: 'Emerald', description: 'Calm operational green', accent: '#059669', deep: '#064e3b', soft: '#d1fae5' },
    { id: 'violet', name: 'Violet', description: 'Modern creative violet', accent: '#7c3aed', deep: '#4c1d95', soft: '#ede9fe' },
    { id: 'amber', name: 'Amber', description: 'Warm high-visibility amber', accent: '#d97706', deep: '#78350f', soft: '#fef3c7' },
    { id: 'teal', name: 'Teal', description: 'Balanced records teal', accent: '#0d9488', deep: '#134e4a', soft: '#ccfbf1' },
    { id: 'rose', name: 'Rose', description: 'Bright polished rose', accent: '#e11d48', deep: '#881337', soft: '#ffe4e6' },
    { id: 'indigo', name: 'Indigo', description: 'Structured executive indigo', accent: '#4f46e5', deep: '#312e81', soft: '#e0e7ff' }
] as const;
export type ColorTheme = (typeof COLOR_THEME_OPTIONS)[number]['id'];

export interface SystemSettings {
    defaultDocumentView: DocumentViewMode;
    documentRowsPerPage: number;
    officeOpenMode: OfficeOpenMode;
    automaticPrintDialog: boolean;
    themeScope: ThemeScope;
    colorMode: ColorMode;
    colorTheme: ColorTheme;
    systemTitle: string;
    systemShortTitle: string;
    brandEyebrow: string;
    logoUrl: string;
    faviconUrl: string;
    loginCoverUrl: string;
    loginKicker: string;
    loginHeadline: string;
    loginDescription: string;
    loginWelcomeTitle: string;
    loginWelcomeSubtitle: string;
    backendApiUrl: string;
    backupApiUrl: string;
    assistantEnabled: boolean;
    assistantTitle: string;
    assistantWelcomeText: string;
    footerText: string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
    defaultDocumentView: 'list',
    documentRowsPerPage: 10,
    officeOpenMode: 'desktop',
    automaticPrintDialog: true,
    themeScope: 'shared',
    colorMode: 'light',
    colorTheme: 'default',
    systemTitle: 'Document Tracking System (DTS)',
    systemShortTitle: 'DTS',
    brandEyebrow: 'Records workspace',
    logoUrl: '/images/pk-dts-mark-v3.png',
    faviconUrl: '/images/pk-dts-mark-v3.png',
    loginCoverUrl: '/images/pk-building-cover.png',
    loginKicker: 'Document Tracking System',
    loginHeadline: 'Secure access for your document control center.',
    loginDescription: 'Manage the full document lifecycle from one secure workspace. This portal keeps records organized, routes access by role, and brings documents, storage, users, and permissions together in a clean panel experience.',
    loginWelcomeTitle: 'Welcome back',
    loginWelcomeSubtitle: 'Use your username and password to continue.',
    backendApiUrl: BACKEND_API_BASE_URL,
    backupApiUrl: `${BACKEND_API_BASE_URL}/backup-restore`,
    assistantEnabled: true,
    assistantTitle: 'Document Assistant',
    assistantWelcomeText: 'Available across the panel for faster document lookup and guided retrieval, with offline local search fallback when internet AI is unavailable.',
    footerText: 'Document Tracking System (DTS)'
};

const STORAGE_KEY = 'dts.system-settings.v3';
const WORKSPACE_VIEW_STORAGE_PREFIX = 'dts.workspace-view.v1';
const LEGACY_STORAGE_KEYS = ['dms.system-settings.v2', 'dms.system-settings.v1'] as const;
const LEGACY_SYSTEM_TITLE = 'Document Tracking and Management System';
const LEGACY_SYSTEM_SHORT_TITLE = 'Document Management';
const LEGACY_FOOTER_TEXT = 'Document Tracking and Management System';
const LEGACY_LOGO_URL = '/images/peanut_kisses_logo-removebg-preview.png';
const PREVIOUS_LOGO_URL = '/images/dts-logo.png';
const FORMER_BRAND_LOGO_URL = '/images/pk-dts-logo.png';
const GENERATED_BRAND_LOGO_URL = '/images/pk-dts-logo-v2.png';
const LEGACY_FAVICON_URL = '/images/peanut_kisses_logo-removebg-preview.png';
const PREVIOUS_FAVICON_URL = '/images/dts-logo.png';
const APPEARANCE_API = `${BACKEND_API_BASE_URL}/system-settings/appearance`;
const RUNTIME_API_CONNECTION_STORAGE_KEY = 'dts.api-connections.v1';

interface AppearanceSettings {
    themeScope: ThemeScope;
    colorMode: ColorMode;
    colorTheme: ColorTheme;
    settings?: Partial<SystemSettings>;
}

interface ApiResponseEnvelope<T> {
    data: T;
}

@Injectable({ providedIn: 'root' })
export class SystemSettingsService {
    private readonly http = inject(HttpClient);
    private readonly router = inject(Router);
    private readonly auth = inject(AuthService);
    private readonly settingsState = signal<SystemSettings>(this.read());
    readonly settings = this.settingsState.asReadonly();

    constructor() {
        this.applyBrowserBranding(this.settingsState());
        this.persistRuntimeConnections(this.settingsState());
        this.refreshAppearance();
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', (event) => {
                if (event.key !== STORAGE_KEY && !LEGACY_STORAGE_KEYS.includes(event.key as (typeof LEGACY_STORAGE_KEYS)[number])) return;
                const settings = this.read();
                this.settingsState.set(settings);
                this.applyBrowserBranding(settings);
            });
            window.setInterval(() => this.refreshAppearance(), 30_000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') this.refreshAppearance();
            });
            document.addEventListener('click', this.captureDocumentViewSelection);
            this.router.events
                .pipe(filter((event): event is NavigationStart => event instanceof NavigationStart))
                .subscribe((event) => this.applyPageDocumentView(event.url));
        }
    }

    save(settings: SystemSettings) {
        const normalized = this.normalizeSettings(settings);

        this.persistLocalSettings(normalized);
        const pageSettings = this.withPageDocumentView(normalized);
        this.settingsState.set(pageSettings);
        this.applyBrowserBranding(pageSettings);
    }

    reset() {
        this.save({ ...DEFAULT_SYSTEM_SETTINGS });
    }

    // Kept for compatibility with older callers. The application is permanently light-only.
    toggleColorMode() {
        const settings = this.withPageDocumentView(this.normalizeSettings(this.settingsState()));
        this.settingsState.set(settings);
        this.applyBrowserBranding(settings);
    }

    defaultDataView(): 'list' | 'grid' {
        return this.settingsState().defaultDocumentView === 'list' ? 'list' : 'grid';
    }

    defaultRowsPerPage(): number {
        return this.settingsState().documentRowsPerPage;
    }

    updateAppearanceScope(settings: SystemSettings) {
        const normalized = this.normalizeSettings(settings);
        const payload: AppearanceSettings = {
            themeScope: 'shared',
            colorMode: 'light',
            colorTheme: DEFAULT_SYSTEM_SETTINGS.colorTheme,
            settings: normalized
        };

        return this.http.patch<ApiResponseEnvelope<AppearanceSettings> | AppearanceSettings>(APPEARANCE_API, payload).pipe(
            map((response) => this.unwrapAppearance(response)),
            tap((appearance) => this.applyServerAppearance(appearance))
        );
    }

    refreshAppearance() {
        this.http
            .get<ApiResponseEnvelope<AppearanceSettings> | AppearanceSettings>(APPEARANCE_API)
            .pipe(map((response) => this.unwrapAppearance(response)))
            .subscribe({ next: (appearance) => this.applyServerAppearance(appearance), error: () => this.applyBrowserBranding(this.settingsState()) });
    }

    // Kept for compatibility. Appearance previews are disabled in the light-only UI.
    previewAppearance(_colorMode: ColorMode, _colorTheme: ColorTheme) {
        this.applyBrowserBranding(this.settingsState());
    }

    private read(): SystemSettings {
        try {
            const storedValue = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].map((key) => localStorage.getItem(key)).find(Boolean) || '{}';
            const stored = JSON.parse(storedValue) as Partial<SystemSettings>;
            return this.withPageDocumentView(this.normalizeSettings({ ...DEFAULT_SYSTEM_SETTINGS, ...stored }));
        } catch {
            return this.withPageDocumentView({ ...DEFAULT_SYSTEM_SETTINGS });
        }
    }

    private normalizeSettings(settings: Partial<SystemSettings>): SystemSettings {
        return {
            // Retained in the API model for backward compatibility only. Actual document layouts are remembered per user and page.
            defaultDocumentView: DEFAULT_SYSTEM_SETTINGS.defaultDocumentView,
            documentRowsPerPage: [10, 20, 50].includes(Number(settings.documentRowsPerPage)) ? Number(settings.documentRowsPerPage) : DEFAULT_SYSTEM_SETTINGS.documentRowsPerPage,
            officeOpenMode: settings.officeOpenMode === 'browser' ? 'browser' : 'desktop',
            automaticPrintDialog: settings.automaticPrintDialog !== false,
            themeScope: 'shared',
            colorMode: 'light',
            colorTheme: DEFAULT_SYSTEM_SETTINGS.colorTheme,
            systemTitle: this.brandingText(settings.systemTitle, LEGACY_SYSTEM_TITLE, DEFAULT_SYSTEM_SETTINGS.systemTitle, 100),
            systemShortTitle: this.brandingText(settings.systemShortTitle, LEGACY_SYSTEM_SHORT_TITLE, DEFAULT_SYSTEM_SETTINGS.systemShortTitle, 50),
            brandEyebrow: this.text(settings.brandEyebrow, DEFAULT_SYSTEM_SETTINGS.brandEyebrow, 40),
            logoUrl: this.brandingAssetUrl(settings.logoUrl, [LEGACY_LOGO_URL, PREVIOUS_LOGO_URL, FORMER_BRAND_LOGO_URL, GENERATED_BRAND_LOGO_URL], DEFAULT_SYSTEM_SETTINGS.logoUrl),
            faviconUrl: this.brandingAssetUrl(settings.faviconUrl, [LEGACY_FAVICON_URL, PREVIOUS_FAVICON_URL], DEFAULT_SYSTEM_SETTINGS.faviconUrl),
            loginCoverUrl: this.coverUrl(settings.loginCoverUrl),
            loginKicker: this.text(settings.loginKicker, DEFAULT_SYSTEM_SETTINGS.loginKicker, 60),
            loginHeadline: this.text(settings.loginHeadline, DEFAULT_SYSTEM_SETTINGS.loginHeadline, 120),
            loginDescription: this.text(settings.loginDescription, DEFAULT_SYSTEM_SETTINGS.loginDescription, 500),
            loginWelcomeTitle: this.text(settings.loginWelcomeTitle, DEFAULT_SYSTEM_SETTINGS.loginWelcomeTitle, 60),
            loginWelcomeSubtitle: this.text(settings.loginWelcomeSubtitle, DEFAULT_SYSTEM_SETTINGS.loginWelcomeSubtitle, 140),
            backendApiUrl: this.connectionUrl(settings.backendApiUrl, DEFAULT_SYSTEM_SETTINGS.backendApiUrl),
            backupApiUrl: this.connectionUrl(settings.backupApiUrl, DEFAULT_SYSTEM_SETTINGS.backupApiUrl),
            assistantEnabled: settings.assistantEnabled !== false,
            assistantTitle: this.text(settings.assistantTitle, DEFAULT_SYSTEM_SETTINGS.assistantTitle, 60),
            assistantWelcomeText: this.text(settings.assistantWelcomeText, DEFAULT_SYSTEM_SETTINGS.assistantWelcomeText, 300),
            footerText: this.brandingText(settings.footerText, LEGACY_FOOTER_TEXT, DEFAULT_SYSTEM_SETTINGS.footerText, 100)
        };
    }

    private readonly captureDocumentViewSelection = (event: Event) => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest<HTMLButtonElement>('[role="group"][aria-label="Document view"] button');
        if (!button) return;

        const mode = button.querySelector('.pi-list')
            ? 'list'
            : button.querySelector('.pi-th-large')
              ? 'grid'
              : button.querySelector('.pi-folder-open')
                ? 'folder'
                : null;
        if (!mode) return;

        this.rememberPageDocumentView(mode);
    };

    private applyPageDocumentView(url: string) {
        const mode = this.pageDocumentView(url);
        this.settingsState.update((settings) => (settings.defaultDocumentView === mode ? settings : { ...settings, defaultDocumentView: mode }));
    }

    private rememberPageDocumentView(mode: DocumentViewMode) {
        try {
            localStorage.setItem(this.pageDocumentViewStorageKey(this.currentPagePath()), mode);
        } catch {
            // Keep the clicked layout for this session even when browser storage is unavailable.
        }
        this.settingsState.update((settings) => ({ ...settings, defaultDocumentView: mode }));
    }

    private withPageDocumentView(settings: SystemSettings, url = this.currentPagePath()): SystemSettings {
        return { ...settings, defaultDocumentView: this.pageDocumentView(url) };
    }

    private pageDocumentView(url: string): DocumentViewMode {
        try {
            return this.documentViewMode(localStorage.getItem(this.pageDocumentViewStorageKey(url)));
        } catch {
            return DEFAULT_SYSTEM_SETTINGS.defaultDocumentView;
        }
    }

    private pageDocumentViewStorageKey(url: string) {
        const path = this.normalizePagePath(url);
        const userKey = this.auth.user()?.user_id || this.auth.user()?.username || 'anonymous';
        return `${WORKSPACE_VIEW_STORAGE_PREFIX}:${encodeURIComponent(String(userKey))}:${encodeURIComponent(path)}`;
    }

    private currentPagePath() {
        return typeof window === 'undefined' ? '/' : window.location.pathname;
    }

    private normalizePagePath(url: string) {
        const path = String(url || '/')
            .split('?')[0]
            .split('#')[0]
            .replace(/^\/+|\/+$/g, '');
        return path || 'root';
    }

    private text(value: unknown, fallback: string, maxLength: number) {
        const normalized = typeof value === 'string' ? value.trim() : '';
        return (normalized || fallback).slice(0, maxLength);
    }

    private brandingText(value: unknown, legacyValue: string, fallback: string, maxLength: number) {
        return this.text(value === legacyValue ? fallback : value, fallback, maxLength);
    }

    private brandingAssetUrl(value: unknown, legacyValue: string | readonly string[], fallback: string) {
        const legacyValues = Array.isArray(legacyValue) ? legacyValue : [legacyValue];
        return this.assetUrl(legacyValues.includes(value as string) ? fallback : value, fallback);
    }

    private documentViewMode(value: unknown): DocumentViewMode {
        return value === 'grid' || value === 'folder' ? value : 'list';
    }

    private coverUrl(value: unknown) {
        const normalized = this.assetUrl(value, DEFAULT_SYSTEM_SETTINGS.loginCoverUrl);
        return normalized.toLowerCase() === '/images/pk building.jpg' ? DEFAULT_SYSTEM_SETTINGS.loginCoverUrl : normalized;
    }

    private applyServerAppearance(appearance: AppearanceSettings & Partial<SystemSettings>) {
        const incoming = appearance.settings || appearance;
        const normalized = this.normalizeSettings({ ...this.settingsState(), ...incoming });
        this.persistLocalSettings(normalized);
        const settings = this.withPageDocumentView(normalized);
        this.settingsState.set(settings);
        this.persistRuntimeConnections(settings);
        this.applyBrowserBranding(settings);
    }

    private unwrapAppearance(response: ApiResponseEnvelope<AppearanceSettings> | AppearanceSettings): AppearanceSettings {
        return 'data' in response ? response.data : response;
    }

    private assetUrl(value: unknown, fallback: string) {
        const normalized = typeof value === 'string' ? value.trim() : '';
        if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml|x-icon);base64,/i.test(normalized)) {
            return normalized.slice(0, 3_000_000);
        }
        return /^(\/|https?:\/\/)/i.test(normalized) ? normalized.slice(0, 500) : fallback;
    }

    private connectionUrl(value: unknown, fallback: string) {
        const normalized = typeof value === 'string' ? value.trim() : '';
        return /^(\/|https?:\/\/)/i.test(normalized) ? normalized.replace(/\/$/, '').slice(0, 500) : fallback;
    }

    private persistLocalSettings(settings: SystemSettings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            return;
        } catch {
            // Large branding data URLs belong in the shared server setting. Keep a
            // compact local copy so a browser quota cannot block the server save.
        }

        const compactSettings = {
            ...settings,
            logoUrl: this.localAssetUrl(settings.logoUrl),
            faviconUrl: this.localAssetUrl(settings.faviconUrl),
            loginCoverUrl: this.localAssetUrl(settings.loginCoverUrl)
        };

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(compactSettings));
        } catch {
            // The in-memory signal remains authoritative until the shared API responds.
        }
    }

    private localAssetUrl(value: string) {
        return /^data:image\//i.test(value) ? '' : value;
    }

    private persistRuntimeConnections(settings: SystemSettings) {
        try {
            localStorage.setItem(RUNTIME_API_CONNECTION_STORAGE_KEY, JSON.stringify({
                backendApiUrl: settings.backendApiUrl,
                backupApiUrl: settings.backupApiUrl
            }));
        } catch {
            // The compiled API base remains the fallback when browser storage is unavailable.
        }
    }

    private applyBrowserBranding(settings: SystemSettings) {
        if (typeof document === 'undefined') return;

        document.title = settings.systemTitle;
        document.documentElement.classList.remove('app-dark');
        document.documentElement.dataset['dtsTheme'] = DEFAULT_SYSTEM_SETTINGS.colorTheme;
        document.documentElement.style.colorScheme = 'light';

        const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (favicon) favicon.href = settings.faviconUrl;
    }
}
