exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}

  const { refresh_token } = body;

  if (!refresh_token) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'refresh_token manquant' }) };
  }

  const clientId     = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const credentials  = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refresh_token)}`
    });

    const data = await res.json();

    if (data.error) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: data.error_description || data.error, code: 'REFRESH_FAILED' })
      };
    }

    const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        access_token:  data.access_token,
        refresh_token: data.refresh_token || refresh_token, // QBO rotates refresh tokens
        expires_at:    expiresAt
      })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
