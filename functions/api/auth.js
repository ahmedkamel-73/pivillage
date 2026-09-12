async function hashToken(token) {
  const enc = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}
async function checkRateLimit(env, key, limit=5, windowSec=60) {
  const windowStart = new Date(Date.now() - windowSec*1000).toISOString();
  await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(windowStart).run();
  const existing = await env.DB.prepare("SELECT SUM(count) as total FROM rate_limits WHERE key=? AND window_start > ?").bind(key, windowStart).first();
  if (existing && existing.total >= limit) return false;
  await env.DB.prepare("INSERT INTO rate_limits (id, key, count, window_start) VALUES (?,?,1,CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), key).run();
  return true;
}
export async function onRequestPost({request, env}) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await checkRateLimit(env, `auth:${ip}`, 5, 60)) return Response.json({error:'Too many login attempts'}, {status:429});
  const {pi_uid, pi_username, pi_access_token, wallet_address} = await request.json();
  if (!pi_uid || !pi_access_token) return Response.json({error:'Missing pi_uid or pi_access_token'}, {status:400});
  let piUser;
  try {
    const piRes = await fetch('https://api.minepi.com/v2/me', { headers: { 'Authorization': `Bearer ${pi_access_token}` } });
    if (!piRes.ok) return Response.json({error:'Invalid Pi token'}, {status:401});
    piUser = await piRes.json();
    if (piUser.uid !== pi_uid) return Response.json({error:'pi_uid mismatch'}, {status:401});
  } catch (e) {
    if (env.NODE_ENV === 'production') return Response.json({error:'Pi API failed'}, {status:401});
    piUser = { uid: pi_uid, username: pi_username };
  }
  let user = await env.DB.prepare("SELECT * FROM users WHERE pi_uid=?").bind(pi_uid).first();
  if (!user) {
    user = await env.DB.prepare("INSERT INTO users (id, pi_uid, pi_username, wallet_address, role) VALUES (?,?,?,?,'pioneer') RETURNING *").bind(crypto.randomUUID(), pi_uid, pi_username || piUser.username, wallet_address).first();
  }
  await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id).run();
  const tokenHash = await hashToken(pi_access_token);
  const last4 = pi_access_token.slice(-4);
  const expiresAt = new Date(Date.now()+7*24*60*60*1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, pi_access_token_hash, pi_access_token_last4, pi_uid, ip_address, expires_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), user.id, tokenHash, last4, pi_uid, ip, expiresAt).run();
  await env.DB.prepare("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, ip_address) VALUES (?,?, 'login','user',?,?)").bind(crypto.randomUUID(), user.id, user.id, ip).run();
  return Response.json({user, session_token: pi_access_token, expires_at: expiresAt});
}
export async function onRequestDelete({request, env}) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return Response.json({error:'Auth required'}, {status:401});
  const token = authHeader.replace('Bearer ','');
  const enc = new TextEncoder().encode(token);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  const tokenHash = Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare("DELETE FROM sessions WHERE pi_access_token_hash=?").bind(tokenHash).run();
  return Response.json({logged_out:true});
}
export async function onRequestGet({request, env}) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return Response.json({error:'Auth required'}, {status:401});
  const token = authHeader.replace('Bearer ','');
  const enc = new TextEncoder().encode(token);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  const tokenHash = Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  const session = await env.DB.prepare("SELECT s.*, u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.pi_access_token_hash=? AND s.expires_at>CURRENT_TIMESTAMP").bind(tokenHash).first();
  if (!session) return Response.json({error:'Invalid session'}, {status:401});
  return Response.json({user: session});
}
