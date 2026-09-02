(function(){
  const ui = {
    login:document.getElementById('loginScreen'),app:document.getElementById('adminApp'),content:document.getElementById('adminContent'),
    loading:document.getElementById('loadingState'),pageTitle:document.getElementById('pageTitle'),pageEyebrow:document.getElementById('pageEyebrow')
  };
  const fallbackPeople = typeof PEOPLE === 'undefined' ? {} : JSON.parse(JSON.stringify(PEOPLE));
  const fallbackPlaces = typeof PLACES === 'undefined' ? [] : JSON.parse(JSON.stringify(PLACES));
  const state = {people:fallbackPeople,places:fallbackPlaces,overview:{changes:[],revisions:[],profiles:[]},status:null,ready:false};
  const labels = {contributor:'Bidragsgivare',editor:'Redaktör',admin:'Administratör',mother:'Bengtsson-ledet',father:'Nilsson-ledet',shared:'Gemensamt'};
  const routeTitles = {dashboard:'Översikt',people:'Personer',places:'Gårdar och platser',changes:'Ändringar',members:'Användare'};

  function esc(value){ return String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function clone(value){ return JSON.parse(JSON.stringify(value || {})); }
  function icon(name){ return `<i data-lucide="${name}"></i>`; }
  function icons(){ window.lucide?.createIcons({attrs:{'stroke-width':1.8}}); }
  function toast(message,error=false){ const el=document.getElementById('toast'); el.textContent=message; el.className=`toast show${error?' error':''}`; clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.className='toast',4200); }
  function role(){ return state.status?.profile?.role || 'contributor'; }
  function canReview(){ return ['editor','admin'].includes(role()); }
  function canManageUsers(){ return role()==='admin'; }
  function isFile(){ return location.protocol==='file:'; }
  function adminUrl(path=''){ const clean=String(path).replace(/^\/+|\/+$/g,''); return isFile() ? `#/${clean}${clean?'/':''}` : `/admin/${clean}${clean?'/':''}`; }
  function publicUrl(type,item){ return `/${type==='person'?'personer':'gardar'}/${item.slug || slug(item.name)}/`; }
  function slug(value){ return String(value||'post').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'post'; }
  function entityId(type){ return `${type}_${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`; }
  function uniqueSlug(type,name){
    const base=slug(name); const taken=new Set((type==='person'?Object.values(state.people):state.places).map(item=>item.slug).filter(Boolean));
    if(!taken.has(base)) return base;
    let index=2; while(taken.has(`${base}-${index}`)) index+=1;
    return `${base}-${index}`;
  }
  function rows(value){ return String(value||'').split(/\n+/).map(row=>row.trim()).filter(Boolean); }
  function pairs(value){ return rows(value).map(row=>{const at=row.indexOf(':');return at<0?['Notering',row]:[row.slice(0,at).trim()||'Notering',row.slice(at+1).trim()];}); }
  function pairText(value){ return (value||[]).map(row=>Array.isArray(row)?`${row[0]}: ${row[1]}`:String(row)).join('\n'); }
  function imageText(value){ return (value||[]).map(row=>typeof row==='string'?row:`${row.src||row.url||''}${row.caption?` | ${row.caption}`:''}`).filter(Boolean).join('\n'); }
  function images(value){ return rows(value).map(row=>{const [src,...caption]=row.split('|');return {src:src.trim(),caption:caption.join('|').trim()};}).filter(row=>row.src); }
  function galleryPreview(items,type='place'){
    if(!items.length) return `<div class="gallery-empty">${icon('images')}<span>Inga bilder i galleriet ännu.</span></div>`;
    return items.map((item,index)=>`<article class="gallery-admin-item" data-gallery-index="${index}"><img src="${esc(item.src||item.url)}" alt="" loading="lazy" onerror="this.closest('article').classList.add('image-error')"><div><label><span>Bildtext</span><input type="text" value="${esc(item.caption||'')}" data-gallery-caption="${index}" placeholder="Vilka, var och när?"></label><div class="gallery-item-actions">${type==='person'?`<button class="gallery-profile" type="button" data-gallery-profile="${index}">${icon('user-round')} Använd som profilbild</button>`:''}<button class="gallery-remove" type="button" data-gallery-remove="${index}">${icon('trash-2')} Ta bort från galleriet</button></div></div></article>`).join('');
  }
  function galleryEditor(type,id,record,isNew){
    const items=images(imageText(record.images));
    const uploadAllowed=!isNew&&canReview();
    const uploadCopy=isNew?'Spara posten först. Därefter kan du ladda upp bilder.':uploadAllowed?'JPG, PNG eller WebP, högst 15 MB. Bilden blir offentlig när posten sparas.':'Du kan lägga till bildlänkar. En redaktör hanterar filuppladdning och publicering.';
    return `<div class="gallery-manager" data-gallery-manager data-entity-type="${type}" data-entity-id="${esc(id)}"><div class="gallery-admin-grid" data-gallery-preview>${galleryPreview(items,type)}</div><div class="gallery-upload-card"><div><strong>Ladda upp ny bild</strong><p>${esc(uploadCopy)}</p></div><div class="gallery-upload-fields"><label class="field"><span>Bildfil</span><input type="file" accept="image/jpeg,image/png,image/webp" data-gallery-file${uploadAllowed?'':' disabled'}></label><label class="field"><span>Bildtext</span><input type="text" data-gallery-upload-caption placeholder="Personer, plats och ungefärligt år"${uploadAllowed?'':' disabled'}></label><button class="secondary-button" type="button" data-gallery-upload${uploadAllowed?'':' disabled'}>${icon('upload')} Ladda upp</button></div></div><details class="gallery-link-entry"><summary>Lägg till eller kontrollera bildadress</summary><label class="field"><span>En bild per rad</span><textarea id="fImages" data-gallery-source placeholder="https://…/bild.jpg | Bildtext">${esc(imageText(record.images))}</textarea><small class="field-help">Format: bildadress | bildtext. Befintliga länkar fortsätter fungera.</small></label></details></div>`;
  }
  function refreshGalleryManager(manager){
    const source=manager.querySelector('[data-gallery-source]');
    const preview=manager.querySelector('[data-gallery-preview]');
    if(source&&preview){preview.innerHTML=galleryPreview(images(source.value),manager.dataset.entityType);icons();}
  }
  function updateGalleryCaption(input){
    const manager=input.closest('[data-gallery-manager]');
    const source=manager?.querySelector('[data-gallery-source]');
    if(!source)return;
    const items=images(source.value),index=Number(input.dataset.galleryCaption);
    if(!items[index])return;
    items[index].caption=input.value.trim();source.value=imageText(items);
  }
  async function uploadGalleryImage(button){
    const manager=button.closest('[data-gallery-manager]');
    const fileInput=manager?.querySelector('[data-gallery-file]');
    const captionInput=manager?.querySelector('[data-gallery-upload-caption]');
    const source=manager?.querySelector('[data-gallery-source]');
    const file=fileInput?.files?.[0];
    if(!file){toast('Välj en bildfil först.',true);return;}
    button.disabled=true;button.innerHTML=`<span class="spinner small"></span> Laddar upp`;
    try{
      const item=await window.FamilyData.uploadPublicImage(file,manager.dataset.entityType,manager.dataset.entityId,captionInput.value.trim());
      const items=images(source.value);items.push(item);source.value=imageText(items);refreshGalleryManager(manager);
      fileInput.value='';captionInput.value='';toast('Bilden är uppladdad. Spara posten för att lägga den i galleriet.');
    }catch(error){toast(error.message||'Bilden kunde inte laddas upp.',true);}
    finally{button.disabled=false;button.innerHTML=`${icon('upload')} Ladda upp`;icons();}
  }

  function route(){
    const raw=isFile()?decodeURIComponent(location.hash.slice(1)):location.pathname.replace(/^\/admin\/?/,'');
    const parts=raw.replace(/^\/+|\/+$/g,'').split('/').filter(Boolean);
    if(parts[0]==='personer') return {name:'people',id:parts[1]||null};
    if(parts[0]==='gardar') return {name:'places',id:parts[1]||null};
    if(parts[0]==='andringar') return {name:'changes'};
    if(parts[0]==='anvandare') return {name:'members'};
    return {name:'dashboard'};
  }
  function navigate(name,id){
    const base={dashboard:'',people:'personer',places:'gardar',changes:'andringar',members:'anvandare'}[name]||'';
    const url=adminUrl([base,id].filter(Boolean).join('/'));
    if(isFile()) location.hash=url.slice(1); else history.pushState({},'',url);
    renderRoute();
  }

  async function refreshData(showToast=false){
    if(!state.status?.user) return;
    ui.loading.hidden=false;
    try{
      const [snapshot,overview]=await Promise.all([window.FamilyData.loadSnapshot(),window.FamilyData.loadAdminOverview()]);
      state.people={...fallbackPeople,...(snapshot?.people||{})};
      const places=new Map(fallbackPlaces.map(item=>[item.id,item]));
      (snapshot?.places||[]).forEach(item=>places.set(item.id,{...(places.get(item.id)||{}),...item}));
      state.places=[...places.values()]; state.overview=overview; state.ready=true;
      renderRoute(); if(showToast) toast('Familjearkivet är uppdaterat.');
    }catch(error){ toast(error.message||'Familjearkivet kunde inte hämtas.',true); }
    finally{ ui.loading.hidden=true; }
  }

  function showAuth(status){
    state.status=status;
    const signedIn=!!status?.user;
    ui.login.hidden=signedIn; ui.app.hidden=!signedIn;
    if(!signedIn) return;
    const name=status.profile?.display_name||status.user.email||'Familjemedlem';
    document.getElementById('accountName').textContent=name;
    document.getElementById('accountRole').textContent=labels[role()]||'Familjemedlem';
    document.getElementById('accountAvatar').textContent=name.trim().charAt(0).toLocaleUpperCase('sv')||'F';
    document.querySelectorAll('[data-admin-only]').forEach(el=>el.hidden=!canManageUsers());
    refreshData();
  }

  function heading(title,copy,actions=''){ return `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(copy)}</p></div>${actions?`<div class="page-actions">${actions}</div>`:''}</div>`; }
  function stat(label,value,note){ return `<div class="stat-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`; }
  function activity(change,review=false){
    const entity=change.proposed_data?.name||change.entity_id||'Ny post';
    const statusClass=change.status==='approved'?'green':change.status==='rejected'?'red':'amber';
    const actions=review&&change.status==='pending'&&['person','place'].includes(change.entity_type)?`<div class="review-actions"><button class="primary-button" data-review="approved" data-change-id="${esc(change.id)}">Godkänn</button><button class="danger-button" data-review="rejected" data-change-id="${esc(change.id)}">Avslå</button></div>`:'';
    return `<div class="activity-row"><span class="activity-icon">${icon(change.entity_type==='place'?'landmark':'user-round')}</span><div><strong>${esc(entity)}</strong><p>${change.operation==='create'?'Ny':change.operation==='delete'?'Radering':'Ändring'} · ${change.entity_type==='place'?'plats':'person'} <span class="badge ${statusClass}">${esc(change.status||'pending')}</span></p>${actions}</div><time>${new Date(change.created_at).toLocaleDateString('sv-SE')}</time></div>`;
  }

  function renderDashboard(){
    const pending=state.overview.changes.filter(item=>item.status==='pending');
    const actions=`<button class="primary-button" data-create="person">${icon('user-plus')} Ny person</button><button class="secondary-button" data-create="place">${icon('map-pin-plus')} Ny plats</button>`;
    ui.content.innerHTML=heading('Översikt','En samlad arbetsyta för familjens personer, gårdar och pågående ändringar.',actions)+
      `<div class="stats-grid">${stat('Personer',Object.keys(state.people).length,'i familjearkivet')}${stat('Gårdar och platser',state.places.length,'registrerade platser')}${stat('Väntar på granskning',pending.length,canReview()?'för redaktionellt beslut':'av dina ändringar')}${stat('Din roll',labels[role()]||role(),'styr vad du kan publicera')}</div>
      <div class="dashboard-grid"><section class="panel-card"><div class="panel-head"><h2>Senaste ändringar</h2><button class="row-action" data-go="changes">Visa alla</button></div><div class="panel-body activity-list">${state.overview.changes.slice(0,7).map(row=>activity(row,canReview())).join('')||'<div class="empty-state">Inga ändringar finns ännu.</div>'}</div></section>
      <section class="panel-card"><div class="panel-head"><h2>Arbeta vidare</h2></div><div class="panel-body"><div class="activity-list"><button class="secondary-button" data-go="people">${icon('search')} Sök och redigera person</button><button class="secondary-button" data-go="places">${icon('landmark')} Hantera gårdar</button><a class="secondary-button" href="/" style="text-decoration:none">${icon('external-link')} Granska publika sidan</a></div></div></section></div>`;
  }

  function renderPeople(){
    const people=Object.entries(state.people).sort((a,b)=>a[1].name.localeCompare(b[1].name,'sv'));
    ui.content.innerHTML=heading('Personer','Sök, granska och uppdatera personuppgifter från ett och samma register.',`<button class="primary-button" data-create="person">${icon('user-plus')} Ny person</button>`)+
      `<div class="toolbar"><div class="search-box">${icon('search')}<input id="adminSearch" type="search" placeholder="Sök namn, årtal eller plats"></div><select class="filter-select" id="branchFilter"><option value="">Alla släktled</option><option value="mother">Bengtsson-ledet</option><option value="father">Nilsson-ledet</option><option value="shared">Gemensamt</option></select></div>
      <div class="table-shell"><table class="data-table"><thead><tr><th>Person</th><th>Levnadsår</th><th>Plats</th><th>Släktled</th><th>Status</th><th></th></tr></thead><tbody id="peopleRows">${people.map(personRow).join('')}</tbody></table></div>`;
    const filter=()=>{const q=document.getElementById('adminSearch').value.toLocaleLowerCase('sv');const branch=document.getElementById('branchFilter').value;document.querySelectorAll('#peopleRows tr').forEach(row=>row.hidden=!(row.dataset.search.includes(q)&&(!branch||row.dataset.branch===branch)));};
    document.getElementById('adminSearch').addEventListener('input',filter); document.getElementById('branchFilter').addEventListener('change',filter);
  }
  function personRow([id,p]){ const hay=[p.name,p.alt,p.born,p.died,p.place,p.role].join(' ').toLocaleLowerCase('sv');const hasPhoto=p.photo&&!/person-placeholder\.svg$/i.test(p.photo),imageCount=(p.images||[]).length+(hasPhoto?1:0);return `<tr data-search="${esc(hay)}" data-branch="${esc(p.branch||'shared')}"><td><div class="entity-cell"><img class="entity-avatar" src="${esc(p.photo||'/assets/person-placeholder.svg')}" alt=""><span><strong>${esc(p.name)}</strong><small>${esc(p.role||'Person')}${imageCount?` · ${imageCount} ${imageCount===1?'bild':'bilder'}`:''}</small></span></div></td><td>${esc([p.born,p.died].filter(Boolean).join(' – ')||'Saknas')}</td><td>${esc(p.place||'Ej angivet')}</td><td><span class="badge">${esc(labels[p.branch]||'Gemensamt')}</span></td><td><span class="badge ${p.status==='confirmed'?'green':'amber'}">${esc(p.status||'open')}</span></td><td><button class="row-action" data-edit-person="${esc(id)}">Redigera</button></td></tr>`; }

  function renderPlaces(){
    const places=[...state.places].sort((a,b)=>a.name.localeCompare(b.name,'sv'));
    ui.content.innerHTML=heading('Gårdar och platser','Samla gårdshistorik, namnformer, kartpunkter, källor och kopplade berättelser.',`<button class="primary-button" data-create="place">${icon('map-pin-plus')} Ny plats</button>`)+
      `<div class="toolbar"><div class="search-box">${icon('search')}<input id="adminSearch" type="search" placeholder="Sök gård, socken eller område"></div><select class="filter-select" id="mapFilter"><option value="">Alla kartstatusar</option><option value="mapped">Med kartpunkt</option><option value="unmapped">Utan kartpunkt</option></select></div>
      <div class="table-shell"><table class="data-table"><thead><tr><th>Plats</th><th>Område</th><th>Namnvarianter</th><th>Karta</th><th></th></tr></thead><tbody id="placeRows">${places.map(placeRow).join('')}</tbody></table></div>`;
    const filter=()=>{const q=document.getElementById('adminSearch').value.toLocaleLowerCase('sv');const map=document.getElementById('mapFilter').value;document.querySelectorAll('#placeRows tr').forEach(row=>row.hidden=!(row.dataset.search.includes(q)&&(!map||row.dataset.map===map)));};
    document.getElementById('adminSearch').addEventListener('input',filter); document.getElementById('mapFilter').addEventListener('change',filter);
  }
  function placeRow(p){const mapped=Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng));const hay=[p.name,p.area,...(p.aliases||[])].join(' ').toLocaleLowerCase('sv');const imageCount=(p.images||[]).length;return `<tr data-search="${esc(hay)}" data-map="${mapped?'mapped':'unmapped'}"><td><div class="entity-cell"><span class="entity-avatar entity-icon">${icon('landmark')}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.note||'Platskort')}${imageCount?` · ${imageCount} ${imageCount===1?'bild':'bilder'}`:''}</small></span></div></td><td>${esc(p.area||'Ej angivet')}</td><td>${esc((p.aliases||[]).slice(0,3).join(', ')||'Saknas')}</td><td><span class="badge ${mapped?'green':'amber'}">${mapped?'Kartlagd':'Saknas'}</span></td><td><button class="row-action" data-edit-place="${esc(p.id)}">Redigera</button></td></tr>`;}

  function personOptions(selected=''){ return `<option value="">Ingen vald</option>`+Object.entries(state.people).sort((a,b)=>a[1].name.localeCompare(b[1].name,'sv')).map(([id,p])=>`<option value="${esc(id)}"${id===selected?' selected':''}>${esc(p.name)}${p.born?` (${esc(p.born)})`:''}</option>`).join(''); }
  function field(label,id,value='',wide=false,type='text',help=''){return `<label class="field${wide?' full':''}"><span>${esc(label)}</span>${type==='textarea'?`<textarea id="${id}">${esc(value)}</textarea>`:`<input id="${id}" type="${type}" value="${esc(value)}">`}${help?`<small class="field-help">${esc(help)}</small>`:''}</label>`;}
  function renderPersonEditor(id){
    const isNew=id==='ny'; const p=isNew?{name:'',branch:'shared',status:'working',parents:[],isLiving:true,visibility:'family'}:state.people[id]; if(!p){navigate('people');return;}
    const title=isNew?'Ny person':p.name;
    ui.content.innerHTML=`<div class="editor-page">${heading(title,isNew?'Skapa en ny person med ett stabilt internt ID.':'Uppdatera personens samlade arkivuppgifter.',`<button class="secondary-button" data-go="people">${icon('arrow-left')} Till registret</button>`)}<form id="personForm" class="editor-layout"><div class="editor-card">
      <section class="editor-section"><h2>Grunduppgifter</h2><p>Namn, datum och placering i släktträdet.</p><div class="form-grid">${field('Namn','fName',p.name)}${field('Alternativt namn','fAlt',p.alt||'')}${field('Roll eller relation','fRole',p.role||'')}${field('Huvudplats eller gård','fPlace',p.place||'')}${field('Född','fBorn',p.born||'')}${field('Avliden','fDied',p.died||'')}<label class="field"><span>Släktled</span><select id="fBranch"><option value="mother"${p.branch==='mother'?' selected':''}>Bengtsson-ledet</option><option value="father"${p.branch==='father'?' selected':''}>Nilsson-ledet</option><option value="shared"${!['mother','father'].includes(p.branch)?' selected':''}>Gemensamt</option></select></label><label class="field"><span>Bevisstatus</span><select id="fStatus"><option value="confirmed"${p.status==='confirmed'?' selected':''}>Bekräftat</option><option value="likely"${p.status==='likely'?' selected':''}>Starkt sannolikt</option><option value="working"${p.status==='working'?' selected':''}>Arbetsantagande</option><option value="open"${p.status==='open'?' selected':''}>Öppet spår</option></select></label><label class="field"><span>Direkt led till Axel</span><select id="fDirect"><option value="yes"${p.direct?' selected':''}>Ja</option><option value="no"${!p.direct?' selected':''}>Nej</option></select></label><label class="field"><span>Levnadsstatus</span><select id="fLiving"><option value="yes"${p.isLiving?' selected':''}>Levande</option><option value="no"${!p.isLiving?' selected':''}>Avliden</option></select></label><label class="field full"><span>Synlighet</span><select id="fVisibility"><option value="family"${p.visibility==='family'?' selected':''}>Endast inloggad familj</option><option value="public"${p.visibility==='public'?' selected':''}>Offentlig</option><option value="private"${p.visibility==='private'?' selected':''}>Privat för redaktionen</option></select></label></div></section>
      <section class="editor-section"><h2>Relationer</h2><p>Relationerna sparas med personernas interna ID och påverkas därför inte av namnändringar.</p><div class="form-grid"><label class="field"><span>Förälder 1</span><select id="fParent1">${personOptions(p.parents?.[0])}</select></label><label class="field"><span>Förälder 2</span><select id="fParent2">${personOptions(p.parents?.[1])}</select></label><label class="field full"><span>Make eller maka</span><select id="fPartner">${personOptions(p.partner||'')}</select></label></div></section>
      <section class="editor-section"><h2>Berättelse och källor</h2><p>En uppgift per rad. Datum i livslinjen skrivs som datum: notering.</p><div class="form-grid">${field('Livshistoria','fStory',(p.story||[]).join('\n'),true,'textarea')}${field('Livslinje','fTimeline',pairText(p.timeline),true,'textarea')}${field('Fakta','fFacts',pairText(p.facts),true,'textarea')}${field('Källor','fSources',(p.sources||[]).map(x=>typeof x==='string'?x:x.text||x.citation||'').filter(Boolean).join('\n'),true,'textarea')}${field('Osäkerheter och öppna spår','fUncertainties',(p.uncertainties||[]).join('\n'),true,'textarea')}</div></section>
      <section class="editor-section"><h2>Bildgalleri</h2><p>Samla porträtt, familjefoton och dokumentbilder med tydliga bildtexter.</p><div class="form-grid">${field('Profilbild','fPhoto',p.photo||'',true)}</div>${galleryEditor('person',id,p,isNew)}</section></div>
      <aside class="editor-side"><div class="save-card"><h3>Spara</h3><p class="save-note">${canReview()?'Ändringen publiceras direkt och registreras i historiken.':'Ändringen skickas till en redaktör för granskning innan den publiceras.'}</p><button class="primary-button" type="submit">${canReview()?'Publicera ändring':'Skicka för granskning'}</button></div>${!isNew?`<div class="save-card"><h3>Publik sida</h3><a class="secondary-button" href="${esc(publicUrl('person',p))}">${icon('external-link')} Öppna personsida</a></div>`:''}</aside></form></div>`;
    document.getElementById('personForm').addEventListener('submit',event=>savePerson(event,id,p));
  }

  async function savePerson(event,id,current){
    event.preventDefault(); const button=event.submitter; button.disabled=true;
    const name=document.getElementById('fName').value.trim(); if(!name){toast('Personen behöver ett namn.',true);button.disabled=false;return;}
    const isNew=id==='ny'; const finalId=isNew?entityId('person'):id;
    const payload={...clone(current),name,slug:current.slug||uniqueSlug('person',name),alt:val('fAlt'),role:val('fRole'),place:val('fPlace'),born:val('fBorn'),died:val('fDied'),branch:val('fBranch'),status:val('fStatus'),direct:val('fDirect')==='yes',isLiving:val('fLiving')==='yes',visibility:val('fVisibility'),parents:[val('fParent1'),val('fParent2')].filter(Boolean),partner:val('fPartner'),story:rows(val('fStory')),timeline:pairs(val('fTimeline')),facts:pairs(val('fFacts')),sources:rows(val('fSources')),uncertainties:rows(val('fUncertainties')),photo:val('fPhoto'),images:images(val('fImages'))};
    try{const result=await window.FamilyData.submitChange('person',finalId,payload,isNew?'create':'update');toast(result.mode==='published'?'Personen är publicerad.':'Ändringen är skickad för granskning.');await refreshData();navigate('people',result.mode==='published'?finalId:null);}catch(error){toast(error.message||'Ändringen kunde inte sparas.',true);}finally{button.disabled=false;}
  }

  function renderPlaceEditor(id){
    const isNew=id==='ny'; const p=isNew?{name:'',aliases:[],story:[],visibility:'public'}:state.places.find(row=>row.id===id); if(!p){navigate('places');return;}
    ui.content.innerHTML=`<div class="editor-page">${heading(isNew?'Ny plats':p.name,isNew?'Skapa ett nytt gårds- eller platskort.':'Samla platsens historia och geografiska uppgifter.',`<button class="secondary-button" data-go="places">${icon('arrow-left')} Till registret</button>`)}<form id="placeForm" class="editor-layout"><div class="editor-card">
      <section class="editor-section"><h2>Grunduppgifter</h2><p>Namn, namnformer och geografisk placering.</p><div class="form-grid">${field('Platsnamn','fName',p.name)}${field('Område','fArea',p.area||'')}${field('Latitud','fLat',p.lat??'',false,'text')}${field('Longitud','fLng',p.lng??'',false,'text')}${field('Namnvarianter','fAliases',(p.aliases||[]).join(', '),true)}<label class="field full"><span>Synlighet</span><select id="fVisibility"><option value="public"${p.visibility==='public'?' selected':''}>Offentlig</option><option value="family"${p.visibility==='family'?' selected':''}>Endast inloggad familj</option><option value="private"${p.visibility==='private'?' selected':''}>Privat för redaktionen</option></select></label></div></section>
      <section class="editor-section"><h2>Platsens historia</h2><p>Sammanfatta platsen först och bygg därefter ut berättelse och tidslinje.</p><div class="form-grid">${field('Kort sammanfattning','fNote',p.note||'',true,'textarea')}${field('Historia','fStory',(p.story||[]).join('\n'),true,'textarea')}${field('Tidslinje','fTimeline',pairText(p.timeline),true,'textarea')}${field('Källor','fSources',(p.sources||[]).map(x=>typeof x==='string'?x:x.text||x.citation||'').filter(Boolean).join('\n'),true,'textarea')}${field('Osäkerheter och öppna spår','fUncertainties',(p.uncertainties||[]).join('\n'),true,'textarea')}</div></section>
      <section class="editor-section"><h2>Bildgalleri</h2><p>Samla gårdsbilder, kartor och dokument med tydliga bildtexter.</p>${galleryEditor('place',id,p,isNew)}</section></div>
      <aside class="editor-side"><div class="save-card"><h3>Spara</h3><p class="save-note">${canReview()?'Platskortet publiceras direkt.':'Platskortet skickas för granskning.'}</p><button class="primary-button" type="submit">${canReview()?'Publicera ändring':'Skicka för granskning'}</button></div>${!isNew?`<div class="save-card"><h3>Publik sida</h3><a class="secondary-button" href="${esc(publicUrl('place',p))}">${icon('external-link')} Öppna platssida</a></div>`:''}</aside></form></div>`;
    document.getElementById('placeForm').addEventListener('submit',event=>savePlace(event,id,p));
  }
  async function savePlace(event,id,current){
    event.preventDefault();const button=event.submitter;button.disabled=true;const name=val('fName');if(!name){toast('Platsen behöver ett namn.',true);button.disabled=false;return;}
    const lat=val('fLat'),lng=val('fLng');if((lat&&!lng)||(!lat&&lng)||Number.isNaN(Number(lat))||Number.isNaN(Number(lng))){toast('Fyll i både latitud och longitud med giltiga tal.',true);button.disabled=false;return;}
    const isNew=id==='ny',finalId=isNew?entityId('place'):id;const payload={...clone(current),id:finalId,name,slug:current.slug||uniqueSlug('place',name),area:val('fArea'),visibility:val('fVisibility'),aliases:[name,...val('fAliases').split(',').map(x=>x.trim()).filter(Boolean)].filter((x,i,a)=>a.indexOf(x)===i),note:val('fNote'),story:rows(val('fStory')),timeline:pairs(val('fTimeline')),sources:rows(val('fSources')),uncertainties:rows(val('fUncertainties')),images:images(val('fImages'))};if(lat){payload.lat=Number(lat);payload.lng=Number(lng);}else{delete payload.lat;delete payload.lng;}
    try{const result=await window.FamilyData.submitChange('place',finalId,payload,isNew?'create':'update');toast(result.mode==='published'?'Platsen är publicerad.':'Platsen är skickad för granskning.');await refreshData();navigate('places',result.mode==='published'?finalId:null);}catch(error){toast(error.message||'Platsen kunde inte sparas.',true);}finally{button.disabled=false;}
  }
  function val(id){return document.getElementById(id)?.value.trim()||'';}

  function renderChanges(){
    const changes=state.overview.changes;
    ui.content.innerHTML=heading('Ändringar',canReview()?'Granska bidrag och följ vad som har publicerats.':'Följ statusen för dina inskickade ändringar.')+`<section class="panel-card"><div class="panel-head"><h2>${changes.length} registrerade ändringar</h2></div><div class="panel-body activity-list">${changes.map(row=>activity(row,canReview())).join('')||'<div class="empty-state">Inga ändringar finns ännu.</div>'}</div></section>`;
  }
  function renderMembers(){
    if(!canManageUsers()){navigate('dashboard');return;}
    ui.content.innerHTML=heading('Användare','Hantera vilka familjemedlemmar som får bidra, publicera och administrera.')+`<div class="table-shell"><table class="data-table"><thead><tr><th>Familjemedlem</th><th>Roll</th><th>Registrerad</th></tr></thead><tbody>${state.overview.profiles.map(profile=>`<tr><td><strong>${esc(profile.display_name||'Namnlös användare')}</strong></td><td><select data-member-role="${esc(profile.id)}"><option value="contributor"${profile.role==='contributor'?' selected':''}>Bidragsgivare</option><option value="editor"${profile.role==='editor'?' selected':''}>Redaktör</option><option value="admin"${profile.role==='admin'?' selected':''}>Administratör</option></select></td><td>${new Date(profile.created_at).toLocaleDateString('sv-SE')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderRoute(){
    if(!state.status?.user||!state.ready) return;
    const current=route(); ui.pageTitle.textContent=routeTitles[current.name]||'Familjearkiv'; ui.pageEyebrow.textContent=labels[role()]||'Familjearkiv';
    document.querySelectorAll('[data-route]').forEach(link=>link.classList.toggle('active',link.dataset.route===current.name));
    if(current.name==='people'&&current.id) renderPersonEditor(current.id); else if(current.name==='places'&&current.id) renderPlaceEditor(current.id); else if(current.name==='people') renderPeople(); else if(current.name==='places') renderPlaces(); else if(current.name==='changes') renderChanges(); else if(current.name==='members') renderMembers(); else renderDashboard();
    icons(); ui.adminMain?.focus?.({preventScroll:true});
  }

  async function handleReview(button){
    const status=button.dataset.review;button.disabled=true;
    try{await window.FamilyData.reviewChange(button.dataset.changeId,status);toast(status==='approved'?'Ändringen är godkänd och publicerad.':'Ändringen är avslagen.');await refreshData();}
    catch(error){toast(error.message||'Granskningen misslyckades.',true);}finally{button.disabled=false;}
  }
  function bind(){
    document.getElementById('adminLoginForm').addEventListener('submit',async event=>{event.preventDefault();const message=document.getElementById('loginMessage');message.textContent='Skickar länken...';try{await window.FamilyData.sendMagicLink(document.getElementById('adminEmail').value.trim());message.textContent='Länken är skickad. Öppna din e-post och följ länken.';}catch(error){message.textContent=error.message||'Inloggningen misslyckades.';}});
    document.getElementById('adminSignOut').addEventListener('click',()=>window.FamilyData.signOut());
    document.getElementById('refreshButton').addEventListener('click',()=>refreshData(true));
    document.getElementById('menuButton').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
    document.addEventListener('click',event=>{
      const nav=event.target.closest('[data-route]');if(nav){event.preventDefault();navigate(nav.dataset.route);document.getElementById('sidebar').classList.remove('open');return;}
      const go=event.target.closest('[data-go]');if(go){navigate(go.dataset.go);return;}
      const create=event.target.closest('[data-create]');if(create){navigate(create.dataset.create==='person'?'people':'places','ny');return;}
      const person=event.target.closest('[data-edit-person]');if(person){navigate('people',person.dataset.editPerson);return;}
      const place=event.target.closest('[data-edit-place]');if(place){navigate('places',place.dataset.editPlace);return;}
      const review=event.target.closest('[data-review]');if(review){handleReview(review);return;}
      const removeImage=event.target.closest('[data-gallery-remove]');if(removeImage){const manager=removeImage.closest('[data-gallery-manager]'),source=manager.querySelector('[data-gallery-source]'),items=images(source.value);items.splice(Number(removeImage.dataset.galleryRemove),1);source.value=imageText(items);refreshGalleryManager(manager);return;}
      const profileImage=event.target.closest('[data-gallery-profile]');if(profileImage){const manager=profileImage.closest('[data-gallery-manager]'),item=images(manager.querySelector('[data-gallery-source]').value)[Number(profileImage.dataset.galleryProfile)],field=document.getElementById('fPhoto');if(item&&field){field.value=item.src;toast('Bilden används som profilbild när du sparar posten.');}return;}
      const uploadImage=event.target.closest('[data-gallery-upload]');if(uploadImage){uploadGalleryImage(uploadImage);return;}
    });
    document.addEventListener('input',event=>{if(event.target.matches('[data-gallery-caption]'))updateGalleryCaption(event.target);else if(event.target.matches('[data-gallery-source]'))refreshGalleryManager(event.target.closest('[data-gallery-manager]'));});
    document.addEventListener('change',async event=>{const select=event.target.closest('[data-member-role]');if(!select)return;select.disabled=true;try{await window.FamilyData.updateMemberRole(select.dataset.memberRole,select.value);toast('Användarens roll är uppdaterad.');await refreshData();}catch(error){toast(error.message||'Rollen kunde inte ändras.',true);}finally{select.disabled=false;}});
    addEventListener('popstate',renderRoute);addEventListener('hashchange',renderRoute);
    document.addEventListener('family-auth-change',event=>showAuth(event.detail));
    icons();
  }
  bind(); showAuth(window.FamilyData?.status?.()||{});
})();
