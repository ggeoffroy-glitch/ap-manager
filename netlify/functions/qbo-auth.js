exports.handler = async (event) => {
  const clientId     = process.env.QBO_CLIENT_ID;
  const redirectUri  = process.env.QBO_REDIRECT_URI;
  const clientName   = event.queryStringParameters?.client || '';

  if (!clientId || !redirectUri) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Variables d\'environnement manquantes: QBO_CLIENT_ID ou QBO_REDIRECT_URI' })
    };
  }

  // State encode client name + timestamp for CSRF protection
  const state = Buffer.from(JSON.stringify({
    client: clientName,
    ts: Date.now()
  })).toString('base64url');

  const scope  = 'com.intuit.quickbooks.accounting';
  const authUrl =
    `https://appcenter.intuit.com/connect/oauth2` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;

  return {
    statusCode: 302,
    headers: { Location: authUrl }
  };
};
