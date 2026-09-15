import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController self-service updates', () => {
  const update = jest.fn();
  const controller = new UsersController({ update } as unknown as UsersService);

  beforeEach(() => jest.clearAllMocks());

  it('strips role and leader assignment from a normal user updating their own profile', () => {
    const user = authenticatedUser([]);

    controller.update(
      '7',
      {
        firstname: 'Jane',
        role_id: '1',
        leader_id: '99',
      },
      user,
    );

    expect(update).toHaveBeenCalledWith('7', { firstname: 'Jane' });
  });

  it('keeps role and leader assignment for an authorized account manager', () => {
    const user = authenticatedUser(['user-accounts.edit']);
    const dto = { firstname: 'Jane', role_id: '1', leader_id: '99' };

    controller.update('7', dto, user);

    expect(update).toHaveBeenCalledWith('7', dto);
  });
});

function authenticatedUser(permissions: string[]): AuthenticatedUser {
  return {
    user_id: '7',
    username: 'jane@example.com',
    firstname: 'Jane',
    lastname: 'Doe',
    require_password_change: false,
    role: { role_id: '4', role_name: 'Staff', permissions },
  };
}
