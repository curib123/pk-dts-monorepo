import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { finalize, shareReplay, tap } from 'rxjs/operators';

const DEFAULT_CACHE_TTL_MS = 15_000;
const REFERENCE_CACHE_TTL_MS = 60_000;
const FAST_CHANGING_CACHE_TTL_MS = 8_000;
const MAX_CACHE_ENTRIES = 120;

interface CachedResponse {
    expiresAt: number;
    response: HttpResponse<unknown>;
}

const responseCache = new Map<string, CachedResponse>();
const inFlightRequests = new Map<string, Observable<HttpEvent<unknown>>>();
let cacheGeneration = 0;

/**
 * Reuses concurrent JSON GET requests and briefly reuses completed responses.
 * Any successful mutation invalidates the cache generation, preventing a late
 * GET from repopulating stale data while that mutation is in progress.
 */
export const requestCacheInterceptor: HttpInterceptorFn = (request, next) => {
    if (request.method !== 'GET') {
        const generationAtStart = cacheGeneration;

        return next(request).pipe(
            tap((event) => {
                if (event instanceof HttpResponse && generationAtStart === cacheGeneration) {
                    cacheGeneration += 1;
                    responseCache.clear();
                    inFlightRequests.clear();
                }
            })
        );
    }

    if (!isCacheable(request.url, request.responseType)) {
        return next(request);
    }

    const key = request.urlWithParams;
    const now = Date.now();
    const cached = responseCache.get(key);

    if (cached && cached.expiresAt > now) {
        return of(cached.response.clone());
    }

    if (cached) {
        responseCache.delete(key);
    }

    const pending = inFlightRequests.get(key);
    if (pending) {
        return pending;
    }

    const generationAtStart = cacheGeneration;
    const sharedRequest = next(request).pipe(
        tap((event) => {
            if (event instanceof HttpResponse && generationAtStart === cacheGeneration) {
                const ttlMs = cacheTtlForUrl(request.url);
                if (!responseCache.has(key) && responseCache.size >= MAX_CACHE_ENTRIES) {
                    const oldestKey = responseCache.keys().next().value as string | undefined;
                    if (oldestKey) responseCache.delete(oldestKey);
                }

                responseCache.delete(key);
                responseCache.set(key, {
                    expiresAt: Date.now() + ttlMs,
                    response: event.clone()
                });
            }
        }),
        finalize(() => inFlightRequests.delete(key)),
        shareReplay({ bufferSize: 1, refCount: true })
    );

    inFlightRequests.set(key, sharedRequest);
    return sharedRequest;
};

function isCacheable(url: string, responseType: string): boolean {
    if (responseType !== 'json') {
        return false;
    }

    return !url.includes('/auth/') && !url.includes('/health') && !url.includes('/backup-restore');
}


function cacheTtlForUrl(url: string): number {
    if (/\/(areas|asset-numbers|specifics|locations|sequences|softcopy-categories|roles|permissions)(?:\/|$|\?)/.test(url)) {
        return REFERENCE_CACHE_TTL_MS;
    }

    if (/\/(notifications|dashboard\/navigation-counts)(?:$|\?)/.test(url)) {
        return FAST_CHANGING_CACHE_TTL_MS;
    }

    return DEFAULT_CACHE_TTL_MS;
}
