import { HttpInterceptorFn } from '@angular/common/http';
import { BACKEND_API_BASE_URL } from '@/app/config/api-config';

const RUNTIME_API_CONNECTION_STORAGE_KEY = 'dts.api-connections.v1';

interface RuntimeApiConnections {
    backendApiUrl?: string;
    backupApiUrl?: string;
}

export const apiConnectionInterceptor: HttpInterceptorFn = (request, next) => {
    const connections = readConnections();
    if (!connections) return next(request);

    const suffix = request.url.startsWith(BACKEND_API_BASE_URL) ? request.url.slice(BACKEND_API_BASE_URL.length) : null;
    if (suffix === null) return next(request);

    const isBackupRequest = suffix === '/backup-restore' || suffix.startsWith('/backup-restore/');
    const targetBase = isBackupRequest ? connections.backupApiUrl || connections.backendApiUrl : connections.backendApiUrl;
    if (!targetBase || targetBase === BACKEND_API_BASE_URL) return next(request);

    const targetUrl = isBackupRequest && connections.backupApiUrl
        ? `${targetBase}${suffix.slice('/backup-restore'.length)}`
        : `${targetBase}${suffix}`;
    return next(request.clone({ url: targetUrl }));
};

function readConnections(): RuntimeApiConnections | null {
    try {
        const value = localStorage.getItem(RUNTIME_API_CONNECTION_STORAGE_KEY);
        return value ? (JSON.parse(value) as RuntimeApiConnections) : null;
    } catch {
        return null;
    }
}
