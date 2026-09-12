async function hashToken(t){const enc=new TextEncoder().encode(t);const h=await crypto.subtle.digest('SHA-256',enc);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function auth(request, env){const h=request.headers.get('Authorization');if(!h) return null;const token=h.replace('Bearer ','');const th=await hashToken(token);return await env.DB.prepare("SELECT s.*, u.id as user_id FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.pi_access_token_hash=? AND s.expires_at>CURRENT_TIMESTAMP").bind(th).first();}
export async function onRequestGet({request, env}) {
  const now=new Date().toISOString();
  const {results}=await env.DB.prepare("SELECT billboards.*, shops.name as shop_name FROM billboards JOIN shops ON billboards.shop_id=shops.id WHERE billboards.is_active=1 AND billboards.starts_at <= ? AND billboards.ends_at > ? ORDER BY billboards.type DESC LIMIT 20").bind(now, now).all();
  return Response.json({billboards:results});
}
export async function onRequestPost({request, env}) {
  const session=await auth(request, env);
  if(!session) return Response.json({error:'Auth required'}, {status:401});
  const {shop_id, type, days} = await request.json();
  if(!shop_id || !days || days<=0) return Response.json({error:'shop_id and days required'}, {status:400});
  const shop=await env.DB.prepare("SELECT * FROM shops WHERE id=? AND owner_id=?").bind(shop_id, session.user_id).first();
  if(!shop) return Response.json({error:'Shop not found'}, {status:403});
  const prices={normal:0.1, '3d':0.5, sponsored:0.1};
  const pricePerDay=prices[type||'normal']||0.1;
  if(type==='3d' && days!==3) return Response.json({error:'3D building must be 3 days'}, {status:400});
  const startsAt=new Date().toISOString();
  const endsAt=new Date(Date.now()+days*24*60*60*1000).toISOString();
  const id=crypto.randomUUID();
  const billboard=await env.DB.prepare("INSERT INTO billboards (id, shop_id, type, price_per_day, starts_at, ends_at) VALUES (?,?,?,?,?,?) RETURNING *").bind(id, shop_id, type||'normal', pricePerDay, startsAt, endsAt).first();
  await env.DB.prepare("INSERT INTO audit_log (id, actor_id, action, target_type, target_id) VALUES (?,?, 'billboard_created','billboard',?)").bind(crypto.randomUUID(), session.user_id, id).run();
  return Response.json({billboard, cost: pricePerDay*days}, {status:201});
}
