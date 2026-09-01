import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const code = fs.readFileSync(new URL('data.js', root), 'utf8') +
  '\nglobalThis.__archive={PEOPLE,PLACES,UNITS,DIRECT_HEIRS,MOTHER_UNITS,FATHER_UNITS};';
const context = {};
vm.runInNewContext(code, context, {filename:'data.js'});
const {PEOPLE,PLACES,UNITS,DIRECT_HEIRS,MOTHER_UNITS,FATHER_UNITS} = context.__archive;

function slugify(value){
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/å/g,'a').replace(/ä/g,'a').replace(/ö/g,'o').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'post';
}
function branchForUnit(id){
  if(MOTHER_UNITS.has(id)) return 'mother';
  if(FATHER_UNITS.has(id)) return 'father';
  return 'shared';
}
const personUnit = {};
UNITS.forEach(unit=>unit.persons.forEach(id=>{ if(!personUnit[id]) personUnit[id]=unit.id; }));
const usedPersonSlugs = new Set();
const usedPlaceSlugs = new Set();
function uniqueSlug(base, fallback, used){
  let slug=base, index=2;
  if(used.has(slug)) slug=fallback;
  while(used.has(slug)) slug=`${fallback}-${index++}`;
  used.add(slug); return slug;
}
const people = Object.entries(PEOPLE).map(([id,person])=>({
  id, slug:uniqueSlug(
    person.slug || slugify(person.name),
    slugify(`${person.name}-${person.born || id}`),
    usedPersonSlugs
  ), name:person.name, alt_name:person.alt || null,
  branch:branchForUnit(personUnit[id]), is_direct:DIRECT_HEIRS.has(id),
  is_living:!person.died && Number(String(person.born || '').slice(0,4)) >= new Date().getFullYear()-110,
  visibility:(!person.died && Number(String(person.born || '').slice(0,4)) >= new Date().getFullYear()-110) ? 'family' : 'public',
  content:person
}));
const places = PLACES.map(place=>({
  id:place.id,slug:uniqueSlug(
    place.slug || slugify(place.name),
    slugify(`${place.name}-${place.area || place.id}`),
    usedPlaceSlugs
  ),name:place.name,area:place.area || null,
  latitude:place.lat ?? null,longitude:place.lng ?? null,visibility:'public',content:place
}));
const units = UNITS.map(unit=>({
  id:unit.id,generation:unit.gen,branch:branchForUnit(unit.id),person_ids:unit.persons || [],
  child_unit_ids:unit.children || [],content:Object.fromEntries(Object.entries(unit).filter(([key])=>!['id','gen','persons','children'].includes(key)))
}));
const relationships=[];
for(const [id,person] of Object.entries(PEOPLE)){
  (person.parents || []).forEach(parent=>relationships.push({person_id:id,related_person_id:parent,kind:'parent'}));
}
const snapshot={generatedAt:new Date().toISOString(),people,places,units,relationships};
fs.mkdirSync(new URL('supabase/',root),{recursive:true});
fs.writeFileSync(new URL('supabase/current-data.json',root),JSON.stringify(snapshot,null,2)+'\n');
function sqlText(value){ return value == null ? 'null' : `'${String(value).replaceAll("'","''")}'`; }
function sqlJson(value){ return `${sqlText(JSON.stringify(value))}::jsonb`; }
function sqlArray(values){ return `array[${(values || []).map(sqlText).join(',')}]::text[]`; }
const sql = [
  '-- Generated from data.js. Run after 001_family_archive.sql.',
  'begin;',
  ...people.map(row=>`insert into public.people(id,slug,name,alt_name,branch,is_direct,is_living,visibility,content) values(${sqlText(row.id)},${sqlText(row.slug)},${sqlText(row.name)},${sqlText(row.alt_name)},${sqlText(row.branch)},${row.is_direct},${row.is_living},${sqlText(row.visibility)},${sqlJson(row.content)}) on conflict(id) do update set slug=excluded.slug,name=excluded.name,alt_name=excluded.alt_name,branch=excluded.branch,is_direct=excluded.is_direct,is_living=excluded.is_living,visibility=excluded.visibility,content=excluded.content;`),
  ...places.map(row=>`insert into public.places(id,slug,name,area,latitude,longitude,visibility,content) values(${sqlText(row.id)},${sqlText(row.slug)},${sqlText(row.name)},${sqlText(row.area)},${row.latitude ?? 'null'},${row.longitude ?? 'null'},${sqlText(row.visibility)},${sqlJson(row.content)}) on conflict(id) do update set slug=excluded.slug,name=excluded.name,area=excluded.area,latitude=excluded.latitude,longitude=excluded.longitude,visibility=excluded.visibility,content=excluded.content;`),
  ...units.map(row=>`insert into public.family_units(id,generation,branch,person_ids,child_unit_ids,content) values(${sqlText(row.id)},${row.generation},${sqlText(row.branch)},${sqlArray(row.person_ids)},${sqlArray(row.child_unit_ids)},${sqlJson(row.content)}) on conflict(id) do update set generation=excluded.generation,branch=excluded.branch,person_ids=excluded.person_ids,child_unit_ids=excluded.child_unit_ids,content=excluded.content;`),
  ...relationships.map(row=>`insert into public.relationships(person_id,related_person_id,kind) values(${sqlText(row.person_id)},${sqlText(row.related_person_id)},${sqlText(row.kind)}) on conflict(person_id,related_person_id,kind) do nothing;`),
  'commit;',''
].join('\n');
fs.writeFileSync(new URL('supabase/seed.sql',root),sql);
console.log(`Exported ${people.length} people, ${places.length} places, ${units.length} family units and ${relationships.length} parent links.`);
