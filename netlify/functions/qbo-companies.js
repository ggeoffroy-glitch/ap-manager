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

  // 2. Try QBOA firm endpoints to list all companies
  const firmEndpoints = [
    'https://qbo.intuit.com/manage/qbomanager_proxy/v1/userCompanies',
    'https://qbo.intuit.com/qbo1/rest/primecustomer/v1/companies',
  ];

  for (const endpoint of firmEndpoints) {
    if (companies.length > 0) break;
    try {
      const r = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' }
      });
      if (!r.ok) continue;
      const d = await r.json();
      const raw = d?.CompanyList?.Company || d?.companies || d?.data || d?.Entities || (Array.isArray(d) ? d : []);
      if (raw.length > 0) {
        companies = raw.map(c => ({
          name:    c.CompanyName || c.companyName || c.name || c.Name || 'Sans nom',
          realmId: String(c.CompanyId || c.realmId || c.id || c.Id || ''),
          country: c.Country || 'CA',
        })).filter(c => c.realmId);
      }
    } catch(e) {}
  }

  // 3. Get the specific company info from the OAuth realmId
  if (realm_id) {
    try {
      const infoRes = await fetch(
        `${baseQBO}/v3/company/${realm_id}/companyinfo/${realm_id}?minorversion=65`,
        { headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' } }
      );
      if (infoRes.ok) {
        const info = await infoRes.json();
        const companyName = info?.CompanyInfo?.CompanyName || '';
        if (companyName && !companies.find(c => c.realmId === realm_id)) {
          companies.unshift({ name: companyName, realmId: realm_id, country: 'CA', current: true });
        }
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
