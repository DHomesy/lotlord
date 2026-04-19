const ledgerService = require('../services/ledgerService');
const ledgerRepo   = require('../dal/ledgerRepository');
const tenantRepo   = require('../dal/tenantRepository');
const leaseRepo    = require('../dal/leaseRepository');
const userRepo     = require('../dal/userRepository');
const PDFDocument  = require('pdfkit');
const { resolveOwnerId } = require('../lib/authHelpers');

async function getLedger(req, res, next) {
  try {
    const { leaseId } = req.query;
    if (!leaseId) return res.status(400).json({ error: 'leaseId query param is required' });
    const data = await ledgerService.getLedger(leaseId);
    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      if (!tenantRecord || tenantRecord.id !== data.lease.tenant_record_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (req.user.role === 'landlord' || req.user.role === 'employee') {
      if (data.lease.owner_id !== resolveOwnerId(req.user)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    res.json(data);
  } catch (err) { next(err); }
}

/**
 * GET /api/v1/ledger/portfolio
 *
 * Income summary across all properties (or one property), optionally filtered
 * to a date range.  Returns one row per property with a units[] breakdown.
 *
 * Query params (all optional):
 *   propertyId  — limit to a single property / building
 *   fromDate    — ISO date, e.g. 2026-01-01
 *   toDate      — ISO date, e.g. 2026-01-31
 *
 * Response shape per property:
 *   { propertyId, propertyName, address, unitCount,
 *     totalCharged, totalCollected, totalCredits,
 *     netIncome, outstanding, units[] }
 */
async function getPortfolioSummary(req, res, next) {
  try {
    const { propertyId, fromDate, toDate } = req.query;
    // Landlords and employees are automatically scoped to properties they (or their employer) own
    const ownerId = (req.user.role === 'landlord' || req.user.role === 'employee') ? resolveOwnerId(req.user) : undefined;
    const summary = await ledgerRepo.getPortfolioIncomeSummary({
      propertyId: propertyId || undefined,
      fromDate:   fromDate   || undefined,
      toDate:     toDate     || undefined,
      ownerId,
    });
    res.json(summary);
  } catch (err) { next(err); }
}

/**
 * GET /api/v1/ledger/statement?leaseId=x[&from=YYYY-MM-DD][&to=YYYY-MM-DD]
 *
 * Returns a date-filtered list of ledger entries for a lease —
 * suitable for exporting a tenant account statement.
 * Access rules mirror getLedger.
 */
function isValidDate(str) {
  return str && !isNaN(Date.parse(str));
}

async function getStatement(req, res, next) {
  try {
    const { leaseId, from, to } = req.query;
    if (!leaseId) return res.status(400).json({ error: 'leaseId query param is required' });
    if (from && !isValidDate(from)) return res.status(400).json({ error: 'Invalid from date' });
    if (to   && !isValidDate(to))   return res.status(400).json({ error: 'Invalid to date' });

    const lease = await leaseRepo.findById(leaseId);
    if (!lease) return res.status(404).json({ error: 'Lease not found' });

    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      if (!tenantRecord || tenantRecord.id !== lease.tenant_record_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (req.user.role === 'landlord' || req.user.role === 'employee') {
      if (lease.owner_id !== resolveOwnerId(req.user)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const entries = await ledgerRepo.findStatementEntries(leaseId, { from, to });
    res.json({ leaseId, from: from || null, to: to || null, entries });
  } catch (err) { next(err); }
}

/**
 * GET /api/v1/ledger/statement/pdf?leaseId=x[&from=YYYY-MM-DD][&to=YYYY-MM-DD]
 *
 * Streams a PDF account statement for the lease — an official accounting
 * record suitable for legal audit purposes. NOT a lease contract.
 *
 * Same access-control rules as getStatement.
 * PDF contents: tenant/landlord/property meta, then a table of all
 * ledger entries (date, description, type, charges, payments, running balance).
 */
async function getStatementPdf(req, res, next) {
  try {
    const { leaseId, from, to } = req.query;
    if (!leaseId) return res.status(400).json({ error: 'leaseId query param is required' });
    if (from && !isValidDate(from)) return res.status(400).json({ error: 'Invalid from date' });
    if (to   && !isValidDate(to))   return res.status(400).json({ error: 'Invalid to date' });

    const lease = await leaseRepo.findById(leaseId);
    if (!lease) return res.status(404).json({ error: 'Lease not found' });

    // Access control — identical to getStatement
    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      if (!tenantRecord || tenantRecord.id !== lease.tenant_record_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (req.user.role === 'landlord' || req.user.role === 'employee') {
      if (lease.owner_id !== resolveOwnerId(req.user)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const [entries, landlord] = await Promise.all([
      ledgerRepo.findStatementEntries(leaseId, { from, to }),
      userRepo.findById(lease.owner_id),
    ]);

    const tenantName   = [lease.first_name, lease.last_name].filter(Boolean).join(' ') || lease.email || 'Tenant';
    const landlordName = landlord ? [landlord.first_name, landlord.last_name].filter(Boolean).join(' ') || landlord.email : 'Landlord';
    const propertyAddr = [lease.property_name, lease.address_line1].filter(Boolean).join(' — ');
    const generated    = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const periodFrom   = from ? new Date(from).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'All time';
    const periodTo     = to   ? new Date(to).toLocaleDateString('en-US',   { year: 'numeric', month: 'long', day: 'numeric' }) : 'Present';

    // Build safe filename — strip anything that isn't alphanumeric/hyphen to prevent
    // header injection via Content-Disposition if from/to contain special characters.
    const shortId = leaseId.slice(0, 8);
    const sanitize = (s) => s.replace(/[^a-zA-Z0-9_-]/g, '');
    const fromSlug = from ? sanitize(from) : 'all';
    const toSlug   = to   ? sanitize(to)   : 'present';

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });

    // Pipe before writing — handle pdfkit stream errors before headers are sent
    doc.on('error', (err) => {
      // Headers not yet sent if we haven't called pipe — safe to respond with JSON
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to generate PDF' });
      }
      // Headers already sent — terminate the stream so client doesn't hang
      res.end();
      console.error('[getStatementPdf] pdfkit error after pipe:', err.message);
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${shortId}-${fromSlug}-${toSlug}.pdf"`);
    doc.pipe(res);

    // ── Header ──────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#000').text('LotLord', 50, 50);
    doc.font('Helvetica').fontSize(10).fillColor('#666').text('Property Management Platform', 50, 76);
    doc
      .font('Helvetica-Bold').fontSize(16).fillColor('#000')
      .text('ACCOUNT STATEMENT', 300, 50, { align: 'right', width: 245 });
    doc
      .font('Helvetica').fontSize(9).fillColor('#666')
      .text(`Generated: ${generated}`, 300, 72, { align: 'right', width: 245 });
    doc.moveTo(50, 95).lineTo(562, 95).lineWidth(1).strokeColor('#ddd').stroke();

    // ── Meta block ──────────────────────────────────────────────────────────
    let y = 110;
    const col1 = 50, col2 = 200;
    const lineH = 16;

    function metaRow(label, value) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#555').text(label, col1, y);
      doc.font('Helvetica').fontSize(9).fillColor('#000').text(value || '—', col2, y);
      y += lineH;
    }

    metaRow('Tenant:',          tenantName);
    metaRow('Landlord:',        landlordName);
    metaRow('Property:',        propertyAddr);
    metaRow('Unit:',            lease.unit_number || '—');
    metaRow('Lease period:',    `${new Date(lease.start_date).toLocaleDateString('en-US')} – ${new Date(lease.end_date).toLocaleDateString('en-US')}`);
    metaRow('Statement period:', `${periodFrom} – ${periodTo}`);
    metaRow('Statement ID:',    `${shortId}-${fromSlug}-${toSlug}`);

    y += 8;
    doc.moveTo(50, y).lineTo(562, y).lineWidth(0.5).strokeColor('#ddd').stroke();
    y += 12;

    // ── Table header ────────────────────────────────────────────────────────
    const colDate  = 50;
    const colDesc  = 115;
    const colType  = 310;
    const colChg   = 380;
    const colPmt   = 440;
    const colBal   = 500;
    const tableW   = 512;

    doc.rect(50, y, tableW, 16).fill('#f0f0f0');
    doc
      .font('Helvetica-Bold').fontSize(8).fillColor('#333')
      .text('Date',        colDate, y + 4, { width: 60 })
      .text('Description', colDesc, y + 4, { width: 190 })
      .text('Type',        colType, y + 4, { width: 65 })
      .text('Charges',     colChg,  y + 4, { width: 55, align: 'right' })
      .text('Payments',    colPmt,  y + 4, { width: 55, align: 'right' })
      .text('Balance',     colBal,  y + 4, { width: 62, align: 'right' });
    y += 18;

    // ── Table rows ───────────────────────────────────────────────────────────
    const fmt = (n) => n != null ? `$${Math.abs(Number(n)).toFixed(2)}` : '—';
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    entries.forEach((entry, i) => {
      // Page break guard — leave 60px at bottom for footer
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      const isCharge  = entry.type === 'charge';
      const isPayment = entry.type === 'payment' || entry.type === 'credit';
      const rowFill   = i % 2 === 0 ? '#ffffff' : '#fafafa';

      doc.rect(50, y - 2, tableW, 14).fill(rowFill);
      doc
        .font('Helvetica').fontSize(8).fillColor('#000')
        .text(fmtDate(entry.date),      colDate, y, { width: 60 })
        .text(entry.description || '—', colDesc, y, { width: 190 })
        .text((entry.type || '').replace(/_/g, ' '), colType, y, { width: 65 })
        .text(isCharge  ? fmt(entry.amount) : '',      colChg, y, { width: 55, align: 'right' })
        .text(isPayment ? fmt(entry.amount) : '',      colPmt, y, { width: 55, align: 'right' })
        .text(fmt(entry.balance),                      colBal, y, { width: 62, align: 'right' });
      y += 14;
    });

    if (entries.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#888').text('No entries found for the selected period.', 50, y, { width: tableW });
      y += 20;
    }

    // Bottom rule
    y += 4;
    doc.moveTo(50, y).lineTo(562, y).lineWidth(0.5).strokeColor('#ddd').stroke();
    y += 14;

    // ── Footer ───────────────────────────────────────────────────────────────
    doc
      .font('Helvetica').fontSize(8).fillColor('#888')
      .text(
        'This document is an official accounting record generated by LotLord. ' +
        'Retain for your tax and legal records.',
        50, y, { width: tableW, align: 'center' },
      );

    doc.end();
  } catch (err) { next(err); }
}

module.exports = { getLedger, getPortfolioSummary, getStatement, getStatementPdf };
