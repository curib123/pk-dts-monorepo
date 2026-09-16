import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { map, tap } from 'rxjs';
import { BACKEND_API_BASE_URL } from '@/app/config/api-config';
import { LoginRequest, LoginResponse, AuthUser } from './auth.types';

const AUTH_TOKEN_KEY = 'dtm_auth_token_v2';
const AUTH_USER_KEY = 'dtm_auth_user_v2';
const LEGACY_AUTH_TOKEN_KEY = 'dtm_auth_token';
const LEGACY_AUTH_USER_KEY = 'dtm_auth_user';
const AUTH_API_BASE = `${BACKEND_API_BASE_URL}/auth`;

interface ApiResponseEnvelope<T> {
    success: boolean;
    path: string;
    timestamp: string;
    data: T;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
    private http = inject(HttpClient);

    private tokenSignal = signal<string | null>(this.readStoredToken());
    private userSignal = signal<AuthUser | null>(this.readStoredUser());

    isAuthenticated = computed(() => !!this.tokenSignal());
    user = computed(() => this.userSignal());
    token = computed(() => this.tokenSignal());
    permissions = computed(() => this.userSignal()?.role?.permissions ?? []);

    constructor() {
        localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
        localStorage.removeItem(LEGACY_AUTH_USER_KEY);
    }

    login(payload: LoginRequest, rememberMe = false) {
        return this.http.post<ApiResponseEnvelope<LoginResponse> | LoginResponse>(`${AUTH_API_BASE}/login`, payload).pipe(
            map((response) => this.unwrapLoginResponse(response)),
            tap((response) => this.storeSession(response, rememberMe))
        );
    }

    refreshProfile() {
        if (!this.tokenSignal()) {
            return null;
        }

        return this.http.get<ApiResponseEnvelope<AuthUser> | AuthUser>(`${AUTH_API_BASE}/me`).pipe(
            map((response) => this.unwrapProfileResponse(response)),
            tap((user) => {
                const storage = localStorage.getItem(AUTH_TOKEN_KEY) ? localStorage : sessionStorage;
                storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
                this.userSignal.set(user);
            })
        );
    }

    logout() {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
        sessionStorage.removeItem(AUTH_USER_KEY);
        this.tokenSignal.set(null);
        this.userSignal.set(null);
    }

    hasPermission(permission: string) {
        return this.isAdministrator()
            || this.permissions().includes(permission)
            || (permission.startsWith('documents.') && this.permissions().includes('documents.manage'));
    }

    hasAnyPermission(...permissions: string[]) {
        if (!permissions.length) {
            return this.isAuthenticated();
        }

        if (this.isAdministrator()) return true;
        return permissions.some((permission) => this.hasPermission(permission));
    }

    isAdministrator() {
        const role = this.userSignal()?.role?.role_name?.trim().toLowerCase() ?? '';
        return ['admin', 'administrator', 'super admin', 'superadmin', 'super-admin'].includes(role);
    }

    private storeSession(response: LoginResponse, rememberMe: boolean) {
        const storage = rememberMe ? localStorage : sessionStorage;
        const otherStorage = rememberMe ? sessionStorage : localStorage;
        otherStorage.removeItem(AUTH_TOKEN_KEY);
        otherStorage.removeItem(AUTH_USER_KEY);
        storage.setItem(AUTH_TOKEN_KEY, response.token);
        storage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
        this.tokenSignal.set(response.token);
        this.userSignal.set(response.user);
    }

    private unwrapLoginResponse(response: ApiResponseEnvelope<LoginResponse> | LoginResponse): LoginResponse {
        if (this.isEnvelope(response)) {
            return response.data;
        }

        return response;
    }

    private unwrapProfileResponse(response: ApiResponseEnvelope<AuthUser> | AuthUser): AuthUser {
        if (this.isProfileEnvelope(response)) {
            return response.data;
        }

        return response;
    }

    private isEnvelope(response: ApiResponseEnvelope<LoginResponse> | LoginResponse): response is ApiResponseEnvelope<LoginResponse> {
        return !!response && typeof response === 'object' && 'data' in response && 'success' in response;
    }

    private isProfileEnvelope(response: ApiResponseEnvelope<AuthUser> | AuthUser): response is ApiResponseEnvelope<AuthUser> {
        return !!response && typeof response === 'object' && 'data' in response;
    }

    private readStoredToken(): string | null {
        const token = localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);

        if (!token || token === 'undefined' || token === 'null') {
            return null;
        }

        return token;
    }

    private readStoredUser(): AuthUser | null {
        const raw = localStorage.getItem(AUTH_USER_KEY) || sessionStorage.getItem(AUTH_USER_KEY);
        if (!raw || raw === 'undefined' || raw === 'null') {
            return null;
        }

        try {
            return JSON.parse(raw) as AuthUser;
        } catch {
            return null;
        }
    }
}
