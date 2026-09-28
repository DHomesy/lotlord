const { buildPropertyEmailContext } = require('../../src/lib/propertyEmailContext');

describe('buildPropertyEmailContext', () => {
  it('formats the landlord name and full property address', () => {
    expect(buildPropertyEmailContext({
      landlord_first_name: 'Aston',
      landlord_last_name: 'Smith',
      address_line1: '123 Main St',
      address_line2: 'Building B',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
    })).toEqual({
      landlord_name: 'Aston Smith',
      property_address: '123 Main St, Building B, Austin, TX 78701',
    });
  });

  it('falls back cleanly when optional owner and address fields are missing', () => {
    expect(buildPropertyEmailContext({ property_name: 'Maple Place' })).toEqual({
      landlord_name: 'Your property manager',
      property_address: 'Maple Place',
    });
  });
});