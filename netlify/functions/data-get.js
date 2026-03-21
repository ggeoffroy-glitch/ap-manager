const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-app-password',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Password check
  const appPassword = process.env.APP_PASSWORD;
  const provided    = event.headers['x-app-password'];
  if (appPassword && provided !== appPassword) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Mot de passe incorrect' }) };
  }

  const { key } = event.queryStringParameters || {};
  if (!key) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Paramètre "key" manquant' }) };
  }

  try {
    const store = getStore({ name: 'ap-manager', consistency: 'strong' });
    const value = await store.get(key, { type: 'json' });

    if (value === null) {
      return { statusCode: 200, headers, body: JSON.stringify({ data: null, exists: false }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: value, exists: true })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
