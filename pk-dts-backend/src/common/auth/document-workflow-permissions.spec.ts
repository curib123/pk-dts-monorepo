import { AuthenticatedUser } from './authenticated-user.interface';
import { hasAnyPermission, hasPermission } from './document-workflow-permissions';

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

describe('document workflow permission helpers', () => {
  it('does not grant Admin permissions that are not assigned', () => {
    const user = createUser('Admin', []);

    expect(hasPermission(user, 'document-requests.approve-plant-manager')).toBe(
      false,
    );
  });

  it('allows any role when the permission is assigned', () => {
    const user = createUser('Staff', [
      'document-requests.approve-plant-manager',
    ]);

    expect(hasPermission(user, 'document-requests.approve-plant-manager')).toBe(
      true,
    );
  });

  it('lets document managers satisfy only document permissions', () => {
    const user = createUser('Internal Audit', ['documents.manage']);

    expect(hasPermission(user, 'documents.view')).toBe(true);
    expect(hasPermission(user, 'documents.edit')).toBe(true);
    expect(hasPermission(user, 'documents.delete')).toBe(true);
    expect(hasPermission(user, 'document-requests.review')).toBe(false);
  });

  it('checks a list using only assigned permissions', () => {
    const user = createUser('Documentation Officer', [
      'document-requests.review',
    ]);

    expect(
      hasAnyPermission(user, [
        'document-requests.review',
        'document-requests.approve-hardcopy',
      ]),
    ).toBe(true);
    expect(
      hasAnyPermission(user, ['document-requests.approve-hardcopy']),
    ).toBe(false);
  });
});
