import fs from 'node:fs';

const url=(process.env.SUPABASE_URL || '').replace(/\/$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if(!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
const snapshot=JSON.parse(fs.readFileSync(new URL('../supabase/current-data.json',import.meta.url),'utf8'));
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'};
async function upsert(table,rows,onConflict='id'){
  for(let i=0;i<rows.length;i+=100){
    const response=await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`,{method:'POST',headers,body:JSON.stringify(rows.slice(i,i+100))});
    if(!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  }
  console.log(`Imported ${rows.length} rows into ${table}.`);
}
await upsert('people',snapshot.people);
await upsert('places',snapshot.places);
await upsert('family_units',snapshot.units);
await upsert('relationships',snapshot.relationships,'person_id,related_person_id,kind');

