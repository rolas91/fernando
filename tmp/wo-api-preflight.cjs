require('dotenv').config({ quiet: true });
(async () => {
  const base = 'http://127.0.0.1:3001/api';
  const login = await fetch(base+'/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
  if (!login.ok) throw new Error('Login failed: '+login.status);
  const { access_token } = await login.json();
  for (const path of ['/company-settings','/numbering/work-orders/preview','/form-templates']) {
    const r = await fetch(base+path,{headers:{Authorization:'Bearer '+access_token}});
    if (!r.ok) throw new Error(path+': '+r.status+' '+await r.text());
    const data = await r.json();
    if (path === '/company-settings') console.log(path,data.map(s=>({id:s.id,workOrderNumberPrefix:s.workOrderNumberPrefix,workOrderNumberTemplate:s.workOrderNumberTemplate,workOrderNumberPadding:s.workOrderNumberPadding,workOrderPdfBuilder:s.workOrderPdfBuilder})));
    else console.log(path,JSON.stringify(data));
  }
})().catch(e=>{console.error(e.message);process.exit(1)});
