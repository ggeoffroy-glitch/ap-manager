exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-app-password',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Password check
  const appPassword = process.env.APP_PASSWORD;
  const provided = event.headers['x-app-password'];
  if (appPassword && provided !== appPassword) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Mot de passe incorrect' }) };
  }

  const { key } = event.queryStringParameters || {};
  if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: 'key manquant' }) };

  try {
    // Netlify Blobs REST API — token is auto-injected in Functions context
    const token  = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    const siteId = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;

    if (!token || !siteId) {
      return { statusCode: 200, headers, body: JSON.stringify({ data: null, exists: false, fallback: true }) };
    }

    const url = `https://api.netlify.com/api/v1/blobs/${siteId}/ap-manager/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 404) {
      return { statusCode: 200, headers, body: JSON.stringify({ data: null, exists: false }) };
    }

    if (!res.ok) throw new Error(`API error ${res.status}`);

    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch(e) { data = text; }

    return { statusCode: 200, headers, body: JSON.stringify({ data, exists: true }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
