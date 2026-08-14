jest.mock('uuid', () => ({ v4: jest.fn(() => 'bug-report-uuid') }))

jest.mock('../../src/config/env', () => ({
  BUG_REPORT_EMAIL: 'bugs@lotlord.app',
  ALERT_EMAIL: 'alerts@lotlord.app',
}))

jest.mock('../../src/services/auditService', () => ({
  log: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../src/integrations/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}))

const bugReportService = require('../../src/services/bugReportService')
const env = require('../../src/config/env')
const audit = require('../../src/services/auditService')
const email = require('../../src/integrations/email')

describe('bugReportService.submitBugReport', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    env.BUG_REPORT_EMAIL = 'bugs@lotlord.app'
    env.ALERT_EMAIL = 'alerts@lotlord.app'
  })

  test('submits a report and sends to BUG_REPORT_EMAIL when configured', async () => {
    const result = await bugReportService.submitBugReport({
      user: {
        sub: 'user-123',
        role: 'tenant',
        email: 'tenant@example.com',
      },
      summary: 'Message send button does nothing',
      details: 'Clicked send in messages and there was no response',
      severity: 'high',
      pageUrl: 'https://app.lotlord.app/messages',
      userAgent: 'jest-agent',
    })

    expect(result).toEqual({
      reportId: 'bug-report-uuid',
      severity: 'high',
      deliveredToSupport: true,
    })

    expect(email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'bugs@lotlord.app',
      subject: '[LotLord Bug] HIGH - Message send button does nothing',
    }))

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'bug_report_submitted',
      resourceType: 'support',
      resourceId: 'bug-report-uuid',
      userId: 'user-123',
      metadata: expect.objectContaining({
        severity: 'high',
        supportEmailConfigured: true,
      }),
    }))
  })

  test('falls back to ALERT_EMAIL when BUG_REPORT_EMAIL is missing', async () => {
    env.BUG_REPORT_EMAIL = ''

    await bugReportService.submitBugReport({
      user: { sub: 'u1', role: 'landlord', email: 'owner@example.com' },
      summary: 'Bug summary',
      details: 'Bug details',
      severity: 'medium',
      pageUrl: 'https://app.lotlord.app/profile',
      userAgent: '',
    })

    expect(email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'alerts@lotlord.app',
    }))
  })

  test('still logs audit even when no support email is configured', async () => {
    env.BUG_REPORT_EMAIL = ''
    env.ALERT_EMAIL = ''

    const result = await bugReportService.submitBugReport({
      user: { sub: 'u2', role: 'tenant', email: 'tenant2@example.com' },
      summary: 'Another bug',
      details: 'Details',
      severity: 'unknown-value',
      pageUrl: '',
      userAgent: '',
    })

    expect(email.sendEmail).not.toHaveBeenCalled()
    expect(audit.log).toHaveBeenCalled()
    expect(result).toEqual({
      reportId: 'bug-report-uuid',
      severity: 'medium',
      deliveredToSupport: false,
    })
  })
})
