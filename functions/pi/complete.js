export async function onRequestPost({request, env}) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return Response.json({error:'Auth required'}, {status:401});
  const token = authHeader.replace('Bearer ','');
  const enc = new TextEncoder().encode(token);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  const tokenHash = Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  const session = await env.DB.prepare("SELECT * FROM sessions WHERE pi_access_token_hash=? AND expires_at>CURRENT_TIMESTAMP").bind(tokenHash).first();
  if (!session) return Response.json({error:'Invalid session'}, {status:401});
  const {paymentId, orderId, txid} = await request.json();
  if (!paymentId || !orderId) return Response.json({error:'paymentId and orderId required'}, {status:400});
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id=? AND buyer_id=?").bind(orderId, session.user_id).first();
  if (!order) return Response.json({error:'Order not found'}, {status:404});
  try {
    const piRes = await fetch(`https://api.minepi.com/v2/payments/${paymentId}`, { headers: { Authorization: `Key ${env.PI_API_KEY}` } });
    if (env.NODE_ENV === 'production' && !piRes.ok) return Response.json({error:'Pi verification failed'}, {status:400});
  } catch (e) {
    if (env.NODE_ENV === 'production') return Response.json({error:'Pi API error'}, {status:502});
  }
  const existingEscrow = await env.DB.prepare("SELECT * FROM escrow_transactions WHERE order_id=?").bind(orderId).first();
  if (existingEscrow && existingEscrow.status === 'disputed') return Response.json({error:'Cannot complete - disputed'}, {status:400});
  if (existingEscrow) {
    await env.DB.prepare("UPDATE escrow_transactions SET pi_payment_id=?, amount_pi=?, status='held', auto_release_after=NULL WHERE order_id=? AND status!='disputed'").bind(paymentId, order.total_pi, orderId).run();
  } else {
    await env.DB.prepare("INSERT INTO escrow_transactions (id, order_id, amount_pi, pi_payment_id, status, auto_release_after) VALUES (?,?,?,?, 'held', NULL)").bind(crypto.randomUUID(), orderId, order.total_pi, paymentId).run();
  }
  await env.DB.prepare("UPDATE orders SET pi_payment_id=?, pi_txid=?, status='paid' WHERE id=?").bind(paymentId, txid||null, orderId).run();
  await env.DB.prepare("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, new_value) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), session.user_id, 'payment_completed', 'order', orderId, JSON.stringify({paymentId, txid})).run();
  return Response.json({completed:true, escrow:true, message:'Held - 72h starts after delivery'});
}
