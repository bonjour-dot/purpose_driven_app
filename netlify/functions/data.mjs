import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

const required = ['GOOGLE_CLIENT_ID', 'APPS_SCRIPT_URL', 'APP_GATEWAY_SHARED_SECRET'];
const allowedActions = new Set(['today','capture','task','completeTask','person','food','weight','exercise']);
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

function allowedOrigin(headers) {
  const origin = headers.origin || headers.Origin;
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  return !origin || allowed.includes(origin);
}

function signProof(claims, secret) {
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export default async (request) => {
  if (request.httpMethod !== 'POST') return json(405, { error: 'POST required' });
  if (!allowedOrigin(request.headers)) return json(403, { error: 'Origin is not allowed' });
  if (required.some(name => !process.env[name])) return json(500, { error: 'Server is not configured' });
  try {
    const { credential, action, payload = {} } = JSON.parse(request.body || '{}');
    if (typeof credential !== 'string' || !allowedActions.has(action) || !payload || typeof payload !== 'object') throw Error('Invalid request');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const user = ticket.getPayload();
    if (!user?.sub || !user.email_verified || !['accounts.google.com','https://accounts.google.com'].includes(user.iss)) throw Error('Google sign-in could not be verified');
    const now = Math.floor(Date.now() / 1000);
    const proof = signProof({ sub: user.sub, email: user.email, exp: now + 300, iat: now, nonce: crypto.randomUUID() }, process.env.APP_GATEWAY_SHARED_SECRET);
    const response = await fetch(process.env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ proof, action, payload }) });
    const result = await response.json();
    if (!response.ok || !result.ok) return json(502, { error: result.error || 'Storage service rejected the request' });
    return json(200, { ...result, user: { email: user.email } });
  } catch (error) {
    console.error('Purpose Driven API failure:', error.message);
    return json(401, { error: error.message === 'Invalid request' ? error.message : 'Authentication or storage request failed' });
  }
};

export { signProof, allowedOrigin };
