# Payment Gates

Canonical paid plans: `autopilot`, `portfolio`.

## Feature Gates

| Feature | Roles | Required Plan | Enforcement |
|---|---|---|---|
| AI Inbox (list, thread, reply, draft approve/dismiss) | landlord, employee, admin | Autopilot or Portfolio | Backend route gate + hidden in UI when unpaid |
| Dedicated SMS (status, provision, deprovision) | landlord, admin | Autopilot or Portfolio | Backend route gate + hidden in UI when unpaid |
| AI Settings (enable/mode/notify/channels) | landlord, employee, admin | Autopilot or Portfolio | Backend controller gate + hidden in UI when unpaid |
| Analytics Dashboard | landlord, employee, admin | Autopilot or Portfolio | Backend route gate |
| Portfolio Ledger Summary | landlord, employee, admin | Autopilot or Portfolio | Backend route gate |
| Employee Invitations | landlord, admin | Portfolio | Backend plan-limit gate (`employees`) |

## Rules

- Employees inherit landlord entitlements (billing owner is resolved from employer).
- Admin bypasses all plan gates.
- UI visibility is convenience only; backend gates are the source of truth.
