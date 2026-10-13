// One-time migration: moves any existing photo bytes still sitting
// in Postgres bytea columns into Cloudflare R2, and fills in the
// matching *_key column so the app reads from R2 going forward.
//
// Run this LOCALLY (not on Vercel) after R2 is set up and its env
// vars are confirmed working in production. Safe to run more than
// once — it only touches rows where the *_key column is still null.
//
// Usage:
//   DATABASE_URL=... R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... \
//   R2_SECRET_ACCESS_KEY=... R2_BUCKET_NAME=... node scripts/migrate-to-r2.js

import { neon } from '@neondatabase/serverless';
import { uploadToR2, newObjectKey, isR2Configured } from '../lib/r2.js';
import { toImageBuffer } from '../lib/db.js';

if (!process.env.DATABASE_URL){
  console.error('Set DATABASE_URL before running this script.');
  process.exit(1);
}
if (!isR2Configured()){
  console.error('Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME before running this script.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function migrateColumn({ table, idCol, dataCol, keyCol, prefix }){
  const rows = await sql(
    `select ${idCol} as id, ${dataCol} as data from ${table} where ${dataCol} is not null and ${keyCol} is null`
  );
  console.log(`${table}.${dataCol}: ${rows.length} row(s) to migrate`);
  let ok = 0, failed = 0;
  for (const row of rows){
    try{
      const buffer = toImageBuffer(row.data);
      if (!buffer || !buffer.length){ console.warn(`  skip ${row.id}: empty/undecodable data`); failed++; continue; }
      const key = newObjectKey(prefix);
      await uploadToR2(key, buffer, 'image/jpeg');
      await sql(`update ${table} set ${keyCol} = $1 where ${idCol} = $2`, [key, row.id]);
      ok++;
      process.stdout.write('.');
    }catch(err){
      console.error(`\n  failed ${row.id}:`, err.message);
      failed++;
    }
  }
  console.log(`\n  done: ${ok} migrated, ${failed} failed/skipped\n`);
}

async function main(){
  await migrateColumn({ table: 'students', idCol: 'id', dataCol: 'id_photo', keyCol: 'id_photo_key', prefix: 'id-photos' });
  await migrateColumn({ table: 'pending_registrations', idCol: 'id', dataCol: 'id_photo', keyCol: 'id_photo_key', prefix: 'id-photos' });
  await migrateColumn({ table: 'pending_registrations', idCol: 'id', dataCol: 'payment_screenshot', keyCol: 'payment_screenshot_key', prefix: 'payment-screenshots' });
  console.log('All done. Spot-check a few photos in the app before dropping the old bytea columns (see migration-07-r2-storage.sql for the drop statements).');
}

main().catch(err => { console.error(err); process.exit(1); });
