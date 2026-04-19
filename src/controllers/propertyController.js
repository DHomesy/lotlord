const propertyService = require('../services/propertyService');
const { resolveOwnerId } = require('../lib/authHelpers');

async function listProperties(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const properties = await propertyService.listProperties({ user: req.user, page: Number(page), limit: Number(limit) });
    res.json(properties);
  } catch (err) { next(err); }
}

async function getProperty(req, res, next) {
  try {
    const property = await propertyService.getProperty(req.params.id);
    if ((req.user.role === 'landlord' || req.user.role === 'employee') && property.owner_id !== resolveOwnerId(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(property);
  } catch (err) { next(err); }
}

async function createProperty(req, res, next) {
  try {
    const { name, addressLine1, addressLine2, city, state, zip, country, propertyType } = req.body;
    const property = await propertyService.createProperty(
      { name, addressLine1, addressLine2, city, state, zip, country, propertyType },
      req.user,
    );
    res.status(201).json(property);
  } catch (err) { next(err); }
}

async function updateProperty(req, res, next) {
  try {
    const property = await propertyService.updateProperty(req.params.id, req.body, req.user);
    res.json(property);
  } catch (err) { next(err); }
}

async function deleteProperty(req, res, next) {
  try {
    await propertyService.deleteProperty(req.params.id, req.user);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { listProperties, getProperty, createProperty, updateProperty, deleteProperty };
