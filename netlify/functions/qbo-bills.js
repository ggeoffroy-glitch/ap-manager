exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { access_token, realm_id, days_back } = event.queryStringParameters || {};

  if (!access_token || !realm_id) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Paramètres manquants: access_token et realm_id requis' })
    };
  }

  const env     = process.env.QBO_ENVIRONMENT || 'production';
  const baseUrl = env === 'sandbox'
    ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${realm_id}`
    : `https://quickbooks.api.intuit.com/v3/company/${realm_id}`;

  const daysBack   = parseInt(days_back) || 90;
  const fromDate   = new Date();
  fromDate.setDate(fromDate.getDate() - daysBack);
  const fromDateStr = fromDate.toISOString().slice(0, 10);

  const query = `SELECT * FROM Bill WHERE TxnDate >= '${fromDateStr}' ORDERBY DueDate ASC MAXRESULTS 200`;

  try {
    const res = await fetch(
      `${baseUrl}/query?query=${encodeURIComponent(query)}&minorversion=65`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      // Token expired
      if (res.status === 401) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token expiré', code: 'TOKEN_EXPIRED' }) };
      }
      return { statusCode: res.status, headers, body: JSON.stringify({ error: 'Erreur API QBO', details: errData }) };
    }

    const data  = await res.json();
    const bills = data.QueryResponse?.Bill || [];
    const transformed = bills.map(transformBill);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ bills: transformed, count: transformed.length, from: fromDateStr })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

// ─── Transform QBO Bill → AP Manager format ───────────────────────────────────
function transformBill(bill) {
  const firstLine = bill.Line?.find(l => l.DetailType === 'AccountBasedExpenseLineDetail');
  const accountName = firstLine?.AccountBasedExpenseLineDetail?.AccountRef?.name || '';
  const { code: glCode, nom: glNom } = mapQBOAccount(accountName);

  // Tax breakdown
  let subtotal = 0, tps = 0, tvq = 0;

  bill.Line?.forEach(line => {
    if (line.DetailType === 'AccountBasedExpenseLineDetail') {
      subtotal += line.Amount || 0;
    }
  });

  // Try to extract TPS/TVQ from TxnTaxDetail
  const taxLines = bill.TxnTaxDetail?.TaxLine || [];
  taxLines.forEach(tl => {
    const taxName = (tl.TaxLineDetail?.TaxRateRef?.name || '').toLowerCase();
    const amt     = tl.Amount || 0;
    if (taxName.includes('gst') || taxName.includes('tps')) tps += amt;
    else if (taxName.includes('qst') || taxName.includes('tvq')) tvq += amt;
  });

  // If taxes not separated, estimate from total
  if (tps === 0 && tvq === 0 && bill.TotalAmt > subtotal + 0.01) {
    const diff = bill.TotalAmt - subtotal;
    // Estimate: TPS ≈ 5/14.975 of total taxes, TVQ ≈ 9.975/14.975
    tps = Math.round((diff * (5 / 14.975)) * 100) / 100;
    tvq = Math.round((diff * (9.975 / 14.975)) * 100) / 100;
  }

  return {
    id: `qbo_${bill.Id}_${Date.now()}`,
    vendor:      bill.VendorRef?.name || 'Fournisseur inconnu',
    invoiceNum:  bill.DocNumber || `QB-${bill.Id}`,
    invDate:     bill.TxnDate  || new Date().toISOString().slice(0, 10),
    dueDate:     bill.DueDate  || addDays(bill.TxnDate, 30),
    glCode,
    glNom,
    description: firstLine?.Description || bill.PrivateNote || '',
    subtotal:    Math.round(subtotal * 100) / 100,
    tps:         Math.round(tps * 100) / 100,
    tvq:         Math.round(tvq * 100) / 100,
    total:       bill.TotalAmt || 0,
    notes:       `Synchronisé depuis QuickBooks — Solde: ${bill.Balance || 0} $`,
    paid:        (bill.Balance || 0) === 0,
    qboId:       bill.Id,
    source:      'quickbooks',
    createdAt:   new Date().toISOString()
  };
}

function addDays(dateStr, n) {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── QBO Account Name → GL Code mapping ──────────────────────────────────────
function mapQBOAccount(accountName) {
  const n = accountName.toLowerCase();
  const map = [
    { kw: ['cost of goods','coût des marchand','cogs'],                         code:'5000', nom:'Coût des marchandises vendues' },
    { kw: ['advertis','marketing','promot','publicité'],                         code:'6000', nom:'Publicité et marketing' },
    { kw: ['bank charge','bank fee','frais bancaire','interest','intérêt'],      code:'6010', nom:'Frais bancaires et intérêts' },
    { kw: ['insurance','assurance'],                                             code:'6020', nom:'Assurances' },
    { kw: ['meal','repas','restaurant','entertainment','représentation','divertis'], code:'6030', nom:'Repas et représentation' },
    { kw: ['office supply','fourniture','stationery','papeterie'],               code:'6040', nom:'Fournitures de bureau' },
    { kw: ['legal','professional fee','honoraire','accounting','comptab','audit'], code:'6050', nom:'Honoraires professionnels' },
    { kw: ['rent','loyer','lease','bail','occupation'],                          code:'6060', nom:'Loyer et occupation' },
    { kw: ['repair','réparation','maintenance','entretien'],                     code:'6070', nom:'Réparations et entretien' },
    { kw: ['salary','salaire','payroll','paie','wage','rémunération'],           code:'6080', nom:'Salaires et charges sociales' },
    { kw: ['phone','téléphone','internet','telecom','communicat','bell','vidéo'], code:'6090', nom:'Téléphone et communications' },
    { kw: ['travel','voyage','déplacement','transport','airfare','hôtel'],       code:'6100', nom:'Frais de déplacement' },
    { kw: ['utility','électricité','electricity','gas','gaz','water','eau','hydro'], code:'6110', nom:'Services publics' },
    { kw: ['vehicle','véhicule','automobile','car','auto','gas station'],        code:'6120', nom:'Frais de véhicule' },
    { kw: ['software','logiciel','technology','technolo','license','licence','saas','subscription','abonnement'], code:'6130', nom:'Logiciels et technologie' },
    { kw: ['subcontract','sous-traitant','consultant','contractor'],             code:'6140', nom:'Sous-traitants et consultants' },
    { kw: ['shipping','expédition','delivery','livraison','freight','fret','purolator','fedex','ups'], code:'6150', nom:'Expédition et livraison' },
    { kw: ['training','formation','education','éducation','cours'],              code:'6160', nom:'Formation professionnelle' },
    { kw: ['material','matière','raw','inventory','inventaire','stock','fournis'], code:'6170', nom:'Matières premières' },
    { kw: ['equipment','équipement','tool','outil','machin'],                    code:'6180', nom:'Équipements et outils' },
  ];

  for (const entry of map) {
    if (entry.kw.some(kw => n.includes(kw))) {
      return { code: entry.code, nom: entry.nom };
    }
  }
  return { code: '6190', nom: 'Autres dépenses d\'exploitation' };
}
