const { resolveOwnerId } = require('../src/lib/authHelpers');

describe('resolveOwnerId', () => {
  it('returns undefined when user is null', () => {
    expect(resolveOwnerId(null)).toBeUndefined();
  });

  it('returns user.sub for a landlord', () => {
    expect(resolveOwnerId({ role: 'landlord', sub: 'landlord-uuid' })).toBe('landlord-uuid');
  });

  it('returns user.sub for a tenant', () => {
    expect(resolveOwnerId({ role: 'tenant', sub: 'tenant-uuid' })).toBe('tenant-uuid');
  });

  it('returns user.sub for an admin', () => {
    expect(resolveOwnerId({ role: 'admin', sub: 'admin-uuid' })).toBe('admin-uuid');
  });

  it('returns employerId for an employee with a valid token', () => {
    expect(resolveOwnerId({ role: 'employee', sub: 'emp-uuid', employerId: 'employer-uuid' })).toBe('employer-uuid');
  });

  it('throws 401 for an employee whose token is missing employerId', () => {
    expect(() => resolveOwnerId({ role: 'employee', sub: 'emp-uuid' })).toThrow(
      'Employee token missing employerId claim',
    );
    try {
      resolveOwnerId({ role: 'employee', sub: 'emp-uuid' });
    } catch (err) {
      expect(err.status).toBe(401);
    }
  });

  it('does NOT use sub as fallback when employerId is missing', () => {
    expect(() => resolveOwnerId({ role: 'employee', sub: 'emp-uuid' })).toThrow();
  });
});
