export async function onRequestPost({request, env}) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return Response.json({error:'Auth required'}, {status:401});
  const token = authHeader.replace('Bearer ','');
  const enc = new TextEncoder().encode(token);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  const tokenHash = Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  const session = await env.DB.prepare("SELECT * FROM sessions WHERE pi_access_token_hash=? AND expires_at>CURRENT_TIMESTAMP").bind(tokenHash).first();
  if (!session) return Response.json({error:'Invalid session'}, {status:401});
  const {paymentId, orderId} = await request.json();
  if (!paymentId || !orderId) return Response.json({error:'paymentId and orderId required'}, {status:400});
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id=? AND buyer_id=?").bind(orderId, session.user_id).first();
  if (!order) return Response.json({error:'Order not found'}, {status:404});
  await env.DB.prepare("UPDATE orders SET pi_payment_id=?, status='paid' WHERE id=?").bind(paymentId, orderId).run();
  await env.DB.prepare("INSERT INTO audit_log (id, actor_id, action, target_type, target_id) VALUES (?,?, 'payment_approved','order',?)").bind(crypto.randomUUID(), session.user_id, orderId).run();
  return Response.json({approved:true, paymentId, orderId});
}
