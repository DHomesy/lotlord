/**
 * OpenAI integration — AI Tenant Agent
 *
 * The agent answers tenant questions via SMS and email.
 *
 * Hard boundaries (enforced by system prompt):
 *  ✅ Answer FAQs, confirm payment status, give lease dates
 *  ✅ Log maintenance requests on behalf of tenant
 *  ❌ Make payment arrangements or agree to new amounts
 *  ❌ Modify lease terms
 *  ❌ Promise anything legally binding
 *
 * Every message (user + assistant) must be saved to ai_messages BEFORE replying.
 */

const OpenAI = require('openai');
const env = require('../config/env');

let openai;

function getClient() {
  if (!openai) {
    openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openai;
}

const SYSTEM_PROMPT = `
You are a helpful property management assistant. You assist tenants with questions
about their lease, payment status, and maintenance requests.

You MUST NOT:
- Make any payment arrangements or negotiate amounts
- Agree to any changes to lease terms
- Make any legally binding promises or commitments
- Discuss other tenants or share any private information

If a tenant asks anything outside your scope, politely explain that you will have
the property manager follow up with them directly, and set the conversation status
to escalated.

Always be professional, concise, and friendly.
`.trim();

/**
 * Generate a reply for a tenant message.
 * @param {Object} opts
 * @param {Array<{role: string, content: string}>} opts.history - Prior messages in this conversation
 * @param {string} opts.newMessage - The latest message from the tenant
 * @param {string} [opts.systemContext] - Optional plain-text context appended to the system prompt
 *                                        (lease details, balance, property info from conversationService)
 * @returns {Promise<{ reply: string, tokensUsed: number, model: string }>}
 */
async function generateReply({ history, newMessage, systemContext = '' }) {
  // Truncate to 2000 chars — same limit as classifyMessage — to cap token cost
  // and constrain prompt injection via tenant-controlled message content.
  const safeNewMessage = String(newMessage).substring(0, 2000);

  const fullSystemPrompt = systemContext
    ? `${SYSTEM_PROMPT}\n\nContext for this tenant:\n${systemContext}`
    : SYSTEM_PROMPT;

  const messages = [
    { role: 'system', content: fullSystemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: safeNewMessage },
  ];

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 300,
    temperature: 0.4,
  });

  const choice = response.choices[0];
  return {
    reply: choice.message.content.trim(),
    tokensUsed: response.usage?.total_tokens ?? 0,
    model: response.model,
  };
}

/**
 * Classify an inbound tenant message.
 * Returns category, urgency score, and a one-sentence summary.
 * Intentionally a separate call from generateReply so classification always
 * runs even if reply generation fails or is skipped.
 *
 * @param {string} content - The raw tenant message text
 * @returns {Promise<{ category: string, urgency: number, summary: string }>}
 */
async function classifyMessage(content) {
  // Truncate to 2000 chars — limits cost and constrains prompt injection blast radius
  const safeContent = String(content).substring(0, 2000);
  const response = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a property management triage assistant. Classify the tenant message and respond with valid JSON only. No markdown, no explanation.',
      },
      {
        role: 'user',
        content: `Classify this tenant message. Respond with JSON only:\n{"category":"maintenance|payment|lease|general","urgency":1,"summary":"one sentence"}\n\nUrgency scale: 1=low, 2=minor, 3=normal, 4=high, 5=critical/emergency.\nUse urgency 5 for words like: emergency, flood, fire, gas leak, no heat, mold, uninhabitable.\nUse urgency 4 for: broken AC, no hot water, eviction mentions, lawyer, court.\n\nMessage: ${safeContent}`,
      },
    ],
    max_tokens: 100,
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  try {
    const parsed = JSON.parse(response.choices[0].message.content);
    const validCategories = ['maintenance', 'payment', 'lease', 'general'];
    return {
      category: validCategories.includes(parsed.category) ? parsed.category : 'general',
      urgency:  Math.max(1, Math.min(5, parseInt(parsed.urgency, 10) || 3)),
      summary:  (parsed.summary || '').substring(0, 200),
    };
  } catch {
    return { category: 'general', urgency: 3, summary: '' };
  }
}

module.exports = { generateReply, classifyMessage };
