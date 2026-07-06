// Axels släkt - app-logik
// Renderar trädet, personrutor, sök och karta utifrån data.js.

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function escapeRegExp(value){ return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function formatDates(p){
  const b = p.born ? "★ "+p.born : "";
  const d = p.died ? "† "+p.died : "";
  return [b,d].filter(Boolean).join("   ");
}
function personHTML(id, unit){
  const p = PEOPLE[id];
  const heir = DIRECT_HEIRS.has(id);
  const role = p.role || (heir ? "Direkt linje" : "Person");
  const alt = p.alt ? `<span class="alt">/ ${escapeHtml(p.alt)}</span>` : "";
  const dates = formatDates(p);
  return `<button class="person${heir ? " heir" : ""}${unit?.ancestor ? " ancestor" : ""}" data-id="${id}" title="Öppna livshistoria">
    <span class="prole"><span class="sdot ${p.status || 'open'}"></span>${escapeHtml(role)}</span>
    <span class="pname">${escapeHtml(p.name)}${alt}</span>
    ${dates ? `<span class="pdates">${escapeHtml(dates)}</span>` : ""}
  </button>`;
}

const CARD_W = window.innerWidth <= 640 ? 188 : 208;
const CARD_GAP = 12;
const UNIT_GAP = 64;
const LEVEL_H = 245;
const PAD = 80;
const canvas = document.getElementById('canvas');
const linksSvg = document.getElementById('links');
const viewport = document.getElementById('viewport');

function unitWidth(unit){ return unit.persons.length * CARD_W + (unit.persons.length - 1) * CARD_GAP; }
function layoutUnits(){
  const rows = new Map();
  UNITS.forEach(u=>{ if(!rows.has(u.gen)) rows.set(u.gen, []); rows.get(u.gen).push(u); });
  let worldW = 0;
  [...rows.entries()].forEach(([gen, units])=>{
    const rowW = units.reduce((sum,u)=>sum + unitWidth(u), 0) + Math.max(0, units.length-1) * UNIT_GAP;
    worldW = Math.max(worldW, rowW);
  });
  [...rows.entries()].forEach(([gen, units])=>{
    const rowW = units.reduce((sum,u)=>sum + unitWidth(u), 0) + Math.max(0, units.length-1) * UNIT_GAP;
    let x = PAD + (worldW - rowW) / 2;
    units.forEach(u=>{
      u._x = x; u._y = PAD + gen * LEVEL_H; u._w = unitWidth(u); u._h = 0;
      x += u._w + UNIT_GAP;
    });
  });
  return {worldW: worldW + PAD*2, worldH: PAD*2 + (Math.max(...UNITS.map(u=>u.gen)) + 1) * LEVEL_H};
}

const world = layoutUnits();
canvas.style.width = world.worldW + "px";
canvas.style.height = world.worldH + "px";
linksSvg.setAttribute('width', world.worldW);
linksSvg.setAttribute('height', world.worldH);
linksSvg.setAttribute('viewBox', `0 0 ${world.worldW} ${world.worldH}`);

function renderUnits(){
  UNITS.forEach(u=>{
    const div = document.createElement('div');
    div.className = "unit" + (DIRECT_UNITS.has(u.id) ? " direct-unit" : "");
    div.dataset.unit = u.id;
    div.style.left = u._x + "px";
    div.style.top = u._y + "px";
    div.style.width = u._w + "px";
    div.innerHTML = u.persons.map(pid=>personHTML(pid,u)).join("");
    canvas.appendChild(div);
    u._el = div;
    u._h = div.offsetHeight;
    div.querySelectorAll('.person').forEach(btn=>{
      btn.addEventListener('pointerdown', e=>e.stopPropagation());
      btn.addEventListener('click', e=>{
        e.preventDefault(); e.stopPropagation();
        openPerson(btn.dataset.id);
      });
    });
  });
}
renderUnits();

function unitCenter(u){ return {x:u._el.offsetLeft + u._el.offsetWidth/2, y:u._el.offsetTop + u._el.offsetHeight}; }
function unitTop(u){ return {x:u._el.offsetLeft + u._el.offsetWidth/2, y:u._el.offsetTop}; }
function drawLinks(){
  let paths = "";
  EDGES.forEach(edge=>{
    const from = UNIT_BY_ID[edge.from], to = UNIT_BY_ID[edge.to];
    const a = unitCenter(from), b = unitTop(to);
    const busY = a.y + (b.y - a.y) * 0.5;
    const direct = DIRECT_EDGES.has(`${edge.from}>${edge.to}`);
    paths += `<path class="link${direct ? " direct" : " faint"}" d="M ${a.x} ${a.y} V ${busY} H ${b.x} V ${b.y}"/>`;
  });
  linksSvg.innerHTML = paths;
}
drawLinks();

let scale = 1, tx = 0, ty = 0;
const MIN_S = 0.15, MAX_S = 2.4;
function applyTransform(){ canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; }
function clampScale(s){ return Math.max(MIN_S, Math.min(MAX_S, s)); }
function fit(){
  const vw = viewport.clientWidth, vh = viewport.clientHeight;
  scale = clampScale(Math.min(vw / world.worldW, vh / world.worldH) * 0.98);
  tx = (vw - world.worldW * scale) / 2;
  ty = (vh - world.worldH * scale) / 2;
  applyTransform();
}
function zoomAt(factor, cx, cy){
  const ns = clampScale(scale * factor);
  if(ns === scale) return;
  const wx = (cx - tx) / scale, wy = (cy - ty) / scale;
  scale = ns; tx = cx - wx * scale; ty = cy - wy * scale;
  applyTransform();
}
document.getElementById('zoomIn').onclick = ()=>{ const r=viewport.getBoundingClientRect(); zoomAt(1.25, r.width/2, r.height/2); };
document.getElementById('zoomOut').onclick = ()=>{ const r=viewport.getBoundingClientRect(); zoomAt(0.8, r.width/2, r.height/2); };
document.getElementById('fit').onclick = fit;
viewport.addEventListener('wheel', e=>{
  e.preventDefault();
  const r = viewport.getBoundingClientRect();
  zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX-r.left, e.clientY-r.top);
},{passive:false});
const pointers = new Map();
let panStart = null, movedFar = false, pinchStart = null;
viewport.addEventListener('pointerdown', e=>{
  if(e.target.closest('.person,.relchip,.person-link,.panel-close')) return;
  viewport.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  movedFar = false;
  if(pointers.size===1){ panStart={x:e.clientX,y:e.clientY,tx,ty}; viewport.classList.add('grabbing'); }
  else if(pointers.size===2){
    const pts=[...pointers.values()];
    pinchStart={dist:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),mid:{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2},scale,tx,ty};
    panStart=null;
  }
});
viewport.addEventListener('pointermove', e=>{
  if(!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2 && pinchStart){
    const pts=[...pointers.values()];
    const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
    const m={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
    const r=viewport.getBoundingClientRect();
    const ns=clampScale(pinchStart.scale*(d/pinchStart.dist));
    const wx=(pinchStart.mid.x-r.left-pinchStart.tx)/pinchStart.scale;
    const wy=(pinchStart.mid.y-r.top-pinchStart.ty)/pinchStart.scale;
    scale=ns; tx=m.x-r.left-wx*scale; ty=m.y-r.top-wy*scale; movedFar=true; applyTransform(); return;
  }
  if(panStart){
    const dx=e.clientX-panStart.x, dy=e.clientY-panStart.y;
    if(Math.abs(dx)+Math.abs(dy)>6) movedFar=true;
    tx=panStart.tx+dx; ty=panStart.ty+dy; applyTransform();
  }
});
function endPointer(e){
  pointers.delete(e.pointerId);
  if(pointers.size<2) pinchStart=null;
  if(pointers.size===0){ panStart=null; viewport.classList.remove('grabbing'); }
  else if(pointers.size===1){ const p=[...pointers.values()][0]; panStart={x:p.x,y:p.y,tx,ty}; }
}
viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);

