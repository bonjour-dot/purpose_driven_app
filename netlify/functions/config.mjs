const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// A browser OAuth client ID is intentionally public. Server secrets never leave Netlify.
export default async (request) => {
  if (request.method !== 'GET') return json(405, { error: 'GET required' });
  return json(200, { googleClientId: process.env.GOOGLE_CLIENT_ID || null });
};
