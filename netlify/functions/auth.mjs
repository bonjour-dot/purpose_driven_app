import { OAuth2Client } from 'google-auth-library';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

function allowedOrigin(headers) {
  const origin = headers.get('origin');
  const configured = (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return !origin || configured.includes(origin);
}

export default async request => {
  if (request.method !== 'POST') return json(405, { error: 'POST required' });
  if (!allowedOrigin(request.headers)) return json(403, { error: 'Origin is not allowed' });
  if (!process.env.GOOGLE_CLIENT_ID) return json(500, { error: 'Google authentication is not configured' });
  try {
    const { credential } = await request.json();
    if (typeof credential !== 'string' || credential.length < 20) throw Error('Invalid credential');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const user = ticket.getPayload();
    if (!user?.sub || !user.email || !user.email_verified || !['accounts.google.com', 'https://accounts.google.com'].includes(user.iss)) throw Error('Google sign-in could not be verified');
    return json(200, { user: { email: user.email } });
  } catch (error) {
    console.error('Purpose Driven authentication failure:', error.message);
    return json(401, { error: 'Google sign-in could not be verified' });
  }
};

export { allowedOrigin };
