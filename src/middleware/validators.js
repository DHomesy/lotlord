/**
 * Shared validation helpers for express-validator.
 * Import individual validators into route files.
 */
const { body, query, param } = require('express-validator');
const { validationResult } = require('express-validator');

/**
 * Middleware: reject the request if any prior validators failed.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
const registerValidators = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('firstName is required'),
  body('lastName').trim().notEmpty().withMessage('lastName is required'),
  body('phone').optional({ values: 'falsy' }).isMobilePhone(),
  body('role').optional().isIn(['landlord', 'tenant']).withMessage('role must be landlord or tenant'),
  body('acceptedTerms').custom((v) => v === true).withMessage('You must accept the Terms of Service'),
];

const loginValidators = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

const forgotPasswordValidators = [
  body('email').isEmail().normalizeEmail().withMessage('A valid email is required'),
];

const resetPasswordValidators = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

// ── Properties ────────────────────────────────────────────────────────────────
const createPropertyValidators = [
  body('name').trim().notEmpty(),
  body('addressLine1').trim().notEmpty(),
  body('city').trim().notEmpty(),
  body('state').trim().notEmpty(),
  body('zip').trim().notEmpty(),
  body('country').optional().trim(),
  body('propertyType').optional().isIn(['single', 'multi', 'commercial']),
];

// ── Units ─────────────────────────────────────────────────────────────────────
const createUnitValidators = [
  body('propertyId').isUUID(),
  body('unitNumber').trim().notEmpty(),
  body('rentAmount').isFloat({ min: 0 }),
  body('depositAmount').optional().isFloat({ min: 0 }),
  body('bedrooms').optional().isInt({ min: 0 }),
  body('bathrooms').optional().isFloat({ min: 0 }),
  body('sqFt').optional().isInt({ min: 0 }),
  body('status').optional().isIn(['vacant', 'occupied', 'maintenance']),
];

// ── Tenants ───────────────────────────────────────────────────────────────────
// Note: Admin-driven tenant creation goes through POST /invitations (invite flow).
// This validator is used for internal/direct linking of an existing user to a tenant record.
const createTenantValidators = [
  body('userId').isUUID().withMessage('userId must be a valid UUID'),
  body('emergencyContactName').optional().trim(),
  body('emergencyContactPhone').optional({ values: 'falsy' }).isMobilePhone(),
  body('notes').optional().trim(),
];

// ── Invitations ───────────────────────────────────────────────────────────────
const createInvitationValidators = [
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email required'),
  body('phone').optional({ values: 'falsy' }).isMobilePhone().withMessage('Valid phone number required'),
  body('firstName').optional().trim(),
  body('lastName').optional().trim(),
  body('unitId').optional().isUUID().withMessage('unitId must be a valid UUID'),
];

const acceptInvitationValidators = [
  body('token').trim().notEmpty().withMessage('Invitation token is required'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email required'),
  body('phone').optional({ values: 'falsy' }).isMobilePhone().withMessage('Valid phone number required'),
  body('acceptedTerms').custom((v) => v === true).withMessage('You must accept the Terms of Service'),
];

// ── Leases ────────────────────────────────────────────────────────────────────
const createLeaseValidators = [
  body('unitId').isUUID(),
  body('tenantId').isUUID(),
  body('startDate').isISO8601().toDate(),
  body('endDate').isISO8601().toDate(),
  body('monthlyRent').isFloat({ min: 0 }),
  body('depositAmount').optional().isFloat({ min: 0 }),
  body('lateFeeAmount').optional().isFloat({ min: 0 }),
  body('lateFeeGraceDays').optional().isInt({ min: 0 }),
];

const updateLeaseValidators = [
  body('status').optional().isIn(['active', 'terminated', 'expired', 'pending'])
    .withMessage('status must be one of: active, terminated, expired, pending'),
  body('depositStatus').optional().isIn(['held', 'returned', 'applied'])
    .withMessage('depositStatus must be one of: held, returned, applied'),
  body('signedAt').optional({ nullable: true }).isISO8601().toDate(),
  body('documentUrl').optional({ nullable: true }).isURL(),
  body('monthlyRent').optional().isFloat({ min: 0 }),
  body('endDate').optional().isISO8601().toDate(),
  body('lateFeeAmount').optional().isFloat({ min: 0 }),
  body('lateFeeGraceDays').optional().isInt({ min: 0 }),
];

// ── Properties ────────────────────────────────────────────────────────────────
const updatePropertyValidators = [
  body('name').optional().trim().notEmpty(),
  body('addressLine1').optional().trim().notEmpty(),
  body('addressLine2').optional({ nullable: true }).trim(),
  body('city').optional().trim().notEmpty(),
  body('state').optional().trim().notEmpty(),
  body('zip').optional().trim().notEmpty(),
  body('country').optional().trim(),
  body('propertyType').optional().isIn(['single', 'multi', 'commercial'])
    .withMessage('propertyType must be one of: single, multi, commercial'),
];

// ── Units update ──────────────────────────────────────────────────────────────
const updateUnitValidators = [
  body('unitNumber').optional().trim().notEmpty(),
  body('floor').optional({ nullable: true }).isInt({ min: 0 }),
  body('bedrooms').optional({ nullable: true }).isInt({ min: 0 }),
  body('bathrooms').optional({ nullable: true }).isFloat({ min: 0 }),
  body('sqFt').optional({ nullable: true }).isInt({ min: 0 }),
  body('rentAmount').optional().isFloat({ min: 0 }),
  body('depositAmount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('status').optional().isIn(['vacant', 'occupied', 'maintenance'])
    .withMessage('status must be one of: vacant, occupied, maintenance'),
];

// ── Charges update ────────────────────────────────────────────────────────────
const updateChargeValidators = [
  body('description').optional({ nullable: true }).trim(),
  body('dueDate').optional().isDate().withMessage('dueDate must be a valid date (YYYY-MM-DD)'),
  body('chargeType').optional().isIn(['rent', 'late_fee', 'utility', 'other'])
    .withMessage('chargeType must be rent | late_fee | utility | other'),
];

// ── Tenants update ────────────────────────────────────────────────────────────
const updateTenantValidators = [
  body('emergencyContactName').optional({ nullable: true }).trim(),
  body('emergencyContactPhone').optional({ nullable: true, values: 'falsy' }).isMobilePhone(),
  body('notes').optional({ nullable: true }).trim(),
  body('emailOptIn').optional().isBoolean(),
  body('smsOptIn').optional().isBoolean(),
];

// ── Payments ──────────────────────────────────────────────────────────────────
const createPaymentValidators = [
  body('leaseId').isUUID(),
  body('amountPaid').isFloat({ min: 0.01 }),
  body('paymentDate').isISO8601().toDate(),
  body('paymentMethod').isIn(['stripe_ach', 'stripe_card', 'check', 'cash', 'other']),
  body('chargeId').optional().isUUID(),
  body('notes').optional().trim(),
];

// ── Maintenance ───────────────────────────────────────────────────────────────
const createMaintenanceValidators = [
  body('unitId').isUUID().withMessage('unitId must be a valid UUID'),
  body('category').isIn(['plumbing', 'electric', 'hvac', 'appliance', 'structural', 'other'])
    .withMessage('category must be one of: plumbing, electric, hvac, appliance, structural, other'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'emergency'])
    .withMessage('priority must be one of: low, medium, high, emergency'),
  body('title').trim().notEmpty().withMessage('title is required'),
  body('description').optional().trim(),
];

const updateMaintenanceValidators = [
  body('status').optional().isIn(['open', 'in_progress', 'completed', 'cancelled'])
    .withMessage('status must be one of: open, in_progress, completed, cancelled'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'emergency'])
    .withMessage('priority must be one of: low, medium, high, emergency'),
  body('category').optional().isIn(['plumbing', 'electric', 'hvac', 'appliance', 'structural', 'other'])
    .withMessage('category must be one of: plumbing, electric, hvac, appliance, structural, other'),
  body('assignedTo').optional().isUUID().withMessage('assignedTo must be a valid UUID'),
  body('title').optional().trim().notEmpty(),
  body('description').optional().trim(),
];

// ── Notifications ─────────────────────────────────────────────────────────────
const NOTIFICATION_CHANNELS      = ['email', 'sms'];
const NOTIFICATION_TRIGGER_EVENTS = [
  'rent_due', 'rent_overdue', 'late_fee_applied',
  'lease_expiring', 'maintenance_update', 'payment_received', 'custom',
];

const createTemplateValidators = [
  body('name').trim().notEmpty().withMessage('name is required'),
  body('channel').isIn(NOTIFICATION_CHANNELS).withMessage('channel must be email or sms'),
  body('triggerEvent').isIn(NOTIFICATION_TRIGGER_EVENTS)
    .withMessage('triggerEvent must be one of: ' + NOTIFICATION_TRIGGER_EVENTS.join(', ')),
  body('subject').optional().trim(),
  body('bodyTemplate').trim().notEmpty().withMessage('bodyTemplate is required'),
];

const updateTemplateValidators = [
  body('name').optional().trim().notEmpty(),
  body('channel').optional().isIn(NOTIFICATION_CHANNELS),
  body('triggerEvent').optional().isIn(NOTIFICATION_TRIGGER_EVENTS),
  body('subject').optional().trim(),
  body('bodyTemplate').optional().trim().notEmpty(),
];

// Two valid shapes: template send or ad-hoc send
const sendNotificationValidators = [
  body('recipientId').isUUID().withMessage('recipientId must be a valid UUID'),
  // Template mode
  body('templateId').optional().isUUID().withMessage('templateId must be a valid UUID'),
  body('variables').optional().isObject().withMessage('variables must be an object'),
  // Ad-hoc mode (required when no templateId)
  body('subject').if(body('templateId').not().exists()).notEmpty()
    .withMessage('subject is required for ad-hoc sends'),
  body('html').if(body('templateId').not().exists()).notEmpty()
    .withMessage('html is required for ad-hoc sends'),
  body('text').optional().trim(),
];

const createSetupIntentValidators = [
  body('tenantId').isUUID().withMessage('tenantId must be a valid UUID'),
];

const createPaymentIntentValidators = [
  body('leaseId').isUUID().withMessage('leaseId must be a valid UUID'),
  body('chargeId').optional().isUUID().withMessage('chargeId must be a valid UUID'),
  body('paymentMethodId').optional().isString().trim().notEmpty()
    .withMessage('paymentMethodId must be a non-empty string'),
];

const createChargeValidators = [
  body('unitId').isUUID().withMessage('unitId must be a valid UUID'),
  body('dueDate').isDate().withMessage('dueDate must be a valid date (YYYY-MM-DD)'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be a positive number'),
  body('chargeType')
    .optional()
    .isIn(['rent', 'late_fee', 'utility', 'other'])
    .withMessage('chargeType must be rent | late_fee | utility | other'),
  body('description').optional().trim(),
  body('leaseId').optional().isUUID().withMessage('leaseId must be a valid UUID'),
  body('tenantId').optional().isUUID().withMessage('tenantId must be a valid UUID'),
];

const sendSmsValidators = [
  body('recipientId').isUUID().withMessage('recipientId must be a valid UUID'),
  body('body').notEmpty().withMessage('body is required')
    .isLength({ max: 1600 }).withMessage('body must be 1600 characters or fewer'),
];

// ── Users update ──────────────────────────────────────────────────────────────
const updateUserValidators = [
  body('firstName').optional().trim().notEmpty().withMessage('firstName must not be blank'),
  body('lastName').optional().trim().notEmpty().withMessage('lastName must not be blank'),
  body('phone').optional({ values: 'falsy' }).isMobilePhone().withMessage('phone must be a valid phone number'),
  body('avatarUrl').optional({ values: 'falsy' }).isURL().withMessage('avatarUrl must be a valid URL'),
];

module.exports = {
  validate,
  registerValidators,
  loginValidators,
  createPropertyValidators,
  updatePropertyValidators,
  createUnitValidators,
  updateUnitValidators,
  createTenantValidators,
  updateTenantValidators,
  createLeaseValidators,
  updateLeaseValidators,
  createPaymentValidators,
  createMaintenanceValidators,
  updateMaintenanceValidators,
  createTemplateValidators,
  updateTemplateValidators,
  sendNotificationValidators,
  sendSmsValidators,
  createSetupIntentValidators,
  createPaymentIntentValidators,
  createChargeValidators,
  updateChargeValidators,
  createInvitationValidators,
  acceptInvitationValidators,
  forgotPasswordValidators,
  resetPasswordValidators,
  updateUserValidators,
};
