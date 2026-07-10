// Axels släkt - app-logik
// Renderar trädet, personrutor, sök och karta utifrån data.js.

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function escapeRegExp(value){ return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
const PERSON_PLACEHOLDER = "assets/person-placeholder.svg";
function personPhoto(p){ return p.photo || p.image || PERSON_PLACEHOLDER; }
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
    <img class="pcard-photo" src="${escapeHtml(personPhoto(p))}" alt="" loading="lazy" onerror="this.src='${PERSON_PLACEHOLDER}'">
    <span class="pcard-text">
      <span class="prole"><span class="sdot ${p.status || 'open'}"></span>${escapeHtml(role)}</span>
      <span class="pname">${escapeHtml(p.name)}${alt}</span>
      ${dates ? `<span class="pdates">${escapeHtml(dates)}</span>` : ""}
    </span>
  </button>`;
}

const CARD_W = window.innerWidth <= 640 ? 188 : 208;
const DIRECT_CARD_W = window.innerWidth <= 640 ? 216 : 246;
const CARD_GAP = 12;
const UNIT_GAP = 64;
const BRANCH_GAP = window.innerWidth <= 640 ? 180 : 360;
const LEVEL_H = window.innerWidth <= 640 ? 255 : 265;
const PAD = 80;
const canvas = document.getElementById('canvas');
const linksSvg = document.getElementById('links');
const viewport = document.getElementById('viewport');
const branchState = { mother:true, father:true };
let currentPlaceId = null;

function personWidth(id){ return DIRECT_HEIRS.has(id) ? DIRECT_CARD_W : CARD_W; }
function unitWidth(unit){ return unit.persons.reduce((sum,id)=>sum + personWidth(id), 0) + (unit.persons.length - 1) * CARD_GAP; }
function shouldShowUnit(unit){
  if(MOTHER_UNITS.has(unit.id) && !branchState.mother) return false;
  if(FATHER_UNITS.has(unit.id) && !branchState.father) return false;
  return true;
}
function activeUnits(){ return UNITS.filter(shouldShowUnit); }
function unitBranch(unit){
  if(MOTHER_UNITS.has(unit.id)) return "mother";
  if(FATHER_UNITS.has(unit.id)) return "father";
  return "shared";
}
function personMatchesActiveBranches(id){
  const unitId = PERSON_TO_UNIT[id];
  if(MOTHER_UNITS.has(unitId)) return branchState.mother;
  if(FATHER_UNITS.has(unitId)) return branchState.father;
  return true;
}
function layoutUnits(units){
  const rows = new Map();
  units.forEach(u=>{ if(!rows.has(u.gen)) rows.set(u.gen, []); rows.get(u.gen).push(u); });
  if(branchState.mother && branchState.father) return layoutSplitBranches(rows, units);
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
  const maxGen = units.length ? Math.max(...units.map(u=>u.gen)) : 0;
  return {worldW: Math.max(worldW + PAD*2, viewport.clientWidth || 0), worldH: PAD*2 + (maxGen + 1) * LEVEL_H};
}
function rowWidth(units){
  return units.reduce((sum,u)=>sum + unitWidth(u), 0) + Math.max(0, units.length-1) * UNIT_GAP;
}
function placeRow(units, startX, gen){
  let x = startX;
  units.forEach(u=>{
    u._x = x; u._y = PAD + gen * LEVEL_H; u._w = unitWidth(u); u._h = 0;
    x += u._w + UNIT_GAP;
  });
}
function layoutSplitBranches(rows, units){
  let leftW = 0, rightW = 0, sharedW = 0;
  [...rows.entries()].forEach(([, row])=>{
    leftW = Math.max(leftW, rowWidth(row.filter(u=>unitBranch(u)==="mother")));
    rightW = Math.max(rightW, rowWidth(row.filter(u=>unitBranch(u)==="father")));
    sharedW = Math.max(sharedW, rowWidth(row.filter(u=>unitBranch(u)==="shared")));
  });
  const centerGap = Math.max(BRANCH_GAP, sharedW + UNIT_GAP * 2);
  const worldW = Math.max(PAD*2 + leftW + centerGap + rightW, viewport.clientWidth || 0);
  const centerX = PAD + leftW + centerGap / 2;
  [...rows.entries()].forEach(([gen, row])=>{
    const mother = row.filter(u=>unitBranch(u)==="mother");
    const shared = row.filter(u=>unitBranch(u)==="shared");
    const father = row.filter(u=>unitBranch(u)==="father");
    const motherW = rowWidth(mother);
    const sharedRowW = rowWidth(shared);
    placeRow(mother, PAD + leftW - motherW, gen);
    placeRow(shared, centerX - sharedRowW / 2, gen);
    placeRow(father, PAD + leftW + centerGap, gen);
  });
  const maxGen = units.length ? Math.max(...units.map(u=>u.gen)) : 0;
  return {worldW, worldH: PAD*2 + (maxGen + 1) * LEVEL_H};
}

let world = {worldW:0, worldH:0};
let visibleUnitIds = new Set();
function applyWorld(nextWorld){
  world = nextWorld;
  canvas.style.width = world.worldW + "px";
  canvas.style.height = world.worldH + "px";
  linksSvg.setAttribute('width', world.worldW);
  linksSvg.setAttribute('height', world.worldH);
  linksSvg.setAttribute('viewBox', `0 0 ${world.worldW} ${world.worldH}`);
}

function renderUnits(units){
  canvas.querySelectorAll('.unit').forEach(el=>el.remove());
  UNITS.forEach(u=>{ u._el = null; });
  visibleUnitIds = new Set(units.map(u=>u.id));
  units.forEach(u=>{
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

function unitCenter(u){ return {x:u._el.offsetLeft + u._el.offsetWidth/2, y:u._el.offsetTop + u._el.offsetHeight}; }
function unitTop(u){ return {x:u._el.offsetLeft + u._el.offsetWidth/2, y:u._el.offsetTop}; }
function drawLinks(){
  let paths = "";
  EDGES.forEach(edge=>{
    if(!visibleUnitIds.has(edge.from) || !visibleUnitIds.has(edge.to)) return;
    const from = UNIT_BY_ID[edge.from], to = UNIT_BY_ID[edge.to];
    if(!from._el || !to._el) return;
    const a = unitCenter(from), b = unitTop(to);
    const busY = a.y + (b.y - a.y) * 0.5;
    const direct = DIRECT_EDGES.has(`${edge.from}>${edge.to}`);
    paths += `<path class="link${direct ? " direct" : " faint"}" d="M ${a.x} ${a.y} V ${busY} H ${b.x} V ${b.y}"/>`;
  });
  linksSvg.innerHTML = paths;
}
function renderTree({preserveView=false}={}){
  const units = activeUnits();
  applyWorld(layoutUnits(units));
  renderUnits(units);
  drawLinks();
  if(!preserveView) fit();
}

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
  panel.setAttribute('aria-label','Livshistoria');
  panel.classList.remove('place-mode');
  const photo = document.getElementById('pPhoto');
  photo.style.display = "";
  photo.src = personPhoto(p);
  photo.alt = `Porträttbild för ${p.name}`;
  photo.onerror = ()=>{ photo.src = PERSON_PLACEHOLDER; };
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
  document.getElementById('pPlacePeopleWrap').style.display = "none";
  document.getElementById('pStoryLabel').textContent = "Livshistoria";
  document.getElementById('pStory').innerHTML = (p.story||["Ännu inte utforskad."]).map(s=>`<p>${linkPersonNames(s)}</p>`).join("");
  const timeline = buildTimeline(p);
  document.getElementById('pTimelineLabel').textContent = "Livslinje";
  document.getElementById('pTimeline').innerHTML = timeline.map(([y,t])=>`<li><span class="tl-y">${escapeHtml(y)}</span><span class="tl-t">${linkPersonNames(t)}</span></li>`).join("");
  document.getElementById('pTimelineWrap').style.display = timeline.length ? "" : "none";
  panel.classList.add('open'); panel.setAttribute('aria-hidden','false'); scrim.classList.add('open');
  document.getElementById('panelClose').focus();
}
function openPlace(id){
  const place = PLACES.find(p=>p.id===id); if(!place) return;
  selectPlace(place.id,{skipMap:true});
  const relatedPeople = placePeople(place);
  panel.setAttribute('aria-label','Platskort');
  panel.classList.add('place-mode');
  document.getElementById('pPhoto').style.display = "none";
  document.getElementById('pRole').textContent = "Platskort";
  document.getElementById('pName').textContent = place.name;
  document.getElementById('pDates').textContent = [place.area, hasCoords(place) ? "Kartpunkt finns" : "Ingen exakt kartpunkt ännu"].filter(Boolean).join("  ·  ");
  const statusEl = document.getElementById('pStatus');
  statusEl.className = "panel-status " + (hasCoords(place) ? "confirmed" : "working");
  statusEl.innerHTML = `<span class="sd"></span>${hasCoords(place) ? "Kartlagd plats" : "Plats utan exakt punkt"}`;
  const facts = [
    ["Område", place.area || "Ej angivet"],
    ["Kartstatus", hasCoords(place) ? `${place.lat.toFixed(3)}, ${place.lng.toFixed(3)}` : "Exakt kartpunkt saknas"],
    ["Kopplade personer", String(relatedPeople.length)]
  ];
  if(place.aliases?.length) facts.push(["Namnvarianter", place.aliases.join(", ")]);
  document.getElementById('pFacts').innerHTML = facts.map(([k,v])=>`<li><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></li>`).join("");
  document.getElementById('pParentsWrap').style.display = "none";
  document.getElementById('pSpouseWrap').style.display = "none";
  document.getElementById('pChildrenWrap').style.display = "none";
  document.getElementById('pPlacePeople').innerHTML = relatedPeople.map(row=>relChip(row.id)).join("");
  document.getElementById('pPlacePeopleWrap').style.display = relatedPeople.length ? "" : "none";
  document.getElementById('pStoryLabel').textContent = "Om platsen";
  const placeStory = [place.note || "Ingen längre platsbeskrivning är inlagd ännu."];
  if(relatedPeople.length){
    const direct = relatedPeople.filter(row=>DIRECT_HEIRS.has(row.id)).map(row=>PEOPLE[row.id].name);
    if(direct.length) placeStory.push(`Direkta ledet har koppling hit genom ${direct.slice(0,5).join(", ")}${direct.length > 5 ? " med flera" : ""}.`);
  }
  document.getElementById('pStory').innerHTML = placeStory.map(s=>`<p>${linkPersonNames(s)}</p>`).join("");
  document.getElementById('pTimelineLabel').textContent = "Platsens historia";
  document.getElementById('pTimeline').innerHTML = relatedPeople.flatMap(row=>row.texts.map((text,index)=>[
    index === 0 ? PEOPLE[row.id].name : "Fler spår",
    text
  ])).slice(0,12).map(([y,t])=>`<li><span class="tl-y">${escapeHtml(y)}</span><span class="tl-t">${linkPersonNames(t)}</span></li>`).join("");
  document.getElementById('pTimelineWrap').style.display = relatedPeople.length ? "" : "none";
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
function initBranchFilters(){
  const motherInputs = [...document.querySelectorAll('[data-branch-toggle="mother"]')];
  const fatherInputs = [...document.querySelectorAll('[data-branch-toggle="father"]')];
  if(!motherInputs.length || !fatherInputs.length) return;
  function setAll(inputs, checked){ inputs.forEach(input=>{ input.checked = checked; }); }
  function sync(source){
    if(source?.dataset.branchToggle === "mother") branchState.mother = source.checked;
    if(source?.dataset.branchToggle === "father") branchState.father = source.checked;
    setAll(motherInputs, branchState.mother);
    setAll(fatherInputs, branchState.father);
    renderTree();
    renderPlaceList();
    refreshSelectedPlace();
  }
  [...motherInputs,...fatherInputs].forEach(input=>input.addEventListener('change',()=>sync(input)));
  setAll(motherInputs, branchState.mother);
  setAll(fatherInputs, branchState.father);
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
function currentSearchMode(){
  return document.querySelector('input[name="searchMode"]:checked')?.value || "person";
}
function placeSearchText(place){
  return [place.name,place.area,place.note,...(place.aliases||[])].filter(Boolean).join(" ").toLocaleLowerCase('sv');
}
function runSearch(query){
  const results = document.getElementById('searchResults');
  const q = query.trim().toLowerCase();
  if(!q){ results.classList.remove('open'); results.innerHTML=""; return; }
  if(currentSearchMode() === "place"){ runPlaceSearch(q, results); return; }
  runPersonSearch(q, results);
}
function runPersonSearch(q, results){
  const hits = Object.keys(PEOPLE).filter(id=>personSearchText(id).includes(q)).sort((a,b)=>{
    const an = PEOPLE[a].name.toLowerCase().startsWith(q) ? 0 : 1;
    const bn = PEOPLE[b].name.toLowerCase().startsWith(q) ? 0 : 1;
    return an-bn || PEOPLE[a].name.localeCompare(PEOPLE[b].name,'sv');
  }).slice(0,12);
  results.classList.add('open');
  if(!hits.length){ results.innerHTML = '<div class="search-empty">Ingen person matchar sökningen.</div>'; return; }
  results.innerHTML = hits.map(id=>{
    const p = PEOPLE[id];
    return `<button class="search-hit" type="button" data-type="person" data-id="${id}">
      <div class="search-hit-name">${escapeHtml(p.name)}${p.alt ? ` / ${escapeHtml(p.alt)}` : ""}</div>
      <div class="search-hit-meta">${escapeHtml(p.role || "Person")}</div>
      <div class="search-hit-context">${escapeHtml(personSearchContext(id) || "Mer information finns i personrutan.")}</div>
    </button>`;
  }).join("");
}
function runPlaceSearch(q, results){
  const hits = visiblePlaces().filter(place=>placeSearchText(place).includes(q)).sort((a,b)=>{
    const an = a.name.toLocaleLowerCase('sv').startsWith(q) ? 0 : 1;
    const bn = b.name.toLocaleLowerCase('sv').startsWith(q) ? 0 : 1;
    return an-bn || a.name.localeCompare(b.name,'sv');
  }).slice(0,12);
  results.classList.add('open');
  if(!hits.length){ results.innerHTML = '<div class="search-empty">Ingen plats matchar sökningen.</div>'; return; }
  results.innerHTML = hits.map(place=>{
    const related = placePeople(place).length;
    return `<button class="search-hit" type="button" data-type="place" data-place="${place.id}">
      <div class="search-hit-name">${escapeHtml(place.name)}</div>
      <div class="search-hit-meta">${escapeHtml(place.area)}${hasCoords(place) ? "" : " · ingen exakt kartpunkt"}</div>
      <div class="search-hit-context">${related ? `${related} person${related === 1 ? "" : "er"} kopplade` : "Inga personer kopplade i aktivt filter"}</div>
    </button>`;
  }).join("");
}
function initPersonSearch(){
  const input = document.getElementById('personSearch'), clear = document.getElementById('searchClear'), results = document.getElementById('searchResults');
  const modes = [...document.querySelectorAll('input[name="searchMode"]')];
  input.addEventListener('input',()=>runSearch(input.value));
  input.addEventListener('keydown', e=>{ if(e.key==="Escape"){ input.value=""; runSearch(""); } });
  modes.forEach(mode=>mode.addEventListener('change',()=>{
    input.placeholder = currentSearchMode() === "place" ? "Sök plats, gård, socken eller ort" : "Sök person på namn, födelsedatum, plats eller notering";
    runSearch(input.value);
  }));
  clear.addEventListener('click',()=>{ input.value=""; runSearch(""); input.focus(); });
  results.addEventListener('click', e=>{
    const hit = e.target.closest('.search-hit'); if(!hit) return;
    if(hit.dataset.type === "place"){
      document.getElementById('platskarta').scrollIntoView({behavior:'smooth',block:'start'});
      selectPlace(hit.dataset.place);
      openPlace(hit.dataset.place);
      return;
    }
    focusPerson(hit.dataset.id); openPerson(hit.dataset.id);
  });
}

let placeMap = null;
const placeMarkers = {};
function hasCoords(place){ return Number.isFinite(place.lat) && Number.isFinite(place.lng); }
function placeHaystack(p){
  return [p.place,...(p.facts||[]).flat(),...(p.story||[]),...(p.timeline||[]).flat()].filter(Boolean).join(" ");
}
function placeMatchesText(place, text){
  const hay = String(text || "").toLocaleLowerCase('sv');
  return (place.aliases || [place.name]).some(alias=>hay.includes(String(alias).toLocaleLowerCase('sv')));
}
function placePeople(place){
  const byPerson = new Map();
  Object.entries(PEOPLE).forEach(([id,p])=>{
    if(!personMatchesActiveBranches(id)) return;
    const chunks = [];
    if(p.place) chunks.push(["Plats", p.place]);
    (p.facts||[]).forEach(([k,v])=>chunks.push([k, v]));
    (p.story||[]).forEach(v=>chunks.push(["Livshistoria", v]));
    (p.timeline||[]).forEach(([k,v])=>chunks.push([k, v]));
    chunks.forEach(([label,text])=>{
      if(!placeMatchesText(place, text)) return;
      if(!byPerson.has(id)) byPerson.set(id, {id, labels:new Set(), texts:[]});
      const row = byPerson.get(id);
      row.labels.add(label);
      if(row.texts.length < 3) row.texts.push(text);
    });
  });
  return [...byPerson.values()].sort((a,b)=>{
    const direct = Number(DIRECT_HEIRS.has(b.id)) - Number(DIRECT_HEIRS.has(a.id));
    return direct || PEOPLE[a.id].name.localeCompare(PEOPLE[b.id].name,'sv');
  });
}
function visiblePlaces(){
  if(branchState.mother && branchState.father) return PLACES;
  return PLACES.filter(place=>placePeople(place).length > 0);
}
function renderPlaceList(){
  const listEl = document.getElementById('placeList');
  if(!listEl) return;
  const places = visiblePlaces();
  listEl.innerHTML = places.length ? places.map(p=>`<button class="place-btn" type="button" data-place="${p.id}">
    <span class="place-btn-name">${escapeHtml(p.name)}</span>
    <span class="place-btn-meta">${escapeHtml(p.area)}${hasCoords(p) ? "" : " · ej kartlagd"}</span>
  </button>`).join("") : '<div class="place-empty-row">Inga platser matchar valt filter.</div>';
}
function initPlaceMap(){
  const mapEl = document.getElementById('placeMap'), listEl = document.getElementById('placeList');
  renderPlaceList();
  listEl.addEventListener('click', e=>{ const btn=e.target.closest('.place-btn'); if(btn) selectPlace(btn.dataset.place); });
  document.getElementById('placeEvidence').addEventListener('click', e=>{ const btn=e.target.closest('.place-evidence-person'); if(btn) openPerson(btn.dataset.id); });
  document.getElementById('placeOpen').addEventListener('click',()=>{ if(currentPlaceId) openPlace(currentPlaceId); });
  if(!window.L){
    document.getElementById('mapEmpty').textContent = "Kartan kunde inte laddas. Platslistan fungerar ändå, och kartan visas när sidan har nätåtkomst.";
    selectPlace(PLACES[0].id,{skipMap:true}); return;
  }
  document.getElementById('mapEmpty').style.display = "none";
  placeMap = L.map(mapEl,{scrollWheelZoom:false}).setView([57.04,12.40],11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap'}).addTo(placeMap);
  PLACES.forEach(place=>{
    if(!hasCoords(place)) return;
    const marker = L.circleMarker([place.lat,place.lng],{radius:7,color:'#38583F',weight:2,fillColor:'#5E7A55',fillOpacity:.78}).addTo(placeMap);
    marker.bindPopup(`<strong>${escapeHtml(place.name)}</strong><br>${escapeHtml(place.area)}<br><button type="button" data-place-card="${escapeHtml(place.id)}">Öppna platskort</button>`);
    marker.on('click',()=>selectPlace(place.id));
    placeMarkers[place.id]=marker;
  });
  const mappedPlaces = PLACES.filter(hasCoords);
  if(mappedPlaces.length) placeMap.fitBounds(L.latLngBounds(mappedPlaces.map(p=>[p.lat,p.lng])),{padding:[24,24]});
  selectPlace('munkaskog');
}
function refreshSelectedPlace(){
  const places = visiblePlaces();
  if(!places.length){
    document.getElementById('placeName').textContent = "Inga platser";
    document.getElementById('placeMeta').textContent = "Välj minst en släktgren";
    document.getElementById('placeNote').textContent = "Platsregistret filtreras efter de grenar som är aktiva i trädet.";
    document.getElementById('placeEvidence').innerHTML = '<li class="place-empty-row">Inga platser matchar valt filter.</li>';
    return;
  }
  const next = places.some(p=>p.id===currentPlaceId) ? currentPlaceId : places[0].id;
  selectPlace(next,{skipMap:true});
}
function selectPlace(id, opts={}){
  const place = PLACES.find(p=>p.id===id) || PLACES[0];
  currentPlaceId = place.id;
  document.querySelectorAll('.place-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.place===place.id));
  document.getElementById('placeName').textContent = place.name;
  document.getElementById('placeMeta').textContent = hasCoords(place) ? place.area : `${place.area} · ingen exakt kartpunkt ännu`;
  document.getElementById('placeNote').textContent = place.note;
  const relatedPeople = placePeople(place);
  document.getElementById('placeEvidence').innerHTML = relatedPeople.length ? relatedPeople.map(row=>`
    <li>
      <button class="place-evidence-person" type="button" data-id="${row.id}">${escapeHtml(PEOPLE[row.id].name)}</button>
      <span class="place-evidence-label">${escapeHtml([...row.labels].join(", "))}${row.texts.length > 1 ? ` · ${row.texts.length} kopplingar` : ""}</span>
      <span class="place-evidence-text">${escapeHtml(row.texts[0])}</span>
    </li>`).join("") : '<li class="place-empty-row">Inga textkopplingar inlagda ännu.</li>';
  if(placeMap && !opts.skipMap && hasCoords(place)){
    document.getElementById('mapEmpty').style.display = "none";
    placeMap.setView([place.lat,place.lng],place.zoom);
    placeMarkers[place.id]?.openPopup();
  } else if(placeMap && !opts.skipMap && !hasCoords(place)){
    document.getElementById('mapEmpty').style.display = "flex";
    document.getElementById('mapEmpty').textContent = "Den här platsen finns i platsregistret men saknar exakt kartpunkt ännu.";
  }
}
document.addEventListener('click', e=>{
  const placeCardBtn = e.target.closest('[data-place-card]');
  if(placeCardBtn) openPlace(placeCardBtn.dataset.placeCard);
});

renderTree();
initBranchFilters();
initPersonSearch();
initPlaceMap();
document.getElementById('mapJump').onclick = ()=>document.getElementById('platskarta').scrollIntoView({behavior:'smooth',block:'start'});
