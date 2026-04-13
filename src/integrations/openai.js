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
 * @returns {Promise<{ reply: string, tokensUsed: number, model: string }>}
 */
async function generateReply({ history, newMessage }) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: newMessage },
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

module.exports = { generateReply };
