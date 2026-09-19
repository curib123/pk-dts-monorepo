import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { BACKEND_API_BASE_URL } from '@/app/config/api-config';

export interface UserNotification { event_key: string; title: string; message: string; route: string; created_at: string; icon: string; read: boolean; }
export interface NotificationFeed { items: UserNotification[]; unread_count: number; }

@Injectable({ providedIn: 'root' })
export class NotificationsService {
    private http = inject(HttpClient);
    private auth = inject(AuthService);

    list() { return this.http.get<any>(`${BACKEND_API_BASE_URL}/notifications`).pipe(map((response) => response?.data ?? response)); }
    read(eventKey: string) { return this.http.patch(`${BACKEND_API_BASE_URL}/notifications/${encodeURIComponent(eventKey)}/read`, {}); }
    readAll() { return this.http.patch(`${BACKEND_API_BASE_URL}/notifications/read-all`, {}); }

    watchInvalidations(): Observable<void> {
        return new Observable<void>((subscriber) => {
            let stopped = false;
            let activeController: AbortController | null = null;

            const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
            const connect = async () => {
                while (!stopped) {
                    const token = this.auth.token();
                    if (!token) {
                        await sleep(2_000);
                        continue;
                    }

                    activeController = new AbortController();
                    try {
                        const response = await fetch(`${BACKEND_API_BASE_URL}/notifications/stream`, {
                            headers: {
                                Authorization: `Bearer ${token}`,
                                Accept: 'text/event-stream'
                            },
                            cache: 'no-store',
                            signal: activeController.signal
                        });
                        if (!response.ok || !response.body) throw new Error(`Notification stream failed with ${response.status}`);

                        const reader = response.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = '';

                        while (!stopped) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            buffer += decoder.decode(value, { stream: true });
                            const frames = buffer.split(/\r?\n\r?\n/);
                            buffer = frames.pop() ?? '';

                            for (const frame of frames) {
                                const dataLine = frame.split(/\r?\n/).find((line) => line.startsWith('data:'));
                                if (!dataLine) continue;
                                try {
                                    const payload = JSON.parse(dataLine.slice(5).trim()) as { type?: string };
                                    if (payload.type === 'invalidate') subscriber.next();
                                } catch {
                                    // Ignore malformed heartbeat/event frames and keep the stream alive.
                                }
                            }
                        }
                    } catch {
                        if (stopped || activeController?.signal.aborted) break;
                    } finally {
                        activeController = null;
                    }

                    if (!stopped) await sleep(2_500);
                }
            };

            void connect();
            return () => {
                stopped = true;
                activeController?.abort();
            };
        });
    }
}
