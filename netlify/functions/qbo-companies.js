exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { access_token } = event.queryStringParameters || {};

  if (!access_token) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'access_token manquant' })
    };
  }

  try {
    // Fetch all companies the accountant has access to via Intuit Platform API
    const res = await fetch(
      'https://accounts.platform.intuit.com/v1/openid_connect/userinfo',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!res.ok) {
      if (res.status === 401) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Token expiré', code: 'TOKEN_EXPIRED' })
        };
      }
      throw new Error(`Intuit API error: ${res.status}`);
    }

    const userInfo = await res.json();

    // Also fetch the list of all companies via the QBO firm API
    const companiesRes = await fetch(
      'https://accounts.platform.intuit.com/v1/openid_connect/userinfo',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept': 'application/json'
        }
      }
    );

    // Try to get all realmIds the user has access to
    // For QBOA, fetch company list from the firm management endpoint
    const firmRes = await fetch(
      'https://qbo.intuit.com/manage/qbomanager_proxy/v1/userCompanies',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    let companies = [];

    if (firmRes.ok) {
      const firmData = await firmRes.json();
      // Extract companies from QBOA firm response
      const rawCompanies = firmData?.CompanyList?.Company ||
                           firmData?.companies ||
                           firmData?.data ||
                           [];

      companies = rawCompanies.map(c => ({
        name:    c.CompanyName || c.name || c.companyName || 'Unnamed',
        realmId: c.CompanyId   || c.realmId || c.id || '',
        country: c.Country     || c.country || 'CA',
        active:  c.IsActive !== false
      })).filter(c => c.realmId && c.active);
    }

    // Fallback: if firm API didn't work, return at least the current user's company
    if (companies.length === 0 && userInfo) {
      companies = [{
        name:    userInfo.givenname || userInfo.name || userInfo.email || 'Mon entreprise',
        realmId: '', // Will need manual realm_id entry
        country: 'CA',
        active:  true,
        note:    'Entrez le Realm ID manuellement'
      }];
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        companies,
        user: {
          name:  userInfo?.givenname || '',
          email: userInfo?.email || ''
        },
        count: companies.length
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
