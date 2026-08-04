/**
 * Stale Reservation Reconciler
 *
 * Finds reservations that are:
 * - status = 'reserved'
 * - expires_at < now()
 *
 * And releases them (sets status = 'released'), returning budget capacity to the project.
 *
 * Safe for repeated execution (idempotent): only touches rows matching the WHERE clause.
 */

import { pool } from '../infrastructure/database.js';

export interface ReconciliationResult {
  staleDetected: number;
  staleResolved: number;
  releasedIds: string[];
  errors: string[];
}

export async function reconcileStaleReservations(): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    staleDetected: 0,
    staleResolved: 0,
    releasedIds: [],
    errors: [],
  };

  // Find all stale reservations (status='reserved' and expires_at in the past)
  const staleRows = await pool.query(
    `SELECT id, project_id, translation_run_id, estimated_amount
     FROM aidilam_app.translation_budget_reservations
     WHERE status = 'reserved' AND expires_at < now()
     ORDER BY expires_at ASC`,
  );

  result.staleDetected = staleRows.rows.length;

  for (const row of staleRows.rows) {
    try {
      // Use conditional update to avoid race with worker that might commit it
      const updateResult = await pool.query(
        `UPDATE aidilam_app.translation_budget_reservations
         SET status = 'released', updated_at = now()
         WHERE id = $1 AND status = 'reserved'
         RETURNING id`,
        [row.id],
      );

      if (updateResult.rowCount && updateResult.rowCount > 0) {
        result.staleResolved++;
        result.releasedIds.push(row.id);
      }
    } catch (err) {
      result.errors.push(`Failed to release ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].includes('reconcile-stale-reservations')) {
  reconcileStaleReservations()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Reconciliation failed:', err);
      process.exit(1);
    });
}
