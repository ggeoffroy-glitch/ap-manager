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

  const { key } = event.queryStringParameters || {};
  if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: 'key manquant' }) };

  try {
    const token  = process.env.NETLIFY_API_TOKEN;
    const siteId = process.env.NETLIFY_SITE_ID;

    if (!token || !siteId) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, fallback: true }) };
    }

    const url = `https://api.netlify.com/api/v1/blobs/${siteId}/ap-manager/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
