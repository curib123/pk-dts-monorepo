import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withEnabledBlockingInitialNavigation, withInMemoryScrolling, withPreloading } from '@angular/router';
import { authInterceptor } from '@/app/auth/auth.interceptor';
import { apiFeedbackInterceptor } from '@/app/core/http/api-feedback.interceptor';
import { apiConnectionInterceptor } from '@/app/core/http/api-connection.interceptor';
import { requestCacheInterceptor } from '@/app/core/http/request-cache.interceptor';
import { AuthenticatedPreloadingStrategy } from '@/app/core/routing/authenticated-preloading.strategy';
import { BrandPreset } from '@/app/theme/brand-preset';
import { providePrimeNG } from 'primeng/config';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
    providers: [
        provideRouter(
            appRoutes,
            withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
            withEnabledBlockingInitialNavigation(),
            withPreloading(AuthenticatedPreloadingStrategy)
        ),
        provideHttpClient(withFetch(), withInterceptors([authInterceptor, apiFeedbackInterceptor, apiConnectionInterceptor, requestCacheInterceptor])),
        provideZonelessChangeDetection(),
        providePrimeNG({ theme: { preset: BrandPreset, options: { darkModeSelector: false } } })
    ]
};
