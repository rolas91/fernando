require('dotenv').config({ quiet: true });
const { Client } = require('pg');
(async () => {
  if (!['localhost','127.0.0.1'].includes(process.env.DB_HOST)) throw new Error('Local DB required');
  const c = new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  await c.connect();
  try {
    console.log('database', (await c.query('select current_database() as name')).rows);
    console.log('tables',(await c.query("select table_name from information_schema.tables where table_schema='public' and (table_name like '%user%' or table_name in ('company_settings','form_templates','work_orders'))")).rows);
    console.log('settings',(await c.query('select id,name,work_order_number_template,work_order_number_padding,work_order_number_reset from company_settings')).rows);
    console.log('templates',(await c.query('select id,name,category from form_templates')).rows);
    console.log('migrations',JSON.stringify((await c.query('select name from migrations order by timestamp desc limit 12')).rows));
    console.log('fields',JSON.stringify((await c.query('select fields from form_templates where id=$1',['work_order_daily_completion'])).rows));
    const response = await fetch('http://127.0.0.1:3001/healthz').catch(()=>null);
    console.log('apiStatus',response?.status || 'unavailable');
  } finally { await c.end(); }
})().catch(e=>{console.error(e.message);process.exit(1)});