const panel = document.getElementById('panel');
const scrim = document.getElementById('scrim');
function findPersonByName(name){
  return Object.entries(PEOPLE).find(([,p])=>p.name===name || p.alt===name)?.[0] || null;
}
function personNameTargets(){
  return Object.entries(PEOPLE).flatMap(([id,p])=>[[p.name,id],p.alt?[p.alt,id]:null]).filter(Boolean).sort((a,b)=>b[0].length-a[0].length);
}
function linkPersonNames(value){
  let html = escapeHtml(value);
  personNameTargets().forEach(([name,id])=>{
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(escapeHtml(name))})(?=$|[^\\p{L}\\p{N}])`,"gu");
    html = html.replace(re, `$1<button class="person-link" type="button" data-id="${id}">$2</button>`);
  });
  return html;
}
function relChip(id){
  const p = PEOPLE[id]; if(!p) return "";
  const yr = p.born ? `<span class="yr">${String(p.born).slice(0,4)}</span>` : "";
  return `<button class="relchip" data-id="${id}">${escapeHtml(p.name)} ${yr}</button>`;
}
function buildTimeline(p){
  if(p.timeline?.length) return p.timeline;
  const rows = [];
  if(p.born) rows.push([p.born, `Föds${p.place ? " i "+p.place : ""}.`]);
  (p.facts||[]).forEach(([k,v])=>{
    if(/döpt/i.test(k)) rows.push([v,"Döps."]);
    if(/vigsel/i.test(k)||/vigsel/i.test(v)) rows.push([String(v).match(/\d{4}-\d{2}-\d{2}/)?.[0] || "Vigsel", v]);
  });
  if(p.died) rows.push([p.died,"Avlider."]);
  return rows;
}
function openPerson(id){
  const p = PEOPLE[id]; if(!p) return;
  document.getElementById('pRole').textContent = p.role || "Person";
  document.getElementById('pName').innerHTML = escapeHtml(p.name) + (p.alt ? ` <span class="alt">/ ${escapeHtml(p.alt)}</span>` : "");
  document.getElementById('pDates').textContent = [p.born ? "Född "+p.born : "", p.died ? "Avliden "+p.died : ""].filter(Boolean).join("  ·  ");
  const st = p.status || "open";
  const statusEl = document.getElementById('pStatus');
  statusEl.className = "panel-status " + st;
  statusEl.innerHTML = `<span class="sd"></span>${STATUS_LABEL[st]}`;
  const facts = [];
  if(p.place) facts.push(["Plats",p.place]);
  (p.facts||[]).forEach(f=>facts.push(f));
  document.getElementById('pFacts').innerHTML = facts.map(([k,v])=>{
    const openCls = /ej |öppen|osäker|ej löst|ej kartlag|ej färdig/i.test(v) ? " open" : "";
    return `<li><span class="k">${escapeHtml(k)}</span><span class="v${openCls}">${linkPersonNames(v)}</span></li>`;
  }).join("");
  const parents = p.parents || [];
  document.getElementById('pParents').innerHTML = parents.map(relChip).join("");
  document.getElementById('pParentsWrap').style.display = parents.length ? "" : "none";
  const spouse = PARTNER[id] ? [PARTNER[id]] : [];
  document.getElementById('pSpouse').innerHTML = spouse.map(relChip).join("");
  document.getElementById('pSpouseWrap').style.display = spouse.length ? "" : "none";
  const children = p.children || [];
  document.getElementById('pChildren').innerHTML = children.map(relChip).join("");
  document.getElementById('pChildrenWrap').style.display = children.length ? "" : "none";
  document.getElementById('pStory').innerHTML = (p.story||["Ännu inte utforskad."]).map(s=>`<p>${linkPersonNames(s)}</p>`).join("");
  const timeline = buildTimeline(p);
  document.getElementById('pTimeline').innerHTML = timeline.map(([y,t])=>`<li><span class="tl-y">${escapeHtml(y)}</span><span class="tl-t">${linkPersonNames(t)}</span></li>`).join("");
  document.getElementById('pTimelineWrap').style.display = timeline.length ? "" : "none";
  panel.classList.add('open'); panel.setAttribute('aria-hidden','false'); scrim.classList.add('open');
  document.getElementById('panelClose').focus();
}
function closePanel(){ panel.classList.remove('open'); panel.setAttribute('aria-hidden','true'); scrim.classList.remove('open'); }
document.getElementById('panelClose').onclick = closePanel;
scrim.onclick = closePanel;
document.addEventListener('keydown', e=>{ if(e.key==="Escape") closePanel(); });
panel.addEventListener('click', e=>{
  const target = e.target.closest('.relchip,.person-link'); if(!target) return;
  openPerson(target.dataset.id);
});

function focusPerson(id){
  const unit = UNIT_BY_ID[PERSON_TO_UNIT[id]]; if(!unit?._el) return;
  const cx = unit._el.offsetLeft + unit._el.offsetWidth/2;
  const cy = unit._el.offsetTop + unit._el.offsetHeight/2;
  scale = clampScale(Math.max(scale,0.72));
  tx = viewport.clientWidth/2 - cx*scale; ty = viewport.clientHeight/2 - cy*scale; applyTransform();
}
function personSearchText(id){
  const p = PEOPLE[id];
  return [p.name,p.alt,p.role,p.born,p.died,p.place,...(p.parents||[]).map(pid=>PEOPLE[pid]?.name),PARTNER[id]&&PEOPLE[PARTNER[id]]?.name,...(p.children||[]).map(pid=>PEOPLE[pid]?.name),...(p.facts||[]).flat(),...(p.story||[]),...(p.timeline||[]).flat()].filter(Boolean).join(" ").toLowerCase();
}
function personSearchContext(id){
  const p = PEOPLE[id], parts = [];
  if(p.born) parts.push(`född ${p.born}`);
  if(p.died) parts.push(`död ${p.died}`);
  if(p.place) parts.push(p.place);
  if(PARTNER[id]) parts.push(`make/maka: ${PEOPLE[PARTNER[id]].name}`);
  return parts.slice(0,3).join(" · ");
}
function runPersonSearch(query){
  const results = document.getElementById('searchResults');
  const q = query.trim().toLowerCase();
  if(!q){ results.classList.remove('open'); results.innerHTML=""; return; }
  const hits = Object.keys(PEOPLE).filter(id=>personSearchText(id).includes(q)).sort((a,b)=>{
    const an = PEOPLE[a].name.toLowerCase().startsWith(q) ? 0 : 1;
    const bn = PEOPLE[b].name.toLowerCase().startsWith(q) ? 0 : 1;
    return an-bn || PEOPLE[a].name.localeCompare(PEOPLE[b].name,'sv');
  }).slice(0,12);
  results.classList.add('open');
  if(!hits.length){ results.innerHTML = '<div class="search-empty">Ingen person matchar sökningen.</div>'; return; }
  results.innerHTML = hits.map(id=>{
    const p = PEOPLE[id];
    return `<button class="search-hit" type="button" data-id="${id}">
      <div class="search-hit-name">${escapeHtml(p.name)}${p.alt ? ` / ${escapeHtml(p.alt)}` : ""}</div>
      <div class="search-hit-meta">${escapeHtml(p.role || "Person")}</div>
      <div class="search-hit-context">${escapeHtml(personSearchContext(id) || "Mer information finns i personrutan.")}</div>
    </button>`;
  }).join("");
}
function initPersonSearch(){
  const input = document.getElementById('personSearch'), clear = document.getElementById('searchClear'), results = document.getElementById('searchResults');
  input.addEventListener('input',()=>runPersonSearch(input.value));
  input.addEventListener('keydown', e=>{ if(e.key==="Escape"){ input.value=""; runPersonSearch(""); } });
  clear.addEventListener('click',()=>{ input.value=""; runPersonSearch(""); input.focus(); });
  results.addEventListener('click', e=>{
    const hit = e.target.closest('.search-hit'); if(!hit) return;
    focusPerson(hit.dataset.id); openPerson(hit.dataset.id);
  });
}

let placeMap = null;
const placeMarkers = {};
function peopleForPlace(place){
  return Object.entries(PEOPLE).filter(([,p])=>{
    const hay = [p.place,...(p.facts||[]).flat(),...(p.story||[]),...(p.timeline||[]).flat()].filter(Boolean).join(" ");
    return place.aliases.some(alias=>hay.includes(alias));
  }).map(([id])=>id);
}
function initPlaceMap(){
  const mapEl = document.getElementById('placeMap'), listEl = document.getElementById('placeList');
  listEl.innerHTML = PLACES.map(p=>`<button class="place-btn" type="button" data-place="${p.id}">${escapeHtml(p.name)}</button>`).join("");
  listEl.addEventListener('click', e=>{ const btn=e.target.closest('.place-btn'); if(btn) selectPlace(btn.dataset.place); });
  document.getElementById('placePeople').addEventListener('click', e=>{ const chip=e.target.closest('.relchip'); if(chip) openPerson(chip.dataset.id); });
  if(!window.L){
    document.getElementById('mapEmpty').textContent = "Kartan kunde inte laddas. Platslistan fungerar ändå, och kartan visas när sidan har nätåtkomst.";
    selectPlace(PLACES[0].id,{skipMap:true}); return;
  }
  document.getElementById('mapEmpty').style.display = "none";
  placeMap = L.map(mapEl,{scrollWheelZoom:false}).setView([57.04,12.40],11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap'}).addTo(placeMap);
  PLACES.forEach(place=>{
    const marker = L.circleMarker([place.lat,place.lng],{radius:7,color:'#7A2C22',weight:2,fillColor:'#9C3B2E',fillOpacity:.78}).addTo(placeMap);
    marker.bindPopup(`<strong>${escapeHtml(place.name)}</strong><br>${escapeHtml(place.area)}`);
    marker.on('click',()=>selectPlace(place.id));
    placeMarkers[place.id]=marker;
  });
  placeMap.fitBounds(L.latLngBounds(PLACES.map(p=>[p.lat,p.lng])),{padding:[24,24]});
  selectPlace('munkaskog');
}
function selectPlace(id, opts={}){
  const place = PLACES.find(p=>p.id===id) || PLACES[0];
  document.querySelectorAll('.place-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.place===place.id));
  document.getElementById('placeName').textContent = place.name;
  document.getElementById('placeMeta').textContent = place.area;
  document.getElementById('placeNote').textContent = place.note;
  const related = peopleForPlace(place);
  document.getElementById('placePeople').innerHTML = related.length ? related.map(relChip).join("") : '<span class="place-note">Inga personer kopplade ännu.</span>';
  if(placeMap && !opts.skipMap){ placeMap.setView([place.lat,place.lng],place.zoom); placeMarkers[place.id]?.openPopup(); }
}

fit();
initPersonSearch();
initPlaceMap();
document.getElementById('mapJump').onclick = ()=>document.getElementById('platskarta').scrollIntoView({behavior:'smooth',block:'start'});
