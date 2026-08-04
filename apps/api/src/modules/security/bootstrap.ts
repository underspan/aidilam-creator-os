#!/usr/bin/env node
/**
 * Bootstrap Internal Admin Service Account
 *
 * Creates the initial service account and token for internal administration.
 * The token is written to /opt/aidilam/secrets/bootstrap_internal_admin_token
 * and printed ONCE. It must be rotated after first controlled use.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node dist/modules/security/bootstrap.js
 *
 * This script is idempotent - if the account already exists, it skips creation.
 */

import { randomUUID } from 'node:crypto';
import { writeFileSync, existsSync, chmodSync } from 'node:fs';
import pg from 'pg';
import { generateServiceToken, loadPepper } from './domain/token-utils.js';

const PEPPER_PATH = process.env.SERVICE_TOKEN_PEPPER_PATH || '/run/secrets/service_token_pepper';
const TOKEN_OUTPUT_PATH = '/opt/aidilam/secrets/bootstrap_internal_admin_token';
const SERVICE_ACCOUNT_CODE = 'aidilam-internal-admin';
const SERVICE_ACCOUNT_NAME = 'AIĐiLàm Internal Administration';

async function bootstrap() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  if (!existsSync(PEPPER_PATH)) {
    console.error(`ERROR: Pepper file not found at ${PEPPER_PATH}`);
    process.exit(1);
  }

  const pepper = loadPepper(PEPPER_PATH);
  const { Pool } = pg;
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const client = await pool.connect();
    try {
      // Check if account already exists
      const existing = await client.query(
        'SELECT id FROM aidilam_app.service_accounts WHERE code = $1',
        [SERVICE_ACCOUNT_CODE]
      );

      if (existing.rows.length > 0) {
        console.log(`Service account '${SERVICE_ACCOUNT_CODE}' already exists. Skipping.`);
        console.log('To create a new token, use the token rotation script.');
        return;
      }

      // Create service account
      await client.query('BEGIN');

      const accountResult = await client.query(
        `INSERT INTO aidilam_app.service_accounts (code, name, description, status)
         VALUES ($1, $2, $3, 'active')
         RETURNING id`,
        [SERVICE_ACCOUNT_CODE, SERVICE_ACCOUNT_NAME, 'Bootstrap internal admin for system initialization']
      );
      const accountId = accountResult.rows[0].id;

      // Assign system_admin global role
      const roleResult = await client.query(
        `SELECT id FROM aidilam_app.roles WHERE code = 'system_admin'`
      );
      if (roleResult.rows.length === 0) {
        throw new Error('system_admin role not found. Run migrations first.');
      }

      // For service accounts, we track role via a custom mechanism
      // (user_global_roles requires a user_id; service accounts use direct role lookup)
      // We'll store the global role assignment with the service account id as user_id reference
      // Actually, let's create a dedicated link - service accounts get their permissions
      // resolved differently: service_accounts join through a separate mechanism.
      // For now, we'll use user_global_roles with a synthetic user entry or
      // resolve permissions by service_account -> roles mapping.
      // Decision: service account role resolution is done by code lookup in application layer.

      // Generate token
      const { plaintext, prefix, hash } = generateServiceToken(pepper);

      await client.query(
        `INSERT INTO aidilam_app.service_tokens (service_account_id, token_prefix, token_hash, hash_algorithm, name, status)
         VALUES ($1, $2, $3, 'hmac-sha256', 'Bootstrap token', 'active')`,
        [accountId, prefix, hash]
      );

      await client.query('COMMIT');

      // Write token to file (permission 600)
      writeFileSync(TOKEN_OUTPUT_PATH, plaintext, { mode: 0o600 });
      chmodSync(TOKEN_OUTPUT_PATH, 0o600);

      console.log('=== BOOTSTRAP COMPLETE ===');
      console.log(`Service account: ${SERVICE_ACCOUNT_CODE}`);
      console.log(`Account ID: ${accountId}`);
      console.log(`Token prefix: aidl_${prefix}_...`);
      console.log(`Token saved to: ${TOKEN_OUTPUT_PATH}`);
      console.log('');
      console.log('⚠️  IMPORTANT: This token must be rotated after first controlled use.');
      console.log('⚠️  The plaintext token is shown ONCE and stored only in the secrets file.');
      console.log('⚠️  Never log, commit, or transmit the token value.');

    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err.message);
  process.exit(1);
});
