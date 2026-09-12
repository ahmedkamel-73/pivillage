async function hashToken(t){const enc=new TextEncoder().encode(t);const h=await crypto.subtle.digest('SHA-256',enc);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function auth(request, env){const h=request.headers.get('Authorization');if(!h) return null;const token=h.replace('Bearer ','');const th=await hashToken(token);return await env.DB.prepare("SELECT s.*, u.id as user_id, u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.pi_access_token_hash=? AND s.expires_at>CURRENT_TIMESTAMP").bind(th).first();}
export async function onRequestGet({request, env}) {
  const url=new URL(request.url);
  const section=url.searchParams.get('section');
  const owner=url.searchParams.get('owner');
  const q=url.searchParams.get('q');
  let sql="SELECT shops.*, sections.name as section_name FROM shops LEFT JOIN sections ON shops.section_id=sections.id WHERE shops.is_active=TRUE";
  let params=[];
  if(section){sql+=" AND shops.section_id=?";params.push(section);}
  if(owner){sql+=" AND shops.owner_id=?";params.push(owner);}
  if(q){sql+=" AND shops.name LIKE ?";params.push(`%${q}%`);}
  sql+=" ORDER BY shops.sales_count DESC LIMIT 50";
  const {results}=await env.DB.prepare(sql).bind(...params).all();
  return Response.json({shops:results});
}
export async function onRequestPost({request, env}) {
  const session=await auth(request, env);
  if(!session) return Response.json({error:'Auth required'}, {status:401});
  const {name, section_id, section_name, description} = await request.json();
  if(!name || name.trim().length<2) return Response.json({error:'Name too short'}, {status:400});
  const slug=name.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-');
  if(!slug) return Response.json({error:'Invalid slug'}, {status:400});
  let finalSectionId=section_id;
  if(!finalSectionId && section_name){
    const sName=section_name.trim();
    const sSlug=sName.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\s-]/g,'').replace(/\s+/g,'-');
    let sec=await env.DB.prepare("SELECT * FROM sections WHERE slug=?").bind(sSlug).first();
    if(!sec){
      sec=await env.DB.prepare("INSERT INTO sections (id, name, slug, created_by) VALUES (?,?,?,?) RETURNING *").bind(crypto.randomUUID(), sName, sSlug, session.user_id).first();
    }
    finalSectionId=sec.id;
  }
  try{
    const id=crypto.randomUUID();
    const shop=await env.DB.prepare("INSERT INTO shops (id, owner_id, section_id, name, slug, description) VALUES (?,?,?,?,?,?) RETURNING *").bind(id, session.user_id, finalSectionId||null, name.trim(), slug, description||null).first();
    if(finalSectionId) await env.DB.prepare("UPDATE sections SET shops_count=shops_count+1 WHERE id=?").bind(finalSectionId).run();
    await env.DB.prepare("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, new_value) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), session.user_id, 'shop_created','shop',id,JSON.stringify({name})).run();
    return Response.json(shop,{status:201});
  }catch(e){ return Response.json({error:'Shop exists or invalid section'}, {status:409}); }
}
