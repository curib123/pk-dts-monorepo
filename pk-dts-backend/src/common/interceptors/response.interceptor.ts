import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, map } from 'rxjs';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();
    const isEventStream = request.originalUrl?.includes('/notifications/stream');

    if (isEventStream) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        const disposition = response?.getHeader?.('Content-Disposition');
        const isDownloadResponse =
          data instanceof StreamableFile ||
          (typeof disposition === 'string' && disposition.length > 0);

        if (isDownloadResponse) {
          return data;
        }

        return {
          success: true,
          path: request.originalUrl,
          timestamp: new Date().toISOString(),
          data,
        };
      }),
    );
  }
}
