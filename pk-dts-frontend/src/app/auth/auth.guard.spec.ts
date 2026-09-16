import { canEnterAuthenticatedRoute } from './auth.guard';

describe('auth guard route access', () => {
    it('allows an authenticated user with an assigned workflow task into the approval workspace', () => {
        expect(canEnterAuthenticatedRoute(['document-requests.review'], false, true)).toBeTrue();
    });

    it('still denies a protected route without permission or an assigned workflow task', () => {
        expect(canEnterAuthenticatedRoute(['document-requests.review'], false, false)).toBeFalse();
    });
});
