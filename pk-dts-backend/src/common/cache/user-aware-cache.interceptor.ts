import { CacheInterceptor } from "@nestjs/cache-manager";
import { CallHandler, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { Observable, concatMap } from "rxjs";
import { AuthenticatedUser } from "../auth/authenticated-user.interface";

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class UserAwareCacheInterceptor extends CacheInterceptor {
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      return next.handle().pipe(
        concatMap(async (response) => {
          try {
            await this.cacheManager.reset();
          } catch {
            // A cache failure must never turn a successful write into an error.
          }
          return response;
        }),
      );
    }

    return super.intercept(context, next);
  }

  protected trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.method !== "GET") {
      return undefined;
    }

    const path = request.originalUrl ?? request.url;
    if (
      path.includes("/auth/") ||
      path.includes("/health") ||
      path.includes("/backup-restore") ||
      path.includes("/notifications/stream")
    ) {
      return undefined;
    }

    const userId = request.user?.user_id;
    return userId ? `http:user:${userId}:${path}` : `http:public:${path}`;
  }
}
