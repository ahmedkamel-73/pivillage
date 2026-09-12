async function hashToken(t){const enc=new TextEncoder().encode(t);const h=await crypto.subtle.digest('SHA-256',enc);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function auth(request, env){const h=request.headers.get('Authorization');if(!h) return null;const token=h.replace('Bearer ','');const th=await hashToken(token);return await env.DB.prepare("SELECT s.*, u.id as user_id FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.pi_access_token_hash=? AND s.expires_at>CURRENT_TIMESTAMP").bind(th).first();}
export async function onRequestGet({request, env}) {
  const url=new URL(request.url);
  const shopId=url.searchParams.get('shop_id');
  const section=url.searchParams.get('section_id');
  let sql="SELECT products.*, shops.name as shop_name FROM products JOIN shops ON products.shop_id=shops.id WHERE products.is_active=TRUE AND shops.is_active=TRUE";
  let params=[];
  if(shopId){sql+=" AND products.shop_id=?";params.push(shopId);}
  if(section){sql+=" AND shops.section_id=?";params.push(section);}
  sql+=" ORDER BY products.created_at DESC LIMIT 100";
  const {results}=await env.DB.prepare(sql).bind(...params).all();
  return Response.json({products:results});
}
export async function onRequestPost({request, env}) {
  const session=await auth(request, env);
  if(!session) return Response.json({error:'Auth required'}, {status:401});
  const {shop_id, name, description, price_pi, stock, images, delivery_type, is_digital} = await request.json();
  if(!shop_id || !name || !price_pi) return Response.json({error:'shop_id, name, price_pi required'}, {status:400});
  if(price_pi <=0) return Response.json({error:'price must >0'}, {status:400});
  const shop=await env.DB.prepare("SELECT * FROM shops WHERE id=? AND owner_id=?").bind(shop_id, session.user_id).first();
  if(!shop) return Response.json({error:'Shop not found or not yours'}, {status:403});
  const id=crypto.randomUUID();
  const product=await env.DB.prepare("INSERT INTO products (id, shop_id, name, description, price_pi, stock, images, delivery_type, is_digital) VALUES (?,?,?,?,?,?,?,?,?) RETURNING *")
    .bind(id, shop_id, name.trim(), description||null, price_pi, stock||0, images?JSON.stringify(images):null, delivery_type||'agreement', is_digital||false).first();
  await env.DB.prepare("INSERT INTO audit_log (id, actor_id, action, target_type, target_id) VALUES (?,?, 'product_created','product',?)").bind(crypto.randomUUID(), session.user_id, id).run();
  return Response.json(product,{status:201});
}
