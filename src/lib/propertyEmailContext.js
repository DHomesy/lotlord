function buildPropertyEmailContext(source = {}) {
  const landlordName = [source.landlord_first_name, source.landlord_last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Your property manager';

  const street = [source.address_line1 || source.property_address, source.address_line2]
    .filter(Boolean)
    .join(', ');
  const cityStateZip = [
    source.city,
    [source.state, source.zip].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');

  return {
    landlord_name: landlordName,
    property_address: [street, cityStateZip].filter(Boolean).join(', ') || source.property_name || '',
  };
}

module.exports = { buildPropertyEmailContext };