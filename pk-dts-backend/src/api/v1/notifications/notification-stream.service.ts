import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, interval, map, merge, startWith } from 'rxjs';

@Injectable()
export class NotificationStreamService {
  private readonly invalidations = new Subject<void>();

  stream(): Observable<MessageEvent> {
    const heartbeat$ = interval(25_000).pipe(
      startWith(0),
      map(() => ({
        type: 'heartbeat',
        data: { type: 'heartbeat', at: new Date().toISOString() },
      }) satisfies MessageEvent),
    );

    const invalidation$ = this.invalidations.pipe(
      map(() => ({
        type: 'invalidate',
        data: { type: 'invalidate', at: new Date().toISOString() },
      }) satisfies MessageEvent),
    );

    return merge(heartbeat$, invalidation$);
  }

  invalidate() {
    this.invalidations.next();
  }
}
