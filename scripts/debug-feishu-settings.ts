import Database from 'better-sqlite3';

const db = new Database('data/gmpilot.db', { readonly: true });
const rows = db
  .prepare(
    "SELECT key, CASE WHEN key LIKE '%SECRET%' THEN '***' ELSE value END as value FROM settings WHERE key LIKE 'FEISHU%'",
  )
  .all();
console.log(JSON.stringify(rows, null, 1));
