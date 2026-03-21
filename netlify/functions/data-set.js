exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-app-password',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const appPassword = process.env.APP_PASSWORD;
  const provided = event.headers['x-app-password'];
  if (appPassword && provided !== appPassword) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Mot de passe incorrect' }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch(e) {}

  const { key, value } = body;
  if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: 'key manquant' }) };

  try {
    const token  = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    const siteId = process.env.NETLIFY_SITE_ID;

    if (!token || !siteId) {
      // No Blobs config — acknowledge without saving to cloud
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, fallback: true }) };
    }

    const url = `https://api.netlify.com/api/v1/blobs/${siteId}/ap-manager/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(value)
    });

    if (!res.ok) throw new Error(`API error ${res.status}`);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, key }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
