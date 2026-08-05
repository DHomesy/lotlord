const unitService = require('../services/unitService');
const propertyRepo = require('../dal/propertyRepository');
const { resolveOwnerId } = require('../lib/authHelpers');

async function listUnits(req, res, next) {
  try {
    const { propertyId, status, page = 1, limit = 50 } = req.query;
    const units = await unitService.listUnits({ propertyId, status, page: Number(page), limit: Number(limit) }, req.user);
    res.json(units);
  } catch (err) { next(err); }
}

async function getUnit(req, res, next) {
  try {
    const unit = await unitService.getUnit(req.params.id);
    if (req.user.role === 'landlord' || req.user.role === 'employee') {
      const property = await propertyRepo.findById(unit.property_id);
      if (!property || property.owner_id !== resolveOwnerId(req.user)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    res.json(unit);
  } catch (err) { next(err); }
}

async function createUnit(req, res, next) {
  try {
    const { propertyId, unitNumber, floor, bedrooms, bathrooms, sqFt, rentAmount, depositAmount, status } = req.body;
    const unit = await unitService.createUnit({ propertyId, unitNumber, floor, bedrooms, bathrooms, sqFt, rentAmount, depositAmount, status }, req.user);
    // Strip the internal property_type field before responding — it's not part of the unit schema
    const { property_type: _pt, ...unitData } = unit;
    res.status(201).json(unitData);
  } catch (err) { next(err); }
}

async function updateUnit(req, res, next) {
  try {
    const unit = await unitService.updateUnit(req.params.id, req.body, req.user);
    res.json(unit);
  } catch (err) { next(err); }
}

async function deleteUnit(req, res, next) {
  try {
    await unitService.deleteUnit(req.params.id, req.user);
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = { listUnits, getUnit, createUnit, updateUnit, deleteUnit };
