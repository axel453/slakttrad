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
const FATHER_SIDE_GAP = window.innerWidth <= 640 ? 180 : 300;
const MOTHER_SIDE_GAP = FATHER_SIDE_GAP;
const LEVEL_H = window.innerWidth <= 640 ? 255 : 265;
const PAD = 80;
const canvas = document.getElementById('canvas');
const linksSvg = document.getElementById('links');
const viewport = document.getElementById('viewport');
const branchState = { mother:true, father:true };
let currentPlaceId = null;
const MANUAL_STORAGE_KEY = "axels-slakt-manual-data-v1";
const manualData = { people:{}, edits:{}, units:[], places:[] };
let currentPanelPersonId = null;
const collapsedUnitIds = new Set();
const compactExpandedUnitIds = new Set();
let compactTreeMode = true;
let layoutMinGen = 0;

function personWidth(id){ return DIRECT_HEIRS.has(id) ? DIRECT_CARD_W : CARD_W; }
function unitWidth(unit){ return unit.persons.reduce((sum,id)=>sum + personWidth(id), 0) + (unit.persons.length - 1) * CARD_GAP; }
function shouldShowUnit(unit){
  if(MOTHER_UNITS.has(unit.id) && !branchState.mother) return false;
  if(FATHER_UNITS.has(unit.id) && !branchState.father) return false;
  return true;
}
function childUnitIds(unitId){
  return UNIT_BY_ID[unitId]?.children || [];
}
function descendantUnitIds(unitId, seen=new Set()){
  childUnitIds(unitId).forEach(childId=>{
    if(seen.has(childId)) return;
    seen.add(childId);
    descendantUnitIds(childId, seen);
  });
  return seen;
}
function hiddenByCollapseIds(){
  const hidden = new Set();
  collapsedUnitIds.forEach(unitId=>{
    descendantUnitIds(unitId).forEach(id=>hidden.add(id));
  });
  return hidden;
}
function compactVisibleUnitIds(){
  const visible = new Set([...DIRECT_UNITS].filter(id=>UNIT_BY_ID[id] && shouldShowUnit(UNIT_BY_ID[id])));
  let changed = true;
  while(changed){
    changed = false;
    [...visible].forEach(unitId=>{
      if(!compactExpandedUnitIds.has(unitId)) return;
      childUnitIds(unitId).forEach(childId=>{
        if(visible.has(childId) || !UNIT_BY_ID[childId] || !shouldShowUnit(UNIT_BY_ID[childId])) return;
        visible.add(childId);
        changed = true;
      });
    });
  }
  return visible;
}
function activeUnits(){
  const hidden = hiddenByCollapseIds();
  const compactVisible = compactVisibleUnitIds();
  return UNITS.filter(unit=>{
    if(!shouldShowUnit(unit) || hidden.has(unit.id)) return false;
    if(compactTreeMode && !compactVisible.has(unit.id)) return false;
    return true;
  });
}
function hiddenChildCount(unit){
  if(compactTreeMode){
    const compactVisible = compactVisibleUnitIds();
    return childUnitIds(unit.id).filter(id=>UNIT_BY_ID[id] && shouldShowUnit(UNIT_BY_ID[id]) && !compactVisible.has(id)).length;
  }
  return [...descendantUnitIds(unit.id)].filter(id=>UNIT_BY_ID[id] && shouldShowUnit(UNIT_BY_ID[id])).length;
}
function revealKind(unit){
  const hasDirectChild = childUnitIds(unit.id).some(id=>DIRECT_UNITS.has(id));
  return hasDirectChild && DIRECT_UNITS.has(unit.id) ? "syskon" : "barn";
}
function unitToggleState(unit){
  const hiddenCount = hiddenChildCount(unit);
  if(compactTreeMode){
    const expanded = compactExpandedUnitIds.has(unit.id);
    if(!hiddenCount && !expanded) return null;
    const kind = revealKind(unit);
    return {
      expanded,
      symbol:expanded ? "▾" : "▸",
      text:expanded ? `Dölj ${kind}` : `Visa ${kind}${hiddenCount ? ` (${hiddenCount})` : ""}`,
      label:expanded ? `Dölj utfällda ${kind}` : `Visa ${kind}${hiddenCount ? `, ${hiddenCount} dolda kort` : ""}`
    };
  }
  const collapsed = collapsedUnitIds.has(unit.id);
  if(!hiddenCount && !collapsed) return null;
  return {
    expanded:!collapsed,
    symbol:collapsed ? "▸" : "▾",
    text:collapsed ? `Visa gren (${hiddenCount})` : "Dölj gren",
    label:collapsed ? `Visa ${hiddenCount} dolda kort` : "Dölj grenen under kortet"
  };
}
function unitBranch(unit){
  if(MOTHER_UNITS.has(unit.id)) return "mother";
  if(FATHER_UNITS.has(unit.id)) return "father";
  return "shared";
}
function fatherLane(unit){
  if(unit.id === "u_elsa_nils_stig") return "father-couple";
  if(typeof FATHER_MOTHER_UNITS !== "undefined" && FATHER_MOTHER_UNITS.has(unit.id)) return "father-mother";
  if(typeof FATHER_FATHER_UNITS !== "undefined" && FATHER_FATHER_UNITS.has(unit.id)) return "father-father";
  return "father-other";
}
function motherLane(unit){
  if(unit.id === "u_karin_harry") return "mother-couple";
  if(typeof MOTHER_MOTHER_UNITS !== "undefined" && MOTHER_MOTHER_UNITS.has(unit.id)) return "mother-karin";
  if(typeof MOTHER_FATHER_UNITS !== "undefined" && MOTHER_FATHER_UNITS.has(unit.id)) return "mother-harry";
  return "mother-other";
}
function personMatchesActiveBranches(id){
  const unitId = PERSON_TO_UNIT[id];
  if(MOTHER_UNITS.has(unitId)) return branchState.mother;
  if(FATHER_UNITS.has(unitId)) return branchState.father;
  return true;
}
function layoutUnits(units){
  const rows = new Map();
  layoutMinGen = units.length ? Math.min(...units.map(u=>u.gen)) : 0;
  units.forEach(u=>{ if(!rows.has(u.gen)) rows.set(u.gen, []); rows.get(u.gen).push(u); });
  if(branchState.mother && branchState.father) return layoutSplitBranches(rows, units);
  if(!branchState.mother && branchState.father) return layoutFatherOnly(rows, units);
  if(branchState.mother && !branchState.father) return layoutMotherOnly(rows, units);
  let worldW = 0;
  [...rows.entries()].forEach(([gen, units])=>{
    const rowW = units.reduce((sum,u)=>sum + unitWidth(u), 0) + Math.max(0, units.length-1) * UNIT_GAP;
    worldW = Math.max(worldW, rowW);
  });
  [...rows.entries()].forEach(([gen, units])=>{
    const rowW = units.reduce((sum,u)=>sum + unitWidth(u), 0) + Math.max(0, units.length-1) * UNIT_GAP;
    let x = PAD + (worldW - rowW) / 2;
    units.forEach(u=>{
      u._x = x; u._y = rowTop(gen); u._w = unitWidth(u); u._h = 0;
      x += u._w + UNIT_GAP;
    });
  });
  const maxGen = units.length ? Math.max(...units.map(u=>u.gen)) : 0;
  return {worldW: Math.max(worldW + PAD*2, viewport.clientWidth || 0), worldH: PAD*2 + (maxGen - layoutMinGen + 1) * LEVEL_H};
}
function rowWidth(units){
  return units.reduce((sum,u)=>sum + unitWidth(u), 0) + Math.max(0, units.length-1) * UNIT_GAP;
}
function rowTop(gen){ return PAD + (gen - layoutMinGen) * LEVEL_H; }
function placeRow(units, startX, gen){
  let x = startX;
  units.forEach(u=>{
    u._x = x; u._y = rowTop(gen); u._w = unitWidth(u); u._h = 0;
    x += u._w + UNIT_GAP;
  });
}
function motherLaneWidths(rows){
  let karinW = 0, harryW = 0, coupleW = 0, otherW = 0;
  [...rows.values()].forEach(row=>{
    const motherRow = row.filter(u=>unitBranch(u)==="mother");
    karinW = Math.max(karinW, rowWidth(motherRow.filter(u=>motherLane(u)==="mother-karin")));
    harryW = Math.max(harryW, rowWidth(motherRow.filter(u=>motherLane(u)==="mother-harry")));
    coupleW = Math.max(coupleW, rowWidth(motherRow.filter(u=>motherLane(u)==="mother-couple")));
    otherW = Math.max(otherW, rowWidth(motherRow.filter(u=>motherLane(u)==="mother-other")));
  });
  const hasAny = karinW || harryW || coupleW || otherW;
  const centerGap = hasAny ? Math.max(MOTHER_SIDE_GAP, coupleW + UNIT_GAP) : 0;
  return {karinW, harryW, coupleW, otherW, centerGap, totalW: karinW + centerGap + harryW + otherW};
}
function placeMotherLanes(row, startX, gen, widths){
  const karin = row.filter(u=>motherLane(u)==="mother-karin");
  const harry = row.filter(u=>motherLane(u)==="mother-harry");
  const couple = row.filter(u=>motherLane(u)==="mother-couple");
  const other = row.filter(u=>motherLane(u)==="mother-other");
  const karinW = rowWidth(karin);
  const harryStart = startX + widths.karinW + widths.centerGap;
  placeRow(karin, startX + widths.karinW - karinW, gen);
  placeRow(couple, startX + widths.karinW + widths.centerGap / 2 - rowWidth(couple) / 2, gen);
  placeRow(harry, harryStart, gen);
  placeRow(other, harryStart + widths.harryW + UNIT_GAP, gen);
}
function fatherLaneWidths(rows){
  let motherW = 0, fatherW = 0, coupleW = 0, otherW = 0;
  [...rows.values()].forEach(row=>{
    const fatherRow = row.filter(u=>unitBranch(u)==="father");
    motherW = Math.max(motherW, rowWidth(fatherRow.filter(u=>fatherLane(u)==="father-mother")));
    fatherW = Math.max(fatherW, rowWidth(fatherRow.filter(u=>fatherLane(u)==="father-father")));
    coupleW = Math.max(coupleW, rowWidth(fatherRow.filter(u=>fatherLane(u)==="father-couple")));
    otherW = Math.max(otherW, rowWidth(fatherRow.filter(u=>fatherLane(u)==="father-other")));
  });
  const centerGap = Math.max(FATHER_SIDE_GAP, coupleW + UNIT_GAP);
  return {motherW, fatherW, coupleW, otherW, centerGap, totalW: motherW + centerGap + fatherW + otherW};
}
function placeFatherLanes(row, startX, gen, widths){
  const mother = row.filter(u=>fatherLane(u)==="father-mother");
  const father = row.filter(u=>fatherLane(u)==="father-father");
  const couple = row.filter(u=>fatherLane(u)==="father-couple");
  const other = row.filter(u=>fatherLane(u)==="father-other");
  const motherW = rowWidth(mother);
  const fatherStart = startX + widths.motherW + widths.centerGap;
  placeRow(mother, startX + widths.motherW - motherW, gen);
  placeRow(couple, startX + widths.motherW + widths.centerGap / 2 - rowWidth(couple) / 2, gen);
  placeRow(father, fatherStart, gen);
  placeRow(other, fatherStart + widths.fatherW + UNIT_GAP, gen);
}
function layoutFatherOnly(rows, units){
  const widths = fatherLaneWidths(rows);
  const sharedW = Math.max(...[...rows.values()].map(row=>rowWidth(row.filter(u=>unitBranch(u)!=="father"))), 0);
  const worldW = Math.max(PAD*2 + Math.max(widths.totalW, sharedW), viewport.clientWidth || 0);
  const fatherStartX = PAD + (worldW - PAD*2 - widths.totalW) / 2;
  [...rows.entries()].forEach(([gen, row])=>{
    const father = row.filter(u=>unitBranch(u)==="father");
    const shared = row.filter(u=>unitBranch(u)!=="father");
    placeFatherLanes(father, fatherStartX, gen, widths);
    placeRow(shared, PAD + (worldW - PAD*2 - rowWidth(shared)) / 2, gen);
  });
  const maxGen = units.length ? Math.max(...units.map(u=>u.gen)) : 0;
  return {worldW, worldH: PAD*2 + (maxGen - layoutMinGen + 1) * LEVEL_H};
}
function layoutMotherOnly(rows, units){
  const widths = motherLaneWidths(rows);
  const sharedW = Math.max(...[...rows.values()].map(row=>rowWidth(row.filter(u=>unitBranch(u)!=="mother"))), 0);
  const worldW = Math.max(PAD*2 + Math.max(widths.totalW, sharedW), viewport.clientWidth || 0);
  const motherStartX = PAD + (worldW - PAD*2 - widths.totalW) / 2;
  [...rows.entries()].forEach(([gen, row])=>{
    const mother = row.filter(u=>unitBranch(u)==="mother");
    const shared = row.filter(u=>unitBranch(u)!=="mother");
    placeMotherLanes(mother, motherStartX, gen, widths);
    placeRow(shared, PAD + (worldW - PAD*2 - rowWidth(shared)) / 2, gen);
  });
  const maxGen = units.length ? Math.max(...units.map(u=>u.gen)) : 0;
  return {worldW, worldH: PAD*2 + (maxGen - layoutMinGen + 1) * LEVEL_H};
}
function layoutSplitBranches(rows, units){
  let sharedW = 0;
  const motherWidths = motherLaneWidths(rows);
  const fatherWidths = fatherLaneWidths(rows);
  [...rows.entries()].forEach(([, row])=>{
    sharedW = Math.max(sharedW, rowWidth(row.filter(u=>unitBranch(u)==="shared")));
  });
  const leftW = motherWidths.totalW;
  const rightW = fatherWidths.totalW;
  const centerGap = Math.max(BRANCH_GAP, sharedW + UNIT_GAP * 2);
  const worldW = Math.max(PAD*2 + leftW + centerGap + rightW, viewport.clientWidth || 0);
  const centerX = PAD + leftW + centerGap / 2;
  [...rows.entries()].forEach(([gen, row])=>{
    const mother = row.filter(u=>unitBranch(u)==="mother");
    const shared = row.filter(u=>unitBranch(u)==="shared");
    const father = row.filter(u=>unitBranch(u)==="father");
    const sharedRowW = rowWidth(shared);
    placeMotherLanes(mother, PAD, gen, motherWidths);
    placeRow(shared, centerX - sharedRowW / 2, gen);
    placeFatherLanes(father, PAD + leftW + centerGap, gen, fatherWidths);
  });
  const maxGen = units.length ? Math.max(...units.map(u=>u.gen)) : 0;
  return {worldW, worldH: PAD*2 + (maxGen - layoutMinGen + 1) * LEVEL_H};
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
    div.classList.toggle("collapsed", collapsedUnitIds.has(u.id));
    div.classList.toggle("compact-expanded", compactExpandedUnitIds.has(u.id));
    const toggleState = unitToggleState(u);
    const toggle = toggleState ? `<button class="unit-toggle" type="button" data-collapse-unit="${escapeHtml(u.id)}" aria-label="${escapeHtml(toggleState.label)}" title="${escapeHtml(toggleState.label)}">
      <span class="unit-toggle-symbol">${escapeHtml(toggleState.symbol)}</span>
      <span class="unit-toggle-text">${escapeHtml(toggleState.text)}</span>
    </button>` : "";
    div.innerHTML = u.persons.map(pid=>personHTML(pid,u)).join("") + toggle;
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
    const toggleBtn = div.querySelector('.unit-toggle');
    if(toggleBtn){
      toggleBtn.addEventListener('pointerdown', e=>e.stopPropagation());
      toggleBtn.addEventListener('click', e=>{
        e.preventDefault(); e.stopPropagation();
        const unitId = toggleBtn.dataset.collapseUnit;
        if(compactTreeMode){
          if(compactExpandedUnitIds.has(unitId)){
            compactExpandedUnitIds.delete(unitId);
            descendantUnitIds(unitId).forEach(id=>compactExpandedUnitIds.delete(id));
          }else compactExpandedUnitIds.add(unitId);
        }else{
          if(collapsedUnitIds.has(unitId)) collapsedUnitIds.delete(unitId);
          else collapsedUnitIds.add(unitId);
        }
        renderTree({preserveView:true});
      });
    }
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
  syncTreeControlButtons();
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
function siblingIds(id){
  const p = PEOPLE[id]; if(!p?.parents?.length) return [];
  const ids = new Set();
  p.parents.forEach(parentId=>{
    (PEOPLE[parentId]?.children || []).forEach(childId=>{
      if(childId !== id && PEOPLE[childId]) ids.add(childId);
    });
  });
  return [...ids].sort((a,b)=>String(PEOPLE[a].born || "9999").localeCompare(String(PEOPLE[b].born || "9999")));
}
function descendantCount(id, seen=new Set()){
  if(seen.has(id)) return 0;
  seen.add(id);
  return (PEOPLE[id]?.children || []).reduce((sum, childId)=>sum + 1 + descendantCount(childId, seen), 0);
}
function sideBranchHTML(id){
  const p = PEOPLE[id]; if(!p) return "";
  const born = p.born ? `Född ${p.born}` : "Födelseuppgift saknas";
  const children = (p.children || []).filter(childId=>PEOPLE[childId]).length;
  const descendants = descendantCount(id);
  const status = STATUS_LABEL[p.status || "open"] || "Status saknas";
  const branchNote = descendants
    ? `${children} kända barn · ${descendants} kända personer i sidogrenen`
    : "Sidogrenen är inte utforskad ännu";
  return `<button class="branch-item" type="button" data-id="${id}">
    <span class="branch-name">${escapeHtml(p.name)}</span>
    <span class="branch-meta">${escapeHtml(born)} · ${escapeHtml(status)}</span>
    <span class="branch-note">${escapeHtml(branchNote)}</span>
  </button>`;
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
  currentPanelPersonId = id;
  panel.setAttribute('aria-label','Livshistoria');
  panel.classList.remove('place-mode');
  document.getElementById('pActions').style.display = "";
  document.getElementById('panelEditForm').classList.remove('open');
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
  const siblings = siblingIds(id);
  document.getElementById('pSideBranches').innerHTML = siblings.map(sideBranchHTML).join("");
  document.getElementById('pSideBranchesWrap').style.display = siblings.length ? "" : "none";
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
  currentPanelPersonId = null;
  selectPlace(place.id,{skipMap:true});
  const relatedPeople = placePeople(place);
  panel.setAttribute('aria-label','Platskort');
  panel.classList.add('place-mode');
  document.getElementById('pActions').style.display = "none";
  document.getElementById('panelEditForm').classList.remove('open');
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
  document.getElementById('pSideBranchesWrap').style.display = "none";
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
  const target = e.target.closest('.relchip,.person-link,.branch-item'); if(!target) return;
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
function syncTreeControlButtons(){
  const compact = document.getElementById('compactTree');
  const expand = document.getElementById('expandTree');
  if(compact) compact.checked = compactTreeMode;
  if(expand) expand.checked = !compactTreeMode;
}
function initTreeControls(){
  const compact = document.getElementById('compactTree');
  const expand = document.getElementById('expandTree');
  if(compact){
    compact.addEventListener('change',()=>{
      if(!compact.checked) return;
      const alreadyCompact = compactTreeMode;
      compactTreeMode = true;
      collapsedUnitIds.clear();
      if(alreadyCompact) compactExpandedUnitIds.clear();
      renderTree();
    });
  }
  if(expand){
    expand.addEventListener('change',()=>{
      if(!expand.checked) return;
      compactTreeMode = false;
      collapsedUnitIds.clear();
      compactExpandedUnitIds.clear();
      renderTree();
    });
  }
  syncTreeControlButtons();
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
function ensurePlaceMarker(place){
  if(!placeMap || !window.L || !hasCoords(place) || placeMarkers[place.id]) return;
  const marker = L.circleMarker([place.lat,place.lng],{radius:7,color:'#245A3B',weight:2,fillColor:'#3F7D5A',fillOpacity:.78}).addTo(placeMap);
  marker.bindPopup(`<strong>${escapeHtml(place.name)}</strong><br>${escapeHtml(place.area)}<br><button type="button" data-place-card="${escapeHtml(place.id)}">Öppna platskort</button>`);
  marker.on('click',()=>selectPlace(place.id));
  placeMarkers[place.id] = marker;
}
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
  PLACES.forEach(ensurePlaceMarker);
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

function slugify(value){
  return String(value || "person")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/å/g,"a").replace(/ä/g,"a").replace(/ö/g,"o")
    .replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"") || "person";
}
function uniqueId(base, collection){
  let id = base, i = 2;
  while(collection[id]) id = `${base}_${i++}`;
  return id;
}
function safeLocalStorageGet(key){
  try{ return localStorage.getItem(key); }catch{ return null; }
}
function safeLocalStorageSet(key, value){
  try{ localStorage.setItem(key, value); return true; }catch{ return false; }
}
function safeLocalStorageRemove(key){
  try{ localStorage.removeItem(key); return true; }catch{ return false; }
}
function applyManualUnit(unit){
  if(UNIT_BY_ID[unit.id]) return;
  const normalized = {
    id:unit.id,
    gen:Number.isFinite(unit.gen) ? unit.gen : 8,
    persons:unit.persons || [],
    children:unit.children || []
  };
  if(unit.direct) normalized.heir = true;
  UNITS.push(normalized);
  UNIT_BY_ID[normalized.id] = normalized;
  normalized.persons.forEach(pid=>{ if(!PERSON_TO_UNIT[pid]) PERSON_TO_UNIT[pid] = normalized.id; });
  if(unit.branch === "mother") MOTHER_UNITS.add(normalized.id);
  if(unit.branch === "father"){
    FATHER_UNITS.add(normalized.id);
    if(unit.fatherLane === "father-mother") FATHER_MOTHER_UNITS.add(normalized.id);
    else FATHER_FATHER_UNITS.add(normalized.id);
  }
  if(unit.direct) DIRECT_UNITS.add(normalized.id);
  if(unit.parentUnitId && UNIT_BY_ID[unit.parentUnitId]){
    const parent = UNIT_BY_ID[unit.parentUnitId];
    if(!parent.children.includes(normalized.id)) parent.children.push(normalized.id);
    if(!EDGES.some(edge=>edge.from===unit.parentUnitId && edge.to===normalized.id)) EDGES.push({from:unit.parentUnitId,to:normalized.id});
    if(unit.direct) DIRECT_EDGES.add(`${unit.parentUnitId}>${normalized.id}`);
  }
}
function applyManualPerson(id, person){
  if(PEOPLE[id]) return;
  PEOPLE[id] = person;
  if(person.direct) DIRECT_HEIRS.add(id);
  (person.parents || []).forEach(parentId=>{
    if(PEOPLE[parentId]){
      if(!PEOPLE[parentId].children) PEOPLE[parentId].children = [];
      if(!PEOPLE[parentId].children.includes(id)) PEOPLE[parentId].children.push(id);
    }
  });
  (person.children || []).forEach(childId=>{
    if(PEOPLE[childId]){
      if(!PEOPLE[childId].parents) PEOPLE[childId].parents = [];
      if(!PEOPLE[childId].parents.includes(id)) PEOPLE[childId].parents.push(id);
    }
  });
  if(person.partner && PEOPLE[person.partner]){
    PARTNER[id] = person.partner;
    PARTNER[person.partner] = id;
  }
}
function removePersonRelationLinks(id, beforeParents, beforePartner){
  beforeParents.forEach(parentId=>{
    const parent = PEOPLE[parentId];
    if(parent?.children) parent.children = parent.children.filter(childId=>childId !== id);
  });
  if(beforePartner && PARTNER[beforePartner] === id) delete PARTNER[beforePartner];
  delete PARTNER[id];
}
function addPersonRelationLinks(id, person){
  (person.parents || []).forEach(parentId=>{
    const parent = PEOPLE[parentId];
    if(!parent) return;
    if(!parent.children) parent.children = [];
    if(!parent.children.includes(id)) parent.children.push(id);
  });
  if(person.partner && PEOPLE[person.partner]){
    PARTNER[id] = person.partner;
    PARTNER[person.partner] = id;
  }
}
function applyManualPersonEdit(id, edit){
  const person = PEOPLE[id]; if(!person) return;
  const beforeParents = [...(person.parents || [])];
  const beforePartner = PARTNER[id] || person.partner || "";
  removePersonRelationLinks(id, beforeParents, beforePartner);
  ["name","alt","role","born","died","status","place","photo"].forEach(key=>{
    person[key] = edit[key] || "";
  });
  person.facts = edit.facts || [];
  person.story = edit.story?.length ? edit.story : ["Ännu inte utforskad."];
  person.parents = edit.parents || [];
  person.partner = edit.partner || "";
  person.direct = !!edit.direct;
  addPersonRelationLinks(id, person);
  const unitId = PERSON_TO_UNIT[id];
  if(person.direct){
    DIRECT_HEIRS.add(id);
    if(unitId) DIRECT_UNITS.add(unitId);
  }else{
    DIRECT_HEIRS.delete(id);
    const unit = unitId ? UNIT_BY_ID[unitId] : null;
    const hasDirectPartner = unit?.persons?.some(pid=>pid !== id && DIRECT_HEIRS.has(pid));
    if(unitId && !hasDirectPartner) DIRECT_UNITS.delete(unitId);
  }
}
function applyManualPlace(place){
  if(PLACES.some(p=>p.id===place.id)) return;
  PLACES.push(place);
  ensurePlaceMarker(place);
}
function loadManualData(){
  const raw = safeLocalStorageGet(MANUAL_STORAGE_KEY);
  if(!raw) return;
  try{
    const parsed = JSON.parse(raw);
    Object.assign(manualData.people, parsed.people || {});
    Object.assign(manualData.edits, parsed.edits || {});
    manualData.units.push(...(parsed.units || []));
    manualData.places.push(...(parsed.places || []));
  }catch{
    return;
  }
  Object.entries(manualData.people).forEach(([id,person])=>applyManualPerson(id,person));
  manualData.units.forEach(applyManualUnit);
  manualData.places.forEach(applyManualPlace);
  Object.entries(manualData.edits).forEach(([id,edit])=>applyManualPersonEdit(id,edit));
}
function saveManualData(){
  return safeLocalStorageSet(MANUAL_STORAGE_KEY, JSON.stringify(manualData, null, 2));
}
function selectOptions(){
  const rows = Object.entries(PEOPLE).sort((a,b)=>a[1].name.localeCompare(b[1].name,'sv'));
  return '<option value="">Ingen vald</option>' + rows.map(([id,p])=>{
    const meta = [p.born, p.role].filter(Boolean).join(" · ");
    return `<option value="${escapeHtml(id)}">${escapeHtml(p.name)}${meta ? ` (${escapeHtml(meta)})` : ""}</option>`;
  }).join("");
}
function refreshEditorSelects(){
  document.querySelectorAll('.person-select').forEach(select=>{
    const value = select.value;
    select.innerHTML = selectOptions();
    if(value && PEOPLE[value]) select.value = value;
  });
}
function renderManualList(){
  const list = document.getElementById('manualList');
  if(!list) return;
  const people = Object.entries(manualData.people);
  const edits = Object.entries(manualData.edits || {}).filter(([id])=>!manualData.people[id]);
  const places = manualData.places || [];
  if(!people.length && !edits.length && !places.length){ list.innerHTML = '<p class="editor-note">Inga manuella personer, platser eller redigeringar är tillagda ännu.</p>'; return; }
  list.innerHTML = people.map(([id,p])=>`<div class="manual-item">
    <div class="manual-name">${escapeHtml(p.name)}</div>
    <div class="manual-meta">${escapeHtml([p.born, p.role, p.place].filter(Boolean).join(" · "))}</div>
  </div>`).join("") + edits.map(([id,p])=>`<div class="manual-item">
    <div class="manual-name">${escapeHtml(p.name || PEOPLE[id]?.name || id)}</div>
    <div class="manual-meta">Redigerad person${p.born ? ` · ${escapeHtml(p.born)}` : ""}</div>
  </div>`).join("") + places.map(place=>`<div class="manual-item">
    <div class="manual-name">${escapeHtml(place.name)}</div>
    <div class="manual-meta">Manuell plats · ${escapeHtml(place.area || "Område saknas")}${hasCoords(place) ? " · kartpunkt" : ""}</div>
  </div>`).join("");
}
function editorMessage(text){
  const el = document.getElementById('editorMessage');
  if(!el) return;
  el.textContent = text;
  window.clearTimeout(editorMessage._timer);
  editorMessage._timer = window.setTimeout(()=>{ el.textContent = ""; }, 4200);
}
function factsToText(facts){
  return (facts || []).map(([key,value])=>`${key}: ${value}`).join("\n");
}
function textToFacts(text){
  return String(text || "").split(/\n+/).map(row=>row.trim()).filter(Boolean).map(row=>{
    const splitAt = row.indexOf(":");
    if(splitAt < 0) return ["Notering", row];
    return [row.slice(0,splitAt).trim() || "Notering", row.slice(splitAt + 1).trim()];
  });
}
function textToStory(text){
  return String(text || "").split(/\n+/).map(row=>row.trim()).filter(Boolean);
}
function setSelectValue(id, value){
  const el = document.getElementById(id);
  if(el) el.value = value || "";
}
function fillPanelEditor(id){
  const person = PEOPLE[id]; if(!person) return;
  refreshEditorSelects();
  document.getElementById('editName').value = person.name || "";
  document.getElementById('editAlt').value = person.alt || "";
  document.getElementById('editRole').value = person.role || "";
  document.getElementById('editBorn').value = person.born || "";
  document.getElementById('editDied').value = person.died || "";
  document.getElementById('editPlace').value = person.place || "";
  document.getElementById('editPhoto').value = person.photo || "";
  document.getElementById('editStatus').value = person.status || "open";
  document.getElementById('editDirect').value = DIRECT_HEIRS.has(id) || person.direct ? "yes" : "";
  document.getElementById('editFacts').value = factsToText(person.facts);
  document.getElementById('editStory').value = (person.story || []).join("\n");
  setSelectValue('editParent1', person.parents?.[0] || "");
  setSelectValue('editParent2', person.parents?.[1] || "");
  setSelectValue('editPartner', PARTNER[id] || person.partner || "");
  document.getElementById('panelEditMessage').textContent = "";
}
function panelEditMessage(text){
  const el = document.getElementById('panelEditMessage');
  if(!el) return;
  el.textContent = text;
  window.clearTimeout(panelEditMessage._timer);
  panelEditMessage._timer = window.setTimeout(()=>{ el.textContent = ""; }, 4200);
}
function savePanelPersonEdit(){
  const id = currentPanelPersonId;
  if(!id || !PEOPLE[id]) return;
  const name = document.getElementById('editName').value.trim();
  if(!name){ panelEditMessage("Namn behövs för att spara."); return; }
  const edit = {
    name,
    alt:document.getElementById('editAlt').value.trim(),
    role:document.getElementById('editRole').value.trim(),
    born:document.getElementById('editBorn').value.trim(),
    died:document.getElementById('editDied').value.trim(),
    status:document.getElementById('editStatus').value,
    place:document.getElementById('editPlace').value.trim(),
    photo:document.getElementById('editPhoto').value.trim(),
    facts:textToFacts(document.getElementById('editFacts').value),
    story:textToStory(document.getElementById('editStory').value),
    parents:[document.getElementById('editParent1').value, document.getElementById('editParent2').value].filter(Boolean),
    partner:document.getElementById('editPartner').value,
    direct:document.getElementById('editDirect').value === "yes"
  };
  manualData.edits[id] = edit;
  if(manualData.people[id]) manualData.people[id] = {...manualData.people[id], ...edit};
  applyManualPersonEdit(id, edit);
  saveManualData();
  refreshEditorSelects();
  renderManualList();
  renderTree({preserveView:true});
  renderPlaceList();
  refreshSelectedPlace();
  openPerson(id);
}
function addManualPerson(form){
  const name = document.getElementById('newPersonName').value.trim();
  if(!name) return;
  const id = uniqueId(slugify(name), {...PEOPLE,...manualData.people});
  const parentIds = [document.getElementById('newPersonParent1').value, document.getElementById('newPersonParent2').value].filter(Boolean);
  const partner = document.getElementById('newPersonPartner').value;
  const storyText = document.getElementById('newPersonStory').value.trim();
  const branch = document.getElementById('newPersonBranch').value;
  const direct = document.getElementById('newPersonDirect').value === "yes";
  const parentUnit = parentIds.length ? (parentIds.length > 1
    ? UNITS.find(u=>parentIds.every(pid=>u.persons.includes(pid)))
    : UNIT_BY_ID[PERSON_TO_UNIT[parentIds[0]]]) : null;
  const partnerUnit = partner ? UNIT_BY_ID[PERSON_TO_UNIT[partner]] : null;
  const unit = {
    id:`u_${id}`,
    gen:parentUnit ? parentUnit.gen + 1 : partnerUnit ? partnerUnit.gen : 8,
    persons:[id],
    children:[],
    branch,
    direct,
    fatherLane:branch === "father" ? "father-mother" : "",
    parentUnitId:parentUnit?.id || ""
  };
  const person = {
    name,
    role:document.getElementById('newPersonRole').value.trim() || "Manuellt tillagd",
    born:document.getElementById('newPersonBorn').value.trim(),
    died:document.getElementById('newPersonDied').value.trim(),
    status:document.getElementById('newPersonStatus').value,
    place:document.getElementById('newPersonPlace').value.trim(),
    photo:document.getElementById('newPersonPhoto').value.trim(),
    facts:[["Tillagd","Manuellt i redigeringsläget"]],
    story:storyText ? storyText.split(/\n+/).map(s=>s.trim()).filter(Boolean) : ["Manuellt tillagd person. Fyll på med mer släkthistoria när källorna är klara."],
    parents:parentIds,
    children:[],
    partner,
    direct
  };
  Object.keys(person).forEach(key=>{ if(person[key] === "" || (Array.isArray(person[key]) && !person[key].length)) delete person[key]; });
  manualData.people[id] = person;
  manualData.units.push(unit);
  applyManualPerson(id, person);
  applyManualUnit(unit);
  if(saveManualData()) editorMessage(`${name} är tillagd och sparad lokalt.`);
  else editorMessage(`${name} är tillagd, men browsern kunde inte spara lokalt.`);
  form.reset();
  document.getElementById('newPersonStatus').value = "working";
  document.getElementById('newPersonBranch').value = branch;
  refreshEditorSelects();
  renderManualList();
  renderTree({preserveView:true});
  renderPlaceList();
  refreshSelectedPlace();
  focusPerson(id);
  openPerson(id);
}
function parseCoordinate(value){
  if(!String(value || "").trim()) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : NaN;
}
function addManualPlace(form){
  const name = document.getElementById('newPlaceName').value.trim();
  if(!name) return;
  const lat = parseCoordinate(document.getElementById('newPlaceLat').value);
  const lng = parseCoordinate(document.getElementById('newPlaceLng').value);
  if(Number.isNaN(lat) || Number.isNaN(lng)){
    editorMessage("Koordinaterna behöver vara siffror, eller lämnas tomma.");
    return;
  }
  if((lat === null) !== (lng === null)){
    editorMessage("Fyll i både latitud och longitud, eller lämna båda tomma.");
    return;
  }
  const id = uniqueId(slugify(name), Object.fromEntries(PLACES.map(place=>[place.id,true])));
  const aliases = document.getElementById('newPlaceAliases').value
    .split(",").map(alias=>alias.trim()).filter(Boolean);
  const place = {
    id,
    name,
    area:document.getElementById('newPlaceArea').value.trim() || "Område saknas",
    note:document.getElementById('newPlaceNote').value.trim() || "Ingen längre platsbeskrivning är inlagd ännu.",
    aliases:[name, ...aliases].filter((alias,index,array)=>array.indexOf(alias)===index)
  };
  if(lat !== null && lng !== null){
    place.lat = lat;
    place.lng = lng;
  }
  manualData.places.push(place);
  applyManualPlace(place);
  saveManualData();
  form.reset();
  renderManualList();
  renderPlaceList();
  selectPlace(place.id);
  editorMessage(`${name} är tillagd som plats.`);
  document.getElementById('platskarta').scrollIntoView({behavior:'smooth',block:'start'});
}
function exportManualData(){
  const blob = new Blob([JSON.stringify(manualData, null, 2)], {type:"application/json"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `axels-slakt-manuella-tillagg-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}
function importManualFile(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const parsed = JSON.parse(reader.result);
      Object.assign(manualData.people, parsed.people || {});
      Object.assign(manualData.edits, parsed.edits || {});
      manualData.units.push(...(parsed.units || []).filter(unit=>!manualData.units.some(existing=>existing.id===unit.id)));
      manualData.places.push(...(parsed.places || []).filter(place=>!manualData.places.some(existing=>existing.id===place.id)));
      Object.entries(parsed.people || {}).forEach(([id,person])=>applyManualPerson(id,person));
      (parsed.units || []).forEach(applyManualUnit);
      (parsed.places || []).forEach(applyManualPlace);
      Object.entries(parsed.edits || {}).forEach(([id,edit])=>applyManualPersonEdit(id,edit));
      saveManualData();
      refreshEditorSelects();
      renderManualList();
      renderTree({preserveView:true});
      renderPlaceList();
      refreshSelectedPlace();
      editorMessage("Importen är inläst och sparad lokalt.");
    }catch{
      editorMessage("Importen kunde inte läsas som JSON.");
    }
  };
  reader.readAsText(file);
}
function initEditor(){
  const shell = document.getElementById('editorShell');
  const toggle = document.getElementById('editorToggle');
  if(!shell || !toggle) return;
  toggle.addEventListener('click',()=>{
    shell.classList.toggle('open');
    if(shell.classList.contains('open')) refreshEditorSelects();
  });
  document.getElementById('personEditorForm').addEventListener('submit', e=>{
    e.preventDefault();
    addManualPerson(e.currentTarget);
  });
  document.getElementById('placeEditorForm').addEventListener('submit', e=>{
    e.preventDefault();
    addManualPlace(e.currentTarget);
  });
  document.getElementById('panelEditToggle').addEventListener('click', ()=>{
    if(!currentPanelPersonId) return;
    const form = document.getElementById('panelEditForm');
    form.classList.toggle('open');
    if(form.classList.contains('open')) fillPanelEditor(currentPanelPersonId);
  });
  document.getElementById('panelEditForm').addEventListener('submit', e=>{
    e.preventDefault();
    savePanelPersonEdit();
  });
  document.getElementById('panelEditCancel').addEventListener('click', ()=>{
    document.getElementById('panelEditForm').classList.remove('open');
  });
  document.getElementById('exportManualData').addEventListener('click', exportManualData);
  document.getElementById('importManualData').addEventListener('change', e=>{
    const file = e.target.files?.[0];
    if(file) importManualFile(file);
    e.target.value = "";
  });
  document.getElementById('clearManualData').addEventListener('click',()=>{
    if(!confirm("Rensa manuella tillägg från den här browsern? Själva grundträdet påverkas inte.")) return;
    safeLocalStorageRemove(MANUAL_STORAGE_KEY);
    editorMessage("Lokala tillägg är rensade. Ladda om sidan för en helt ren vy.");
  });
  refreshEditorSelects();
  renderManualList();
}

loadManualData();
renderTree();
initTreeControls();
initEditor();
initBranchFilters();
initPersonSearch();
initPlaceMap();
document.getElementById('mapJump').onclick = ()=>document.getElementById('platskarta').scrollIntoView({behavior:'smooth',block:'start'});
