/**
 * Development seed — populates the DB with realistic test data.
 * Run: npm run seed
 *
 * WARNING: This will DELETE all existing data. Do not run against production.
 *
 * Accounts created:
 *   admin@example.com      / password123  — Admin
 *   landlord@example.com   / password123  — Landlord (free plan)
 *   landlord2@example.com  / password123  — Landlord (pro subscription)
 *   tenant@example.com     / password123  — Tenant (linked to landlord)
 *   tenant2@example.com    / password123  — Tenant (linked to landlord2)
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('[seed] Clearing existing data...');
    await client.query('DELETE FROM ai_messages');
    await client.query('DELETE FROM ai_conversations');
    await client.query('DELETE FROM notifications_log');
    await client.query('DELETE FROM notification_templates');
    await client.query('DELETE FROM documents');
    await client.query('DELETE FROM maintenance_attachments');
    await client.query('DELETE FROM maintenance_requests');
    await client.query('DELETE FROM ledger_entries');
    await client.query('DELETE FROM rent_payments');
    await client.query('DELETE FROM rent_charges');
    await client.query('DELETE FROM tenant_invitations');
    await client.query('DELETE FROM leases');
    await client.query('DELETE FROM tenants');
    await client.query('DELETE FROM units');
    await client.query('DELETE FROM properties');
    await client.query('DELETE FROM users');

    // ── Users ──────────────────────────────────────────────────────────────────
    console.log('[seed] Creating users...');
    const adminId       = uuidv4();
    const landlordId    = uuidv4();   // free plan
    const landlord2Id   = uuidv4();   // pro plan
    const tenantUserId  = uuidv4();
    const tenantUser2Id = uuidv4();
    const passwordHash  = await bcrypt.hash('password123', 10);

    await client.query(
      `INSERT INTO users (id, email, password_hash, role, first_name, last_name, phone)
       VALUES ($1, $2, $3, 'admin', 'Admin', 'User', '+15550000001')`,
      [adminId, 'admin@example.com', passwordHash],
    );

    // Landlord 1 — free tier
    await client.query(
      `INSERT INTO users (id, email, password_hash, role, first_name, last_name, phone,
                          subscription_status, subscription_plan)
       VALUES ($1, $2, $3, 'landlord', 'Alice', 'Smith', '+15550000004', 'none', NULL)`,
      [landlordId, 'landlord@example.com', passwordHash],
    );

    // Landlord 2 — active pro subscription
    await client.query(
      `INSERT INTO users (id, email, password_hash, role, first_name, last_name, phone,
                          subscription_status, subscription_plan,
                          stripe_billing_customer_id, subscription_id)
       VALUES ($1, $2, $3, 'landlord', 'Bob', 'Johnson', '+15550000005',
               'active', 'pro', 'cus_seed_landlord2', 'sub_seed_landlord2')`,
      [landlord2Id, 'landlord2@example.com', passwordHash],
    );

    await client.query(
      `INSERT INTO users (id, email, password_hash, role, first_name, last_name, phone)
       VALUES ($1, $2, $3, 'tenant', 'Jane', 'Doe', '+15550000002')`,
      [tenantUserId, 'tenant@example.com', passwordHash],
    );

    await client.query(
      `INSERT INTO users (id, email, password_hash, role, first_name, last_name, phone)
       VALUES ($1, $2, $3, 'tenant', 'Carlos', 'Rivera', '+15550000006')`,
      [tenantUser2Id, 'tenant2@example.com', passwordHash],
    );

    // ── Landlord 1 property ───────────────────────────────────────────────────
    console.log('[seed] Creating Landlord 1 property & unit...');
    const property1Id = uuidv4();
    await client.query(
      `INSERT INTO properties (id, owner_id, name, address_line1, city, state, zip, property_type)
       VALUES ($1, $2, 'Maple Apartments', '123 Maple Street', 'Austin', 'TX', '78701', 'multi')`,
      [property1Id, landlordId],
    );

    const unit1Id = uuidv4();
    await client.query(
      `INSERT INTO units (id, property_id, unit_number, bedrooms, bathrooms, sq_ft, rent_amount, deposit_amount, status)
       VALUES ($1, $2, '101', 2, 1, 850, 1450.00, 1450.00, 'occupied')`,
      [unit1Id, property1Id],
    );

    // Vacant unit so the dashboard shows something
    const unit1bId = uuidv4();
    await client.query(
      `INSERT INTO units (id, property_id, unit_number, bedrooms, bathrooms, sq_ft, rent_amount, deposit_amount, status)
       VALUES ($1, $2, '102', 1, 1, 620, 1100.00, 1100.00, 'vacant')`,
      [unit1bId, property1Id],
    );

    console.log('[seed] Creating Landlord 1 tenant & lease...');
    const tenant1Id = uuidv4();
    await client.query(
      `INSERT INTO tenants (id, user_id, emergency_contact_name, emergency_contact_phone)
       VALUES ($1, $2, 'John Doe', '+15550000003')`,
      [tenant1Id, tenantUserId],
    );

    const lease1Id = uuidv4();
    await client.query(
      `INSERT INTO leases (id, unit_id, tenant_id, start_date, end_date, monthly_rent, deposit_amount,
                           deposit_status, status, signed_at, late_fee_amount, late_fee_grace_days)
       VALUES ($1, $2, $3, '2025-02-01', '2026-01-31', 1450.00, 1450.00,
               'held', 'active', NOW(), 75.00, 5)`,
      [lease1Id, unit1Id, tenant1Id],
    );

    console.log('[seed] Creating Landlord 1 charges & payments...');
    const charge1Id = uuidv4();
    await client.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, due_date, amount, charge_type, description)
       VALUES ($1, $2, $3, '2026-02-01', 1450.00, 'rent', 'February 2026 rent')`,
      [charge1Id, unit1Id, lease1Id],
    );

    const payment1Id = uuidv4();
    await client.query(
      `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
       VALUES ($1, $2, $3, 1450.00, '2026-02-01', 'check', 'completed')`,
      [payment1Id, lease1Id, charge1Id],
    );

    await client.query(
      `INSERT INTO ledger_entries (id, lease_id, entry_type, amount, balance_after, description, reference_id, created_by)
       VALUES
         ($1, $2, 'charge',  1450.00, 1450.00, 'February 2026 rent charge', $3, $4),
         ($5, $2, 'payment', -1450.00, 0.00,   'February 2026 rent payment', $6, $4)`,
      [uuidv4(), lease1Id, charge1Id, adminId, uuidv4(), payment1Id],
    );

    // Unpaid March charge so landlord1 sees an outstanding balance
    const charge1bId = uuidv4();
    await client.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, due_date, amount, charge_type, description)
       VALUES ($1, $2, $3, '2026-03-01', 1450.00, 'rent', 'March 2026 rent')`,
      [charge1bId, unit1Id, lease1Id],
    );
    await client.query(
      `INSERT INTO ledger_entries (id, lease_id, entry_type, amount, balance_after, description, reference_id, created_by)
       VALUES ($1, $2, 'charge', 1450.00, 1450.00, 'March 2026 rent charge', $3, $4)`,
      [uuidv4(), lease1Id, charge1bId, adminId],
    );

    console.log('[seed] Creating Landlord 1 maintenance requests...');
    const maint1Id = uuidv4();
    await client.query(
      `INSERT INTO maintenance_requests
         (id, unit_id, submitted_by, category, priority, title, description, status)
       VALUES ($1, $2, $3, 'plumbing', 'high',
               'Kitchen faucet leaking',
               'The kitchen faucet has been dripping constantly. Water is pooling under the sink cabinet.',
               'open')`,
      [maint1Id, unit1Id, tenantUserId],
    );

    const maint2Id = uuidv4();
    await client.query(
      `INSERT INTO maintenance_requests
         (id, unit_id, submitted_by, category, priority, title, description, status)
       VALUES ($1, $2, $3, 'hvac', 'medium',
               'AC not cooling properly',
               'The air conditioner runs but the apartment does not cool below 80°F even when set to 68°F.',
               'in_progress')`,
      [maint2Id, unit1Id, tenantUserId],
    );

    const maint3Id = uuidv4();
    await client.query(
      `INSERT INTO maintenance_requests
         (id, unit_id, submitted_by, category, priority, title, description, status, resolved_at)
       VALUES ($1, $2, $3, 'appliance', 'low',
               'Dishwasher door latch broken',
               'The dishwasher door does not latch closed. Replaced the latch — resolved.',
               'completed', NOW() - INTERVAL '3 days')`,
      [maint3Id, unit1Id, landlordId],
    );

    // ── Landlord 2 property (pro) ─────────────────────────────────────────────
    console.log('[seed] Creating Landlord 2 (pro) property & units...');
    const property2Id = uuidv4();
    await client.query(
      `INSERT INTO properties (id, owner_id, name, address_line1, city, state, zip, property_type)
       VALUES ($1, $2, 'Riverside Lofts', '500 River Road', 'Austin', 'TX', '78702', 'multi')`,
      [property2Id, landlord2Id],
    );

    const unit2Id = uuidv4();
    await client.query(
      `INSERT INTO units (id, property_id, unit_number, bedrooms, bathrooms, sq_ft, rent_amount, deposit_amount, status)
       VALUES ($1, $2, 'A1', 3, 2, 1200, 2200.00, 2200.00, 'occupied')`,
      [unit2Id, property2Id],
    );

    const unit2bId = uuidv4();
    await client.query(
      `INSERT INTO units (id, property_id, unit_number, bedrooms, bathrooms, sq_ft, rent_amount, deposit_amount, status)
       VALUES ($1, $2, 'A2', 2, 2, 980, 1850.00, 1850.00, 'vacant')`,
      [unit2bId, property2Id],
    );

    const unit2cId = uuidv4();
    await client.query(
      `INSERT INTO units (id, property_id, unit_number, bedrooms, bathrooms, sq_ft, rent_amount, deposit_amount, status)
       VALUES ($1, $2, 'B1', 1, 1, 650, 1400.00, 1400.00, 'vacant')`,
      [unit2cId, property2Id],
    );

    // Second property for landlord2 — single family
    const property3Id = uuidv4();
    await client.query(
      `INSERT INTO properties (id, owner_id, name, address_line1, city, state, zip, property_type)
       VALUES ($1, $2, '204 Oak House', '204 Oak Avenue', 'Austin', 'TX', '78703', 'single')`,
      [property3Id, landlord2Id],
    );

    const unit3Id = uuidv4();
    await client.query(
      `INSERT INTO units (id, property_id, unit_number, bedrooms, bathrooms, sq_ft, rent_amount, deposit_amount, status)
       VALUES ($1, $2, 'HOUSE', 4, 2, 1800, 2800.00, 2800.00, 'vacant')`,
      [unit3Id, property3Id],
    );

    console.log('[seed] Creating Landlord 2 tenant & lease...');
    const tenant2Id = uuidv4();
    await client.query(
      `INSERT INTO tenants (id, user_id, emergency_contact_name, emergency_contact_phone)
       VALUES ($1, $2, 'Maria Rivera', '+15550000007')`,
      [tenant2Id, tenantUser2Id],
    );

    const lease2Id = uuidv4();
    await client.query(
      `INSERT INTO leases (id, unit_id, tenant_id, start_date, end_date, monthly_rent, deposit_amount,
                           deposit_status, status, signed_at, late_fee_amount, late_fee_grace_days)
       VALUES ($1, $2, $3, '2025-06-01', '2026-05-31', 2200.00, 2200.00,
               'held', 'active', NOW(), 100.00, 5)`,
      [lease2Id, unit2Id, tenant2Id],
    );

    console.log('[seed] Creating Landlord 2 charges & payments...');
    const charge2Id = uuidv4();
    await client.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, due_date, amount, charge_type, description)
       VALUES ($1, $2, $3, '2026-02-01', 2200.00, 'rent', 'February 2026 rent')`,
      [charge2Id, unit2Id, lease2Id],
    );

    const payment2Id = uuidv4();
    await client.query(
      `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
       VALUES ($1, $2, $3, 2200.00, '2026-01-30', 'stripe_ach', 'completed')`,
      [payment2Id, lease2Id, charge2Id],
    );

    await client.query(
      `INSERT INTO ledger_entries (id, lease_id, entry_type, amount, balance_after, description, reference_id, created_by)
       VALUES
         ($1, $2, 'charge',  2200.00, 2200.00, 'February 2026 rent charge', $3, $4),
         ($5, $2, 'payment', -2200.00, 0.00,   'February 2026 rent payment (ACH)', $6, $4)`,
      [uuidv4(), lease2Id, charge2Id, adminId, uuidv4(), payment2Id],
    );

    const charge2bId = uuidv4();
    await client.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, due_date, amount, charge_type, description)
       VALUES ($1, $2, $3, '2026-03-01', 2200.00, 'rent', 'March 2026 rent')`,
      [charge2bId, unit2Id, lease2Id],
    );

    const payment2bId = uuidv4();
    await client.query(
      `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
       VALUES ($1, $2, $3, 2200.00, '2026-03-01', 'stripe_ach', 'completed')`,
      [payment2bId, lease2Id, charge2bId],
    );

    await client.query(
      `INSERT INTO ledger_entries (id, lease_id, entry_type, amount, balance_after, description, reference_id, created_by)
       VALUES
         ($1, $2, 'charge',  2200.00, 2200.00, 'March 2026 rent charge', $3, $4),
         ($5, $2, 'payment', -2200.00, 0.00,   'March 2026 rent payment (ACH)', $6, $4)`,
      [uuidv4(), lease2Id, charge2bId, adminId, uuidv4(), payment2bId],
    );

    // Late fee charged for April (pro landlord uses late fees)
    const charge2cId = uuidv4();
    await client.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, due_date, amount, charge_type, description)
       VALUES ($1, $2, $3, '2026-04-01', 2200.00, 'rent', 'April 2026 rent')`,
      [charge2cId, unit2Id, lease2Id],
    );
    await client.query(
      `INSERT INTO ledger_entries (id, lease_id, entry_type, amount, balance_after, description, reference_id, created_by)
       VALUES ($1, $2, 'charge', 2200.00, 2200.00, 'April 2026 rent charge', $3, $4)`,
      [uuidv4(), lease2Id, charge2cId, adminId],
    );

    console.log('[seed] Creating Landlord 2 maintenance requests...');
    const maint4Id = uuidv4();
    await client.query(
      `INSERT INTO maintenance_requests
         (id, unit_id, submitted_by, category, priority, title, description, status)
       VALUES ($1, $2, $3, 'electric', 'emergency',
               'Outlet sparking in bedroom',
               'The outlet next to the bed started sparking when plugging in a phone charger. Stopped using it.',
               'open')`,
      [maint4Id, unit2Id, tenantUser2Id],
    );

    const maint5Id = uuidv4();
    await client.query(
      `INSERT INTO maintenance_requests
         (id, unit_id, submitted_by, category, priority, title, description, status)
       VALUES ($1, $2, $3, 'structural', 'medium',
               'Crack in bathroom wall',
               'There is a horizontal crack about 12 inches long on the wall above the shower. Appeared over last 2 weeks.',
               'in_progress')`,
      [maint5Id, unit2Id, tenantUser2Id],
    );

    // ── Notification template ─────────────────────────────────────────────────
    console.log('[seed] Creating notification template...');
    await client.query(
      `INSERT INTO notification_templates (id, name, channel, trigger_event, subject, body_template)
       VALUES ($1, 'Rent Due Reminder', 'email', 'rent_due',
               'Rent Due Soon — {{property}} Unit {{unit}}',
               'Hi {{tenant_name}},\n\nThis is a reminder that your rent of \${{amount}} is due on {{due_date}}.\n\nThank you!')`,
      [uuidv4()],
    );

    await client.query('COMMIT');
    console.log('\n[seed] Done ✓');
    console.log('  admin@example.com      / password123  -- Admin');
    console.log('  landlord@example.com   / password123  -- Landlord (free)     1 property, 2 units, 1 tenant');
    console.log('  landlord2@example.com  / password123  -- Landlord (pro)      3 properties, 4 units, 1 tenant');
    console.log('  tenant@example.com     / password123  -- Tenant (Maple Apts Unit 101)');
    console.log('  tenant2@example.com    / password123  -- Tenant (Riverside Lofts A1)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] Failed, rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
