const unitService = require('../services/unitService');
const propertyRepo = require('../dal/propertyRepository');
const stripeService = require('../services/stripeService');

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
    if (req.user.role === 'landlord') {
      const property = await propertyRepo.findById(unit.property_id);
      if (!property || property.owner_id !== req.user.sub) {
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
    // unit.property_type is returned by the service — no second DB query needed
    if (unit.property_type === 'commercial' && req.user?.sub) {
      stripeService.syncCommercialUnitQuantity(req.user.sub).catch((err) =>
        console.warn('[unitController] syncCommercialUnitQuantity failed after create:', err.message),
      );
    }
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
    // deleteUnit service now returns the unit augmented with property_type
    const unit = await unitService.deleteUnit(req.params.id, req.user);
    // Sync Stripe commercial unit quantity if applicable (fire-and-forget)
    if (unit?.property_type === 'commercial' && req.user?.sub) {
      stripeService.syncCommercialUnitQuantity(req.user.sub).catch((err) =>
        console.warn('[unitController] syncCommercialUnitQuantity failed after delete:', err.message),
      );
    }
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = { listUnits, getUnit, createUnit, updateUnit, deleteUnit };
