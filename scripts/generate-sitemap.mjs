import fs from "node:fs";
import vm from "node:vm";

const SITE_URL = (process.env.SITE_URL || "https://axels-slakt.vercel.app").replace(/\/+$/, "");
const ROOT = new URL("../", import.meta.url);
const template = fs.readFileSync(new URL("index.html", ROOT), "utf8");

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function slugifyUrl(value){
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/å/g,"a").replace(/ä/g,"a").replace(/ö/g,"o")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || "sida";
}
function nameKey(value){
  return String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("sv");
}
function uniqueNames(values,primaryName=""){
  const primaryKey=nameKey(primaryName),seen=new Set();
  return values.flatMap(value=>Array.isArray(value)?value:[value]).map(value=>String(value||"").trim()).filter(value=>{
    const key=nameKey(value);if(!key||key===primaryKey||seen.has(key))return false;seen.add(key);return true;
  });
}
function personAliases(person){const explicit=Array.isArray(person?.aliases)?person.aliases:[];return uniqueNames(explicit.length?explicit:[person?.alt||""],person?.name);}
function placeAliases(place){return uniqueNames(place?.aliases||[],place?.name);}

const code = fs.readFileSync(new URL("data.js", ROOT), "utf8") + "\n" +
  fs.readFileSync(new URL("emigrants.js", ROOT), "utf8") +
  "\nglobalThis.__siteData = { PEOPLE, PLACES, PARTNER, DIRECT_HEIRS, EMIGRANT_BRANCHES };";
const context = {};
vm.runInNewContext(code, context, {filename:"data.js"});
const { PEOPLE, PLACES, PARTNER, EMIGRANT_BRANCHES } = context.__siteData;

