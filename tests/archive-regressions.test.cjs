const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin/admin.js'), 'utf8');
const shared = fs.readFileSync(path.join(root, 'shared-data.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

// Exercise the existing browser functions with isolated data and no live writes.
function sourceFunction(source, name, indent = '') {
  const match = new RegExp('^' + indent + '(?:async )?function ' + name + '\\(', 'm').exec(source);
  assert.ok(match, name);
  const tail = source.slice(match.index + match[0].length);
  const next = new RegExp('^' + indent + '(?:async )?function ', 'm').exec(tail);
  assert.ok(next, 'function following ' + name);
  return source.slice(match.index, match.index + match[0].length + next.index);
}
function loadFunctions(ctx, source, names, indent = '') {
  names.forEach(name => vm.runInContext(sourceFunction(source, name, indent), ctx));
}
function snapshot(people = {}, units = [], places = []) {
  return {people, units, places, deleted:{people:[], places:[]}};
}
function appContext(base = snapshot()) {
  const ctx = vm.createContext({
    PEOPLE:copy(base.people), PLACES:copy(base.places), UNITS:copy(base.units),
    archiveBase:copy(base), knownSharedIds:{people:new Set(),places:new Set()},
    UNIT_BY_ID:{}, PERSON_TO_UNIT:{}, PARTNER:{}, EDGES:[],
    MOTHER_UNITS:new Set(), MOTHER_MOTHER_UNITS:new Set(), MOTHER_FATHER_UNITS:new Set(),
    FATHER_UNITS:new Set(), FATHER_MOTHER_UNITS:new Set(), FATHER_FATHER_UNITS:new Set(),
    DIRECT_UNITS:new Set(), DIRECT_HEIRS:new Set(), DIRECT_EDGES:new Set(),
    archiveBaseSets:Array.from({length:8},()=>[]),
    manualData:{people:{},units:[],places:[],edits:{},placeEdits:{},drafts:{people:{},places:{}}},
    placeMarkers:{}, placeMap:null, currentPlaceId:null, currentPanelPersonId:null,
    window:{}, document:{getElementById:()=>null}, initializedFeatures:{},
    normalizePersonNames:()=>{}, normalizePlaceNames:()=>{}, invalidateEntityReferenceCache:()=>{},
    unitBranch:unit=>unit.branch || 'shared', motherLane:unit=>unit.lane, fatherLane:unit=>unit.lane,
    activePageMode:()=> 'test', syncPlaceMarker:()=>{}, ensurePlaceMarker:()=>{},
    refreshArchiveFilterOptions:()=>{}, refreshEditorSelects:()=>{}, renderArchives:()=>{},
    renderPlaceList:()=>{}, refreshSelectedPlace:()=>{}, closePanel:()=>{}, closeLightbox:()=>{},
    slugifyUrl:value=>value
  });
  loadFunctions(ctx, app, ['uniqueIds','cloneRecord','registerUnitBranch','rebuildUnitIndexes',
    'applyManualPerson','applyManualUnit','applyManualPlace','applyManualPlaceEdit',
    'addPersonRelationLinks','removePersonRelationLinks','applySharedDeletions',
    'resetSharedView','ensureRelationUnits','clearUnavailableViews','applySharedSnapshot']);
  ctx.rebuildUnitIndexes();
  return ctx;
}
function adminContext(people = {}, units = []) {
  const ctx = vm.createContext({state:{people,units}, DIRECT_HEIRS:new Set()});
  loadFunctions(ctx, admin, ['uniqueIds','unitForPerson','parentUnitsFor','unitBranch','unitLane','personBranch','personTreePlacement'], '  ');
  return ctx;
}
function memoryClient(tables, gate) {
  const db = copy({people:[],places:[],family_units:[],archive_tombstones:[],profiles:[],...tables});
  const client = {from(table) {
    let operation = 'select', payload, single = false;
    const filters = [];
    const query = {
      select(){return query;}, eq(key,value){filters.push(row=>row[key]===value);return query;},
      in(key,values){filters.push(row=>values.includes(row[key]));return query;},
      maybeSingle(){single=true;return query;},
      upsert(row){operation='upsert';payload=copy(row);return query;},
      update(row){operation='update';payload=copy(row);return query;},
      then(resolve,reject){return (async()=>{
        if(gate) await gate;
        const rows=db[table];
        if(operation==='upsert') {
          const current=rows.find(row=>row.id===payload.id);
          if(current)Object.assign(current,payload);else rows.push(payload);
        }else if(operation==='update') rows.filter(row=>filters.every(filter=>filter(row))).forEach(row=>Object.assign(row,payload));
        const result=rows.filter(row=>filters.every(filter=>filter(row)));
        return {data:copy(single?(result[0]||null):result),error:null};
      })().then(resolve,reject);}
    };
    return query;
  }};
  return {db,client};
}
function sharedContext(tables = {}, gate) {
  const events=[],timers=[];
  const ctx=vm.createContext({
    window:{},document:{readyState:'loading',addEventListener(){},dispatchEvent:event=>events.push(event)},
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    setTimeout:callback=>{timers.push(callback);},Date
  });
  vm.runInContext(shared.replace('  window.FamilyData =', '  window.testAccess = {state,handleAuthChange};\n  window.FamilyData ='),ctx);
  const storage=memoryClient(tables,gate);
  Object.assign(ctx.window.testAccess.state,{client:storage.client,user:{id:'editor',email:'test@example.test'},profile:{role:'editor'}});
  return {...storage,api:ctx.window.FamilyData,...ctx.window.testAccess,events,timers};
}

test('restricted records disappear, local copies cannot restore them, and login restores them',()=>{
  const ctx=appContext();
  ctx.manualData.people.secret={name:'Old local private copy'};
  ctx.applySharedSnapshot(snapshot({secret:{name:'Family person',visibility:'family'}}));
  ctx.applySharedSnapshot(snapshot());
  assert.equal(ctx.PEOPLE.secret,undefined);
  ctx.applySharedSnapshot(snapshot());
  assert.equal(ctx.PEOPLE.secret,undefined);
  ctx.applySharedSnapshot(snapshot({secret:{name:'Family person',visibility:'family'}}));
  assert.equal(ctx.PEOPLE.secret.name,'Family person');
});

test('omitted shared records cannot reappear from bundled data',()=>{
  const ctx=appContext(snapshot({secret:{name:'Bundled name'}}));
  ctx.applySharedSnapshot(snapshot({secret:{name:'Private name',visibility:'private'}}));
  ctx.applySharedSnapshot(snapshot());
  assert.equal(ctx.PEOPLE.secret,undefined);
});

test('cleared coordinates override bundled and previously loaded positions',async()=>{
  const storage=sharedContext({places:[{id:'farm',name:'Farm',latitude:null,longitude:null,content:{}}]});
  const current=await storage.api.loadSnapshot();
  assert.equal(current.places[0].lat,null);
  const ctx=appContext(snapshot({},[],[{id:'farm',name:'Farm',lat:57,lng:12}]));
  ctx.applySharedSnapshot(current);
  assert.equal(ctx.PLACES[0].lat,null);
  assert.equal(ctx.PLACES[0].lng,null);
});

test('coordinate removal removes the actual map marker',()=>{
  const removed=[];
  const ctx=appContext();
  ctx.window.L={}; ctx.placeMap={removeLayer:marker=>removed.push(marker)};
  ctx.placeMarkers.farm={id:'marker'};
  loadFunctions(ctx,app,['hasCoords','syncPlaceMarker']);
  ctx.syncPlaceMarker({id:'farm',lat:null,lng:null});
  assert.equal(removed.length,1);
  assert.equal(ctx.placeMarkers.farm,undefined);
});

test('a sibling does not inherit the direct-ancestor marker',()=>{
  const unit={id:'ancestor_unit',persons:['ancestor'],gen:4,heir:true};
  const ctx=adminContext({ancestor:{direct:true}},[unit]);
  const result=ctx.personTreePlacement('sibling',{parentIds:[],childIds:[],siblingIds:['ancestor'],siblingUnit:unit,branch:'mother'},false);
  assert.equal(result.direct,false);
});

test('a couple keeps its direct marker when the other spouse is direct',()=>{
  const unit={id:'couple',persons:['person','spouse'],gen:4};
  const ctx=adminContext({person:{},spouse:{direct:true}},[unit]);
  const result=ctx.personTreePlacement('person',{parentIds:[],childIds:[],siblingIds:[],branch:'mother'},false);
  assert.equal(result.direct,true);
});

test('gallery image metadata keeps captions and categories intact',()=>{
  const ctx=vm.createContext({});
  vm.runInContext("const imageCategories={person:'Personporträtt',document:'Dokument',object:'Föremål',place:'Gård eller plats'};",ctx);
  ctx.rows=value=>String(value||'').split(/\n+/).map(row=>row.trim()).filter(Boolean);
  loadFunctions(ctx,admin,['imageCategory','inferImageCategory','imageText','images'],'  ');
  const original=[{src:'https://example.test/kyrkbok.jpg',caption:'Kyrkbok | sida 14',category:'document'}];
  const serialized=ctx.imageText(original);
  assert.equal(serialized,'https://example.test/kyrkbok.jpg | Kyrkbok | sida 14 | document');
  assert.deepEqual(copy(ctx.images(serialized)),original);
});

test('gallery archive rows point back to their person and place',()=>{
  const ctx=vm.createContext({
    PEOPLE:{person_1:{name:'Anna Andersson',photo:'/anna.jpg',images:[{src:'/brev.jpg',caption:'Ett brev',category:'document'}]}},
    PLACES:[{id:'farm_1',name:'Valagården',images:[{src:'/garden.jpg',caption:'Gården'}]}],
    PERSON_PLACEHOLDER:'/assets/person-placeholder.svg',
    routePersonUrl:id=>`/personer/${id}/`,routePlaceUrl:id=>`/gardar/${id}/`
  });
  ctx.visiblePlaces=()=>ctx.PLACES;
  vm.runInContext("const IMAGE_CATEGORY_LABELS={person:'Personporträtt',document:'Dokument',object:'Föremål',place:'Gård eller plats'};",ctx);
  loadFunctions(ctx,app,['normalizeImageCategory','inferImageCategory','parseImageValue','normalizedImages','galleryArchiveRows']);
  const rows=copy(ctx.galleryArchiveRows());
  assert.equal(rows.length,3);
  assert.ok(rows.some(row=>row.ownerName==='Anna Andersson'&&row.category==='person'&&row.ownerUrl==='/personer/person_1/'));
  assert.ok(rows.some(row=>row.caption==='Ett brev'&&row.category==='document'));
  assert.ok(rows.some(row=>row.ownerName==='Valagården'&&row.category==='place'&&row.ownerUrl==='/gardar/farm_1/'));
});

test('legacy document captions are classified without rewriting their source data',()=>{
  const ctx=vm.createContext({});
  vm.runInContext("const IMAGE_CATEGORY_LABELS={person:'Personporträtt',document:'Dokument',object:'Föremål',place:'Gård eller plats'};",ctx);
  loadFunctions(ctx,app,['normalizeImageCategory','inferImageCategory','parseImageValue']);
  assert.equal(ctx.parseImageValue({src:'/school.jpg',caption:'Anna Brittas skolbetyg'},'person').category,'document');
  assert.equal(ctx.parseImageValue({src:'/portrait.jpg',caption:'Porträtt av Anna'},'person').category,'person');
});

test('all new ancestor generations appear regardless of input order',()=>{
  for(const order of [['grandparent','parent','child'],['child','parent','grandparent']]){
    const people={grandparent:{},parent:{parents:['grandparent']},child:{parents:['parent']}};
    const ctx=appContext();
    ctx.applySharedSnapshot(snapshot(Object.fromEntries(order.map(id=>[id,people[id]])),[
      {id:'child_unit',persons:['child'],children:[],gen:0,heir:true,branch:'mother'}
    ]));
    assert.ok(ctx.PERSON_TO_UNIT.parent);
    assert.ok(ctx.PERSON_TO_UNIT.grandparent);
    assert.equal(ctx.UNIT_BY_ID[ctx.PERSON_TO_UNIT.grandparent].gen,-2);
    assert.equal(ctx.UNIT_BY_ID[ctx.PERSON_TO_UNIT.grandparent].heir,true);
  }
});

test('repeated snapshots do not duplicate derived ancestors or change their source',()=>{
  const current=snapshot({parent:{parents:['grandparent']},grandparent:{},child:{parents:['parent']}},[
    {id:'child_unit',persons:['child'],children:[],gen:4,heir:true}
  ]);
  const before=copy(current),ctx=appContext();
  ctx.applySharedSnapshot(current);
  ctx.applySharedSnapshot(current);
  assert.equal(ctx.UNITS.length,3);
  assert.deepEqual(current,before);
});

test('the next snapshot removes previously derived ancestors and edges',()=>{
  const ctx=appContext();
  const unit={id:'child_unit',persons:['child'],children:[],gen:4,heir:true};
  ctx.applySharedSnapshot(snapshot({child:{parents:['parent']},parent:{}},[unit]));
  ctx.applySharedSnapshot(snapshot({child:{parents:[]},parent:{children:[]}},[unit]));
  assert.equal(ctx.UNITS.length,1);
  assert.equal(ctx.EDGES.length,0);
});

test('parent removal is submitted as a tree update',async()=>{
  const current={name:'Child',slug:'child',parents:['parent'],direct:false};
  const ctx=adminContext({child:current,parent:{}},[
    {id:'child_unit',persons:['child'],children:[],gen:4},
    {id:'parent_unit',persons:['parent'],children:['child_unit'],gen:3}
  ]);
  const fields={fName:'Child',fBranch:'mother',fVisibility:'public',fDirect:'no'};
  let payload;
  Object.assign(ctx,{
    document:{getElementById:id=>({value:fields[id]||''})},
    editedAliases:()=>[],formerNames:()=>[],profileCropValue:()=>({}),clearEditorDraft:()=>{},toast:()=>{},
    refreshData:async()=>{},navigate:()=>{},
    window:{FamilyData:{submitChange:async(type,id,value)=>{payload=value;return {mode:'published'};}}}
  });
  loadFunctions(ctx,admin,['clone','rows','pairs','images','personRelations','val','savePerson','publishedMessage'],'  ');
  await ctx.savePerson({preventDefault(){},submitter:{},currentTarget:{}},'child',current);
  assert.deepEqual(copy(payload.parents),[]);
  assert.deepEqual(copy(payload.treePlacement.parentUnitIdsToDisconnect),['parent_unit']);
});

test('parent removal cleans the inverse record and line without erasing other children',async()=>{
  const storage=sharedContext({
    people:[{id:'child',content:{parents:['parent']}},{id:'parent',content:{children:['child','other']}}],
    family_units:[
      {id:'child_unit',person_ids:['child'],child_unit_ids:[],generation:4,content:{}},
      {id:'parent_unit',person_ids:['parent'],child_unit_ids:['child_unit','other_unit'],content:{}}
    ]
  });
  await storage.api.submitChange('person','child',{name:'Child',parents:[],treePlacement:{
    unitId:'child_unit',parentIds:[],parentUnitIds:[],parentUnitIdsToDisconnect:['parent_unit']
  }});
  assert.deepEqual(storage.db.people.find(row=>row.id==='parent').content.children,['other']);
  assert.deepEqual(storage.db.family_units.find(row=>row.id==='parent_unit').child_unit_ids,['other_unit']);
});

test('shared parent line remains when it still belongs to the other spouse',async()=>{
  const storage=sharedContext({
    people:[{id:'child',content:{parents:['parent']}},{id:'spouse',content:{parents:['parent']}},{id:'parent',content:{children:['child','spouse']}}],
    family_units:[
      {id:'couple',person_ids:['child','spouse'],child_unit_ids:[],content:{}},
      {id:'parent_unit',person_ids:['parent'],child_unit_ids:['couple'],content:{}}
    ]
  });
  await storage.api.submitChange('person','child',{name:'Child',parents:[],treePlacement:{
    unitId:'couple',parentIds:[],parentUnitIds:[],parentUnitIdsToDisconnect:['parent_unit']
  }});
  assert.deepEqual(storage.db.family_units.find(row=>row.id==='parent_unit').child_unit_ids,['couple']);
});

test('auth callback is synchronous and schedules database work outside the auth lock',async()=>{
  const storage=sharedContext();
  let queried=false;
  storage.state.client={from(){queried=true;throw Error('Only deferred work may query');}};
  const result=storage.handleAuthChange('SIGNED_OUT',null);
  assert.equal(result,undefined);
  assert.equal(queried,false);
  assert.equal(storage.timers.length,1);
});

test('logout publishes a public-only view even when the next network request fails',async()=>{
  const storage=sharedContext();
  storage.state.lastSnapshot=snapshot({secret:{visibility:'family'},public:{visibility:'public'}},[],[{id:'secret_place',visibility:'private'}]);
  storage.state.client={from(){throw Error('offline');}};
  storage.handleAuthChange('SIGNED_OUT',null);
  await storage.timers.shift()();
  const event=storage.events.find(event=>event.type==='family-data-ready');
  assert.ok(event);
  assert.deepEqual(Object.keys(event.detail.people),['public']);
  assert.equal(event.detail.places.length,0);
});

test('a response started before logout cannot repopulate the page',async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const storage=sharedContext({people:[{id:'secret',name:'Private',visibility:'family',content:{}}]},gate);
  const pending=storage.api.refreshSnapshot();
  storage.handleAuthChange('SIGNED_OUT',null);
  release();
  assert.equal(await pending,null);
  assert.equal(storage.events.filter(event=>event.type==='family-data-ready').length,0);
  assert.equal(storage.state.lastSnapshot,null);
});
