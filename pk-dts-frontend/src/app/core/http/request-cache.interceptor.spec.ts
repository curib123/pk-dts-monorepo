import { HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { requestCacheInterceptor } from './request-cache.interceptor';

describe('requestCacheInterceptor', () => {
    it('cancels the upstream GET when the last subscriber unsubscribes', () => {
        let cancelled = false;
        const request = new HttpRequest('GET', '/api/v1/documents/99991');
        const next = () =>
            new Observable(() => {
                return () => {
                    cancelled = true;
                };
            });

        const subscription = requestCacheInterceptor(request, next).subscribe();
        subscription.unsubscribe();

        expect(cancelled).toBeTrue();
    });
});
