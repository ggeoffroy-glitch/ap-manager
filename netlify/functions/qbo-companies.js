exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { access_token, realm_id } = event.queryStringParameters || {};

  if (!access_token) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'access_token manquant' }) };
  }

  const env     = process.env.QBO_ENVIRONMENT || 'production';
  const baseQBO = env === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';

  let companies = [];
  let userInfo  = {};

  // 1. Get user info
  try {
    const uiRes = await fetch('https://accounts.platform.intuit.com/v1/openid_connect/userinfo', {
      headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' }
    });
    if (uiRes.status === 401) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token expiré', code: 'TOKEN_EXPIRED' }) };
    }
    if (uiRes.ok) userInfo = await uiRes.json();
  } catch(e) {}

  // 2. Get the company name for the realmId from OAuth (most reliable method)
  // This is the company the user SELECTED during OAuth login
  if (realm_id) {
    try {
      const infoRes = await fetch(
        `${baseQBO}/v3/company/${realm_id}/companyinfo/${realm_id}?minorversion=65`,
        { headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' } }
      );
      if (infoRes.ok) {
        const info = await infoRes.json();
        const companyName = info?.CompanyInfo?.CompanyName || '';
        const country     = info?.CompanyInfo?.Country || 'CA';
        if (companyName) {
          companies.push({ name: companyName, realmId: realm_id, country, current: true });
        }
      }
    } catch(e) {}
  }

  // 3. Try Intuit platform API for all accessible companies (QBOA firm endpoint)
  const firmEndpoints = [
    'https://accounts.platform.intuit.com/v1/openid_connect/userinfo',
    'https://qbo.intuit.com/manage/qbomanager_proxy/v1/userCompanies',
  ];

  for (const endpoint of firmEndpoints) {
    try {
      const r = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' }
      });
      if (!r.ok) continue;
      const d = await r.json();

      // Try all known response shapes for QBOA company lists
      const raw = d?.CompanyList?.Company ||
                  d?.companies           ||
                  d?.data                ||
                  d?.Entities            ||
                  (Array.isArray(d) ? d : []);

      if (raw.length > 0) {
        const fetched = raw.map(c => ({
          name:    c.CompanyName || c.companyName || c.name || c.Name || 'Sans nom',
          realmId: String(c.CompanyId || c.realmId || c.id || c.Id || ''),
          country: c.Country || 'CA',
        })).filter(c => c.realmId && c.realmId !== realm_id); // avoid duplicate

        companies = [...companies, ...fetched];
        if (fetched.length > 0) break;
      }
    } catch(e) {}
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      companies,
      needsManual: companies.length === 0,
      user: { name: userInfo?.givenname || '', email: userInfo?.email || '' },
      count: companies.length
    })
  };
};
