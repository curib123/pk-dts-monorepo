import { Injectable, inject } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of, switchMap, timer } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';

interface NetworkInformationLike {
    saveData?: boolean;
    effectiveType?: string;
}

/**
 * Warms lazy route chunks after authentication so the first click into a page
 * does not have to pay the JavaScript download/parse cost. Preloads are
 * staggered and disabled on data-saver/very slow connections.
 */
@Injectable({ providedIn: 'root' })
export class AuthenticatedPreloadingStrategy implements PreloadingStrategy {
    private auth = inject(AuthService);
    private preloadIndex = 0;

    preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
        if (!this.auth.isAuthenticated() || route.data?.['preload'] === false || this.shouldReduceBackgroundWork()) {
            return of(null);
        }

        const explicitDelay = Number(route.data?.['preloadDelayMs']);
        const delayMs = Number.isFinite(explicitDelay)
            ? Math.max(0, explicitDelay)
            : Math.min(3_500, 450 + this.preloadIndex++ * 140);

        return timer(delayMs).pipe(switchMap(() => load()));
    }

    private shouldReduceBackgroundWork() {
        if (typeof navigator === 'undefined') return false;

        const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
        if (!connection) return false;

        return connection.saveData === true || ['slow-2g', '2g'].includes(connection.effectiveType ?? '');
    }
}
