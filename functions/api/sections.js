async function hashToken(t){const enc=new TextEncoder().encode(t);const h=await crypto.subtle.digest('SHA-256',enc);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function auth(request, env){const h=request.headers.get('Authorization');if(!h) return null;const token=h.replace('Bearer ','');const th=await hashToken(token);return await env.DB.prepare("SELECT s.*, u.id as user_id FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.pi_access_token_hash=? AND s.expires_at>CURRENT_TIMESTAMP").bind(th).first();}
async function checkRateLimit(env, key, limit=10, windowSec=60){
  const ws=new Date(Date.now()-windowSec*1000).toISOString();
  await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(ws).run();
  const ex=await env.DB.prepare("SELECT SUM(count) as total FROM rate_limits WHERE key=? AND window_start > ?").bind(key, ws).first();
  if(ex && ex.total>=limit) return false;
  await env.DB.prepare("INSERT INTO rate_limits (id, key, count, window_start) VALUES (?,?,1,CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), key).run();
  return true;
}
export async function onRequestGet({request, env}) {
  const url=new URL(request.url);
  const q=url.searchParams.get('q')||'';
  const query=q ? "SELECT * FROM sections WHERE name LIKE ? ORDER BY shops_count DESC" : "SELECT * FROM sections ORDER BY shops_count DESC";
  const params=q ? [`%${q}%`] : [];
  const {results}=await env.DB.prepare(query).bind(...params).all();
  return Response.json({sections:results, canCreate:!!q});
}
export async function onRequestPost({request, env}) {
  const session=await auth(request, env);
  if(!session) return Response.json({error:'Auth required'}, {status:401});
  // FIX 35: Rate limiting on section creation
  if(!await checkRateLimit(env, `section_create:${session.user_id}`, 5, 3600)) return Response.json({error:'Too many sections created - max 5 per hour'}, {status:429});
  const {name}=await request.json();
  if(!name || name.trim().length<2) return Response.json({error:'Name too short'}, {status:400});
  if(name.trim().length>50) return Response.json({error:'Name too long'}, {status:400});
  // FIX 36: Proper slug sanitization - allow Arabic and alphanumeric only
  let slug=name.trim().toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/g,'') // remove special chars
    .replace(/\s+/g,'-')
    .replace(/-+/g,'-')
    .replace(/^-|-$/g,'');
  if(!slug || slug.length<2) return Response.json({error:'Invalid slug after sanitization'}, {status:400});
  try{
    const id=crypto.randomUUID();
    const section=await env.DB.prepare("INSERT INTO sections (id, name, slug, created_by) VALUES (?,?,?,?) RETURNING *").bind(id, name.trim(), slug, session.user_id).first();
    await env.DB.prepare("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, new_value) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), session.user_id, 'section_created','section',id,JSON.stringify({name})).run();
    return Response.json(section,{status:201});
  }catch(e){ return Response.json({error:'Section exists'}, {status:409}); }
}
