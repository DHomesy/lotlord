/**
 * Unit tests for src/lib/templateUtils.js
 *
 * Covers the two exported functions used by notificationService:
 *   escapeHtml()     — HTML entity encoding for safe email body injection
 *   renderTemplate() — {{key}} placeholder substitution
 *
 * Running: npm test -- --testPathPattern=templateUtils
 * (No DB connection required — pure function tests)
 */

const { escapeHtml, renderTemplate } = require('../../src/lib/templateUtils');

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('AT&T')).toBe('AT&amp;T');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('escapes single quotes (OWASP-complete set; guards href=\'...\')', () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it('escapes a full XSS payload', () => {
    const result = escapeHtml('<img src=x onerror="alert(\'xss\')">');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('"');
    expect(result).not.toContain("'");
  });

  it('passes through plain text unchanged', () => {
    expect(escapeHtml('Hello, John!')).toBe('Hello, John!');
  });

  it('coerces numbers to string', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('coerces null/undefined to empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('does not strip CRLF — header sanitization is handled separately in ses.js', () => {
    // escapeHtml is for HTML injection, not MIME header injection.
    // ses.js has a dedicated sanitizeHeader() for CRLF stripping.
    const withCRLF = 'line1\r\nline2';
    expect(escapeHtml(withCRLF)).toBe('line1\r\nline2');
  });
});

// ── renderTemplate ────────────────────────────────────────────────────────────

describe('renderTemplate (email channel)', () => {
  it('substitutes a single variable', () => {
    expect(renderTemplate('Hello {{first_name}}!', { first_name: 'Alice' }))
      .toBe('Hello Alice!');
  });

  it('substitutes multiple variables', () => {
    const result = renderTemplate(
      '{{property}} Unit {{unit}} — {{amount}} due {{due_date}}',
      { property: 'Maple Place', unit: '4B', amount: '$1,200', due_date: 'June 1' },
    );
    expect(result).toBe('Maple Place Unit 4B — $1,200 due June 1');
  });

  it('leaves unknown placeholders unchanged (so missing variables appear in logs)', () => {
    const result = renderTemplate('Hello {{first_name}} from {{portal_url}}', { first_name: 'Bob' });
    expect(result).toBe('Hello Bob from {{portal_url}}');
  });

  it('HTML-escapes user-controlled values in email templates', () => {
    const result = renderTemplate(
      '<p>Hello {{first_name}}</p>',
      { first_name: '<script>alert(1)</script>' },
      'email',
    );
    expect(result).toBe('<p>Hello &lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(result).not.toContain('<script>');
  });

  it('escapes values that contain double quotes (attribute injection guard)', () => {
    const result = renderTemplate(
      '<a href="{{portal_url}}">click</a>',
      { portal_url: '"onmouseover="alert(1)' },
      'email',
    );
    expect(result).not.toContain('"onmouseover=');
    expect(result).toContain('&quot;');
  });

  it('escapes values that contain single quotes', () => {
    const result = renderTemplate(
      'Hi {{first_name}},',
      { first_name: "O'Brien" },
      'email',
    );
    expect(result).toBe('Hi O&#39;Brien,');
  });

  it('handles an empty variables object gracefully', () => {
    const template = 'Due: {{amount}}';
    expect(renderTemplate(template, {})).toBe('Due: {{amount}}');
  });

  it('coerces non-string values (numbers, booleans) to string', () => {
    const result = renderTemplate('Amount: {{amount}}', { amount: 1500 }, 'email');
    expect(result).toBe('Amount: 1500');
  });
});

describe('renderTemplate (sms channel)', () => {
  it('does NOT HTML-escape values on SMS channel', () => {
    // SMS bodies are plain text — HTML entities would appear literally on the handset.
    const result = renderTemplate(
      'Hi {{first_name}}, your rent is due.',
      { first_name: 'Alice & Bob' },
      'sms',
    );
    expect(result).toBe('Hi Alice & Bob, your rent is due.');
    expect(result).not.toContain('&amp;');
  });

  it('still substitutes placeholders on SMS channel', () => {
    const result = renderTemplate(
      'Rent {{amount}} due {{due_date}}',
      { amount: '$1,200', due_date: 'June 1' },
      'sms',
    );
    expect(result).toBe('Rent $1,200 due June 1');
  });
});
