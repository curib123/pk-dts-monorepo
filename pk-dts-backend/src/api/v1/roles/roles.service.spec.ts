import { RolesService } from './roles.service';

describe('Fixed system roles', () => {
  it('rejects role creation, renaming and deletion', async () => {
    const service = new RolesService({} as any);
    expect(() => service.create({ role_name: 'Extra' })).toThrow();
    expect(() => service.update('1', { role_name: 'Extra' })).toThrow();
    await expect(service.remove('1')).rejects.toThrow();
  });
});
