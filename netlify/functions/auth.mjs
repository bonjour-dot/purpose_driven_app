import { OAuth2Client } from 'google-auth-library';
import { allowedOrigin, cookie, env, json, session, sign } from '../lib/http.mjs';

export default async request => {
  if (request.method === 'GET') { const user = session(request); return user ? json(200, { user: { email: user.email } }) : json(401, { error: 'Sign in required' }); }
  if (!['POST', 'DELETE'].includes(request.method)) return json(405, { error: 'Method not allowed' });
  if (!allowedOrigin(request)) return json(403, { error: 'Origin is not allowed' });
  if (request.method === 'DELETE') return json(200, { ok: true }, { 'Set-Cookie': cookie('__Host-pd_session', '', 0) });
  if (!env('GOOGLE_CLIENT_ID') || !env('APP_SESSION_SECRET')) return json(503, { error: 'Google sign-in is not configured' });
  try {
    const { credential } = await request.json();
    if (typeof credential !== 'string' || credential.length < 20) throw Error('Invalid credential');
    const ticket = await new OAuth2Client(env('GOOGLE_CLIENT_ID')).verifyIdToken({ idToken: credential, audience: env('GOOGLE_CLIENT_ID') });
    const user = ticket.getPayload();
    if (!user?.sub || !user.email || !user.email_verified || !['accounts.google.com', 'https://accounts.google.com'].includes(user.iss)) throw Error('Invalid Google identity');
    const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
    return json(200, { user: { email: user.email } }, { 'Set-Cookie': cookie('__Host-pd_session', sign({ sub: user.sub, email: user.email, exp }, env('APP_SESSION_SECRET')), 30 * 86400) });
  } catch { return json(401, { error: 'Google sign-in could not be verified' }); }
};
