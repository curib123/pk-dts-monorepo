import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { firstAuthorizedPanelUrl } from '@/app/panel/panel-access.config';
import { AuthService } from './auth.service';

export function canEnterAuthenticatedRoute(
    requiredPermissions: readonly string[] | undefined,
    hasRequiredPermission: boolean,
    allowAssignedWorkflowTask: boolean
) {
    return !requiredPermissions?.length || hasRequiredPermission || allowAssignedWorkflowTask;
}

export const authGuard: CanActivateFn = (route) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (auth.isAuthenticated()) {
        const requiredPermissions = route.data?.['permissions'] as string[] | undefined;
        const allowAssignedWorkflowTask = route.data?.['allowAssignedWorkflowTask'] === true;
        if (canEnterAuthenticatedRoute(requiredPermissions, auth.hasAnyPermission(...(requiredPermissions ?? [])), allowAssignedWorkflowTask)) {
            return true;
        }

        if (route.routeConfig?.path === 'dashboard') {
            const user = auth.user();
            return router.createUrlTree([
                firstAuthorizedPanelUrl(user?.role.permissions ?? [], user?.role.role_name ?? 'User')
            ]);
        }

        const refreshedProfile = auth.refreshProfile();
        if (!refreshedProfile) {
            return router.createUrlTree(['/auth/login']);
        }

        return refreshedProfile.pipe(
            map(() => auth.hasAnyPermission(...(requiredPermissions ?? []))
                ? true
                : router.createUrlTree(['/auth/access'])),
            catchError(() => {
                auth.logout();
                return of(router.createUrlTree(['/auth/login']));
            })
        );
    }

    if (route.data?.['publicFallback']) {
        return true;
    }

    return router.createUrlTree(['/auth/login']);
};

export const guestGuard: CanActivateFn = (): boolean | UrlTree => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
        return true;
    }

    return router.createUrlTree(['/panel/dashboard']);
};
