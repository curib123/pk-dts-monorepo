import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticatedUser } from "./authenticated-user.interface";
import { REQUIRED_PERMISSIONS_KEY } from "./require-permissions.decorator";
import { ALLOW_SELF_KEY } from "./allow-self.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    const currentPermissions = new Set(user?.role.permissions ?? []);
    const hasPermission = requiredPermissions.some((permission) =>
      currentPermissions.has(permission),
    );

    if (!hasPermission) {
      const allowSelf = this.reflector.getAllAndOverride<boolean>(
        ALLOW_SELF_KEY,
        [context.getHandler(), context.getClass()],
      );
      const targetUserId = request.params?.id;

      if (allowSelf && user?.user_id && String(targetUserId) === String(user.user_id)) {
        return true;
      }

      throw new ForbiddenException(
        "You are not authorized to access this resource.",
      );
    }

    return true;
  }
}
