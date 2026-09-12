async function hashToken(t){const enc=new TextEncoder().encode(t);const h=await crypto.subtle.digest('SHA-256',enc);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function auth(request, env){const h=request.headers.get('Authorization');if(!h) return null;const token=h.replace('Bearer ','');const th=await hashToken(token);return await env.DB.prepare("SELECT s.*, u.id as user_id, u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.pi_access_token_hash=? AND s.expires_at>CURRENT_TIMESTAMP").bind(th).first();}
export async function onRequestGet({request, env}) {
  const session=await auth(request, env);
  if(!session) return Response.json({error:'Auth required'}, {status:401});
  const url=new URL(request.url);
  const type=url.searchParams.get('type')||'buyer';
  if(type==='seller'){
    const {results}=await env.DB.prepare("SELECT orders.*, shops.name as shop_name FROM orders JOIN shops ON orders.shop_id=shops.id WHERE shops.owner_id=? ORDER BY orders.created_at DESC LIMIT 100").bind(session.user_id).all();
    return Response.json({orders:results});
  } else {
    const {results}=await env.DB.prepare("SELECT orders.*, shops.name as shop_name FROM orders JOIN shops ON orders.shop_id=shops.id WHERE orders.buyer_id=? ORDER BY orders.created_at DESC LIMIT 100").bind(session.user_id).all();
    return Response.json({orders:results});
  }
}
export async function onRequestPost({request, env}) {
  const session=await auth(request, env);
  if(!session) return Response.json({error:'Auth required'}, {status:401});
  const {shop_id, items} = await request.json();
  if(!shop_id || !items || !Array.isArray(items) || items.length===0) return Response.json({error:'shop_id and items required'}, {status:400});
  const shop=await env.DB.prepare("SELECT * FROM shops WHERE id=? AND is_active=1").bind(shop_id).first();
  if(!shop) return Response.json({error:'Shop not found'}, {status:404});
  if(shop.owner_id===session.user_id) return Response.json({error:'Cannot buy from own shop'}, {status:400});
  let total=0;
  for(const it of items){
    if(!it.product_id || !it.quantity || it.quantity<=0) return Response.json({error:'Invalid item'}, {status:400});
    const prod=await env.DB.prepare("SELECT * FROM products WHERE id=? AND shop_id=? AND is_active=1").bind(it.product_id, shop_id).first();
    if(!prod) return Response.json({error:`Product ${it.product_id} not found`}, {status:404});
    if(prod.stock < it.quantity) return Response.json({error:`Insufficient stock for ${prod.name}`}, {status:400});
    total+=prod.price_pi * it.quantity;
  }
  if(total<=0) return Response.json({error:'Total must >0'}, {status:400});
  const orderId=crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO orders (id, buyer_id, shop_id, total_pi, status) VALUES (?,?,?,?, 'pending')").bind(orderId, session.user_id, shop_id, total),
    ...items.map(it=> env.DB.prepare("INSERT INTO order_items (id, order_id, product_id, quantity, price_pi) VALUES (?,?,?,?, (SELECT price_pi FROM products WHERE id=?))").bind(crypto.randomUUID(), orderId, it.product_id, it.quantity, it.product_id)),
  ]);
  for(const it of items){
    await env.DB.prepare("UPDATE products SET stock=stock-? WHERE id=?").bind(it.quantity, it.product_id).run();
  }
  await env.DB.prepare("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, new_value) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), session.user_id, 'order_created','order',orderId,JSON.stringify({total, items})).run();
  return Response.json({order_id:orderId, total_pi:total, message:'Order created - proceed to Pi payment'}, {status:201});
}
export async function onRequestDelete({request, env}) {
  const session=await auth(request, env);
  if(!session) return Response.json({error:'Auth required'}, {status:401});
  const url=new URL(request.url);
  const orderId=url.searchParams.get('order_id');
  if(!orderId) return Response.json({error:'order_id required'}, {status:400});
  const order=await env.DB.prepare("SELECT * FROM orders WHERE id=? AND buyer_id=? AND status='pending'").bind(orderId, session.user_id).first();
  if(!order) return Response.json({error:'Order not found or cannot cancel'}, {status:404});
  await env.DB.prepare("UPDATE orders SET status='cancelled' WHERE id=?").bind(orderId).run();
  return Response.json({cancelled:true});
}
