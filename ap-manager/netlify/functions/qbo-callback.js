exports.handler = async (event) => {
  const siteUrl     = process.env.URL || 'http://localhost:8888';
  const clientId    = process.env.QBO_CLIENT_ID;
  const clientSecret= process.env.QBO_CLIENT_SECRET;
  const redirectUri = process.env.QBO_REDIRECT_URI;

  const { code, state, realmId, error } = event.queryStringParameters || {};

  // User denied access
  if (error) {
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/#qbo_error=${encodeURIComponent(error)}` }
    };
  }

  if (!code || !realmId) {
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/#qbo_error=${encodeURIComponent('Code d\'autorisation manquant')}` }
    };
  }

  // Decode state to recover client name
  let clientName = '';
  try {
    const decoded = JSON.parse(Buffer.from(decodeURIComponent(state), 'base64url').toString());
    clientName = decoded.client || '';
  } catch (e) {
    // State decode failed — non-blocking
  }

  // Exchange authorization code for access + refresh tokens
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      return {
        statusCode: 302,
        headers: {
          Location: `${siteUrl}/#qbo_error=${encodeURIComponent(tokens.error_description || tokens.error)}`
        }
      };
    }

    // Pass tokens back to frontend via URL hash (never logged server-side)
    const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;

    const hash = new URLSearchParams({
      qbo_access_token:  tokens.access_token,
      qbo_refresh_token: tokens.refresh_token,
      qbo_realm_id:      realmId,
      qbo_client:        clientName,
      qbo_expires_at:    expiresAt.toString()
    }).toString();

    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/#${hash}` }
    };

  } catch (err) {
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/#qbo_error=${encodeURIComponent(err.message)}` }
    };
  }
};
