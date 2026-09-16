import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from './authenticated-user.interface';
import { PermissionsGuard } from './permissions.guard';

function createUser(roleName: string, permissions: string[]): AuthenticatedUser {
  return {
    user_id: '42',
    username: 'tester',
    firstname: 'Test',
    lastname: 'User',
    require_password_change: false,
    role: {
      role_id: '1',
      role_name: roleName,
      permissions,
    },
  };
}

function createContext(user: AuthenticatedUser, targetId = '99') {
  const request = { user, params: { id: targetId } };
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('allows access when no permission is required', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValueOnce(undefined),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(createContext(createUser('Staff', [])))).toBe(true);
  });

  it('allows any role when it has a required permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValueOnce(['documents.create']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(
        createContext(createUser('Staff', ['documents.create'])),
      ),
    ).toBe(true);
  });

  it('allows a document manager to access document endpoints', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValueOnce(['documents.edit']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(
        createContext(createUser('Internal Audit', ['documents.manage'])),
      ),
    ).toBe(true);
  });

  it('does not let document management grant workflow approval access', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValueOnce(['document-requests.review']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() =>
      guard.canActivate(createContext(createUser('Internal Audit', ['documents.manage']))),
    ).toThrow(ForbiddenException);
  });

  it('denies Admin when the required permission is not assigned', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValueOnce(['documents.delete']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(createContext(createUser('Admin', [])))).toThrow(
      ForbiddenException,
    );
  });

  it('denies a user without any required permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValueOnce(['documents.delete']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() =>
      guard.canActivate(createContext(createUser('Staff', ['documents.view']))),
    ).toThrow(ForbiddenException);
  });

  it('preserves AllowSelf as a record-level exception', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(['user-accounts.edit'])
        .mockReturnValueOnce(true),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(createContext(createUser('Staff', []), '42')),
    ).toBe(true);
  });
});