function personSlug(id){
  const person = PEOPLE[id];
  const stableName = person?.slug || person?.name || id;
  const base = slugifyUrl(stableName);
  const same = Object.keys(PEOPLE).filter(personId=>slugifyUrl(PEOPLE[personId]?.slug || PEOPLE[personId]?.name) === base);
  return same.length <= 1 ? base : slugifyUrl(`${person.name}-${person.born || id}`);
}
function placeSlug(place){
  const stableName = place.slug || place.name;
  const base = slugifyUrl(stableName);
  const same = PLACES.filter(row=>slugifyUrl(row.slug || row.name) === base);
  return same.length <= 1 ? base : slugifyUrl(`${place.name}-${place.area || place.id}`);
}
function personUrl(id){ return `/personer/${personSlug(id)}/`; }
function placeUrl(place){ return `/gardar/${placeSlug(place)}/`; }
function emigrantUrl(id){ return `/emigranter/${EMIGRANT_BRANCHES[id]?.slug || personSlug(id)}/`; }
function emigrantPersonUrl(branchId,personId){
  const person=EMIGRANT_BRANCHES[branchId]?.people?.[personId];
  return `${emigrantUrl(branchId)}personer/${person?.slug || slugifyUrl(person?.name || personId)}/`;
}
function escapeRegExp(value){ return String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
function referenceVariants(value){
  const name = String(value || "").trim(); if(!name) return [];
  const variants = new Set([name]);
  [...name.matchAll(/([\p{L}-]+)\s*\/\s*([\p{L}-]+)/gu)].forEach(match=>{
    variants.add(name.replace(match[0],match[1]).replace(/\s+/g," "));
    variants.add(name.replace(match[0],match[2]).replace(/\s+/g," "));
    variants.add(name.replace(match[0],`${match[1]} eller ${match[2]}`).replace(/\s+/g," "));
  });
  [...variants].forEach(variant=>{ const words=variant.split(/\s+/); if(words.length>=3) variants.add(`${words[0]} ${words.at(-1)}`); });
  return [...variants].filter(variant=>variant.length>=4);
}
function entityTargets(){
  const rows = new Map();
  const add = (alias,target)=>{
    const key=alias.toLocaleLowerCase('sv');
    if(!rows.has(key)) rows.set(key,{alias,target});
    else if(rows.get(key)?.target?.id!==target.id || rows.get(key)?.target?.type!==target.type) rows.set(key,null);
  };
  Object.entries(PEOPLE).forEach(([id,person])=>{
    [person.name,...(person.formerNames||[])].flatMap(referenceVariants).forEach(alias=>add(alias,{type:"person",id,label:person.name,replaceLabel:true}));
    personAliases(person).flatMap(referenceVariants).filter(alias=>alias.includes(" ")).forEach(alias=>add(alias,{type:"person",id,label:person.name,replaceLabel:false}));
  });
  PLACES.forEach(place=>{
    [place.name,...(place.formerNames||[])].flatMap(referenceVariants).forEach(alias=>add(alias,{type:"place",id:place.id,label:place.name,replaceLabel:true}));
    placeAliases(place).flatMap(referenceVariants).forEach(alias=>add(alias,{type:"place",id:place.id,label:place.name,replaceLabel:false}));
  });
  return [...rows.values()].filter(Boolean).sort((a,b)=>b.alias.length-a.alias.length);
}
const ENTITY_TARGETS = entityTargets();
function linkEntities(value){
  const text=String(value??""); if(!text||!ENTITY_TARGETS.length) return escapeHtml(text);
  const lookup=new Map(ENTITY_TARGETS.map(row=>[row.alias.toLocaleLowerCase('sv'),row.target]));
  const re=new RegExp(`(^|[^\\p{L}\\p{N}])(${ENTITY_TARGETS.map(row=>escapeRegExp(row.alias)).join("|")})(?=$|[^\\p{L}\\p{N}])`,"giu");
  let cursor=0,html="",match;
  while((match=re.exec(text))){
    const start=match.index+match[1].length; html+=escapeHtml(text.slice(cursor,start));
    const target=lookup.get(match[2].toLocaleLowerCase('sv')); const label=target?.replaceLabel?target.label:match[2];
    if(target?.type==="person") html+=`<a class="entity-link" href="${personUrl(target.id)}">${escapeHtml(label)}</a>`;
    else if(target?.type==="place") html+=`<a class="entity-link place-reference" href="${placeUrl(PLACES.find(place=>place.id===target.id))}">${escapeHtml(label)}</a>`;
    else html+=escapeHtml(match[2]);
    cursor=start+match[2].length;
  }
  return html+escapeHtml(text.slice(cursor));
}

function setHead(html, {title,description,path,jsonLd}){
  return html
    .replace("<meta charset=\"UTF-8\">", "<meta charset=\"UTF-8\">\n<base href=\"/\">")
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeHtml(description)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${SITE_URL}${path}">`)
    .replace('<script id="structuredData" type="application/ld+json"></script>', `<script id="structuredData" type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g,"\\u003c")}</script>`);
}
function listLinks(ids, emptyText){
  const valid = ids.filter(id=>PEOPLE[id]);
  if(!valid.length) return `<p class="detail-empty">${escapeHtml(emptyText)}</p>`;
  return `<div class="detail-link-grid">${valid.map(id=>`<a class="detail-link-card" href="${personUrl(id)}"><span class="detail-link-title">${escapeHtml(PEOPLE[id].name)}</span><span class="detail-link-meta">${escapeHtml([PEOPLE[id].born,PEOPLE[id].role].filter(Boolean).join(" · "))}</span></a>`).join("")}</div>`;
}
function factsList(rows){
  if(!rows.length) return '<p class="detail-empty">Ingen faktaruta är inlagd ännu.</p>';
  return `<ul class="detail-facts">${rows.map(([label,value])=>`<li><span class="k">${escapeHtml(label)}</span><span class="v">${linkEntities(value)}</span></li>`).join("")}</ul>`;
}
function timelineList(rows){
  if(!rows?.length) return '<p class="detail-empty">Ingen tidslinje är inlagd ännu.</p>';
  return `<ol class="detail-timeline">${rows.map(([date,text])=>`<li><span class="tl-y">${escapeHtml(date)}</span><span class="tl-t">${linkEntities(text)}</span></li>`).join("")}</ol>`;
}
function evidenceList(items, uncertain=false){
  if(!items?.length) return '<p class="detail-empty">Inga uppgifter inlagda ännu.</p>';
  return `<ul class="evidence-list">${items.map(item=>`<li class="evidence-item${uncertain ? " uncertain" : ""}">${linkEntities(item)}</li>`).join("")}</ul>`;
}
function galleryImages(record, includeProfile=false){
  const items=(record.images||[]).map(item=>{
    if(typeof item === "string"){
      const [src,...caption]=item.split("|");
      return {src:src.trim(),caption:caption.join("|").trim()};
    }
    return {src:item?.src||item?.url||"",caption:item?.caption||item?.alt||""};
  }).filter(item=>item.src);
  const profile=record.photo||record.image;
  if(includeProfile&&profile&&!/person-placeholder\.svg$/i.test(profile)&&!items.some(item=>item.src===profile)) items.unshift({src:profile,caption:`Porträtt av ${record.name||"personen"}`});
  return items;
}
function gallerySection(record, includeProfile=false){
  const items=galleryImages(record,includeProfile);
  if(!items.length) return '<p class="detail-empty">Inga bilder är inlagda ännu.</p>';
  return `<p class="detail-media-summary">${items.length} ${items.length===1?'bild':'bilder'} i galleriet</p><div class="detail-media-grid">${items.map((item,index)=>`<figure class="detail-media"><button class="detail-media-button" type="button" data-gallery-item data-gallery-index="${index}" data-gallery-src="${escapeHtml(item.src)}" data-gallery-caption="${escapeHtml(item.caption||'Bild ur familjearkivet')}" aria-label="Öppna bild ${index+1} av ${items.length}"><img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.caption||record.name||'Arkivbild')}" loading="lazy"><figcaption>${escapeHtml(item.caption||'Bild ur familjearkivet')}</figcaption></button></figure>`).join('')}</div>`;
}
function researchStatus(status){return {confirmed:"Bekräftat",strong:"Starkt stöd",hypothesis:"Hypotes",excluded:"Avförd"}[status]||"Öppet spår";}
function branchPerson(branch,id){return id===branch.rootPersonId?PEOPLE[id]:branch.people?.[id];}
function branchPersonLink(branch,id,className="emigrant-family-person"){
  const person=branchPerson(branch,id);if(!person)return "";
  const url=id===branch.rootPersonId?personUrl(id):emigrantPersonUrl(branch.id,id);
  return `<a class="${className}" href="${url}"><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml([person.relation,person.born,person.died,person.location].filter(Boolean).join(" · "))}</span></a>`;
}
function emigrantFamilyTree(branch,family,seen=new Set(),depth=0){
  if(!family||seen.has(family.id))return "";const next=new Set(seen);next.add(family.id);
  const partners=family.partners.map(id=>branchPersonLink(branch,id)).join('<span class="emigrant-family-and">och</span>');
  const children=family.children.map(id=>{const childFamily=branch.families.find(row=>row.partners.includes(id)&&row.children.length);return `<li>${branchPersonLink(branch,id,"emigrant-family-person child")}${childFamily?`<details class="emigrant-family-more"><summary>Visa nästa generation</summary>${emigrantFamilyTree(branch,childFamily,next,depth+1)}</details>`:""}</li>`}).join("");
  return `<div class="emigrant-family-branch"><div class="emigrant-family-couple">${partners}</div>${children?`<ol class="emigrant-family-children">${children}</ol>`:'<p class="detail-empty">Inga säkert kopplade barn är införda.</p>'}<p class="emigrant-family-source"><span class="research-status ${escapeHtml(family.status)}">${researchStatus(family.status)}</span>${escapeHtml(family.source||"")}</p></div>`;
}
function emigrantTree(branch){
  const rootFamily=branch.families.find(family=>family.partners.includes(branch.rootPersonId));
  return rootFamily?`<div class="emigrant-tree-shell">${emigrantFamilyTree(branch,rootFamily)}<p class="emigrant-tree-note">Endast relationer med stöd i Master 4 visas i trädet.</p></div>`:'<p class="detail-empty">Inga säkert belagda relationer är införda.</p>';
}
function personArticle(id){
  const person = PEOPLE[id];
  const facts = [...(personAliases(person).length ? [["Sekundära namn",personAliases(person).join(", ")]] : []),...(person.place ? [["Gård/plats",person.place]] : []),...(person.facts || [])];
  const story = person.story?.length ? person.story : ["Ännu inte utforskad."];
  const relations = [...(person.parents || []),PARTNER[id],...(person.children || [])].filter(Boolean);
  const emigrantLink = EMIGRANT_BRANCHES[id] ? `<section class="detail-section"><h2>Emigrantgren</h2><div class="detail-link-grid"><a class="detail-link-card" href="${emigrantUrl(id)}"><span class="detail-link-title">Öppna sekundärt släktträd</span><span class="detail-link-meta">${escapeHtml(EMIGRANT_BRANCHES[id].destinationCountry || "Emigrantarkivet")}</span></a></div></section>` : "";
  return `<div class="detail-hero"><div><nav class="breadcrumbs" aria-label="Brödsmulor"><a href="/">Startsida</a><span>/</span><a href="/personarkiv/">Personarkiv</a><span>/</span><strong>${escapeHtml(person.name)}</strong></nav><p class="detail-kicker">Personsida</p><h1 class="detail-title">${escapeHtml(person.name)}</h1>${personAliases(person).length?`<p class="detail-name-aliases"><span>Även känd som</span> ${escapeHtml(personAliases(person).join(" · "))}</p>`:""}<p class="detail-subtitle">${escapeHtml([person.role,person.born ? `född ${person.born}`:"",person.died ? `avliden ${person.died}`:""].filter(Boolean).join(" · "))}</p><p class="detail-summary">${linkEntities(story[0])}</p></div></div><div class="detail-layout"><main class="detail-main"><section class="detail-section"><h2>Livshistoria</h2><div class="detail-story">${story.map(text=>`<p>${linkEntities(text)}</p>`).join("")}</div></section><section class="detail-section"><h2>Livslinje</h2>${timelineList(person.timeline || [])}</section><section class="detail-section"><h2>Bilder</h2>${gallerySection(person,true)}</section></main><aside class="detail-side"><section class="detail-section"><h2>Fakta</h2>${factsList(facts)}</section><section class="detail-section"><h2>Familjerelationer</h2>${listLinks(relations,"Inga relationer inlagda ännu.")}</section>${emigrantLink}</aside></div>`;
}
function placeMatchesPerson(place, person){
  const haystack = [person.place,...(person.facts || []).flat(),...(person.story || []),...(person.timeline || []).flat()].filter(Boolean).join(" ").toLocaleLowerCase("sv");
  return [place.name,...placeAliases(place),...(place.formerNames||[])].some(alias=>haystack.includes(String(alias).toLocaleLowerCase("sv")));
}
function placeArticle(place){
  const people = Array.isArray(place.relatedPersonIds) ? place.relatedPersonIds.filter(id=>PEOPLE[id]) : Object.entries(PEOPLE).filter(([,person])=>placeMatchesPerson(place,person)).map(([id])=>id);
  const story = place.story?.length ? place.story : [place.note || "Ingen längre platsbeskrivning är inlagd ännu."];
  const facts = [["Område",place.area || "Ej angivet"],...(placeAliases(place).length ? [["Sekundära namn",placeAliases(place).join(", ")]] : []),...(place.facts || [])];
  const cover=place.coverImage||"";
  return `<div class="detail-hero${cover?" has-cover":""}">${cover?`<img class="detail-cover-image" src="${escapeHtml(cover)}" alt="" aria-hidden="true">`:""}<div><nav class="breadcrumbs" aria-label="Brödsmulor"><a href="/">Startsida</a><span>/</span><a href="/gardar/">Gårdsarkiv</a><span>/</span><strong>${escapeHtml(place.name)}</strong></nav><p class="detail-kicker">Gårdssida</p><h1 class="detail-title">${escapeHtml(place.name)}</h1>${placeAliases(place).length?`<p class="detail-name-aliases"><span>Även känd som</span> ${escapeHtml(placeAliases(place).join(" · "))}</p>`:""}<p class="detail-subtitle">${escapeHtml(place.area || "")}</p><p class="detail-summary">${linkEntities(story[0])}</p></div></div><div class="detail-layout"><main class="detail-main"><section class="detail-section"><h2>Platsens historia</h2><div class="detail-story">${story.map(text=>`<p>${linkEntities(text)}</p>`).join("")}</div></section><section class="detail-section"><h2>Tidslinje</h2>${timelineList(place.timeline || [])}</section><section class="detail-section"><h2>Bilder</h2>${gallerySection(place)}</section></main><aside class="detail-side"><section class="detail-section"><h2>Fakta</h2>${factsList(facts)}</section><section class="detail-section"><h2>Kopplade personer</h2>${listLinks(people,"Inga personer är kopplade hit ännu.")}</section></aside></div>`;
}
function emigrantArticleBase(id){
  const branch = EMIGRANT_BRANCHES[id];
  const person = PEOPLE[branch.rootPersonId];
  const status = branch.emigrationConfirmed ? "Bekräftad emigration" : branch.status === "working" ? "Under utredning" : "Öppet emigrantspår";
  const descendants = Object.keys(branch.people || {});
  const sourceGroups=(branch.sourceGroups||[]).map(group=>`<section class="source-group"><h3>${escapeHtml(group.title)}</h3>${evidenceList(group.items)}</section>`).join("");
  const research=(items,kind)=>(items||[]).map(item=>`<article class="research-item ${escapeHtml(item.status||kind)}"><span class="research-status ${escapeHtml(item.status||kind)}">${researchStatus(item.status||kind)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text||item.reason||"")}</p></article>`).join("")||'<p class="detail-empty">Inga poster.</p>';
  return `<div class="detail-hero"><div><nav class="breadcrumbs" aria-label="Brödsmulor"><a href="/">Startsida</a><span>/</span><a href="/emigranter/">Emigrantarkiv</a><span>/</span><strong>${escapeHtml(person.name)}</strong></nav><p class="detail-kicker">Sekundärt släktträd · ${escapeHtml(branch.branchLabel || "Släktgren")}</p><h1 class="detail-title">${escapeHtml(person.name)}</h1><div class="emigrant-route"><strong>${escapeHtml(branch.originCountry || "Sverige")}</strong><span class="emigrant-route-arrow" aria-hidden="true">→</span><strong>${escapeHtml(branch.destinationCountry || "Okänd destination")}</strong></div><p class="detail-subtitle">${escapeHtml(status)}</p><p class="detail-summary">${linkEntities(branch.summary)}</p></div><div class="detail-actions"><a class="btn" href="${personUrl(branch.rootPersonId)}">Öppna personsida</a></div></div><div class="detail-layout"><main class="detail-main"><section class="detail-section"><h2>Emigrantspåret</h2><div class="detail-story">${(branch.story || []).map(text=>`<p>${linkEntities(text)}</p>`).join("")}</div></section><section class="detail-section"><h2>Sekundärt släktträd</h2>${emigrantTree(branch)}</section><section class="detail-section"><h2>Tidslinje</h2>${timelineList(branch.timeline || [])}</section><section class="detail-section"><h2>Platser och adresser</h2>${factsList((branch.places||[]).map(place=>[`${place.name}${place.period?` (${place.period})`:""}`,place.note||""]))}</section><section class="detail-section"><h2>Källor</h2><div class="source-groups">${sourceGroups}</div></section><section class="detail-section"><h2>Hypoteser</h2><div class="research-list">${research(branch.hypotheses,"hypothesis")}</div></section><section class="detail-section"><h2>Avförda kandidater</h2><div class="research-list">${research(branch.excludedCandidates,"excluded")}</div></section><section class="detail-section"><h2>Osäkerheter och öppna spår</h2>${evidenceList(branch.uncertainties,true)}</section></main><aside class="detail-side"><section class="detail-section"><h2>Grenfakta</h2>${factsList(branch.facts || [])}</section><section class="detail-section"><h2>Personregister för grenen</h2><div class="emigrant-descendant-list">${descendants.map(personId=>branchPersonLink(branch,personId,"emigrant-descendant")).join("")}</div></section></aside></div>`;
}
function emigrantArticle(id){
  const branch=EMIGRANT_BRANCHES[id];
  const unplaced=(branch.unplacedDescendants||[]).map(item=>{
    const record=item.personId?branch.people[item.personId]:null;
    return `<article class="research-item ${escapeHtml(item.status||"open")}"><span class="research-status ${escapeHtml(item.status||"open")}">${researchStatus(item.status)}</span><h3>${record?branchPersonLink(branch,item.personId,"inline-emigrant-person"):escapeHtml(item.names||"Namngivna efterkommande")}</h3><p>${escapeHtml([item.relation,item.note].filter(Boolean).join(". "))}</p></article>`;
  }).join("")||'<p class="detail-empty">Inga ofördelade efterkommande.</p>';
  const priorities=(branch.researchPriorities||[]).map(item=>`<article class="research-item ${escapeHtml(item.status||"open")}"><span class="research-status ${escapeHtml(item.status||"open")}">${researchStatus(item.status)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text||"")}</p></article>`).join("")||'<p class="detail-empty">Inga prioriterade forskningsuppgifter.</p>';
  const addition=`<section class="detail-section"><h2>Efterkommande utan säker föräldraplacering</h2><div class="research-list">${unplaced}</div></section><section class="detail-section"><h2>Prioriterade forskningsuppgifter</h2><div class="research-list">${priorities}</div></section>`;
  return emigrantArticleBase(id).replace('</main><aside class="detail-side">',`${addition}</main><aside class="detail-side">`);
}
function emigrantPersonArticle(branchId,personId){
  const branch=EMIGRANT_BRANCHES[branchId],person=branch.people[personId],root=PEOPLE[branch.rootPersonId];
  const parents=[],partners=[],children=[];
  branch.families.forEach(family=>{if(family.children.includes(personId))parents.push(...family.partners);if(family.partners.includes(personId)){partners.push(...family.partners.filter(id=>id!==personId));children.push(...family.children)}});
  const links=(ids,empty)=>{const unique=[...new Set(ids)];return unique.length?`<div class="emigrant-descendant-list">${unique.map(id=>branchPersonLink(branch,id,"emigrant-descendant")).join("")}</div>`:`<p class="detail-empty">${escapeHtml(empty)}</p>`};
  const facts=[...(person.aliases?.length?[["Sekundära namn",person.aliases.join(", ")]]:[]),...(person.location?[["Plats",person.location]]:[]),...(person.facts||[])];
  const description=person.summary||`${person.name}, person i ${root.name}s amerikanska emigrantgren.`;
  return `<div class="detail-hero"><div><nav class="breadcrumbs" aria-label="Brödsmulor"><a href="/">Startsida</a><span>/</span><a href="/emigranter/">Emigrantarkiv</a><span>/</span><a href="${emigrantUrl(branchId)}">${escapeHtml(root.name)}s gren</a><span>/</span><strong>${escapeHtml(person.name)}</strong></nav><p class="detail-kicker">Person i amerikansk emigrantgren</p><h1 class="detail-title">${escapeHtml(person.name)}</h1><p class="detail-subtitle">${escapeHtml([person.relation,person.born?`född ${person.born}`:"",person.died?`avliden ${person.died}`:"",person.location].filter(Boolean).join(" · "))}</p><span class="research-status ${escapeHtml(person.status||"open")}">${researchStatus(person.status)}</span><p class="detail-summary">${escapeHtml(description)}</p></div><div class="detail-actions"><a class="btn" href="${emigrantUrl(branchId)}">Visa hela emigrantgrenen</a></div></div><div class="detail-layout"><main class="detail-main"><section class="detail-section"><h2>Livshistoria</h2><div class="detail-story">${(person.story?.length?person.story:[description]).map(text=>`<p>${escapeHtml(text)}</p>`).join("")}</div></section><section class="detail-section"><h2>Livslinje</h2>${timelineList(person.timeline||[])}</section><section class="detail-section"><h2>Bilder och dokument</h2>${gallerySection(person,true)}</section><section class="detail-section"><h2>Källor</h2>${evidenceList(person.sources||[])}</section><section class="detail-section"><h2>Osäkerheter</h2>${evidenceList(person.uncertainties||[],true)}</section></main><aside class="detail-side">${person.isLiving?'<section class="detail-section privacy-note"><h2>Integritet</h2><p>Personen kan vara i livet. Privata kontaktuppgifter och exakta privata adresser visas därför inte.</p></section>':""}<section class="detail-section"><h2>Fakta</h2>${factsList(facts)}</section><section class="detail-section"><h2>Föräldrar</h2>${links(parents,"Inga säkert kopplade föräldrar är inlagda.")}</section><section class="detail-section"><h2>Make eller maka</h2>${links(partners,"Ingen make eller maka är säkert inlagd.")}</section><section class="detail-section"><h2>Barn</h2>${links(children,"Inga säkert kopplade barn är inlagda.")}</section></aside></div>`;
}
function detailPage(article, head){
  let html = setHead(template, head).replace('<body class="page-home">','<body class="page-detail">');
  return html.replace('<section class="detail-page" id="detailPage" data-page="detail" aria-live="polite"></section>', `<section class="detail-page open" id="detailPage" data-page="detail" aria-live="polite">${article}</section>`);
}
function archivePage(kind){
  const isPeople = kind === "personarkiv";
  const title = isPeople ? "Personarkiv - Nilsson/Bengtsson släktträd" : "Gårdsarkiv - Nilsson/Bengtsson släktträd";
  const description = isPeople ? "Alla personer i Nilsson/Bengtsson-släkten, sorterade efter släktled, gårdar och platser." : "Alla gårdar, orter och platser som förekommer i Nilsson/Bengtsson-släktens familjearkiv.";
  let html = setHead(template,{title,description,path:isPeople?"/personarkiv/":"/gardar/",jsonLd:{"@context":"https://schema.org","@type":"CollectionPage","name":title,"description":description}})
    .replace('<body class="page-home">', `<body class="page-${isPeople ? "personarkiv" : "gardarkiv"}">`);
  if(isPeople){
    const links = Object.keys(PEOPLE).sort((a,b)=>PEOPLE[a].name.localeCompare(PEOPLE[b].name,"sv")).map(id=>`<a class="archive-item" href="${personUrl(id)}"><span class="archive-item-name">${escapeHtml(PEOPLE[id].name)}${personAliases(PEOPLE[id]).length?` / ${escapeHtml(personAliases(PEOPLE[id]).join(" / "))}`:""}</span><span class="archive-item-meta">${escapeHtml([PEOPLE[id].born,PEOPLE[id].place].filter(Boolean).join(" · "))}</span></a>`).join("");
    html = html.replace('<div id="personArchive" class="archive-grid"></div>', `<div id="personArchive" class="archive-grid"><article class="archive-group"><h3>Alla personer</h3><div class="archive-list">${links}</div></article></div>`);
  }else{
    const links = PLACES.slice().sort((a,b)=>a.name.localeCompare(b.name,"sv")).map(place=>`<article class="archive-group"><h3>${escapeHtml(place.name)}</h3><p class="archive-group-meta">${escapeHtml(place.area || "Område saknas")}</p><a class="archive-item" href="${placeUrl(place)}"><span class="archive-item-name">Öppna gårdssida</span></a></article>`).join("");
    html = html.replace('<div id="placeArchive" class="archive-grid"></div>', `<div id="placeArchive" class="archive-grid">${links}</div>`);
  }
  return html;
}
function emigrantArchivePage(){
  const title = "Emigrantarkiv - Nilsson/Bengtsson släktträd";
  const description = "Emigranter och separata internationella släktgrenar i Nilsson/Bengtsson-släkten.";
  let html = setHead(template,{title,description,path:"/emigranter/",jsonLd:{"@context":"https://schema.org","@type":"CollectionPage","name":title,"description":description}})
    .replace('<body class="page-home">','<body class="page-emigrantarkiv">');
  const links = Object.values(EMIGRANT_BRANCHES).filter(branch=>PEOPLE[branch.rootPersonId]).sort((a,b)=>PEOPLE[a.rootPersonId].name.localeCompare(PEOPLE[b.rootPersonId].name,"sv")).map(branch=>{
    const person = PEOPLE[branch.rootPersonId];
    return `<article class="archive-group"><p class="archive-section-label">${escapeHtml(branch.branchLabel || "Emigrantgren")}</p><h3>${escapeHtml(person.name)}</h3><div class="emigrant-route"><strong>${escapeHtml(branch.originCountry || "Sverige")}</strong><span class="emigrant-route-arrow" aria-hidden="true">→</span><strong>${escapeHtml(branch.destinationCountry || "Okänd destination")}</strong></div><p class="archive-group-meta">${escapeHtml([person.born ? `född ${person.born}` : "",branch.emigrationConfirmed ? "Bekräftad emigration" : "Under utredning"].filter(Boolean).join(" · "))}</p><p class="place-note">${escapeHtml(branch.summary)}</p><div class="archive-list" style="margin-top:12px"><a class="archive-item" href="${emigrantUrl(branch.id)}"><span class="archive-item-name">Öppna emigrantgren</span><span class="archive-item-meta">${escapeHtml((branch.destinationAreas || []).join(" · ") || "Destination utreds")}</span></a></div></article>`;
  }).join("");
  return html.replace('<div id="emigrantArchive" class="archive-grid"></div>', `<div id="emigrantArchive" class="archive-grid">${links}</div>`);
}
function contactPage(){
  const title = "Kontakt - Nilsson/Bengtsson släktträd";
  const description = "Kontakta Axel Nilsson med fotografier, berättelser, källor och rättelser till Nilsson/Bengtsson släktträd.";
  return setHead(template,{title,description,path:"/kontakt/",jsonLd:{"@context":"https://schema.org","@type":"ContactPage","name":"Kontakt",description,"url":`${SITE_URL}/kontakt/`}})
    .replace('<body class="page-home">','<body class="page-contact">');
}
function writePage(path, html){
  const file = new URL(path.replace(/^\//, ""), ROOT);
  fs.mkdirSync(new URL("./", file), {recursive:true});
  fs.writeFileSync(file, html);
}

const emigrantPersonPaths=Object.entries(EMIGRANT_BRANCHES).flatMap(([branchId,branch])=>Object.keys(branch.people||{}).map(personId=>emigrantPersonUrl(branchId,personId)));
const paths = ["/","/personarkiv/","/gardar/","/emigranter/","/kontakt/",...Object.keys(PEOPLE).map(personUrl),...PLACES.map(placeUrl),...Object.keys(EMIGRANT_BRANCHES).map(emigrantUrl),...emigrantPersonPaths];
writePage("personarkiv/index.html", archivePage("personarkiv"));
writePage("gardar/index.html", archivePage("gardarkiv"));
writePage("emigranter/index.html", emigrantArchivePage());
writePage("kontakt/index.html", contactPage());
Object.keys(PEOPLE).forEach(id=>{
  const person = PEOPLE[id];
  const path = personUrl(id);
  const description = `${person.name}${person.born ? `, född ${person.born}` : ""}${person.place ? `, kopplad till ${person.place}` : ""}. Personsida i Nilsson/Bengtsson släktträd.`;
  writePage(`${path.slice(1)}index.html`, detailPage(personArticle(id),{title:`${person.name} - Nilsson/Bengtsson släktträd`,description,path,jsonLd:{"@context":"https://schema.org","@type":"Person","name":person.name,"alternateName":personAliases(person).length ? personAliases(person) : undefined,"birthDate":person.born || undefined,"deathDate":person.died || undefined,"description":person.story?.[0] || description,"url":`${SITE_URL}${path}`}}));
});
PLACES.forEach(place=>{
  const path = placeUrl(place);
  const description = `${place.name}${place.area ? ` i ${place.area}` : ""}. Gårdssida med historik, tidslinje och kopplade personer.`;
  writePage(`${path.slice(1)}index.html`, detailPage(placeArticle(place),{title:`${place.name} - gårdssida`,description,path,jsonLd:{"@context":"https://schema.org","@type":"Place","name":place.name,"alternateName":placeAliases(place).length ? placeAliases(place) : undefined,"description":place.note || description,"url":`${SITE_URL}${path}`}}));
});
Object.keys(EMIGRANT_BRANCHES).forEach(id=>{
  const branch = EMIGRANT_BRANCHES[id];
  const person = PEOPLE[branch.rootPersonId];
  if(!person) return;
  const path = emigrantUrl(id);
  const description = `${person.name}s emigrantgren med efterkommande, tidslinje, källor och ett separat släktträd.`;
  writePage(`${path.slice(1)}index.html`, detailPage(emigrantArticle(id),{title:`${person.name}s emigrantgren - Nilsson/Bengtsson släktträd`,description,path,jsonLd:{"@context":"https://schema.org","@type":"ProfilePage","name":`${person.name}s emigrantgren`,"description":branch.summary,"mainEntity":{"@type":"Person","name":person.name,"birthDate":person.born || undefined},"url":`${SITE_URL}${path}`}}));
  Object.keys(branch.people || {}).forEach(personId=>{
    const branchPerson=branch.people[personId];
    const personPath=emigrantPersonUrl(id,personId);
    const personDescription=branchPerson.summary||`${branchPerson.name}, person i ${person.name}s emigrantgren.`;
    writePage(`${personPath.slice(1)}index.html`,detailPage(emigrantPersonArticle(id,personId),{title:`${branchPerson.name} - ${person.name}s emigrantgren`,description:personDescription,path:personPath,jsonLd:{"@context":"https://schema.org","@type":"Person","name":branchPerson.name,"alternateName":branchPerson.aliases||undefined,"birthDate":branchPerson.born||undefined,"deathDate":branchPerson.died||undefined,"description":personDescription,"url":`${SITE_URL}${personPath}`}}));
  });
});

const today = new Date().toISOString().slice(0,10);
const urls = paths.map(path=>`  <url>\n    <loc>${SITE_URL}${path}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`).join("\n");
fs.writeFileSync(new URL("sitemap.xml", ROOT), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
fs.writeFileSync(new URL("robots.txt", ROOT), `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
console.log(`Generated ${paths.length} static pages and sitemap URLs for ${SITE_URL}`);
