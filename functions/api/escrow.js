// Pi Village v2.6 Production - Secure Escrow - Fixes 12,13,22,23,24,25,30
async function hashToken(t){const enc=new TextEncoder().encode(t);const h=await crypto.subtle.digest('SHA-256',enc);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function auth(request, env){
  const h=request.headers.get('Authorization');
  if(!h) return null;
  const token=h.replace('Bearer ','');
  const th=await hashToken(token);
  return await env.DB.prepare("SELECT s.*, u.id as user_id, u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.pi_access_token_hash=? AND s.expires_at>CURRENT_TIMESTAMP").bind(th).first();
}
async function audit(env, actorId, action, targetType, targetId, oldV, newV, reason, ip){
  await env.DB.prepare("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, old_value, new_value, reason, ip_address) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), actorId, action, targetType, targetId, oldV?JSON.stringify(oldV):null, newV?JSON.stringify(newV):null, reason||null, ip||null).run();
}
export async function onRequestPost({request, env}) {
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const session=await auth(request, env);
  if(!session) return Response.json({error:'Auth required'}, {status:401});
  const body=await request.json();
  const {order_id, action, reason, evidence, resolution, tracking_number, delivery_proof} = body;
  if(!order_id || !action) return Response.json({error:'order_id and action required'}, {status:400});
  const order=await env.DB.prepare("SELECT o.*, s.owner_id as seller_id, s.section_id FROM orders o JOIN shops s ON o.shop_id=s.id WHERE o.id=?").bind(order_id).first();
  if(!order) return Response.json({error:'Order not found'}, {status:404});
  const escrow=await env.DB.prepare("SELECT * FROM escrow_transactions WHERE order_id=?").bind(order_id).first();
  if(!escrow) return Response.json({error:'Escrow not held'}, {status:404});
  const isBuyer=order.buyer_id===session.user_id;
  const isSeller=order.seller_id===session.user_id;
  const isAdmin=session.role==='admin';
  let isMod=isAdmin;
  if(session.role==='moderator'){
    const mod=await env.DB.prepare("SELECT * FROM moderators WHERE user_id=? AND (section_id=? OR can_resolve_all=TRUE)").bind(session.user_id, order.section_id).first();
    isMod=!!mod;
  }
  // FIX 13: Moderator section check enforced
  if(['cancelled','refunded','auto_released'].includes(order.status)) return Response.json({error:`Order ${order.status}`}, {status:400});
  if(escrow.status!=='held' && action!=='admin_resolve') return Response.json({error:`Escrow ${escrow.status}`}, {status:400});

  if(action==='buyer_confirm'){
    if(!isBuyer) return Response.json({error:'Only buyer'}, {status:403});
    if(!order.seller_delivered) return Response.json({error:'Not delivered yet'}, {status:400});
    if(order.buyer_confirmed) return Response.json({error:'Already confirmed'}, {status:400});
    // FIX 30: Check auto_released
    if(order.status==='auto_released') return Response.json({error:'Already auto-released after 72h'}, {status:400});
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET buyer_confirmed=TRUE WHERE id=?").bind(order_id),
      env.DB.prepare("UPDATE escrow_transactions SET buyer_approved=TRUE, last_action_by=? WHERE order_id=?").bind(session.user_id, order_id)
    ]);
    const upd=await env.DB.prepare("SELECT * FROM escrow_transactions WHERE order_id=?").bind(order_id).first();
    if(upd.buyer_approved && upd.seller_approved){
      await env.DB.batch([
        env.DB.prepare("UPDATE escrow_transactions SET status='released', released_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(order_id),
        env.DB.prepare("UPDATE orders SET status='completed' WHERE id=?").bind(order_id)
      ]);
      await audit(env, session.user_id, 'escrow_released_dual', 'order', order_id, escrow, upd, 'Buyer+Seller', ip);
      return Response.json({released:true});
    }
    await audit(env, session.user_id, 'buyer_confirm', 'order', order_id, order, {buyer_confirmed:true}, null, ip);
    return Response.json({waiting:true});
  }

  if(action==='seller_delivered'){
    if(!isSeller) return Response.json({error:'Only seller'}, {status:403});
    if(order.seller_delivered) return Response.json({error:'Already delivered'}, {status:400});
    // FIX 22: Require proof
    if(!tracking_number && !delivery_proof) return Response.json({error:'tracking_number or delivery_proof required'}, {status:400});
    const releaseAt=new Date(Date.now()+72*60*60*1000).toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE escrow_transactions SET seller_approved=TRUE, auto_release_after=?, last_action_by=? WHERE order_id=?").bind(releaseAt, session.user_id, order_id),
      env.DB.prepare("UPDATE orders SET seller_delivered=TRUE, delivered_at=CURRENT_TIMESTAMP, auto_release_at=?, tracking_number=?, delivery_proof=?, status='delivered' WHERE id=?").bind(releaseAt, tracking_number||null, delivery_proof||null, order_id)
    ]);
    await audit(env, session.user_id, 'seller_delivered', 'order', order_id, order, {tracking_number, delivery_proof, auto_release_at:releaseAt}, null, ip);
    return Response.json({delivered:true, auto_release_at:releaseAt});
  }

  if(action==='buyer_dispute'){
    if(!isBuyer) return Response.json({error:'Only buyer'}, {status:403});
    if(!reason || reason.trim().length<10) return Response.json({error:'Reason min 10 chars'}, {status:400});
    if(order.disputed) return Response.json({error:'Already disputed'}, {status:400});
    if(!order.seller_delivered) return Response.json({error:'Cannot dispute before delivery'}, {status:400});
    const disputeId=crypto.randomUUID();
    // FIX 24: Stop auto_release
    await env.DB.batch([
      env.DB.prepare("INSERT INTO disputes (id, order_id, raised_by, reason, evidence, status) VALUES (?,?,?,?,?,'open')").bind(disputeId, order_id, session.user_id, reason, evidence?JSON.stringify(evidence):null),
      env.DB.prepare("UPDATE orders SET disputed=TRUE, dispute_id=?, status='disputed', auto_release_at=NULL WHERE id=?").bind(disputeId, order_id),
      env.DB.prepare("UPDATE escrow_transactions SET status='disputed', auto_release_after=NULL WHERE order_id=?").bind(order_id)
    ]);
    await audit(env, session.user_id, 'dispute_opened', 'order', order_id, order, {dispute_id:disputeId}, reason, ip);
    return Response.json({disputed:true, dispute_id:disputeId, message:'Auto-release stopped'});
  }

  if(action==='admin_resolve'){
    if(!isMod) return Response.json({error:'Moderator only for your section'}, {status:403});
    if(!['buyer','seller','split'].includes(resolution)) return Response.json({error:'Invalid resolution'}, {status:400});
    if(!reason || reason.trim().length<10) return Response.json({error:'Reason required'}, {status:400});
    if(!order.disputed) return Response.json({error:'Not disputed'}, {status:400});
    // FIX 12: Split actually splits
    if(resolution==='buyer'){
      await env.DB.batch([
        env.DB.prepare("UPDATE escrow_transactions SET status='refunded', buyer_amount=?, seller_amount=0, last_action_by=? WHERE order_id=?").bind(escrow.amount_pi, session.user_id, order_id),
        env.DB.prepare("UPDATE orders SET status='refunded' WHERE id=?").bind(order_id),
        env.DB.prepare("UPDATE disputes SET status='resolved_buyer', resolution=?, resolution_reason=?, split_seller_percent=0, resolved_by=?, resolved_at=CURRENT_TIMESTAMP WHERE id=?").bind(resolution, reason, session.user_id, order.dispute_id)
      ]);
    } else if(resolution==='seller'){
      await env.DB.batch([
        env.DB.prepare("UPDATE escrow_transactions SET status='released', buyer_amount=0, seller_amount=?, released_at=CURRENT_TIMESTAMP, last_action_by=? WHERE order_id=?").bind(escrow.amount_pi, session.user_id, order_id),
        env.DB.prepare("UPDATE orders SET status='completed' WHERE id=?").bind(order_id),
        env.DB.prepare("UPDATE disputes SET status='resolved_seller', resolution=?, resolution_reason=?, split_seller_percent=100, resolved_by=?, resolved_at=CURRENT_TIMESTAMP WHERE id=?").bind(resolution, reason, session.user_id, order.dispute_id)
      ]);
    } else {
      const half=escrow.amount_pi/2;
      // FIX 12 & 25: Split with percentages and audit
      await env.DB.batch([
        env.DB.prepare("UPDATE escrow_transactions SET status='split', buyer_amount=?, seller_amount=?, released_at=CURRENT_TIMESTAMP, last_action_by=? WHERE order_id=?").bind(half, half, session.user_id, order_id),
        env.DB.prepare("UPDATE orders SET status='completed' WHERE id=?").bind(order_id),
        env.DB.prepare("UPDATE disputes SET status='resolved_split', resolution=?, resolution_reason=?, split_seller_percent=50, resolved_by=?, resolved_at=CURRENT_TIMESTAMP WHERE id=?").bind(resolution, reason, session.user_id, order.dispute_id),
        env.DB.prepare("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, new_value, reason, ip_address) VALUES (?,?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), session.user_id, 'split_transfer', 'order', order_id, JSON.stringify({buyer_refund:half, seller_release:half, percent:50}), reason, ip)
      ]);
    }
    await audit(env, session.user_id, `dispute_resolved_${resolution}`, 'order', order_id, order, {resolution, reason, split_percent: resolution==='split'?50: resolution==='seller'?100:0}, reason, ip);
    return Response.json({resolved:true, resolution, split: resolution==='split'?{buyer:escrow.amount_pi/2, seller:escrow.amount_pi/2, percent:50}:null});
  }
  return Response.json({error:'Invalid action'}, {status:400});
}
export async function onRequestGet({request, env}) {
  const authHeader=request.headers.get('Authorization');
  if(!authHeader) return Response.json({error:'Auth required'}, {status:401});
  const token=authHeader.replace('Bearer ','');
  const th=await hashToken(token);
  const session=await env.DB.prepare("SELECT s.*, u.id as user_id, u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.pi_access_token_hash=? AND s.expires_at>CURRENT_TIMESTAMP").bind(th).first();
  if(!session) return Response.json({error:'Invalid session'}, {status:401});
  const url=new URL(request.url);
  const orderId=url.searchParams.get('order_id');
  if(!orderId) return Response.json({error:'order_id required'}, {status:400});
  const order=await env.DB.prepare("SELECT o.*, s.owner_id as seller_id, s.section_id FROM orders o JOIN shops s ON o.shop_id=s.id WHERE o.id=?").bind(orderId).first();
  if(!order) return Response.json({error:'Not found'}, {status:404});
  let isMod=session.role==='admin';
  if(session.role==='moderator'){
    const mod=await env.DB.prepare("SELECT * FROM moderators WHERE user_id=? AND (section_id=? OR can_resolve_all=TRUE)").bind(session.user_id, order.section_id).first();
    isMod=!!mod;
  }
  if(order.buyer_id!==session.user_id && order.seller_id!==session.user_id && !isMod) return Response.json({error:'Forbidden'}, {status:403});
  // FIX 23: Sanitize sensitive data
  const escrow=await env.DB.prepare("SELECT id, order_id, amount_pi, status, buyer_approved, seller_approved, buyer_amount, seller_amount, released_at, auto_release_after FROM escrow_transactions WHERE order_id=?").bind(orderId).first();
  const dispute=order.dispute_id ? await env.DB.prepare("SELECT id, reason, evidence, status, resolution, resolution_reason, split_seller_percent FROM disputes WHERE id=?").bind(order.dispute_id).first() : null;
  const safeOrder={id:order.id, status:order.status, total_pi:order.total_pi, buyer_confirmed:order.buyer_confirmed, seller_delivered:order.seller_delivered, disputed:order.disputed, tracking_number:order.tracking_number, delivered_at:order.delivered_at, auto_release_at:order.auto_release_at};
  return Response.json({order:safeOrder, escrow, dispute});
}
