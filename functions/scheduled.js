// Pi Village v2.6 - Cron Auto-release - Fixes 26,27,28,29
export async function scheduled(event, env, ctx) {
  const start=Date.now();
  let processed=0, failed=0;
  console.log(`[CRON] Starting auto-release check at ${new Date().toISOString()}`);
  try {
    // FIX 28: LIMIT 100 to avoid CPU timeout
    const {results}=await env.DB.prepare("SELECT o.id, e.id as escrow_id, o.buyer_id FROM orders o JOIN escrow_transactions e ON o.id=e.order_id WHERE o.status='delivered' AND o.disputed=FALSE AND e.status='held' AND e.auto_release_after <= CURRENT_TIMESTAMP AND o.auto_release_at IS NOT NULL ORDER BY e.auto_release_after ASC LIMIT 100").all();
    console.log(`[CRON] Found ${results.length} orders to auto-release`);
    for (const r of results) {
      try {
        // FIX 26: Error handling per order
        await env.DB.batch([
          env.DB.prepare("UPDATE escrow_transactions SET status='released', released_at=CURRENT_TIMESTAMP, last_action_by=NULL WHERE id=?").bind(r.escrow_id),
          env.DB.prepare("UPDATE orders SET status='auto_released' WHERE id=?").bind(r.id),
          // FIX 27: actor_id NULL documented as system, but set action as system
          env.DB.prepare("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, new_value, reason) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), null, 'auto_released_72h', 'order', r.id, JSON.stringify({auto:true, after:'72h', buyer_id:r.buyer_id}), 'System auto-release after 72h no dispute')
        ]);
        processed++;
        console.log(`[CRON] Auto-released ${r.id}`);
      } catch (e) {
        failed++;
        console.error(`[CRON] Failed ${r.id}:`, e);
        // Continue to next - FIX 26
      }
    }
  } catch (e) {
    console.error('[CRON] Fatal error:', e);
  }
  // FIX 29: Logging
  const duration=Date.now()-start;
  console.log(`[CRON] Finished - processed: ${processed}, failed: ${failed}, duration: ${duration}ms`);
}
