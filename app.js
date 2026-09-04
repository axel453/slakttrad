// Axels släkt - app-logik
// Renderar trädet, personrutor, sök och karta utifrån data.js.

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function escapeRegExp(value){ return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function nameKey(value){
  return String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("sv");
}
function uniqueNames(values, primaryName=""){
  const primaryKey = nameKey(primaryName), seen = new Set();
  return values.flatMap(value=>Array.isArray(value) ? value : [value]).map(value=>String(value || "").trim()).filter(value=>{
    const key = nameKey(value);
    if(!key || key === primaryKey || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function personAliases(person){
  const explicit = Array.isArray(person?.aliases) ? person.aliases : [];
  return uniqueNames(explicit.length ? explicit : [person?.alt || ""],person?.name);
}
function placeAliases(place){ return uniqueNames(place?.aliases || [],place?.name); }
function personAliasText(person){ return personAliases(person).join(" / "); }
function aliasesToEditorText(aliases){ return (aliases || []).join("\n"); }
function aliasesFromEditorText(value){ return String(value || "").split(/\n+/).map(name=>name.trim()).filter(Boolean); }
function aliasesAfterRename(record,newName,enteredAliases){
  const previousPrimary = record?.name && nameKey(record.name) !== nameKey(newName) ? record.name : "";
  return uniqueNames([enteredAliases,previousPrimary],newName);
}
function formerNamesAfterRename(record,newName){
  const previousPrimary = record?.name && nameKey(record.name) !== nameKey(newName) ? record.name : "";
  return uniqueNames([record?.formerNames || [],previousPrimary],newName);
}
function normalizePersonNames(person){
  if(!person) return person;
  person.aliases = personAliases(person);
  person.alt = person.aliases.join(" / ");
  person.formerNames = uniqueNames(person.formerNames || [],person.name);
  return person;
}
function normalizePlaceNames(place){
  if(!place) return place;
  place.aliases = placeAliases(place);
  place.formerNames = uniqueNames(place.formerNames || [],place.name);
  return place;
}
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
  const aliasText = personAliasText(p);
  const alt = aliasText ? `<span class="alt">/ ${escapeHtml(aliasText)}</span>` : "";
  const dates = formatDates(p);
  const place = p.place ? `<span class="pplace">${escapeHtml(canonicalEntityText(p.place))}</span>` : "";
  return `<span class="person-card-shell">
    <button class="person${heir ? " heir" : ""}${unit?.ancestor ? " ancestor" : ""}" data-id="${id}" title="Öppna livshistoria">
      <img class="pcard-photo" src="${escapeHtml(personPhoto(p))}" alt="" loading="lazy" onerror="this.src='${PERSON_PLACEHOLDER}'">
      <span class="pcard-text">
        <span class="prole"><span class="sdot ${p.status || 'open'}"></span>${escapeHtml(role)}</span>
        <span class="pname">${escapeHtml(p.name)}${alt}</span>
        ${dates ? `<span class="pdates">${escapeHtml(dates)}</span>` : ""}
        ${place}
      </span>
    </button>
    ${adminEditLinkHTML("person",id,p.name,"record-edit-shortcut person-card-edit")}
  </span>`;
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
const ACCESS_STORAGE_KEY = "nilsson-bengtsson-accessibility-v1";
const manualData = { people:{}, edits:{}, units:[], places:[], placeEdits:{}, drafts:{people:{},places:{}}, history:[] };
Object.values(PEOPLE).forEach(normalizePersonNames);
PLACES.forEach(normalizePlaceNames);
const BASE_PERSON_REFERENCE_NAMES = Object.fromEntries(Object.entries(PEOPLE).map(([id,person])=>[id,{name:person.name,aliases:personAliases(person),formerNames:[...(person.formerNames || [])]}]));
const BASE_PLACE_REFERENCE_NAMES = Object.fromEntries(PLACES.map(place=>[place.id,{name:place.name,aliases:placeAliases(place),formerNames:[...(place.formerNames || [])]}]));
let entityReferenceCache = null;
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
function personBranch(id, seen=new Set()){
  if(seen.has(id)) return "shared";
  seen.add(id);
  const unitId = PERSON_TO_UNIT[id];
  if(MOTHER_UNITS.has(unitId)) return "mother";
  if(FATHER_UNITS.has(unitId)) return "father";
  const parentSides = new Set((PEOPLE[id]?.parents || []).map(parentId=>personBranch(parentId, seen)));
  if(parentSides.has("mother") && parentSides.has("father")) return "shared";
  if(parentSides.has("mother")) return "mother";
  if(parentSides.has("father")) return "father";
  return "shared";
}
function personBranchLabel(id){
  const branch = personBranch(id);
  if(branch === "mother") return {branch, label:"Mammas led"};
  if(branch === "father") return {branch, label:"Pappas led"};
  return {branch, label:"Mammas och pappas led"};
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
    div.querySelectorAll('.record-edit-shortcut').forEach(link=>{
      link.addEventListener('pointerdown', e=>e.stopPropagation());
      link.addEventListener('click', e=>e.stopPropagation());
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
  refreshPageIcons();
  if(!preserveView) initialTreeView();
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
function initialTreeView(){
  if(window.matchMedia('(max-width: 640px)').matches && PEOPLE.axel_nilsson){
    scale = 0.82;
    focusPerson('axel_nilsson', 0.82);
    return;
  }
  fit();
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
  const key = nameKey(name);
  return Object.entries(PEOPLE).find(([,p])=>[p.name,...personAliases(p),...(p.formerNames || [])].some(value=>nameKey(value)===key))?.[0] || null;
}
function referenceNameVariants(value){
  const name = String(value || "").trim();
  if(!name) return [];
  const variants = new Set([name]);
  const slash = [...name.matchAll(/([\p{L}-]+)\s*\/\s*([\p{L}-]+)/gu)];
  slash.forEach(match=>{
    variants.add(name.replace(match[0],match[1]).replace(/\s+/g," "));
    variants.add(name.replace(match[0],match[2]).replace(/\s+/g," "));
    variants.add(name.replace(match[0],`${match[1]} eller ${match[2]}`).replace(/\s+/g," "));
  });
  [...variants].forEach(variant=>{
    const words = variant.split(/\s+/);
    if(words.length >= 3) variants.add(`${words[0]} ${words.at(-1)}`);
  });
  return [...variants].filter(variant=>variant.length >= 4);
}
function entityReferenceTargets(){
  if(entityReferenceCache) return entityReferenceCache;
  const targets = new Map();
  const add = (alias,target,replaceLabel=false)=>{
    const key = alias.toLocaleLowerCase('sv');
    if(!targets.has(key)) targets.set(key,{alias,target:{...target,replaceLabel}});
    else if(targets.get(key)?.target?.id !== target.id || targets.get(key)?.target?.type !== target.type) targets.set(key,null);
    else if(replaceLabel) targets.get(key).target.replaceLabel = true;
  };
  Object.entries(PEOPLE).forEach(([id,person])=>{
    const historical = BASE_PERSON_REFERENCE_NAMES[id] || {};
    const historyNames = (manualData.history || []).filter(item=>item.type === "person" && item.id === id).flatMap(item=>[item.before?.name,item.after?.name]);
    [person.name,historical.name,...(person.formerNames || []),...(historical.formerNames || []),...historyNames].filter(Boolean).flatMap(referenceNameVariants).forEach(alias=>add(alias,{type:"person",id,label:person.name},true));
    [...personAliases(person),...(historical.aliases || [])].filter(Boolean).flatMap(referenceNameVariants).filter(alias=>alias.includes(" ")).forEach(alias=>add(alias,{type:"person",id,label:person.name},false));
  });
  PLACES.forEach(place=>{
    const historical = BASE_PLACE_REFERENCE_NAMES[place.id] || {};
    const historyNames = (manualData.history || []).filter(item=>item.type === "place" && item.id === place.id).flatMap(item=>[item.before?.name,item.after?.name]);
    [place.name,historical.name,...(place.formerNames || []),...(historical.formerNames || []),...historyNames].filter(Boolean).flatMap(referenceNameVariants).forEach(alias=>add(alias,{type:"place",id:place.id,label:place.name},true));
    [...placeAliases(place),...(historical.aliases || [])].filter(Boolean).flatMap(referenceNameVariants).forEach(alias=>add(alias,{type:"place",id:place.id,label:place.name},false));
  });
  entityReferenceCache = [...targets.values()].filter(Boolean).sort((a,b)=>b.alias.length-a.alias.length);
  return entityReferenceCache;
}
function invalidateEntityReferenceCache(){ entityReferenceCache = null; }
function canonicalEntityText(value){
  const text = String(value ?? ""), targets = entityReferenceTargets();
  if(!text || !targets.length) return text;
  const byAlias = new Map(targets.map(row=>[row.alias.toLocaleLowerCase('sv'),row.target]));
  const pattern = targets.map(row=>escapeRegExp(row.alias)).join("|");
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${pattern})(?=$|[^\\p{L}\\p{N}])`,"giu");
  return text.replace(re,(match,prefix,alias)=>{
    const target = byAlias.get(alias.toLocaleLowerCase('sv'));
    const currentName = target?.type === "person" ? PEOPLE[target.id]?.name : PLACES.find(place=>place.id === target?.id)?.name;
    return `${prefix}${currentName || alias}`;
  });
}
function linkEntityReferences(value){
  const text = String(value ?? "");
  const targets = entityReferenceTargets();
  if(!targets.length) return escapeHtml(text);
  const byAlias = new Map(targets.map(row=>[row.alias.toLocaleLowerCase('sv'),row.target]));
  const pattern = targets.map(row=>escapeRegExp(row.alias)).join("|");
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${pattern})(?=$|[^\\p{L}\\p{N}])`,"giu");
  let cursor = 0, html = "", match;
  while((match = re.exec(text))){
    const prefixLength = match[1].length;
    const entityStart = match.index + prefixLength;
    html += escapeHtml(text.slice(cursor,entityStart));
    const target = byAlias.get(match[2].toLocaleLowerCase('sv'));
    const currentLabel = target?.type === "person" ? PEOPLE[target.id]?.name : PLACES.find(place=>place.id === target?.id)?.name;
    const label = target?.replaceLabel ? (currentLabel || target.label) : match[2];
    if(!target){ html += escapeHtml(match[2]); }
    else if(target.type === "person") html += `<a class="entity-link" href="${escapeHtml(routePersonUrl(target.id))}" data-open-person="${escapeHtml(target.id)}">${escapeHtml(label)}</a>`;
    else html += `<a class="entity-link place-reference" href="${escapeHtml(routePlaceUrl(target.id))}" data-open-place="${escapeHtml(target.id)}">${escapeHtml(label)}</a>`;
    cursor = entityStart + match[2].length;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}
function linkPersonNames(value){
  return linkEntityReferences(value);
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
  document.getElementById('panelPageOpen').dataset.route = personPath(id);
  document.getElementById('panelPageOpen').textContent = "Öppna sida";
  const panelEdit = document.getElementById('panelEditToggle');
  panelEdit.href = adminEditUrl("person",id);
  panelEdit.setAttribute('aria-label',`Redigera ${p.name}`);
  panelEdit.title = `Redigera ${p.name}`;
  document.getElementById('panelEditForm').classList.remove('open');
  const photo = document.getElementById('pPhoto');
  photo.style.display = "";
  photo.src = personPhoto(p);
  photo.alt = `Porträttbild för ${p.name}`;
  photo.onerror = ()=>{ photo.src = PERSON_PLACEHOLDER; };
  document.getElementById('pRole').textContent = p.role || "Person";
  const aliases = personAliasText(p);
  document.getElementById('pName').innerHTML = escapeHtml(p.name) + (aliases ? ` <span class="alt">/ ${escapeHtml(aliases)}</span>` : "");
  document.getElementById('pDates').textContent = [p.born ? "Född "+p.born : "", p.died ? "Avliden "+p.died : ""].filter(Boolean).join("  ·  ");
  const st = p.status || "open";
  const statusEl = document.getElementById('pStatus');
  statusEl.className = "panel-status " + st;
  statusEl.innerHTML = `<span class="sd"></span>${STATUS_LABEL[st]}`;
  const branchInfo = personBranchLabel(id);
  const branchEl = document.getElementById('pBranch');
  branchEl.className = "panel-branch " + branchInfo.branch;
  branchEl.textContent = branchInfo.label;
  branchEl.style.display = "";
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
  document.getElementById('pActions').style.display = "";
  document.getElementById('panelPageOpen').dataset.route = placePath(place.id);
  document.getElementById('panelPageOpen').textContent = "Öppna platssida";
  const panelEdit = document.getElementById('panelEditToggle');
  panelEdit.href = adminEditUrl("place",place.id);
  panelEdit.setAttribute('aria-label',`Redigera platsen ${place.name}`);
  panelEdit.title = `Redigera platsen ${place.name}`;
  document.getElementById('panelEditForm').classList.remove('open');
  document.getElementById('pPhoto').style.display = "none";
  document.getElementById('pRole').textContent = "Platskort";
  document.getElementById('pName').textContent = place.name;
  document.getElementById('pDates').textContent = [place.area, hasCoords(place) ? "Kartpunkt finns" : "Ingen exakt kartpunkt ännu"].filter(Boolean).join("  ·  ");
  const statusEl = document.getElementById('pStatus');
  statusEl.className = "panel-status " + (hasCoords(place) ? "confirmed" : "working");
  statusEl.innerHTML = `<span class="sd"></span>${hasCoords(place) ? "Kartlagd plats" : "Plats utan exakt punkt"}`;
  document.getElementById('pBranch').style.display = "none";
  const facts = [
    ["Område", place.area || "Ej angivet"],
    ["Kartstatus", hasCoords(place) ? `${place.lat.toFixed(3)}, ${place.lng.toFixed(3)}` : "Exakt kartpunkt saknas"],
    ["Kopplade personer", String(relatedPeople.length)]
  ];
  if(placeAliases(place).length) facts.push(["Sekundära namn", placeAliases(place).join(", ")]);
  (place.facts||[]).forEach(f=>facts.push(f));
  document.getElementById('pFacts').innerHTML = facts.map(([k,v])=>`<li><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></li>`).join("");
  document.getElementById('pParentsWrap').style.display = "none";
  document.getElementById('pSpouseWrap').style.display = "none";
  document.getElementById('pChildrenWrap').style.display = "none";
  document.getElementById('pSideBranchesWrap').style.display = "none";
  document.getElementById('pPlacePeople').innerHTML = relatedPeople.map(row=>relChip(row.id)).join("");
  document.getElementById('pPlacePeopleWrap').style.display = relatedPeople.length ? "" : "none";
  document.getElementById('pStoryLabel').textContent = "Om platsen";
  const placeStory = place.story?.length ? place.story : [place.note || "Ingen längre platsbeskrivning är inlagd ännu."];
  if(relatedPeople.length){
    const direct = relatedPeople.filter(row=>DIRECT_HEIRS.has(row.id)).map(row=>PEOPLE[row.id].name);
    if(direct.length) placeStory.push(`Direkta ledet har koppling hit genom ${direct.slice(0,5).join(", ")}${direct.length > 5 ? " med flera" : ""}.`);
  }
  document.getElementById('pStory').innerHTML = placeStory.map(s=>`<p>${linkPersonNames(s)}</p>`).join("");
  document.getElementById('pTimelineLabel').textContent = "Platsens historia";
  const placeTimeline = place.timeline?.length ? place.timeline : relatedPeople.flatMap(row=>row.texts.map((text,index)=>[
    index === 0 ? PEOPLE[row.id].name : "Fler spår",
    text
  ])).slice(0,12);
  document.getElementById('pTimeline').innerHTML = placeTimeline.map(([y,t])=>`<li><span class="tl-y">${escapeHtml(y)}</span><span class="tl-t">${linkPersonNames(t)}</span></li>`).join("");
  document.getElementById('pTimelineWrap').style.display = placeTimeline.length ? "" : "none";
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

function slugifyUrl(value){
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/å/g,"a").replace(/ä/g,"a").replace(/ö/g,"o")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || "sida";
}
function personSlug(id){
  const p = PEOPLE[id]; if(!p) return slugifyUrl(id);
  const stableName = p.slug || BASE_PERSON_REFERENCE_NAMES[id]?.name || p.name;
  const base = slugifyUrl(stableName);
  const same = Object.keys(PEOPLE).filter(pid=>slugifyUrl(PEOPLE[pid]?.slug || BASE_PERSON_REFERENCE_NAMES[pid]?.name || PEOPLE[pid]?.name) === base);
  if(same.length <= 1) return base;
  return slugifyUrl(`${stableName}-${p.born || id}`);
}
function placeSlug(id){
  const place = PLACES.find(p=>p.id===id); if(!place) return slugifyUrl(id);
  const stableName = place.slug || BASE_PLACE_REFERENCE_NAMES[id]?.name || place.name;
  const base = slugifyUrl(stableName);
  const same = PLACES.filter(p=>slugifyUrl(p.slug || BASE_PLACE_REFERENCE_NAMES[p.id]?.name || p.name) === base);
  if(same.length <= 1) return base;
  return slugifyUrl(`${stableName}-${place.area || id}`);
}
function personPath(id){ return `/personer/${personSlug(id)}/`; }
function placePath(id){ return `/gardar/${placeSlug(id)}/`; }
function emigrantPath(id){
  const branch = EMIGRANT_BRANCHES[id];
  return `/emigranter/${branch?.slug || personSlug(id)}/`;
}
function emigrantPersonSlug(branch, id){
  const person = branch?.people?.[id];
  return person?.slug || slugifyUrl(person?.name || id);
}
function emigrantPersonPath(branchId, personId){
  const branch = EMIGRANT_BRANCHES[branchId];
  return `${emigrantPath(branchId)}personer/${emigrantPersonSlug(branch,personId)}/`;
}
function findEmigrantPersonBySlug(branch, slug){
  return Object.keys(branch?.people || {}).find(id=>emigrantPersonSlug(branch,id) === slug || slugifyUrl(id) === slug) || null;
}
function findPersonBySlug(slug){
  return Object.keys(PEOPLE).find(id=>personSlug(id) === slug || slugifyUrl(id) === slug) || null;
}
function findPlaceBySlug(slug){
  return PLACES.find(place=>placeSlug(place.id) === slug || slugifyUrl(place.id) === slug)?.id || null;
}
function findEmigrantBySlug(slug){
  return Object.keys(EMIGRANT_BRANCHES).find(id=>EMIGRANT_BRANCHES[id].slug === slug || slugifyUrl(id) === slug) || null;
}
function localHashForPath(path){
  const clean = path.replace(/^\/+|\/+$/g,"");
  return clean ? `#/${clean}` : "#/";
}
function navigatePath(path, {replace=false}={}){
  if(!path) return;
  if(location.protocol === "file:"){
    const hash = localHashForPath(path);
    if(location.hash === hash) renderCurrentRoute();
    else location.hash = hash;
    return;
  }
  if(replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  renderCurrentRoute();
}
function clearDetailRoute(){
  const detail = document.getElementById('detailPage');
  detail?.classList.remove('open');
  navigatePath("/");
}
function routePersonUrl(id){ return personPath(id); }
function routePlaceUrl(id){ return placePath(id); }
function adminEditUrl(type,id){
  const section = type === "person" ? "personer" : "gardar";
  const recordPath = `${section}/${encodeURIComponent(id)}/`;
  if(location.protocol !== "file:") return `/admin/${recordPath}`;
  const appScript = [...document.scripts].find(script=>/\bapp\.js(?:\?|$)/.test(script.src));
  const adminPage = new URL("admin/index.html",appScript?.src || location.href);
  return `${adminPage.href}#/${recordPath}`;
}
function adminEditLinkHTML(type,id,name,className="btn"){
  const label = type === "person" ? `Redigera ${name}` : `Redigera platsen ${name}`;
  return `<a class="${escapeHtml(className)} auth-edit-link" href="${escapeHtml(adminEditUrl(type,id))}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><i data-lucide="pencil" aria-hidden="true"></i>${className.includes("record-edit-shortcut") ? "" : "<span>Redigera</span>"}</a>`;
}
function absoluteUrl(path){
  if(location.protocol === "file:") return path;
  return new URL(path, location.origin).href;
}
const PUBLIC_SITE_ORIGIN = "https://axels-slakt.vercel.app";
function publicShareUrl(path){
  const localHost = location.protocol === "file:" || ["localhost","127.0.0.1","::1"].includes(location.hostname);
  return new URL(path, localHost ? PUBLIC_SITE_ORIGIN : location.origin).href;
}
function shareButtonHTML({title,text,path,restricted=false}){
  return `<button class="btn detail-share-button" type="button" data-share-page data-share-title="${escapeHtml(title)}" data-share-text="${escapeHtml(text)}" data-share-path="${escapeHtml(path)}" data-share-restricted="${restricted ? "true" : "false"}" aria-label="Dela ${escapeHtml(title)}"><i data-lucide="share-2" aria-hidden="true"></i><span>Dela</span></button><span class="share-feedback" data-share-feedback role="status" aria-live="polite"></span>`;
}
function refreshPageIcons(){
  window.lucide?.createIcons({attrs:{"stroke-width":1.8}});
}
function showShareFeedback(button,message){
  const feedback=button.closest('.detail-actions')?.querySelector('[data-share-feedback]');
  if(!feedback)return;
  feedback.textContent=message;
  clearTimeout(showShareFeedback.timer);
  showShareFeedback.timer=setTimeout(()=>{ feedback.textContent=""; },4200);
}
async function copyShareUrl(url){
  if(navigator.clipboard?.writeText){
    try{ await navigator.clipboard.writeText(url); return; }catch(error){}
  }
  const input=document.createElement('textarea');
  input.value=url;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';
  document.body.appendChild(input);input.select();
  const copied=document.execCommand('copy');input.remove();
  if(!copied) throw new Error('Länken kunde inte kopieras.');
}
async function shareDetailPage(button){
  const restricted=button.dataset.shareRestricted === "true";
  if(restricted && !window.confirm('Den här personen är markerad som levande eller skyddad. Mottagaren kan behöva vara inloggad för att se innehållet. Vill du dela länken ändå?')) return;
  const url=publicShareUrl(button.dataset.sharePath || location.pathname);
  const shareData={title:button.dataset.shareTitle,text:button.dataset.shareText,url};
  try{
    if(typeof navigator.share === 'function'){
      await navigator.share(shareData);
      showShareFeedback(button,'Sidan är delad.');
    }else{
      await copyShareUrl(url);
      showShareFeedback(button,'Länken är kopierad.');
    }
  }catch(error){
    if(error?.name === 'AbortError') return;
    try{ await copyShareUrl(url); showShareFeedback(button,'Länken är kopierad.'); }
    catch(copyError){ showShareFeedback(button,'Länken kunde inte delas.'); }
  }
}
function setMeta(title, description, path="/", jsonLd=null){
  document.title = title;
  const metaDescription = document.querySelector('meta[name="description"]');
  if(metaDescription) metaDescription.setAttribute("content", description);
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if(ogTitle) ogTitle.setAttribute("content", title);
  if(ogDescription) ogDescription.setAttribute("content", description);
  const canonical = document.querySelector('link[rel="canonical"]');
  if(canonical) canonical.setAttribute("href", absoluteUrl(path));
  const structured = document.getElementById('structuredData');
  if(structured) structured.textContent = jsonLd ? JSON.stringify(jsonLd) : "";
}
function resetMetaForPage(mode){
  if(mode === "personarkiv"){
    setMeta(
      "Personarkiv - Nilsson/Bengtsson släktträd",
      "Personarkiv för Nilsson/Bengtsson-släkten, sorterat efter gårdar, platser och släktled.",
      "/personarkiv/"
    );
    return;
  }
  if(mode === "gardarkiv"){
    setMeta(
      "Gårdsarkiv - Nilsson/Bengtsson släktträd",
      "Gårdsarkiv med gårdar, orter, platskort, kartkopplingar och personer i Nilsson/Bengtsson-släkten.",
      "/gardar/"
    );
    return;
  }
  if(mode === "emigrantarkiv"){
    setMeta(
      "Emigrantarkiv - Nilsson/Bengtsson släktträd",
      "Emigrantarkiv med separata släktgrenar, resor, efterkommande, platser och källor för Nilsson/Bengtsson-släkten.",
      "/emigranter/"
    );
    return;
  }
  if(mode === "contact"){
    setMeta(
      "Kontakt - Nilsson/Bengtsson släktträd",
      "Kontakta Axel Nilsson med fotografier, berättelser, källor och rättelser till Nilsson/Bengtsson släktträd.",
      "/kontakt/",
      {"@context":"https://schema.org","@type":"ContactPage","name":"Kontakt","url":absoluteUrl('/kontakt/')}
    );
    return;
  }
  setMeta(
    "Nilsson/Bengtsson släktträd",
    "Ett interaktivt släktträd och familjearkiv för Nilsson/Bengtsson-släkten med personer, gårdar, platser, tidslinjer och källnära släktforskning.",
    "/"
  );
}
function breadcrumbsHTML(items){
  return `<nav class="breadcrumbs" aria-label="Brödsmulor">${items.map((item,index)=>{
    if(item.href) return `<a href="${escapeHtml(item.href)}" data-nav="${escapeHtml(item.nav || "")}">${escapeHtml(item.label)}</a><span>/</span>`;
    return `<strong>${escapeHtml(item.label)}</strong>`;
  }).join("")}</nav>`;
}
function statusBadgeHTML(status){
  const st = status || "open";
  return `<span class="panel-status ${escapeHtml(st)}"><span class="sd"></span>${escapeHtml(STATUS_LABEL[st] || "Öppet spår")}</span>`;
}
function detailFactsHTML(rows){
  if(!rows.length) return '<p class="detail-empty">Ingen faktaruta är inlagd ännu.</p>';
  return `<ul class="detail-facts">${rows.map(([k,v])=>`<li><span class="k">${escapeHtml(k)}</span><span class="v">${linkPersonNames(v)}</span></li>`).join("")}</ul>`;
}
function detailTimelineHTML(rows){
  if(!rows.length) return '<p class="detail-empty">Ingen tidslinje är inlagd ännu.</p>';
  return `<ol class="detail-timeline">${rows.map(([y,t])=>`<li><span class="tl-y">${escapeHtml(y)}</span><span class="tl-t">${linkPersonNames(t)}</span></li>`).join("")}</ol>`;
}
function textItems(value){
  if(!value) return [];
  if(typeof value === "string") return value.split(/\n+/).map(row=>row.trim()).filter(Boolean);
  if(!Array.isArray(value)) return [];
  return value.map(item=>{
    if(typeof item === "string") return item.trim();
    if(Array.isArray(item)) return item.filter(Boolean).join(": ");
    if(item && typeof item === "object") return item.text || item.title || item.label || item.caption || "";
    return "";
  }).filter(Boolean);
}
function recordSources(record){
  const explicit = textItems(record.sources);
  if(explicit.length) return explicit;
  const sourceFacts = (record.facts || []).filter(([key])=>/källa|kyrkbok|födelsenotis|dödnotis|bouppteckning|husförhör|mantals|grav|begrav/i.test(key));
  return sourceFacts.map(([key,value])=>`${key}: ${value}`);
}
function recordUncertainties(record){
  const explicit = textItems(record.uncertainties);
  if(explicit.length) return explicit;
  return (record.story || []).filter(text=>/osäker|inte (?:löst|klar|bekräft)|öppet spår|arbetsantag|möjlig|nästa steg|bör sökas|saknas/i.test(text)).slice(0,6);
}
function detailEvidenceHTML(items, kind="source"){
  if(!items.length) return `<p class="detail-empty">${kind === "source" ? "Inga källhänvisningar är strukturerade ännu." : "Inga särskilda osäkerheter är noterade."}</p>`;
  const content = item=>kind === "source" ? escapeHtml(item).replace(/https?:\/\/[^\s<]+/g, url=>`<a href="${url}" target="_blank" rel="noopener">Visa originalkälla</a>`) : linkPersonNames(item);
  return `<ul class="evidence-list">${items.map(item=>`<li class="evidence-item${kind === "uncertain" ? " uncertain" : ""}">${content(item)}</li>`).join("")}</ul>`;
}
function normalizedImages(record, includeProfile=false){
  const rows = [];
  (record.images || []).forEach(item=>{
    if(typeof item === "string"){
      const [src,...caption] = item.split("|");
      if(src.trim()) rows.push({src:src.trim(),caption:caption.join("|").trim()});
    }else if(item?.src || item?.url){
      rows.push({src:item.src || item.url,caption:item.caption || item.alt || ""});
    }
  });
  const profile = record.photo || record.image;
  if(includeProfile && profile && profile !== PERSON_PLACEHOLDER && !rows.some(row=>row.src === profile)) rows.unshift({src:profile,caption:`Porträtt av ${record.name || "personen"}`});
  return rows;
}
function detailImagesHTML(record, includeProfile=false){
  const images = normalizedImages(record, includeProfile);
  if(!images.length) return '<p class="detail-empty">Inga bilder är inlagda ännu.</p>';
  return `<p class="detail-media-summary">${images.length} ${images.length === 1 ? "bild" : "bilder"} i galleriet</p><div class="detail-media-grid">${images.map((item,index)=>`<figure class="detail-media"><button class="detail-media-button" type="button" data-gallery-item data-gallery-index="${index}" data-gallery-src="${escapeHtml(item.src)}" data-gallery-caption="${escapeHtml(item.caption || "Bild ur familjearkivet")}" aria-label="Öppna bild ${index + 1} av ${images.length}"><img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.caption || record.name || "Arkivbild")}" loading="lazy" onerror="this.closest('figure').style.display='none'"><figcaption>${escapeHtml(item.caption || "Bild ur familjearkivet")}</figcaption></button></figure>`).join("")}</div>`;
}
let activeGallery = [];
let activeGalleryIndex = 0;
let activeGalleryTrigger = null;
function updateLightbox(){
  const item = activeGallery[activeGalleryIndex];
  const lightbox = document.getElementById('mediaLightbox');
  if(!item || !lightbox) return;
  const image = document.getElementById('mediaLightboxImage');
  image.src = item.src;
  image.alt = item.caption || `Bild ${activeGalleryIndex + 1}`;
  document.getElementById('mediaLightboxCaption').textContent = item.caption || "Bild ur familjearkivet";
  document.getElementById('mediaLightboxCount').textContent = `${activeGalleryIndex + 1} av ${activeGallery.length}`;
  lightbox.querySelector('[data-gallery-prev]').hidden = activeGallery.length < 2;
  lightbox.querySelector('[data-gallery-next]').hidden = activeGallery.length < 2;
}
function openLightbox(button){
  const grid = button.closest('.detail-media-grid');
  const buttons = [...(grid?.querySelectorAll('[data-gallery-item]') || [])];
  activeGallery = buttons.map(item=>({src:item.dataset.gallerySrc,caption:item.dataset.galleryCaption}));
  activeGalleryIndex = Math.max(0, buttons.indexOf(button));
  activeGalleryTrigger = button;
  const lightbox = document.getElementById('mediaLightbox');
  if(!lightbox || !activeGallery.length) return;
  updateLightbox();
  lightbox.hidden = false;
  document.body.classList.add('lightbox-open');
  lightbox.querySelector('[data-gallery-close]').focus();
}
function closeLightbox(){
  const lightbox = document.getElementById('mediaLightbox');
  if(!lightbox || lightbox.hidden) return;
  lightbox.hidden = true;
  document.body.classList.remove('lightbox-open');
  if(activeGalleryTrigger?.isConnected) activeGalleryTrigger.focus();
}
function moveLightbox(direction){
  if(activeGallery.length < 2) return;
  activeGalleryIndex = (activeGalleryIndex + direction + activeGallery.length) % activeGallery.length;
  updateLightbox();
}
document.addEventListener('click',event=>{
  const item = event.target.closest('[data-gallery-item]');
  if(item){ openLightbox(item); return; }
  if(event.target.closest('[data-gallery-close]')) closeLightbox();
  else if(event.target.closest('[data-gallery-prev]')) moveLightbox(-1);
  else if(event.target.closest('[data-gallery-next]')) moveLightbox(1);
  else if(event.target.id === 'mediaLightbox') closeLightbox();
});
document.addEventListener('keydown',event=>{
  const lightbox = document.getElementById('mediaLightbox');
  if(!lightbox || lightbox.hidden) return;
  if(event.key === 'Escape') closeLightbox();
  else if(event.key === 'ArrowLeft') moveLightbox(-1);
  else if(event.key === 'ArrowRight') moveLightbox(1);
});
function personGenerationNavHTML(id){
  const p = PEOPLE[id];
  const older = (p.parents || []).filter(pid=>PEOPLE[pid] && DIRECT_HEIRS.has(pid));
  const younger = (p.children || []).filter(pid=>PEOPLE[pid] && DIRECT_HEIRS.has(pid));
  const olderId = older[0] || (p.parents || []).find(pid=>PEOPLE[pid]);
  const youngerId = younger[0] || (p.children || []).find(pid=>PEOPLE[pid]);
  if(!olderId && !youngerId) return "";
  const card = (pid,label)=>pid ? `<a class="detail-link-card" href="${escapeHtml(routePersonUrl(pid))}" data-open-person="${escapeHtml(pid)}"><span class="detail-link-meta">${label}</span><span class="detail-link-title">${escapeHtml(PEOPLE[pid].name)}</span></a>` : '<span></span>';
  return `<nav class="detail-generation-nav" aria-label="Nästa och föregående i släktledet">${card(olderId,"Tidigare generation")}${card(youngerId,"Senare generation")}</nav>`;
}
function detailPersonLinks(ids, emptyText){
  const filtered = ids.filter(id=>PEOPLE[id]);
  if(!filtered.length) return `<p class="detail-empty">${escapeHtml(emptyText)}</p>`;
  return `<div class="detail-link-grid">${filtered.map(id=>{
    const p = PEOPLE[id];
    const aliases = personAliasText(p);
    return `<a class="detail-link-card" href="${escapeHtml(routePersonUrl(id))}" data-open-person="${escapeHtml(id)}">
      <span class="detail-link-title">${escapeHtml(p.name)}${aliases ? ` / ${escapeHtml(aliases)}` : ""}</span>
      <span class="detail-link-meta">${escapeHtml([p.born, p.role, canonicalEntityText(p.place)].filter(Boolean).join(" · ") || "Personkort")}</span>
    </a>`;
  }).join("")}</div>`;
}
function detailPlaceLinksForPerson(person){
  const matches = PLACES.filter(place=>placeMatchesText(place, placeHaystack(person)));
  if(!matches.length) return '<p class="detail-empty">Ingen platsmatchning hittad ännu.</p>';
  return `<div class="detail-link-grid">${matches.slice(0,8).map(place=>`<a class="detail-link-card" href="${escapeHtml(routePlaceUrl(place.id))}" data-open-place="${escapeHtml(place.id)}">
    <span class="detail-link-title">${escapeHtml(place.name)}</span>
    <span class="detail-link-meta">${escapeHtml(place.area || "Plats")}${hasCoords(place) ? " · kartpunkt" : " · ingen kartpunkt"}</span>
  </a>`).join("")}</div>`;
}
function renderPersonDetail(id){
  const p = PEOPLE[id]; if(!p) return false;
  const description = `${p.name}${p.born ? `, född ${p.born}` : ""}${p.place ? `, kopplad till ${p.place}` : ""}. Personsida i Nilsson/Bengtsson släktträd.`;
  setMeta(`${p.name} - Nilsson/Bengtsson släktträd`, description, personPath(id), {
    "@context":"https://schema.org",
    "@type":"Person",
    "name":p.name,
    "alternateName":personAliases(p).length ? personAliases(p) : undefined,
    "birthDate":p.born || undefined,
    "deathDate":p.died || undefined,
    "description":(p.story || [description])[0],
    "url":absoluteUrl(personPath(id))
  });
  const detail = document.getElementById('detailPage');
  const parents = p.parents || [];
  const spouse = PARTNER[id] ? [PARTNER[id]] : [];
  const children = p.children || [];
  const siblings = siblingIds(id);
  const facts = [];
  if(personAliases(p).length) facts.push(["Sekundära namn", personAliases(p).join(", ")]);
  if(p.place) facts.push(["Gård/plats", p.place]);
  (p.facts || []).forEach(row=>facts.push(row));
  detail.innerHTML = `
    <div class="detail-hero">
      <div>
        ${breadcrumbsHTML([{label:"Startsida",href:"/",nav:"home"},{label:"Personarkiv",href:"/personarkiv/",nav:"personarkiv"},{label:p.name}])}
        <p class="detail-kicker">Personsida · ${escapeHtml(personBranchLabel(id).label)}</p>
        <h2 class="detail-title">${escapeHtml(p.name)}</h2>
        ${personAliases(p).length ? `<p class="detail-name-aliases"><span>Även känd som</span> ${escapeHtml(personAliases(p).join(" · "))}</p>` : ""}
        <p class="detail-subtitle">${escapeHtml([p.role, p.born ? "född "+p.born : "", p.died ? "avliden "+p.died : ""].filter(Boolean).join(" · "))}</p>
        ${statusBadgeHTML(p.status)}
        <p class="detail-summary">${linkPersonNames((p.story || ["Ännu inte utforskad."])[0])}</p>
        ${personGenerationNavHTML(id)}
      </div>
      <div class="detail-actions">
        <img class="detail-photo" src="${escapeHtml(personPhoto(p))}" alt="">
        <button class="btn" type="button" data-show-in-tree="${escapeHtml(id)}">Visa i trädet</button>
        ${EMIGRANT_BRANCHES[id] ? `<a class="btn" href="${escapeHtml(emigrantPath(id))}" data-open-emigrant="${escapeHtml(id)}">Visa emigrantgren</a>` : ""}
        ${adminEditLinkHTML("person",id,p.name)}
        ${shareButtonHTML({title:p.name,text:`Läs om ${p.name} i Nilsson/Bengtsson släktträd.`,path:personPath(id),restricted:p.isLiving === true || ["family","private"].includes(p.visibility)})}
        <button class="btn" type="button" data-print-page>Skriv ut</button>
      </div>
    </div>
    <div class="detail-layout">
      <main class="detail-main">
        <section class="detail-section">
          <h3>Livshistoria</h3>
          <div class="detail-story">${(p.story || ["Ännu inte utforskad."]).map(s=>`<p>${linkPersonNames(s)}</p>`).join("")}</div>
        </section>
        <section class="detail-section">
          <h3>Livslinje</h3>
          ${detailTimelineHTML(buildTimeline(p))}
        </section>
        <section class="detail-section">
          <h3>Kopplade platser</h3>
          ${detailPlaceLinksForPerson(p)}
        </section>
        <section class="detail-section">
          <h3>Bilder</h3>
          ${detailImagesHTML(p, true)}
        </section>
        <section class="detail-section">
          <h3>Källor</h3>
          ${detailEvidenceHTML(recordSources(p), "source")}
        </section>
        <section class="detail-section">
          <h3>Osäkerheter och öppna spår</h3>
          ${detailEvidenceHTML(recordUncertainties(p), "uncertain")}
        </section>
      </main>
      <aside class="detail-side">
        <section class="detail-section">
          <h3>Fakta</h3>
          ${detailFactsHTML(facts)}
        </section>
        <section class="detail-section">
          <h3>Föräldrar</h3>
          ${detailPersonLinks(parents, "Inga föräldrar inlagda ännu.")}
        </section>
        <section class="detail-section">
          <h3>Make/maka</h3>
          ${detailPersonLinks(spouse, "Ingen make eller maka inlagd ännu.")}
        </section>
        <section class="detail-section">
          <h3>Barn</h3>
          ${detailPersonLinks(children, "Inga barn inlagda ännu.")}
        </section>
        <section class="detail-section">
          <h3>Syskon och sidospår</h3>
          ${detailPersonLinks(siblings, "Inga syskon inlagda ännu.")}
        </section>
      </aside>
    </div>`;
  detail.classList.add('open');
  refreshPageIcons();
  detail.scrollIntoView({behavior:'smooth',block:'start'});
  return true;
}
function factsFromPlace(place){
  const rows = [
    ["Område", place.area || "Ej angivet"],
    ["Kartstatus", hasCoords(place) ? `${place.lat.toFixed(3)}, ${place.lng.toFixed(3)}` : "Exakt kartpunkt saknas"]
  ];
  if(placeAliases(place).length) rows.push(["Sekundära namn", placeAliases(place).join(", ")]);
  (place.facts || []).forEach(row=>rows.push(row));
  return rows;
}
function placeTimelineToText(timeline){
  return timelineToText(timeline || []);
}
function renderPlaceDetail(id){
  const place = PLACES.find(p=>p.id===id); if(!place) return false;
  const placeDraft = manualData.drafts.places[id] ? {...place, ...manualData.drafts.places[id]} : place;
  const description = `${place.name}${place.area ? ` i ${place.area}` : ""}. Gårdssida med historik, tidslinje och kopplade personer i Nilsson/Bengtsson släktträd.`;
  setMeta(`${place.name} - gårdssida`, description, placePath(id), {
    "@context":"https://schema.org",
    "@type":"Place",
    "name":place.name,
    "alternateName":placeAliases(place).length ? placeAliases(place) : undefined,
    "description":place.note || description,
    "geo":hasCoords(place) ? {"@type":"GeoCoordinates","latitude":place.lat,"longitude":place.lng} : undefined,
    "url":absoluteUrl(placePath(id))
  });
  const detail = document.getElementById('detailPage');
  const related = placePeople(place);
  const story = place.story?.length ? place.story : [place.note || "Ingen längre platsbeskrivning är inlagd ännu."];
  const timeline = place.timeline?.length ? place.timeline : related.flatMap(row=>row.texts.map((text,index)=>[
    index === 0 ? PEOPLE[row.id].name : "Fler spår",
    text
  ])).slice(0,16);
  detail.innerHTML = `
    <div class="detail-hero">
      <div>
        ${breadcrumbsHTML([{label:"Startsida",href:"/",nav:"home"},{label:"Gårdsarkiv",href:"/gardar/",nav:"gardarkiv"},{label:place.name}])}
        <p class="detail-kicker">Platssida · ${hasCoords(place) ? "kartlagd" : "utan exakt kartpunkt"}</p>
        <h2 class="detail-title">${escapeHtml(place.name)}</h2>
        ${placeAliases(place).length ? `<p class="detail-name-aliases"><span>Även känd som</span> ${escapeHtml(placeAliases(place).join(" · "))}</p>` : ""}
        <p class="detail-subtitle">${escapeHtml([place.area, related.length ? `${related.length} kopplade personer` : ""].filter(Boolean).join(" · "))}</p>
        <span class="panel-status ${hasCoords(place) ? "confirmed" : "working"}"><span class="sd"></span>${hasCoords(place) ? "Kartlagd plats" : "Plats utan exakt punkt"}</span>
        <p class="detail-summary">${linkPersonNames(story[0])}</p>
      </div>
      <div class="detail-actions">
        ${adminEditLinkHTML("place",place.id,place.name)}
        <button class="btn" type="button" data-jump-place-map="${escapeHtml(place.id)}">Visa på kartan</button>
        ${shareButtonHTML({title:place.name,text:`Läs om ${place.name} i Nilsson/Bengtsson släktträd.`,path:placePath(id)})}
        <button class="btn" type="button" data-print-page>Skriv ut</button>
      </div>
    </div>
    <div class="detail-layout">
      <main class="detail-main">
        <form class="place-edit-form" id="placeDetailEditForm">
          <div class="place-edit-grid">
            <label class="panel-edit-label">Namn<input class="panel-edit-field" id="placeEditName" required value="${escapeHtml(placeDraft.name)}"></label>
            <label class="panel-edit-label">Område<input class="panel-edit-field" id="placeEditArea" value="${escapeHtml(placeDraft.area || "")}"></label>
            <label class="panel-edit-label">Latitud<input class="panel-edit-field" id="placeEditLat" value="${hasCoords(placeDraft) ? escapeHtml(placeDraft.lat) : ""}"></label>
            <label class="panel-edit-label">Longitud<input class="panel-edit-field" id="placeEditLng" value="${hasCoords(placeDraft) ? escapeHtml(placeDraft.lng) : ""}"></label>
            <label class="panel-edit-label full">Sekundära namn<textarea class="panel-edit-field" id="placeEditAliases" placeholder="Ett namn per rad">${escapeHtml(aliasesToEditorText(placeAliases(placeDraft)))}</textarea></label>
            <label class="panel-edit-label full">Kort notering<textarea class="panel-edit-field" id="placeEditNote">${escapeHtml(placeDraft.note || "")}</textarea></label>
            <label class="panel-edit-label full">Platsens historia<textarea class="panel-edit-field" id="placeEditStory">${escapeHtml((placeDraft.story || []).join("\n"))}</textarea></label>
            <label class="panel-edit-label full">Tidslinje<textarea class="panel-edit-field" id="placeEditTimeline">${escapeHtml(placeTimelineToText(placeDraft.timeline))}</textarea></label>
            <label class="panel-edit-label full">Bilder<textarea class="panel-edit-field" id="placeEditImages" placeholder="En per rad: bildadress | bildtext">${escapeHtml(imagesToText(placeDraft.images))}</textarea></label>
            <label class="panel-edit-label full">Källor<textarea class="panel-edit-field" id="placeEditSources" placeholder="En källa per rad">${escapeHtml(textItems(placeDraft.sources).join("\n"))}</textarea></label>
            <label class="panel-edit-label full">Osäkerheter och öppna spår<textarea class="panel-edit-field" id="placeEditUncertainties">${escapeHtml(textItems(placeDraft.uncertainties).join("\n"))}</textarea></label>
          </div>
          <div class="panel-edit-actions"><button class="btn" type="submit">Spara plats</button><button class="btn" type="button" data-save-place-draft="${escapeHtml(place.id)}">Spara utkast</button><span class="panel-edit-message" id="placeEditMessage"></span></div>
        </form>
        <section class="detail-section">
          <h3>Platsens historia</h3>
          <div class="detail-story">${story.map(s=>`<p>${linkPersonNames(s)}</p>`).join("")}</div>
        </section>
        <section class="detail-section">
          <h3>Tidslinje</h3>
          ${detailTimelineHTML(timeline)}
        </section>
        <section class="detail-section">
          <h3>Bilder</h3>
          ${detailImagesHTML(place)}
        </section>
        <section class="detail-section">
          <h3>Källor</h3>
          ${detailEvidenceHTML(recordSources(place), "source")}
        </section>
        <section class="detail-section">
          <h3>Osäkerheter och öppna spår</h3>
          ${detailEvidenceHTML(recordUncertainties(place), "uncertain")}
        </section>
      </main>
      <aside class="detail-side">
        <section class="detail-section">
          <h3>Fakta</h3>
          ${detailFactsHTML(factsFromPlace(place))}
        </section>
        <section class="detail-section">
          <h3>Kopplade personer</h3>
          ${detailPersonLinks(related.map(row=>row.id), "Inga personer är kopplade hit ännu.")}
        </section>
      </aside>
    </div>`;
  detail.classList.add('open');
  refreshPageIcons();
  detail.scrollIntoView({behavior:'smooth',block:'start'});
  return true;
}
function emigrantBranchStatus(branch){
  if(branch.emigrationConfirmed) return "Bekräftad emigration";
  if(branch.status === "working") return "Under utredning";
  if(branch.status === "open") return "Öppet emigrantspår";
  return STATUS_LABEL[branch.status] || "Emigrantspår";
}
function emigrantResearchStatus(status){
  return {confirmed:"Bekräftat",strong:"Starkt stöd",hypothesis:"Hypotes",excluded:"Avförd"}[status] || STATUS_LABEL[status] || "Öppet spår";
}
function emigrantPersonRecord(branch,id){
  return id === branch.rootPersonId ? PEOPLE[id] : branch.people?.[id];
}
function emigrantPersonLinkHTML(branch,id,className="emigrant-person-link"){
  const person = emigrantPersonRecord(branch,id);
  if(!person) return "";
  const meta = [person.relation,person.born,person.died,person.location].filter(Boolean).join(" · ");
  if(id === branch.rootPersonId){
    return `<a class="${className}" href="${escapeHtml(personPath(id))}" data-open-person="${escapeHtml(id)}"><strong>${escapeHtml(person.name)}</strong>${meta ? `<span>${escapeHtml(meta)}</span>` : ""}</a>`;
  }
  return `<a class="${className}" href="${escapeHtml(emigrantPersonPath(branch.id,id))}" data-open-emigrant-person="${escapeHtml(id)}" data-emigrant-branch="${escapeHtml(branch.id)}"><strong>${escapeHtml(person.name)}</strong>${meta ? `<span>${escapeHtml(meta)}</span>` : ""}</a>`;
}
function emigrantFamilyBranchHTML(branch,family,seen=new Set(),depth=0){
  if(!family || seen.has(family.id)) return "";
  const nextSeen = new Set(seen); nextSeen.add(family.id);
  const partners = family.partners.map(id=>emigrantPersonLinkHTML(branch,id,"emigrant-family-person")).join('<span class="emigrant-family-and">och</span>');
  const children = family.children.map(childId=>{
    const childFamily = branch.families.find(row=>row.partners.includes(childId) && row.children.length);
    return `<li>${emigrantPersonLinkHTML(branch,childId,"emigrant-family-person child")}${childFamily ? `<details class="emigrant-family-more"><summary>Visa nästa generation</summary>${emigrantFamilyBranchHTML(branch,childFamily,nextSeen,depth+1)}</details>` : ""}</li>`;
  }).join("");
  return `<div class="emigrant-family-branch">
    <div class="emigrant-family-couple">${partners}</div>
    ${family.children.length ? `<ol class="emigrant-family-children">${children}</ol>` : '<p class="detail-empty">Inga säkert kopplade barn är införda.</p>'}
    <p class="emigrant-family-source"><span class="research-status ${escapeHtml(family.status)}">${escapeHtml(emigrantResearchStatus(family.status))}</span>${escapeHtml(family.source || "")}</p>
  </div>`;
}
function emigrantTreeHTML(branch){
  const rootFamily = branch.families.find(family=>family.partners.includes(branch.rootPersonId));
  if(!rootFamily) return '<p class="detail-empty">Inga säkert belagda familjerelationer är införda ännu.</p>';
  return `<div class="emigrant-tree-shell">${emigrantFamilyBranchHTML(branch,rootFamily)}<p class="emigrant-tree-note">Endast relationer med stöd i Master 4 visas i trädet. Öppna nästa generation stegvis för en lugnare överblick.</p></div>`;
}
function emigrantSourceGroupsHTML(groups){
  if(!groups?.length) return '<p class="detail-empty">Inga källgrupper är inlagda.</p>';
  return `<div class="source-groups">${groups.map(group=>`<section class="source-group"><h4>${escapeHtml(group.title)}</h4>${detailEvidenceHTML(group.items || [],"source")}</section>`).join("")}</div>`;
}
function emigrantResearchItemsHTML(items,kind){
  if(!items?.length) return '<p class="detail-empty">Inga poster i denna kategori.</p>';
  return `<div class="research-list">${items.map(item=>`<article class="research-item ${escapeHtml(item.status || kind)}"><span class="research-status ${escapeHtml(item.status || kind)}">${escapeHtml(emigrantResearchStatus(item.status || kind))}</span><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.text || item.reason || item.note || "")}</p></article>`).join("")}</div>`;
}
function emigrantUnplacedHTML(branch){
  const items = branch.unplacedDescendants || [];
  if(!items.length) return '<p class="detail-empty">Inga ofördelade efterkommande.</p>';
  return `<div class="research-list">${items.map(item=>{
    const person = item.personId ? branch.people?.[item.personId] : null;
    return `<article class="research-item ${escapeHtml(item.status || "open")}"><span class="research-status ${escapeHtml(item.status || "open")}">${escapeHtml(emigrantResearchStatus(item.status))}</span><h4>${person ? emigrantPersonLinkHTML(branch,item.personId,"inline-emigrant-person") : escapeHtml(item.names || "Namngivna efterkommande")}</h4><p>${escapeHtml([item.relation,item.note].filter(Boolean).join(". "))}</p></article>`;
  }).join("")}</div>`;
}
function renderEmigrantDetail(id){
  const branch = EMIGRANT_BRANCHES[id];
  const person = PEOPLE[branch?.rootPersonId];
  if(!branch || !person) return false;
  const path = emigrantPath(id);
  const description = `${person.name}s emigrantgren med resa, efterkommande, källor och ett separat släktträd.`;
  setMeta(`${person.name}s emigrantgren - Nilsson/Bengtsson släktträd`, description, path, {
    "@context":"https://schema.org",
    "@type":"ProfilePage",
    "name":`${person.name}s emigrantgren`,
    "description":branch.summary,
    "mainEntity":{"@type":"Person","name":person.name,"birthDate":person.born || undefined},
    "url":absoluteUrl(path)
  });
  const detail = document.getElementById('detailPage');
  const descendants = Object.entries(branch.people || {}).map(([personId,record])=>({personId,...record}));
  detail.innerHTML = `
    <div class="detail-hero">
      <div>
        ${breadcrumbsHTML([{label:"Startsida",href:"/",nav:"home"},{label:"Emigrantarkiv",href:"/emigranter/",nav:"emigrantarkiv"},{label:person.name}])}
        <p class="detail-kicker">Sekundärt släktträd · ${escapeHtml(branch.branchLabel || "Släktgren")}</p>
        <h2 class="detail-title">${escapeHtml(person.name)}</h2>
        <div class="emigrant-route"><strong>${escapeHtml(branch.originCountry || "Sverige")}</strong><span class="emigrant-route-arrow" aria-hidden="true">→</span><strong>${escapeHtml(branch.destinationCountry || "Okänd destination")}</strong>${branch.destinationAreas?.length ? `<span>· ${escapeHtml(branch.destinationAreas.join(" och "))}</span>` : ""}</div>
        <span class="panel-status ${escapeHtml(branch.status || "open")}"><span class="sd"></span>${escapeHtml(emigrantBranchStatus(branch))}</span>
        <p class="detail-summary">${linkPersonNames(branch.summary)}</p>
      </div>
      <div class="detail-actions">
        <a class="btn" href="${escapeHtml(personPath(branch.rootPersonId))}" data-open-person="${escapeHtml(branch.rootPersonId)}">Öppna personsida</a>
        <button class="btn" type="button" data-print-page>Skriv ut</button>
      </div>
    </div>
    <div class="detail-layout">
      <main class="detail-main">
        <section class="detail-section"><h3>Emigrantspåret</h3><div class="detail-story">${(branch.story || []).map(text=>`<p>${linkPersonNames(text)}</p>`).join("")}</div></section>
        <section class="detail-section"><h3>Sekundärt släktträd</h3>${emigrantTreeHTML(branch)}</section>
        <section class="detail-section"><h3>Tidslinje</h3>${detailTimelineHTML(branch.timeline || [])}</section>
        <section class="detail-section"><h3>Platser och adresser</h3>${detailFactsHTML((branch.places || []).map(place=>[place.name || place[0],place.note || place[1] || ""]))}</section>
        <section class="detail-section"><h3>Källor</h3>${emigrantSourceGroupsHTML(branch.sourceGroups)}</section>
        <section class="detail-section"><h3>Hypoteser</h3>${emigrantResearchItemsHTML(branch.hypotheses,"hypothesis")}</section>
        <section class="detail-section"><h3>Avförda kandidater</h3>${emigrantResearchItemsHTML(branch.excludedCandidates,"excluded")}</section>
        <section class="detail-section"><h3>Efterkommande utan säker föräldraplacering</h3>${emigrantUnplacedHTML(branch)}</section>
        <section class="detail-section"><h3>Prioriterade forskningsuppgifter</h3>${emigrantResearchItemsHTML(branch.researchPriorities,"open")}</section>
        <section class="detail-section"><h3>Osäkerheter och öppna forskningsfrågor</h3>${detailEvidenceHTML(branch.uncertainties || [],"uncertain")}</section>
      </main>
      <aside class="detail-side">
        <section class="detail-section"><h3>Grenfakta</h3>${detailFactsHTML(branch.facts || [])}</section>
        <section class="detail-section"><h3>Personregister för grenen</h3><div class="emigrant-descendant-list">${descendants.map(item=>emigrantPersonLinkHTML(branch,item.personId,"emigrant-descendant")).join("") || '<p class="detail-empty">Inga efterkommande inlagda ännu.</p>'}</div></section>
        <section class="detail-section"><h3>Avgränsning</h3><p class="place-note">Rotpersonen hämtas från personarkivet. Den här sidan innehåller endast emigrantgrenens forskning och sekundära släktträd.</p></section>
      </aside>
    </div>`;
  detail.classList.add('open');
  detail.scrollIntoView({behavior:'smooth',block:'start'});
  return true;
}
function emigrantRelativeIds(branch,id){
  const parents=[],partners=[],children=[];
  (branch.families || []).forEach(family=>{
    if(family.children.includes(id)) parents.push(...family.partners);
    if(family.partners.includes(id)){
      partners.push(...family.partners.filter(personId=>personId !== id));
      children.push(...family.children);
    }
  });
  const unique = values=>[...new Set(values)];
  return {parents:unique(parents),partners:unique(partners),children:unique(children)};
}
function emigrantRelativeLinksHTML(branch,ids,emptyText){
  if(!ids.length) return `<p class="detail-empty">${escapeHtml(emptyText)}</p>`;
  return `<div class="emigrant-descendant-list">${ids.map(id=>emigrantPersonLinkHTML(branch,id,"emigrant-descendant")).join("")}</div>`;
}
function renderEmigrantPersonDetail(branchId,personId){
  const branch = EMIGRANT_BRANCHES[branchId];
  const person = branch?.people?.[personId];
  const root = PEOPLE[branch?.rootPersonId];
  if(!branch || !person || !root) return false;
  const path = emigrantPersonPath(branchId,personId);
  const description = person.summary || `${person.name}, person i ${root.name}s amerikanska emigrantgren.`;
  setMeta(`${person.name} - ${root.name}s emigrantgren`,description,path,{"@context":"https://schema.org","@type":"Person","name":person.name,"alternateName":person.aliases || undefined,"birthDate":person.born || undefined,"deathDate":person.died || undefined,"description":description,"url":absoluteUrl(path)});
  const relatives = emigrantRelativeIds(branch,personId);
  const facts = [];
  if(person.aliases?.length) facts.push(["Sekundära namn",person.aliases.join(", ")]);
  if(person.location) facts.push(["Plats",person.location]);
  (person.facts || []).forEach(row=>facts.push(row));
  const detail = document.getElementById('detailPage');
  detail.innerHTML = `<div class="detail-hero"><div>
    ${breadcrumbsHTML([{label:"Startsida",href:"/",nav:"home"},{label:"Emigrantarkiv",href:"/emigranter/",nav:"emigrantarkiv"},{label:`${root.name}s gren`,href:emigrantPath(branchId)},{label:person.name}])}
    <p class="detail-kicker">Person i amerikansk emigrantgren</p><h2 class="detail-title">${escapeHtml(person.name)}</h2>
    ${person.aliases?.length ? `<p class="detail-name-aliases"><span>Även känd som</span> ${escapeHtml(person.aliases.join(" · "))}</p>` : ""}
    <p class="detail-subtitle">${escapeHtml([person.relation,person.born ? `född ${person.born}` : "",person.died ? `avliden ${person.died}` : "",person.location].filter(Boolean).join(" · "))}</p>
    <span class="research-status ${escapeHtml(person.status || "open")}">${escapeHtml(emigrantResearchStatus(person.status))}</span>
    <p class="detail-summary">${escapeHtml(description)}</p>
  </div><div class="detail-actions"><a class="btn" href="${escapeHtml(emigrantPath(branchId))}" data-open-emigrant="${escapeHtml(branchId)}">Visa hela emigrantgrenen</a>${shareButtonHTML({title:person.name,text:`Läs om ${person.name} i ${root.name}s emigrantgren.`,path,restricted:person.isLiving === true})}<button class="btn" type="button" data-print-page>Skriv ut</button></div></div>
  <div class="detail-layout"><main class="detail-main">
    <section class="detail-section"><h3>Livshistoria</h3><div class="detail-story">${(person.story?.length ? person.story : [description]).map(text=>`<p>${escapeHtml(text)}</p>`).join("")}</div></section>
    <section class="detail-section"><h3>Livslinje</h3>${detailTimelineHTML(person.timeline || [])}</section>
    <section class="detail-section"><h3>Bilder och dokument</h3>${detailImagesHTML(person,true)}</section>
    <section class="detail-section"><h3>Källor</h3>${detailEvidenceHTML(person.sources || [],"source")}</section>
    <section class="detail-section"><h3>Osäkerheter</h3>${detailEvidenceHTML(person.uncertainties || [],"uncertain")}</section>
  </main><aside class="detail-side">
    ${person.isLiving ? '<section class="detail-section privacy-note"><h3>Integritet</h3><p>Personen kan vara i livet. Privata kontaktuppgifter och exakta privata adresser visas därför inte.</p></section>' : ""}
    <section class="detail-section"><h3>Fakta</h3>${detailFactsHTML(facts)}</section>
    <section class="detail-section"><h3>Föräldrar</h3>${emigrantRelativeLinksHTML(branch,relatives.parents,"Inga säkert kopplade föräldrar är inlagda.")}</section>
    <section class="detail-section"><h3>Make eller maka</h3>${emigrantRelativeLinksHTML(branch,relatives.partners,"Ingen make eller maka är säkert inlagd.")}</section>
    <section class="detail-section"><h3>Barn</h3>${emigrantRelativeLinksHTML(branch,relatives.children,"Inga säkert kopplade barn är inlagda.")}</section>
  </aside></div>`;
  detail.classList.add('open'); refreshPageIcons(); detail.scrollIntoView({behavior:'smooth',block:'start'}); return true;
}
function setPageMode(mode){
  document.body.classList.remove("page-home","page-personarkiv","page-gardarkiv","page-emigrantarkiv","page-contact","page-detail");
  document.body.classList.add(`page-${mode}`);
  if(mode !== "detail") resetMetaForPage(mode);
  if(mode === "gardarkiv") refreshPlaceMapLayout();
}
function currentRoute(){
  const rawHash = decodeURIComponent(location.hash.slice(1));
  if(location.protocol === "file:" && rawHash.startsWith("/")){
    const clean = rawHash.replace(/^\/+|\/+$/g,"");
    return clean ? "/" + clean + "/" : "/";
  }
  if(rawHash === "hem") return "/";
  if(rawHash === "personarkiv") return "/personarkiv/";
  if(rawHash === "gardarkiv") return "/gardar/";
  if(rawHash === "emigrantarkiv") return "/emigranter/";
  if(rawHash === "kontakt") return "/kontakt/";
  if(rawHash.startsWith("person/")) return `/personer/${rawHash.slice(7)}/`;
  if(rawHash.startsWith("plats/")) return `/gardar/${rawHash.slice(6)}/`;
  return location.pathname || "/";
}
function renderCurrentRoute(){
  updateActiveNav();
  const detail = document.getElementById('detailPage');
  detail?.classList.remove('open');
  const path = currentRoute();
  const parts = path.replace(/^\/+|\/+$/g,"").split("/").filter(Boolean);
  if(!parts.length || parts[0] === "index.html"){
    setPageMode("home");
    return;
  }
  if(parts[0] === "personarkiv"){
    setPageMode("personarkiv");
    document.getElementById('personarkiv')?.scrollIntoView({behavior:'auto',block:'start'});
    return;
  }
  if(parts[0] === "gardar" && parts.length === 1){
    setPageMode("gardarkiv");
    document.getElementById('platskarta')?.scrollIntoView({behavior:'auto',block:'start'});
    return;
  }
  if(parts[0] === "emigranter" && parts.length === 1){
    setPageMode("emigrantarkiv");
    document.getElementById('emigrantarkiv')?.scrollIntoView({behavior:'auto',block:'start'});
    return;
  }
  if(parts[0] === "kontakt" && parts.length === 1){
    setPageMode("contact");
    document.getElementById('kontakt')?.scrollIntoView({behavior:'auto',block:'start'});
    return;
  }
  if(parts[0] === "personer" && parts[1]){
    const id = findPersonBySlug(parts[1]);
    if(id){ setPageMode("detail"); if(renderPersonDetail(id)) return; }
  }
  if(parts[0] === "gardar" && parts[1]){
    const id = findPlaceBySlug(parts[1]);
    if(id){ setPageMode("detail"); if(renderPlaceDetail(id)) return; }
  }
  if(parts[0] === "emigranter" && parts[1] && parts[2] === "personer" && parts[3]){
    const branchId = findEmigrantBySlug(parts[1]);
    const personId = branchId ? findEmigrantPersonBySlug(EMIGRANT_BRANCHES[branchId],parts[3]) : null;
    if(branchId && personId){ setPageMode("detail"); if(renderEmigrantPersonDetail(branchId,personId)) return; }
  }
  if(parts[0] === "emigranter" && parts[1]){
    const id = findEmigrantBySlug(parts[1]);
    if(id){ setPageMode("detail"); if(renderEmigrantDetail(id)) return; }
  }
  setPageMode("home");
}
window.addEventListener('hashchange', renderCurrentRoute);
window.addEventListener('popstate', renderCurrentRoute);
document.addEventListener('click', e=>{
  const personBtn = e.target.closest('[data-open-person]');
  if(personBtn){ e.preventDefault(); navigatePath(personPath(personBtn.dataset.openPerson)); return; }
  const placeBtn = e.target.closest('[data-open-place]');
  if(placeBtn){ e.preventDefault(); navigatePath(placePath(placeBtn.dataset.openPlace)); return; }
  const emigrantBtn = e.target.closest('[data-open-emigrant]');
  if(emigrantBtn){ e.preventDefault(); navigatePath(emigrantPath(emigrantBtn.dataset.openEmigrant)); return; }
  const emigrantPersonBtn = e.target.closest('[data-open-emigrant-person]');
  if(emigrantPersonBtn){
    e.preventDefault();
    navigatePath(emigrantPersonPath(emigrantPersonBtn.dataset.emigrantBranch,emigrantPersonBtn.dataset.openEmigrantPerson));
    return;
  }
  const closeBtn = e.target.closest('[data-close-detail]');
  if(closeBtn){ clearDetailRoute(); return; }
  const shareBtn = e.target.closest('[data-share-page]');
  if(shareBtn){ shareDetailPage(shareBtn); return; }
  const printBtn = e.target.closest('[data-print-page]');
  if(printBtn){ window.print(); return; }
  const showInTree = e.target.closest('[data-show-in-tree]');
  if(showInTree){
    const id = showInTree.dataset.showInTree;
    navigatePath("/");
    window.setTimeout(()=>{
      renderTree({preserveView:true});
      focusPerson(id);
      openPerson(id);
    }, 40);
    return;
  }
  const editPerson = e.target.closest('[data-edit-person]');
  if(editPerson){
    if(!canEditArchive()){ openLoginPanel(); return; }
    openPerson(editPerson.dataset.editPerson);
    document.getElementById('panelEditForm').classList.add('open');
    fillPanelEditor(editPerson.dataset.editPerson);
    return;
  }
  const mapJump = e.target.closest('[data-jump-place-map]');
  if(mapJump){
    const id = mapJump.dataset.jumpPlaceMap;
    navigatePath("/gardar/");
    window.setTimeout(()=>{
      document.getElementById('platskarta').scrollIntoView({behavior:'smooth',block:'start'});
      selectPlace(id);
    }, 40);
  }
});

function focusPerson(id, minimumScale=0.72){
  const unit = UNIT_BY_ID[PERSON_TO_UNIT[id]]; if(!unit?._el) return;
  const cx = unit._el.offsetLeft + unit._el.offsetWidth/2;
  const cy = unit._el.offsetTop + unit._el.offsetHeight/2;
  scale = clampScale(Math.max(scale,minimumScale));
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
    renderArchives();
    refreshSelectedPlace();
  }
  [...motherInputs,...fatherInputs].forEach(input=>input.addEventListener('change',()=>sync(input)));
  setAll(motherInputs, branchState.mother);
  setAll(fatherInputs, branchState.father);
}
function personSearchText(id){
  const p = PEOPLE[id];
  return [personPrimarySearchText(p),...(p.facts||[]).flat(),...(p.story||[]),...(p.timeline||[]).flat(),...recordSources(p),...recordUncertainties(p)].filter(Boolean).join(" ");
}
function normalizeSearchText(value){
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase('sv').replace(/[^a-z0-9]+/g," ").trim();
}
function searchTokens(query){ return normalizeSearchText(query).split(/\s+/).filter(Boolean); }
function matchesSearchText(value,query){
  const haystack=normalizeSearchText(value),tokens=searchTokens(query);
  return !!tokens.length && tokens.every(token=>haystack.includes(token));
}
function personPrimarySearchText(person){
  return [person.name,...personAliases(person),...(person.formerNames || []),person.role,person.born,person.died,person.place].filter(Boolean).join(" ");
}
function personSearchRank(id,query){
  const person=PEOPLE[id],normalizedQuery=normalizeSearchText(query);
  const names=normalizeSearchText([person.name,...personAliases(person),...(person.formerNames || [])].filter(Boolean).join(" "));
  const nameWords=new Set(names.split(/\s+/)),tokens=searchTokens(query);
  if(names === normalizedQuery || names.startsWith(`${normalizedQuery} `)) return 0;
  if(tokens.every(token=>nameWords.has(token))) return 1;
  if(matchesSearchText(names,query)) return 2;
  if(matchesSearchText(personPrimarySearchText(person),query)) return 3;
  if(matchesSearchText(personSearchText(id),query)) return 4;
  return Infinity;
}
function rankedPersonSearch(query){
  const rows=Object.keys(PEOPLE).map(id=>({id,rank:personSearchRank(id,query)})).filter(row=>Number.isFinite(row.rank));
  const best=Math.min(...rows.map(row=>row.rank),Infinity);
  return rows.filter(row=>best <= 1 ? row.rank <= 1 : best < 4 ? row.rank <= 3 : true).sort((a,b)=>a.rank-b.rank || PEOPLE[a.id].name.localeCompare(PEOPLE[b.id].name,'sv'));
}
function personSearchContext(id){
  const p = PEOPLE[id], parts = [];
  if(p.born) parts.push(`född ${p.born}`);
  if(p.died) parts.push(`död ${p.died}`);
  if(p.place) parts.push(canonicalEntityText(p.place));
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
  return [placePrimarySearchText(place),place.note,...(place.facts||[]).flat(),...(place.story||[]),...(place.timeline||[]).flat(),...recordSources(place),...recordUncertainties(place)].filter(Boolean).join(" ");
}
function placePrimarySearchText(place){
  return [place.name,place.area,...placeAliases(place),...(place.formerNames || [])].filter(Boolean).join(" ");
}
function placeSearchRank(place,query){
  const normalizedQuery=normalizeSearchText(query),name=normalizeSearchText(place.name);
  const primary=normalizeSearchText(placePrimarySearchText(place)),primaryWords=new Set(primary.split(/\s+/)),tokens=searchTokens(query);
  if(name === normalizedQuery || name.startsWith(`${normalizedQuery} `)) return 0;
  if(tokens.every(token=>primaryWords.has(token))) return 1;
  if(matchesSearchText(primary,query)) return 2;
  if(matchesSearchText(placeSearchText(place),query)) return 3;
  return Infinity;
}
function rankedPlaceSearch(query){
  const rows=visiblePlaces().map(place=>({place,rank:placeSearchRank(place,query)})).filter(row=>Number.isFinite(row.rank));
  const best=Math.min(...rows.map(row=>row.rank),Infinity);
  return rows.filter(row=>best <= 1 ? row.rank <= 1 : best < 3 ? row.rank <= 2 : true).sort((a,b)=>a.rank-b.rank || a.place.name.localeCompare(b.place.name,'sv'));
}
function rankedEmigrantPersonSearch(query){
  const normalizedQuery=normalizeSearchText(query),tokens=searchTokens(query),rows=[];
  Object.entries(EMIGRANT_BRANCHES).forEach(([branchId,branch])=>{
    Object.entries(branch.people || {}).forEach(([personId,person])=>{
      const names=normalizeSearchText([person.name,...(person.aliases || [])].join(" "));
      const words=new Set(names.split(/\s+/));
      const full=[names,person.relation,person.born,person.died,person.location,person.summary,...(person.story || []),...(person.facts || []).flat()].filter(Boolean).join(" ");
      let rank=Infinity;
      if(names === normalizedQuery || names.startsWith(`${normalizedQuery} `)) rank=0;
      else if(tokens.every(token=>words.has(token))) rank=1;
      else if(matchesSearchText(names,query)) rank=2;
      else if(matchesSearchText(full,query)) rank=4;
      if(Number.isFinite(rank)) rows.push({branchId,personId,person,rank});
    });
  });
  return rows.sort((a,b)=>a.rank-b.rank || a.person.name.localeCompare(b.person.name,'sv'));
}
function runSearch(query){
  const results = document.getElementById('searchResults');
  const q = normalizeSearchText(query);
  if(!q){ results.classList.remove('open'); results.innerHTML=""; return; }
  if(currentSearchMode() === "place"){ runPlaceSearch(q, results); return; }
  runPersonSearch(q, results);
}
function runPersonSearch(q, results){
  const central = rankedPersonSearch(q).map(row=>({kind:"central",id:row.id,person:PEOPLE[row.id],rank:row.rank}));
  const branch = rankedEmigrantPersonSearch(q).map(row=>({kind:"emigrant",...row}));
  const hits = [...central,...branch].sort((a,b)=>a.rank-b.rank || a.person.name.localeCompare(b.person.name,'sv')).slice(0,12);
  results.classList.add('open');
  if(!hits.length){ results.innerHTML = '<div class="search-empty">Ingen person matchar sökningen.</div>'; return; }
  results.innerHTML = hits.map(hit=>{
    const p = hit.person;
    if(hit.kind === "emigrant"){
      return `<a class="search-hit" href="${escapeHtml(emigrantPersonPath(hit.branchId,hit.personId))}" data-type="emigrant-person" data-id="${escapeHtml(hit.personId)}" data-emigrant-branch="${escapeHtml(hit.branchId)}">
        <div class="search-hit-name">${escapeHtml(p.name)}${p.aliases?.length ? ` / ${escapeHtml(p.aliases.join(" / "))}` : ""}</div>
        <div class="search-hit-meta">${escapeHtml(p.relation || "Emigrantgren")}</div>
        <div class="search-hit-context">${escapeHtml([p.born,p.location,"amerikansk gren"].filter(Boolean).join(" · "))}</div>
      </a>`;
    }
    const id = hit.id;
    const aliases = personAliasText(p);
    return `<a class="search-hit" href="${escapeHtml(personPath(id))}" data-type="person" data-id="${id}">
      <div class="search-hit-name">${escapeHtml(p.name)}${aliases ? ` / ${escapeHtml(aliases)}` : ""}</div>
      <div class="search-hit-meta">${escapeHtml(p.role || "Person")}</div>
      <div class="search-hit-context">${escapeHtml(personSearchContext(id) || "Mer information finns i personrutan.")}</div>
    </a>`;
  }).join("");
}
function runPlaceSearch(q, results){
  const hits = rankedPlaceSearch(q).map(row=>row.place).slice(0,12);
  results.classList.add('open');
  if(!hits.length){ results.innerHTML = '<div class="search-empty">Ingen plats matchar sökningen.</div>'; return; }
  results.innerHTML = hits.map(place=>{
    const related = placePeople(place).length;
    return `<a class="search-hit" href="${escapeHtml(placePath(place.id))}" data-type="place" data-place="${place.id}">
      <div class="search-hit-name">${escapeHtml(place.name)}</div>
      <div class="search-hit-meta">${escapeHtml(place.area)}${hasCoords(place) ? "" : " · ingen exakt kartpunkt"}</div>
      <div class="search-hit-context">${related ? `${related} person${related === 1 ? "" : "er"} kopplade` : "Inga personer kopplade i aktivt filter"}</div>
    </a>`;
  }).join("");
}
function archiveBranchKey(id){
  const branch = personBranch(id);
  if(branch === "mother") return "Bengtsson-ledet";
  if(branch === "father") return "Nilsson-ledet";
  return "Ej placerat släktled";
}
function archivePlaceKey(person){
  if(!person.place) return "Plats saknas";
  const match = PLACES.find(place=>placeMatchesText(place, placeHaystack(person)));
  return match?.name || person.place.split("/")[0].split(",")[0].trim() || "Plats saknas";
}
function archiveValue(id){ return document.getElementById(id)?.value?.trim() || ""; }
function personCentury(person){
  const match = `${person.born || ""} ${person.died || ""}`.match(/(1[5-9]\d{2}|20\d{2})/);
  if(!match) return "";
  return `${Math.floor(Number(match[1]) / 100) + 1}00-talet`;
}
function isFarmPlace(place){
  return /gård|hemman|nilsgård|valagård|wahlagård|skultagård|klockaregård|prästgård/i.test(`${place.name} ${placeAliases(place).join(" ")}`);
}
function archivePersonRows(){
  const query = archiveValue('personArchiveSearch');
  const century = archiveValue('personArchiveCentury');
  const placeFilter = archiveValue('personArchivePlace');
  const status = archiveValue('personArchiveStatus');
  const matchingIds = query ? new Set(rankedPersonSearch(query).map(row=>row.id)) : null;
  return Object.entries(PEOPLE)
    .filter(([id])=>personMatchesActiveBranches(id))
    .map(([id,p])=>({id,person:p,branch:archiveBranchKey(id),place:archivePlaceKey(p)}))
    .filter(row=>!matchingIds || matchingIds.has(row.id))
    .filter(row=>!century || personCentury(row.person) === century)
    .filter(row=>!placeFilter || row.place === placeFilter)
    .filter(row=>!status || (row.person.status || "open") === status)
    .sort((a,b)=>a.branch.localeCompare(b.branch,'sv') || a.place.localeCompare(b.place,'sv') || a.person.name.localeCompare(b.person.name,'sv'));
}
function renderPersonArchive(){
  const el = document.getElementById('personArchive');
  const count = document.getElementById('personArchiveCount');
  if(!el) return;
  const rows = archivePersonRows();
  if(count) count.textContent = `${rows.length} ${rows.length === 1 ? "person" : "personer"} i aktivt filter`;
  const byBranch = new Map();
  rows.forEach(row=>{
    if(!byBranch.has(row.branch)) byBranch.set(row.branch, new Map());
    const byPlace = byBranch.get(row.branch);
    if(!byPlace.has(row.place)) byPlace.set(row.place, []);
    byPlace.get(row.place).push(row);
  });
  const branchOrder = ["Bengtsson-ledet","Nilsson-ledet","Ej placerat släktled"];
  el.innerHTML = branchOrder.filter(branch=>byBranch.has(branch)).flatMap(branch=>{
    const byPlace = byBranch.get(branch);
    return [...byPlace.entries()].map(([place, people])=>`
      <article class="archive-group">
        <p class="archive-section-label">${escapeHtml(branch)}</p>
        <h3>${escapeHtml(place)}</h3>
        <p class="archive-group-meta">${people.length} person${people.length === 1 ? "" : "er"}</p>
        <div class="archive-list">
          ${people.map(({id,person})=>`<div class="archive-item-row"><a class="archive-item" href="${escapeHtml(routePersonUrl(id))}" data-open-person="${escapeHtml(id)}">
            <span class="archive-item-name">${escapeHtml(person.name)}${personAliases(person).length ? ` / ${escapeHtml(personAliases(person).join(" / "))}` : ""}</span>
            <span class="archive-item-meta">${escapeHtml([person.born, person.role, DIRECT_HEIRS.has(id) ? "direkt led" : "", EMIGRANT_BRANCHES[id] ? "emigrantgren" : ""].filter(Boolean).join(" · ") || "Person")}</span>
          </a>${adminEditLinkHTML("person",id,person.name,"record-edit-shortcut archive-edit-shortcut")}</div>`).join("")}
        </div>
      </article>`);
  }).join("") || '<p class="detail-empty">Inga personer matchar valt filter.</p>';
  refreshPageIcons();
}
function renderPlaceArchive(){
  const el = document.getElementById('placeArchive');
  const count = document.getElementById('placeArchiveCount');
  if(!el) return;
  const query = archiveValue('placeArchiveSearch');
  const typeFilter = archiveValue('placeArchiveType');
  const mapFilter = archiveValue('placeArchiveMap');
  const matchingIds = query ? new Set(rankedPlaceSearch(query).map(row=>row.place.id)) : null;
  const places = visiblePlaces().filter(place=>{
    if(matchingIds && !matchingIds.has(place.id)) return false;
    if(typeFilter === "farm" && !isFarmPlace(place)) return false;
    if(typeFilter === "place" && isFarmPlace(place)) return false;
    if(mapFilter === "mapped" && !hasCoords(place)) return false;
    if(mapFilter === "unmapped" && hasCoords(place)) return false;
    return true;
  }).slice().sort((a,b)=>a.name.localeCompare(b.name,'sv'));
  if(count) count.textContent = `${places.length} ${places.length === 1 ? "plats" : "platser"} i aktivt filter`;
  el.innerHTML = places.map(place=>{
    const related = placePeople(place);
    const type = isFarmPlace(place) ? "Gård" : "Plats";
    return `<article class="archive-group">
      <p class="archive-section-label">${escapeHtml(type)}</p>
      <h3>${escapeHtml(place.name)}</h3>
      <p class="archive-group-meta">${escapeHtml(place.area || "Område saknas")} · ${related.length} kopplade personer${hasCoords(place) ? " · kartpunkt" : ""}</p>
      <p class="place-note">${escapeHtml(place.note || "Ingen platsbeskrivning ännu.")}</p>
      <div class="archive-list" style="margin-top:12px">
        <div class="archive-item-row"><a class="archive-item" href="${escapeHtml(routePlaceUrl(place.id))}" data-open-place="${escapeHtml(place.id)}">
          <span class="archive-item-name">Öppna gårdssida</span>
          <span class="archive-item-meta">${escapeHtml(placeAliases(place).slice(0,4).join(" · ") || place.name)}</span>
        </a>${adminEditLinkHTML("place",place.id,place.name,"record-edit-shortcut archive-edit-shortcut")}</div>
      </div>
    </article>`;
  }).join("") || '<p class="detail-empty">Inga platser matchar valt filter.</p>';
  refreshPageIcons();
}
function emigrantSearchText(branch){
  const person = PEOPLE[branch.rootPersonId] || {};
  const branchPeople = Object.values(branch.people || {}).flatMap(item=>[item.name,...(item.aliases || []),item.relation,item.born,item.died,item.location,item.summary,...(item.story || []),...(item.facts || []).flat()]);
  return [person.name,...personAliases(person),person.born,branch.branchLabel,branch.originCountry,branch.destinationCountry,...(branch.destinationAreas || []),branch.summary,...(branch.story || []),...(branch.facts || []).flat(),...branchPeople].filter(Boolean).join(" ").toLocaleLowerCase('sv');
}
function renderEmigrantArchive(){
  const el = document.getElementById('emigrantArchive');
  const count = document.getElementById('emigrantArchiveCount');
  if(!el) return;
  const query = archiveValue('emigrantArchiveSearch');
  const destination = archiveValue('emigrantArchiveDestination');
  const status = archiveValue('emigrantArchiveStatus');
  const branches = Object.values(EMIGRANT_BRANCHES)
    .filter(branch=>PEOPLE[branch.rootPersonId])
    .filter(branch=>!query || matchesSearchText(emigrantSearchText(branch),query))
    .filter(branch=>!destination || branch.destinationCountry === destination)
    .filter(branch=>!status || (branch.status || "open") === status)
    .sort((a,b)=>PEOPLE[a.rootPersonId].name.localeCompare(PEOPLE[b.rootPersonId].name,'sv'));
  if(count) count.textContent = `${branches.length} emigrantgren${branches.length === 1 ? "" : "ar"} i aktivt filter`;
  el.innerHTML = branches.map(branch=>{
    const person = PEOPLE[branch.rootPersonId];
    return `<article class="archive-group">
      <p class="archive-section-label">${escapeHtml(branch.branchLabel || "Emigrantgren")}</p>
      <h3>${escapeHtml(person.name)}</h3>
      <div class="emigrant-route"><strong>${escapeHtml(branch.originCountry || "Sverige")}</strong><span class="emigrant-route-arrow" aria-hidden="true">→</span><strong>${escapeHtml(branch.destinationCountry || "Okänd destination")}</strong></div>
      <p class="archive-group-meta">${escapeHtml([person.born ? `född ${person.born}` : "",emigrantBranchStatus(branch),`${Object.keys(branch.people || {}).length} dokumenterade personer`].filter(Boolean).join(" · "))}</p>
      <p class="place-note">${escapeHtml(branch.summary)}</p>
      <div class="archive-list" style="margin-top:12px">
        <a class="archive-item" href="${escapeHtml(emigrantPath(branch.id))}" data-open-emigrant="${escapeHtml(branch.id)}">
          <span class="archive-item-name">Öppna emigrantgren</span>
          <span class="archive-item-meta">${escapeHtml((branch.destinationAreas || []).join(" · ") || "Destination utreds")}</span>
        </a>
      </div>
    </article>`;
  }).join("") || '<p class="detail-empty">Inga emigrantgrenar matchar valt filter.</p>';
}
function renderArchives(){
  renderPersonArchive();
  renderPlaceArchive();
  renderEmigrantArchive();
  refreshStructuredArchive();
}
function buildStructuredArchive(){
  const events = [];
  const sources = [];
  const images = [];
  const relationships = [];
  Object.entries(PEOPLE).forEach(([personId,person])=>{
    buildTimeline(person).forEach(([date,note],index)=>events.push({id:`person:${personId}:event:${index}`,ownerType:"person",ownerId:personId,date,note}));
    recordSources(person).forEach((text,index)=>sources.push({id:`person:${personId}:source:${index}`,ownerType:"person",ownerId:personId,text}));
    normalizedImages(person,true).forEach((image,index)=>images.push({id:`person:${personId}:image:${index}`,ownerType:"person",ownerId:personId,...image}));
    (person.parents || []).filter(parentId=>PEOPLE[parentId]).forEach(parentId=>relationships.push({type:"parent",from:parentId,to:personId}));
    if(PARTNER[personId] && personId.localeCompare(PARTNER[personId]) < 0) relationships.push({type:"partner",from:personId,to:PARTNER[personId]});
  });
  PLACES.forEach(place=>{
    (place.timeline || []).forEach(([date,note],index)=>events.push({id:`place:${place.id}:event:${index}`,ownerType:"place",ownerId:place.id,date,note}));
    recordSources(place).forEach((text,index)=>sources.push({id:`place:${place.id}:source:${index}`,ownerType:"place",ownerId:place.id,text}));
    normalizedImages(place).forEach((image,index)=>images.push({id:`place:${place.id}:image:${index}`,ownerType:"place",ownerId:place.id,...image}));
    placePeople(place).forEach(row=>relationships.push({type:"place",from:row.id,to:place.id}));
  });
  return {people:PEOPLE,places:PLACES,emigrantBranches:EMIGRANT_BRANCHES,events,sources,images,relationships};
}
function refreshStructuredArchive(){
  window.NILSSON_BENGTSSON_ARCHIVE = buildStructuredArchive();
}
function setSelectOptions(id, values, firstLabel){
  const select = document.getElementById(id); if(!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>` + values.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if(values.includes(current)) select.value = current;
}
function initArchiveFilters(){
  const rows = Object.entries(PEOPLE).map(([id,person])=>({id,person,place:archivePlaceKey(person)}));
  const centuries = [...new Set(rows.map(row=>personCentury(row.person)).filter(Boolean))].sort();
  const places = [...new Set(rows.map(row=>row.place).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'sv'));
  const destinations = [...new Set(Object.values(EMIGRANT_BRANCHES).map(branch=>branch.destinationCountry).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'sv'));
  setSelectOptions('personArchiveCentury', centuries, 'Alla århundraden');
  setSelectOptions('personArchivePlace', places, 'Alla platser');
  setSelectOptions('emigrantArchiveDestination', destinations, 'Alla destinationer');
  const liveSearches = {
    personArchiveSearch: renderPersonArchive,
    placeArchiveSearch: renderPlaceArchive,
    emigrantArchiveSearch: renderEmigrantArchive
  };
  Object.entries(liveSearches).forEach(([id,render])=>bindLiveSearch(document.getElementById(id),render));
  ['personArchiveCentury','personArchivePlace','personArchiveStatus','placeArchiveType','placeArchiveMap','emigrantArchiveDestination','emigrantArchiveStatus'].forEach(id=>{
    const field = document.getElementById(id);
    field?.addEventListener('change', renderArchives);
  });
}
function placeIdFromCurrentRoute(){
  const parts = currentRoute().replace(/^\/+|\/+$/g,"").split("/").filter(Boolean);
  if(parts[0] === "gardar" && parts[1]) return findPlaceBySlug(parts[1]);
  const hash = decodeURIComponent(location.hash.slice(1));
  if(hash.startsWith("plats/")) return hash.slice(6);
  return null;
}
function initSiteNavigation(){
  document.addEventListener('click', e=>{
    const nav = e.target.closest('[data-nav]');
    if(!nav) return;
    e.preventDefault();
    const target = nav.dataset.nav === "personarkiv" ? "/personarkiv/" : nav.dataset.nav === "gardarkiv" ? "/gardar/" : nav.dataset.nav === "emigrantarkiv" ? "/emigranter/" : nav.dataset.nav === "contact" ? "/kontakt/" : "/";
    closePanel();
    navigatePath(target);
  });
}
function initMobileNavigation(){
  const nav = document.querySelector('.site-nav');
  const toggle = document.getElementById('navToggle');
  if(!nav || !toggle) return;
  const close = ()=>{
    nav.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','Öppna meny');
    toggle.title = 'Öppna meny';
    toggle.textContent = '☰';
    document.querySelector('.access-menu')?.removeAttribute('open');
  };
  toggle.addEventListener('click',()=>{
    const open = !nav.classList.contains('menu-open');
    nav.classList.toggle('menu-open',open);
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-label',open ? 'Stäng meny' : 'Öppna meny');
    toggle.title = open ? 'Stäng meny' : 'Öppna meny';
    toggle.textContent = open ? '×' : '☰';
  });
  nav.addEventListener('click',event=>{ if(event.target.closest('a')) close(); });
  document.addEventListener('click',event=>{
    const menu = document.querySelector('.access-menu');
    if(menu?.open && !menu.contains(event.target)) menu.removeAttribute('open');
  });
  window.matchMedia('(min-width: 901px)').addEventListener?.('change',event=>{ if(event.matches) close(); });
}
function updateActiveNav(){
  const route = currentRoute();
  document.querySelectorAll('[data-nav]').forEach(link=>{
    const key = link.dataset.nav;
    const active = (key === "home" && route === "/") || (key === "personarkiv" && route.startsWith("/personarkiv")) || (key === "gardarkiv" && route.startsWith("/gardar")) || (key === "emigrantarkiv" && route.startsWith("/emigranter")) || (key === "contact" && route.startsWith("/kontakt"));
    link.classList.toggle('active', active);
  });
}
function bindLiveSearch(input, callback){
  if(!input) return;
  let composing = false;
  let frame = 0;
  const update = ()=>{
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(()=>callback(input.value));
  };
  input.addEventListener('compositionstart',()=>{ composing = true; });
  input.addEventListener('compositionend',()=>{ composing = false; update(); });
  ['input','search','change'].forEach(type=>input.addEventListener(type,()=>{ if(!composing) update(); }));
  input.addEventListener('keyup',event=>{
    if(!composing && event.key !== 'Enter' && event.key !== 'Escape') update();
  });
  input.addEventListener('keydown',event=>{
    if(event.key !== 'Enter') return;
    event.preventDefault();
    update();
  });
}
function initPersonSearch(){
  const input = document.getElementById('personSearch'), clear = document.getElementById('searchClear'), results = document.getElementById('searchResults');
  const modes = [...document.querySelectorAll('input[name="searchMode"]')];
  bindLiveSearch(input,runSearch);
  input.addEventListener('keydown', e=>{ if(e.key==="Escape"){ input.value=""; runSearch(""); } });
  document.getElementById('siteSearchForm')?.addEventListener('submit',event=>{
    event.preventDefault();
    runSearch(input.value);
  });
  modes.forEach(mode=>mode.addEventListener('change',()=>{
    input.placeholder = currentSearchMode() === "place" ? "Sök plats, gård, socken eller ort" : "Sök person på namn, födelsedatum, plats eller notering";
    runSearch(input.value);
  }));
  clear.addEventListener('click',()=>{ input.value=""; runSearch(""); input.focus(); });
  results.addEventListener('click', e=>{
    const hit = e.target.closest('.search-hit'); if(!hit) return;
    e.preventDefault();
    if(hit.dataset.type === "place"){
      navigatePath(placePath(hit.dataset.place));
      return;
    }
    if(hit.dataset.type === "emigrant-person"){
      navigatePath(emigrantPersonPath(hit.dataset.emigrantBranch,hit.dataset.id));
      return;
    }
    navigatePath(personPath(hit.dataset.id));
  });
}

let placeMap = null;
const placeMarkers = {};
function hasCoords(place){ return Number.isFinite(place.lat) && Number.isFinite(place.lng); }
function refreshPlaceMapLayout(){
  if(!placeMap) return;
  window.requestAnimationFrame(()=>{
    placeMap.invalidateSize({pan:false});
    const selected = PLACES.find(place=>place.id === currentPlaceId);
    if(selected && hasCoords(selected)){
      placeMap.setView([selected.lat,selected.lng],selected.zoom || 13,{animate:false});
      return;
    }
    const mappedPlaces = visiblePlaces().filter(hasCoords);
    if(mappedPlaces.length){
      placeMap.fitBounds(L.latLngBounds(mappedPlaces.map(place=>[place.lat,place.lng])),{padding:[24,24],animate:false});
    }
  });
}
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
  return [place.name,...placeAliases(place),...(place.formerNames || [])].some(alias=>hay.includes(String(alias).toLocaleLowerCase('sv')));
}
function placePeople(place){
  if(Array.isArray(place.relatedPersonIds)){
    return place.relatedPersonIds.filter(id=>PEOPLE[id] && personMatchesActiveBranches(id)).map(id=>({
      id,
      labels:new Set(["Uttrycklig platskoppling"]),
      texts:[PEOPLE[id].place || `Kopplad till ${place.name}`]
    })).sort((a,b)=>{
      const direct = Number(DIRECT_HEIRS.has(b.id)) - Number(DIRECT_HEIRS.has(a.id));
      return direct || PEOPLE[a.id].name.localeCompare(PEOPLE[b.id].name,'sv');
    });
  }
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
  listEl.innerHTML = places.length ? places.map(p=>`<div class="place-list-row"><button class="place-btn" type="button" data-place="${p.id}">
    <span class="place-btn-name">${escapeHtml(p.name)}</span>
    <span class="place-btn-meta">${escapeHtml(p.area)}${hasCoords(p) ? "" : " · ej kartlagd"}</span>
  </button>${adminEditLinkHTML("place",p.id,p.name,"record-edit-shortcut place-list-edit")}</div>`).join("") : '<div class="place-empty-row">Inga platser matchar valt filter.</div>';
  refreshPageIcons();
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
  if(document.body.classList.contains('page-gardarkiv')) refreshPlaceMapLayout();
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
function applyAccessibilityPrefs(prefs){
  document.body.classList.toggle("large-text", !!prefs.largeText);
  document.body.classList.toggle("high-contrast", !!prefs.highContrast);
  const large = document.getElementById('largeTextToggle');
  const contrast = document.getElementById('contrastToggle');
  if(large) large.classList.toggle("active", !!prefs.largeText);
  if(contrast) contrast.classList.toggle("active", !!prefs.highContrast);
}
function loadAccessibilityPrefs(){
  try{ return JSON.parse(safeLocalStorageGet(ACCESS_STORAGE_KEY) || "{}"); }catch{ return {}; }
}
function saveAccessibilityPrefs(prefs){
  safeLocalStorageSet(ACCESS_STORAGE_KEY, JSON.stringify(prefs));
}
function initAccessibilityControls(){
  const prefs = loadAccessibilityPrefs();
  applyAccessibilityPrefs(prefs);
  document.getElementById('largeTextToggle')?.addEventListener('click', ()=>{
    prefs.largeText = !prefs.largeText;
    applyAccessibilityPrefs(prefs);
    saveAccessibilityPrefs(prefs);
  });
  document.getElementById('contrastToggle')?.addEventListener('click', ()=>{
    prefs.highContrast = !prefs.highContrast;
    applyAccessibilityPrefs(prefs);
    saveAccessibilityPrefs(prefs);
  });
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
  normalizePersonNames(person);
  person.slug ||= slugifyUrl(person.name || id);
  PEOPLE[id] = person;
  invalidateEntityReferenceCache();
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
  invalidateEntityReferenceCache();
  const beforeParents = [...(person.parents || [])];
  const beforePartner = PARTNER[id] || person.partner || "";
  removePersonRelationLinks(id, beforeParents, beforePartner);
  ["name","alt","aliases","formerNames","role","born","died","status","place","photo"].forEach(key=>{
    person[key] = edit[key] || "";
  });
  normalizePersonNames(person);
  person.facts = edit.facts || [];
  person.story = edit.story?.length ? edit.story : ["Ännu inte utforskad."];
  person.timeline = edit.timeline || [];
  person.images = edit.images || [];
  person.sources = edit.sources || [];
  person.uncertainties = edit.uncertainties || [];
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
  normalizePlaceNames(place);
  place.slug ||= slugifyUrl(place.name || place.id);
  PLACES.push(place);
  invalidateEntityReferenceCache();
  ensurePlaceMarker(place);
}
function applyManualPlaceEdit(id, edit){
  const place = PLACES.find(p=>p.id===id); if(!place) return;
  invalidateEntityReferenceCache();
  if(edit.lat === null) delete place.lat;
  if(edit.lng === null) delete place.lng;
  Object.assign(place, edit);
  if(place.lat === null) delete place.lat;
  if(place.lng === null) delete place.lng;
  normalizePlaceNames(place);
  if(placeMarkers[id] && hasCoords(place)){
    placeMarkers[id].setLatLng([place.lat, place.lng]);
    placeMarkers[id].setPopupContent(`<strong>${escapeHtml(place.name)}</strong><br>${escapeHtml(place.area)}<br><button type="button" data-place-card="${escapeHtml(place.id)}">Öppna platskort</button>`);
  }else{
    ensurePlaceMarker(place);
  }
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
    Object.assign(manualData.placeEdits, parsed.placeEdits || {});
    manualData.drafts = parsed.drafts || {people:{},places:{}};
    manualData.drafts.people ||= {};
    manualData.drafts.places ||= {};
    manualData.history.push(...(parsed.history || []));
  }catch{
    return;
  }
  Object.entries(manualData.people).forEach(([id,person])=>applyManualPerson(id,person));
  manualData.units.forEach(applyManualUnit);
  manualData.places.forEach(applyManualPlace);
  Object.entries(manualData.placeEdits).forEach(([id,edit])=>applyManualPlaceEdit(id,edit));
  Object.entries(manualData.edits).forEach(([id,edit])=>applyManualPersonEdit(id,edit));
}
function saveManualData(){
  return safeLocalStorageSet(MANUAL_STORAGE_KEY, JSON.stringify(manualData, null, 2));
}
function sharedSaveMessage(result){
  if(result?.mode === "published") return "Ändringen är publicerad för alla.";
  if(result?.mode === "pending") return "Ändringen är skickad för granskning.";
  return "Ändringen är sparad lokalt. Logga in för att dela den med familjen.";
}
async function persistSharedEntity(type, id, payload, operation="update", showMessage=editorMessage){
  if(!window.FamilyData) return {mode:"local"};
  try{
    const result = await window.FamilyData.submitChange(type,id,cloneRecord(payload),operation);
    showMessage(sharedSaveMessage(result));
    return result;
  }catch(error){
    showMessage(`Lokalt sparad, men delningen misslyckades: ${error.message || "okänt fel"}`);
    return {mode:"error",error};
  }
}
function applySharedSnapshot(snapshot){
  if(!snapshot) return;
  Object.entries(snapshot.people || {}).forEach(([id,person])=>{
    // Master 4 replaces the legacy Nils Johan row. Ignore that stale database
    // record until migration 005 has been applied so it cannot recreate a duplicate.
    if(id === "nils_johan_bengtsson" && PEOPLE.nils_johan_bengtsson_1869) return;
    normalizePersonNames(person);
    if(PEOPLE[id]) Object.assign(PEOPLE[id], person);
    else applyManualPerson(id, person);
    if(person.direct) DIRECT_HEIRS.add(id);
  });
  (snapshot.units || []).forEach(unit=>{
    unit = {...unit,persons:(unit.persons || []).map(id=>id === "nils_johan_bengtsson" ? "nils_johan_bengtsson_1869" : id)};
    if(UNIT_BY_ID[unit.id]){
      Object.assign(UNIT_BY_ID[unit.id], unit);
      (unit.persons || []).forEach(personId=>{ PERSON_TO_UNIT[personId] = unit.id; });
    }else applyManualUnit(unit);
  });
  (snapshot.places || []).forEach(place=>{
    normalizePlaceNames(place);
    const current = PLACES.find(row=>row.id === place.id);
    if(current) Object.assign(current, place);
    else applyManualPlace(place);
  });
  Object.entries(manualData.people).forEach(([id,person])=>applyManualPerson(id,person));
  manualData.units.forEach(applyManualUnit);
  manualData.places.forEach(applyManualPlace);
  Object.entries(manualData.placeEdits).forEach(([id,edit])=>applyManualPlaceEdit(id,edit));
  Object.entries(manualData.edits).forEach(([id,edit])=>applyManualPersonEdit(id,edit));
  invalidateEntityReferenceCache();
  refreshEditorSelects();
  renderTree({preserveView:true});
  renderPlaceList();
  renderArchives();
  refreshSelectedPlace();
  renderCurrentRoute();
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
  const history = (manualData.history || []).map((item,index)=>({...item,index})).slice(-12).reverse();
  if(!people.length && !edits.length && !places.length && !history.length){ list.innerHTML = '<p class="editor-note">Inga manuella personer, platser eller redigeringar är tillagda ännu.</p>'; return; }
  list.innerHTML = people.map(([id,p])=>`<div class="manual-item">
    <div class="manual-name">${escapeHtml(p.name)}</div>
    <div class="manual-meta">${escapeHtml([p.born, p.role, canonicalEntityText(p.place)].filter(Boolean).join(" · "))}</div>
  </div>`).join("") + edits.map(([id,p])=>`<div class="manual-item">
    <div class="manual-name">${escapeHtml(p.name || PEOPLE[id]?.name || id)}</div>
    <div class="manual-meta">Redigerad person${p.born ? ` · ${escapeHtml(p.born)}` : ""}</div>
  </div>`).join("") + places.map(place=>`<div class="manual-item">
    <div class="manual-name">${escapeHtml(place.name)}</div>
    <div class="manual-meta">Manuell plats · ${escapeHtml(place.area || "Område saknas")}${hasCoords(place) ? " · kartpunkt" : ""}</div>
  </div>`).join("") + (history.length ? `<p class="editor-subtitle">Senaste ändringar</p>${history.map(item=>`<div class="manual-item"><div class="manual-name">${escapeHtml(item.label || item.id)}</div><div class="manual-meta">${escapeHtml(item.action || "Ändrad")} · ${escapeHtml(new Date(item.at).toLocaleString('sv-SE'))}</div>${Object.keys(item.before || {}).length ? `<button class="btn" type="button" data-restore-change="${item.index}">Återställ föregående version</button>` : ""}</div>`).join("")}` : "");
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
function imagesToText(images){
  return (images || []).map(item=>{
    if(typeof item === "string") return item;
    return `${item.src || item.url || ""}${item.caption ? ` | ${item.caption}` : ""}`;
  }).filter(Boolean).join("\n");
}
function textToImages(text){
  return String(text || "").split(/\n+/).map(row=>row.trim()).filter(Boolean).map(row=>{
    const [src,...caption] = row.split("|");
    return {src:src.trim(),caption:caption.join("|").trim()};
  }).filter(item=>item.src);
}
function cloneRecord(value){
  return JSON.parse(JSON.stringify(value || {}));
}
function personSnapshot(id){
  return {...cloneRecord(PEOPLE[id]),partner:PARTNER[id] || "",direct:DIRECT_HEIRS.has(id)};
}
function recordChange(type, id, label, before, after, action="Sparad ändring"){
  manualData.history.push({type,id,label,action,at:new Date().toISOString(),before:cloneRecord(before),after:cloneRecord(after)});
  if(manualData.history.length > 100) manualData.history.splice(0, manualData.history.length - 100);
}
function restoreChange(index){
  const item = manualData.history[index];
  if(!item || !Object.keys(item.before || {}).length) return;
  if(item.type === "person" && PEOPLE[item.id]){
    const current = personSnapshot(item.id);
    manualData.edits[item.id] = cloneRecord(item.before);
    applyManualPersonEdit(item.id, item.before);
    recordChange("person", item.id, item.before.name || item.label, current, item.before, "Återställd version");
  }else if(item.type === "place" && PLACES.some(place=>place.id === item.id)){
    const place = PLACES.find(row=>row.id === item.id);
    const current = cloneRecord(place);
    manualData.placeEdits[item.id] = cloneRecord(item.before);
    applyManualPlaceEdit(item.id, item.before);
    recordChange("place", item.id, item.before.name || item.label, current, item.before, "Återställd version");
  }else return;
  saveManualData();
  renderManualList();
  renderTree({preserveView:true});
  renderPlaceList();
  renderArchives();
  refreshSelectedPlace();
  renderCurrentRoute();
  editorMessage("Den föregående versionen är återställd.");
}
function timelineToText(timeline){
  return (timeline || []).map(([date,note])=>`${date}: ${note}`).join("\n");
}
function textToTimeline(text){
  return String(text || "").split(/\n+/).map(row=>row.trim()).filter(Boolean).map(row=>{
    const splitAt = row.indexOf(":");
    if(splitAt < 0) return ["Notering", row];
    return [row.slice(0,splitAt).trim() || "Notering", row.slice(splitAt + 1).trim()];
  }).filter(([,note])=>note);
}
function setSelectValue(id, value){
  const el = document.getElementById(id);
  if(el) el.value = value || "";
}
function fillPanelEditor(id){
  const basePerson = PEOPLE[id]; if(!basePerson) return;
  const person = manualData.drafts.people[id] ? {...basePerson, ...manualData.drafts.people[id]} : basePerson;
  refreshEditorSelects();
  document.getElementById('editName').value = person.name || "";
  document.getElementById('editAliases').value = aliasesToEditorText(personAliases(person));
  document.getElementById('editRole').value = person.role || "";
  document.getElementById('editBorn').value = person.born || "";
  document.getElementById('editDied').value = person.died || "";
  document.getElementById('editPlace').value = person.place || "";
  document.getElementById('editPhoto').value = person.photo || "";
  document.getElementById('editStatus').value = person.status || "open";
  document.getElementById('editDirect').value = DIRECT_HEIRS.has(id) || person.direct ? "yes" : "";
  document.getElementById('editFacts').value = factsToText(person.facts);
  document.getElementById('editStory').value = (person.story || []).join("\n");
  document.getElementById('editTimeline').value = timelineToText(person.timeline);
  document.getElementById('editImages').value = imagesToText(person.images);
  document.getElementById('editSources').value = textItems(person.sources).join("\n");
  document.getElementById('editUncertainties').value = textItems(person.uncertainties).join("\n");
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
function panelPersonEditValue(){
  const current = PEOPLE[currentPanelPersonId] || {};
  const name = document.getElementById('editName').value.trim();
  const aliases = aliasesAfterRename(current,name,aliasesFromEditorText(document.getElementById('editAliases').value));
  return {
    name,
    aliases,
    alt:aliases.join(" / "),
    formerNames:formerNamesAfterRename(current,name),
    role:document.getElementById('editRole').value.trim(),
    born:document.getElementById('editBorn').value.trim(),
    died:document.getElementById('editDied').value.trim(),
    status:document.getElementById('editStatus').value,
    place:document.getElementById('editPlace').value.trim(),
    photo:document.getElementById('editPhoto').value.trim(),
    facts:textToFacts(document.getElementById('editFacts').value),
    story:textToStory(document.getElementById('editStory').value),
    timeline:textToTimeline(document.getElementById('editTimeline').value),
    images:textToImages(document.getElementById('editImages').value),
    sources:textToStory(document.getElementById('editSources').value),
    uncertainties:textToStory(document.getElementById('editUncertainties').value),
    parents:[document.getElementById('editParent1').value, document.getElementById('editParent2').value].filter(Boolean),
    partner:document.getElementById('editPartner').value,
    direct:document.getElementById('editDirect').value === "yes"
  };
}
function savePanelPersonEdit(){
  if(!canEditArchive()){ openLoginPanel(); return; }
  const id = currentPanelPersonId;
  if(!id || !PEOPLE[id]) return;
  const name = document.getElementById('editName').value.trim();
  if(!name){ panelEditMessage("Namn behövs för att spara."); return; }
  const edit = panelPersonEditValue();
  recordChange("person", id, name, personSnapshot(id), edit);
  manualData.edits[id] = edit;
  delete manualData.drafts.people[id];
  if(manualData.people[id]) manualData.people[id] = {...manualData.people[id], ...edit};
  applyManualPersonEdit(id, edit);
  saveManualData();
  refreshEditorSelects();
  renderManualList();
  renderTree({preserveView:true});
  renderPlaceList();
  renderArchives();
  refreshSelectedPlace();
  openPerson(id);
  persistSharedEntity("person",id,personSnapshot(id),"update",panelEditMessage);
}
function savePanelPersonDraft(){
  if(!canEditArchive()){ openLoginPanel(); return; }
  const id = currentPanelPersonId;
  if(!id || !PEOPLE[id]) return;
  const draft = panelPersonEditValue();
  if(!draft.name){ panelEditMessage("Namn behövs för att spara utkastet."); return; }
  manualData.drafts.people[id] = draft;
  saveManualData();
  renderManualList();
  panelEditMessage("Utkastet är sparat på den här enheten.");
}
function addManualPerson(form){
  if(!canEditArchive()){ openLoginPanel(); return; }
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
    slug:slugifyUrl(name),
    aliases:aliasesFromEditorText(document.getElementById('newPersonAliases').value),
    role:document.getElementById('newPersonRole').value.trim() || "Manuellt tillagd",
    born:document.getElementById('newPersonBorn').value.trim(),
    died:document.getElementById('newPersonDied').value.trim(),
    status:document.getElementById('newPersonStatus').value,
    place:document.getElementById('newPersonPlace').value.trim(),
    photo:document.getElementById('newPersonPhoto').value.trim(),
    facts:[["Tillagd","Manuellt i redigeringsläget"]],
    story:storyText ? storyText.split(/\n+/).map(s=>s.trim()).filter(Boolean) : ["Manuellt tillagd person. Fyll på med mer släkthistoria när källorna är klara."],
    images:textToImages(document.getElementById('newPersonImages').value),
    sources:textToStory(document.getElementById('newPersonSources').value),
    uncertainties:textToStory(document.getElementById('newPersonUncertainties').value),
    parents:parentIds,
    children:[],
    partner,
    direct
  };
  Object.keys(person).forEach(key=>{ if(person[key] === "" || (Array.isArray(person[key]) && !person[key].length)) delete person[key]; });
  manualData.people[id] = person;
  recordChange("person", id, name, {}, person, "Ny person");
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
  renderArchives();
  refreshSelectedPlace();
  focusPerson(id);
  openPerson(id);
  persistSharedEntity("person",id,personSnapshot(id),"create");
}
function parseCoordinate(value){
  if(!String(value || "").trim()) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : NaN;
}
function addManualPlace(form){
  if(!canEditArchive()){ openLoginPanel(); return; }
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
  const aliases = uniqueNames(aliasesFromEditorText(document.getElementById('newPlaceAliases').value),name);
  const place = {
    id,
    name,
    slug:slugifyUrl(name),
    area:document.getElementById('newPlaceArea').value.trim() || "Område saknas",
    note:document.getElementById('newPlaceNote').value.trim() || "Ingen längre platsbeskrivning är inlagd ännu.",
    aliases,
    images:textToImages(document.getElementById('newPlaceImages').value),
    sources:textToStory(document.getElementById('newPlaceSources').value),
    uncertainties:textToStory(document.getElementById('newPlaceUncertainties').value)
  };
  if(lat !== null && lng !== null){
    place.lat = lat;
    place.lng = lng;
  }
  manualData.places.push(place);
  recordChange("place", id, name, {}, place, "Ny plats");
  applyManualPlace(place);
  saveManualData();
  form.reset();
  renderManualList();
  renderPlaceList();
  renderArchives();
  selectPlace(place.id);
  editorMessage(`${name} är tillagd som plats.`);
  persistSharedEntity("place",id,place,"create");
  document.getElementById('platskarta').scrollIntoView({behavior:'smooth',block:'start'});
}
function savePlaceDetailEdit(){
  if(!canEditArchive()){ openLoginPanel(); return; }
  const id = placeIdFromCurrentRoute();
  const place = PLACES.find(p=>p.id===id);
  if(!place) return;
  const name = document.getElementById('placeEditName').value.trim();
  if(!name){
    document.getElementById('placeEditMessage').textContent = "Platsnamn behövs.";
    return;
  }
  const lat = parseCoordinate(document.getElementById('placeEditLat').value);
  const lng = parseCoordinate(document.getElementById('placeEditLng').value);
  if(Number.isNaN(lat) || Number.isNaN(lng)){
    document.getElementById('placeEditMessage').textContent = "Koordinaterna behöver vara siffror.";
    return;
  }
  if((lat === null) !== (lng === null)){
    document.getElementById('placeEditMessage').textContent = "Fyll i både latitud och longitud, eller lämna båda tomma.";
    return;
  }
  const aliases = aliasesAfterRename(place,name,aliasesFromEditorText(document.getElementById('placeEditAliases').value));
  const edit = {
    name,
    area:document.getElementById('placeEditArea').value.trim(),
    note:document.getElementById('placeEditNote').value.trim(),
    aliases,
    formerNames:formerNamesAfterRename(place,name),
    story:textToStory(document.getElementById('placeEditStory').value),
    timeline:textToTimeline(document.getElementById('placeEditTimeline').value),
    images:textToImages(document.getElementById('placeEditImages').value),
    sources:textToStory(document.getElementById('placeEditSources').value),
    uncertainties:textToStory(document.getElementById('placeEditUncertainties').value)
  };
  if(lat !== null && lng !== null){
    edit.lat = lat;
    edit.lng = lng;
  }else{
    edit.lat = null;
    edit.lng = null;
  }
  recordChange("place", id, name, place, edit);
  manualData.placeEdits[id] = edit;
  delete manualData.drafts.places[id];
  const manualPlace = manualData.places.find(p=>p.id===id);
  if(manualPlace) Object.assign(manualPlace, edit);
  applyManualPlaceEdit(id, edit);
  saveManualData();
  renderManualList();
  renderPlaceList();
  renderArchives();
  refreshSelectedPlace();
  renderPlaceDetail(id);
  persistSharedEntity("place",id,place,"update",text=>{
    const message = document.getElementById('placeEditMessage');
    if(message) message.textContent = text;
  });
}
function savePlaceDetailDraft(id){
  if(!canEditArchive()){ openLoginPanel(); return; }
  const place = PLACES.find(p=>p.id===id); if(!place) return;
  manualData.drafts.places[id] = {
    name:document.getElementById('placeEditName').value.trim(),
    area:document.getElementById('placeEditArea').value.trim(),
    lat:parseCoordinate(document.getElementById('placeEditLat').value),
    lng:parseCoordinate(document.getElementById('placeEditLng').value),
    aliases:aliasesAfterRename(place,document.getElementById('placeEditName').value.trim(),aliasesFromEditorText(document.getElementById('placeEditAliases').value)),
    formerNames:formerNamesAfterRename(place,document.getElementById('placeEditName').value.trim()),
    note:document.getElementById('placeEditNote').value.trim(),
    story:textToStory(document.getElementById('placeEditStory').value),
    timeline:textToTimeline(document.getElementById('placeEditTimeline').value),
    images:textToImages(document.getElementById('placeEditImages').value),
    sources:textToStory(document.getElementById('placeEditSources').value),
    uncertainties:textToStory(document.getElementById('placeEditUncertainties').value)
  };
  saveManualData();
  renderManualList();
  const message = document.getElementById('placeEditMessage');
  if(message) message.textContent = "Utkastet är sparat på den här enheten.";
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
      Object.assign(manualData.placeEdits, parsed.placeEdits || {});
      manualData.units.push(...(parsed.units || []).filter(unit=>!manualData.units.some(existing=>existing.id===unit.id)));
      manualData.places.push(...(parsed.places || []).filter(place=>!manualData.places.some(existing=>existing.id===place.id)));
      Object.entries(parsed.people || {}).forEach(([id,person])=>applyManualPerson(id,person));
      (parsed.units || []).forEach(applyManualUnit);
      (parsed.places || []).forEach(applyManualPlace);
      Object.entries(parsed.placeEdits || {}).forEach(([id,edit])=>applyManualPlaceEdit(id,edit));
      Object.entries(parsed.edits || {}).forEach(([id,edit])=>applyManualPersonEdit(id,edit));
      saveManualData();
      refreshEditorSelects();
      renderManualList();
      renderTree({preserveView:true});
      renderPlaceList();
      renderArchives();
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
  toggle.addEventListener('click',()=>{ location.href = '/admin/'; });
  document.getElementById('personEditorForm').addEventListener('submit', e=>{
    e.preventDefault();
    addManualPerson(e.currentTarget);
  });
  document.getElementById('placeEditorForm').addEventListener('submit', e=>{
    e.preventDefault();
    addManualPlace(e.currentTarget);
  });
  document.getElementById('panelEditForm').addEventListener('submit', e=>{
    e.preventDefault();
    savePanelPersonEdit();
  });
  document.getElementById('panelDraftSave').addEventListener('click', savePanelPersonDraft);
  document.getElementById('panelEditCancel').addEventListener('click', ()=>{
    document.getElementById('panelEditForm').classList.remove('open');
  });
  document.getElementById('panelPageOpen').addEventListener('click', e=>{
    const route = e.currentTarget.dataset.route;
    closePanel();
    navigatePath(route);
  });
  document.addEventListener('click', e=>{
    const togglePlaceEdit = e.target.closest('[data-toggle-place-edit]');
    if(togglePlaceEdit){
      if(!canEditArchive()){ openLoginPanel(); return; }
      document.getElementById('placeDetailEditForm')?.classList.toggle('open');
    }
    const placeDraft = e.target.closest('[data-save-place-draft]');
    if(placeDraft) savePlaceDetailDraft(placeDraft.dataset.savePlaceDraft);
  });
  document.addEventListener('submit', e=>{
    if(e.target?.id === "placeDetailEditForm"){
      e.preventDefault();
      savePlaceDetailEdit();
    }
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
  document.getElementById('manualList').addEventListener('click', e=>{
    const button = e.target.closest('[data-restore-change]');
    if(button) restoreChange(Number(button.dataset.restoreChange));
  });
  refreshEditorSelects();
  renderManualList();
}

function renderFamilyAccount(status={}){
  const state = document.getElementById('familyAccountState');
  const form = document.getElementById('familyLoginForm');
  const signOut = document.getElementById('familySignOut');
  if(!state || !form || !signOut) return;
  const locked = !!status.configured && !status.user;
  document.body.classList.toggle('family-auth-required',locked);
  document.body.classList.toggle('family-authenticated',!!status.user);
  const editorToggle = document.getElementById('editorToggle');
  if(editorToggle) editorToggle.innerHTML = '<span class="ico">✎</span> Familjearkiv';
  if(locked){
    document.getElementById('panelEditForm')?.classList.remove('open');
    document.getElementById('placeDetailEditForm')?.classList.remove('open');
  }
  if(!status.configured){
    state.textContent = "Lokalt läge. Databasen är ännu inte ansluten.";
    form.hidden = true;
    signOut.hidden = true;
  }else if(status.user){
    const role = status.profile?.role === "admin" ? "administratör" : status.profile?.role === "editor" ? "redaktör" : "familjemedlem";
    state.textContent = `${status.profile?.display_name || status.user.email} · ${role}`;
    form.hidden = true;
    signOut.hidden = false;
  }else{
    state.textContent = "Logga in med e-postlänk för att dela ändringar.";
    form.hidden = false;
    signOut.hidden = true;
  }
}
function canEditArchive(){
  return false;
}
function openLoginPanel(){
  location.href = '/admin/';
}
function initFamilyAccount(){
  renderFamilyAccount(window.FamilyData?.status?.() || {});
  document.getElementById('familyLoginForm')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const email = document.getElementById('familyEmail').value.trim();
    const message = document.getElementById('familyAccountMessage');
    if(!email) return;
    try{
      await window.FamilyData.sendMagicLink(email);
      message.textContent = "Inloggningslänken är skickad. Kontrollera din e-post.";
    }catch(error){ message.textContent = error.message || "Inloggningen misslyckades."; }
  });
  document.getElementById('familySignOut')?.addEventListener('click',()=>window.FamilyData?.signOut());
  document.addEventListener('family-auth-change',event=>{
    renderFamilyAccount(event.detail);
    renderCurrentRoute();
    if(currentPanelPersonId) openPerson(currentPanelPersonId);
  });
  document.addEventListener('family-data-status',event=>{
    const badge = document.getElementById('familyDataBadge');
    if(!badge) return;
    badge.textContent = event.detail.message;
    badge.dataset.mode = event.detail.mode;
  });
  document.addEventListener('family-data-ready',event=>applySharedSnapshot(event.detail));
}

loadManualData();
initAccessibilityControls();
initMobileNavigation();
renderTree();
initTreeControls();
initEditor();
initFamilyAccount();
initBranchFilters();
initPersonSearch();
initPlaceMap();
initSiteNavigation();
initArchiveFilters();
renderArchives();
renderCurrentRoute();
document.getElementById('mapJump').onclick = ()=>document.getElementById('platskarta').scrollIntoView({behavior:'smooth',block:'start'});
