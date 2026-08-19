const env = require('../config/env');

const POLICY_VERSION = 'd4-routing-v1';

function toInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(n) ? n : fallback;
}

function riskFromInput(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'elevated') return 'elevated';
  return 'normal';
}

function chooseDefaultModels() {
  return {
    defaultModel: env.AI_MODEL_DEFAULT || 'gpt-4o-mini',
    highRiskModel: env.AI_MODEL_HIGH_RISK || 'gpt-4o',
    classificationModel: env.AI_MODEL_CLASSIFICATION || env.AI_MODEL_DEFAULT || 'gpt-4o-mini',
  };
}

function hasComplexitySignals({ historySize, messageLength }) {
  const maxHistoryBeforeEscalation = toInt(env.AI_ROUTE_MAX_HISTORY_BEFORE_ESCALATION, 60);
  const maxMessageLengthBeforeEscalation = toInt(env.AI_ROUTE_MAX_MESSAGE_LENGTH_BEFORE_ESCALATION, 1400);
  return historySize >= maxHistoryBeforeEscalation || messageLength >= maxMessageLengthBeforeEscalation;
}

function resolveModel({ operation, riskState, needsHumanReview, messageLength = 0, historySize = 0 } = {}) {
  const models = chooseDefaultModels();

  if (operation === 'classification') {
    return {
      model: models.classificationModel,
      reason: 'classification_default',
      policyVersion: POLICY_VERSION,
    };
  }

  const risk = riskFromInput(riskState);
  const forceHighRiskOnReview = String(env.AI_ROUTE_FORCE_HIGH_RISK_ON_REVIEW || 'true') !== 'false';
  if (risk === 'critical') {
    return {
      model: models.highRiskModel,
      reason: 'critical_risk',
      policyVersion: POLICY_VERSION,
    };
  }

  if (forceHighRiskOnReview && (risk === 'elevated' || needsHumanReview)) {
    return {
      model: models.highRiskModel,
      reason: 'elevated_or_review',
      policyVersion: POLICY_VERSION,
    };
  }

  if (hasComplexitySignals({ historySize, messageLength })) {
    return {
      model: models.highRiskModel,
      reason: 'complexity_signal',
      policyVersion: POLICY_VERSION,
    };
  }

  return {
    model: models.defaultModel,
    reason: 'default',
    policyVersion: POLICY_VERSION,
  };
}

module.exports = {
  POLICY_VERSION,
  resolveModel,
};
