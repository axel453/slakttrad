(function(){
  const ui = {
    login:document.getElementById('loginScreen'),app:document.getElementById('adminApp'),content:document.getElementById('adminContent'),
    password:document.getElementById('passwordScreen'),loading:document.getElementById('loadingState'),pageTitle:document.getElementById('pageTitle'),pageEyebrow:document.getElementById('pageEyebrow')
  };
  const fallbackPeople = typeof PEOPLE === 'undefined' ? {} : JSON.parse(JSON.stringify(PEOPLE));
  const fallbackPlaces = typeof PLACES === 'undefined' ? [] : JSON.parse(JSON.stringify(PLACES));
  const fallbackUnits = typeof UNITS === 'undefined' ? [] : JSON.parse(JSON.stringify(UNITS));
  const state = {people:fallbackPeople,places:fallbackPlaces,units:fallbackUnits,overview:{changes:[],revisions:[],profiles:[]},status:null,ready:false};
  const labels = {contributor:'Bidragsgivare',editor:'Redaktör',admin:'Administratör',mother:'Bengtsson-ledet',father:'Nilsson-ledet',shared:'Gemensamt'};
  const routeTitles = {dashboard:'Översikt',people:'Personer',places:'Gårdar och platser',changes:'Ändringar',members:'Användare'};
  const draftPrefix = 'family-admin-form-draft-v1:';
  const restoredDrafts = new Set();
  let draftTimer = 0;

  function esc(value){ return String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function normalizeSearch(value){ return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sv').replace(/[^a-z0-9]+/g,' ').trim(); }
  function clone(value){ return JSON.parse(JSON.stringify(value || {})); }
  function icon(name){ return `<i data-lucide="${name}"></i>`; }
  function icons(){ window.lucide?.createIcons({attrs:{'stroke-width':1.8}}); }
  function toast(message,error=false){ const el=document.getElementById('toast'); el.textContent=message; el.className=`toast show${error?' error':''}`; clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.className='toast',4200); }
  function publishedMessage(label,visibility){
    if(visibility==='family') return `${label} är sparad och visas för inloggade familjemedlemmar.`;
    if(visibility==='private') return `${label} är sparad och visas endast för redaktionen.`;
    return `${label} är publicerad för alla.`;
  }
  function role(){ return state.status?.profile?.role || 'contributor'; }
  function canReview(){ return ['editor','admin'].includes(role()); }
  function canManageUsers(){ return role()==='admin'; }
  function isFile(){ return location.protocol==='file:'; }
  function adminUrl(path=''){
    const clean=String(path).replace(/^\/+|\/+$/g,'');
    return isFile() ? `#/${clean}${clean?'/':''}` : `/admin/#/${clean}${clean?'/':''}`;
  }
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
  function draftStorageGet(key){try{return sessionStorage.getItem(key);}catch{return null;}}
  function draftStorageSet(key,value){try{sessionStorage.setItem(key,value);}catch{}}
  function draftStorageRemove(key){try{sessionStorage.removeItem(key);}catch{}}
  function editorDraftKey(type,id){return `${draftPrefix}${type}:${id||'ny'}`;}
  function saveEditorDraft(form){
    if(!form||form.dataset.draftClean==='true'||!form.dataset.draftKey)return;
    const values={};
    form.querySelectorAll('input[id]:not([type="file"]),textarea[id],select[id]').forEach(field=>{values[field.id]=field.value;});
    draftStorageSet(form.dataset.draftKey,JSON.stringify({values,updatedAt:new Date().toISOString()}));
  }
  function saveActiveEditorDraft(){saveEditorDraft(document.querySelector('#personForm,#placeForm'));}
  function scheduleEditorDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(saveActiveEditorDraft,180);}
  function clearEditorDraft(form){
    if(!form?.dataset.draftKey)return;
    form.dataset.draftClean='true';
    draftStorageRemove(form.dataset.draftKey);
  }
  function restoreEditorDraft(form,type,id){
    const key=editorDraftKey(type,id);form.dataset.draftKey=key;
    const raw=draftStorageGet(key);if(!raw)return false;
    try{
      const draft=JSON.parse(raw);
      Object.entries(draft.values||{}).forEach(([fieldId,value])=>{const field=document.getElementById(fieldId);if(field&&form.contains(field)&&field.type!=='file')field.value=value;});
      if(!restoredDrafts.has(key)){restoredDrafts.add(key);setTimeout(()=>toast('Ditt osparade utkast har återställts.'),0);}
      return true;
    }catch{draftStorageRemove(key);return false;}
  }
  function refreshRestoredMedia(form){
    const profile=form.querySelector('[data-profile-manager]');
    if(profile){setProfilePreview(profile,val('fPhoto'));updateProfileCrop(profile);}
    const cover=form.querySelector('[data-cover-manager]');
    if(cover)setCoverPreview(val('fCoverImage'));
    form.querySelectorAll('[data-gallery-manager]').forEach(refreshGalleryManager);
  }
  function uniqueNames(values,primaryName=''){
    const primaryKey=normalizeSearch(primaryName),seen=new Set();
    return values.flatMap(value=>Array.isArray(value)?value:[value]).map(value=>String(value||'').trim()).filter(value=>{
      const key=normalizeSearch(value);if(!key||key===primaryKey||seen.has(key))return false;seen.add(key);return true;
    });
  }
  function personAliases(person){const explicit=Array.isArray(person.aliases)?person.aliases:[];return uniqueNames(explicit.length?explicit:[person.alt||''],person.name);}
  function aliasText(record,type='place'){return (type==='person'?personAliases(record):uniqueNames(record.aliases||[],record.name)).join('\n');}
  function editedAliases(value,name,current){
    const formerPrimary=current?.name&&normalizeSearch(current.name)!==normalizeSearch(name)?current.name:'';
    return uniqueNames([rows(value),formerPrimary],name);
  }
  function formerNames(current,name){
    const previous=current?.name&&normalizeSearch(current.name)!==normalizeSearch(name)?current.name:'';
    return uniqueNames([current?.formerNames||[],previous],name);
  }
  function pairs(value){ return rows(value).map(row=>{const at=row.indexOf(':');return at<0?['Notering',row]:[row.slice(0,at).trim()||'Notering',row.slice(at+1).trim()];}); }
  function pairText(value){ return (value||[]).map(row=>Array.isArray(row)?`${row[0]}: ${row[1]}`:String(row)).join('\n'); }
  function imageText(value){ return (value||[]).map(row=>typeof row==='string'?row:`${row.src||row.url||''}${row.caption?` | ${row.caption}`:''}`).filter(Boolean).join('\n'); }
  function images(value){ return rows(value).map(row=>{const [src,...caption]=row.split('|');return {src:src.trim(),caption:caption.join('|').trim()};}).filter(row=>row.src); }
  function profileCrop(record={}){
    const crop=record.photoCrop||{};
    const clamp=(value,min,max,fallback)=>{const number=Number(value);return Number.isFinite(number)?Math.min(max,Math.max(min,number)):fallback;};
    return {x:clamp(crop.x,0,100,50),y:clamp(crop.y,0,100,50),zoom:clamp(crop.zoom,1,3,1)};
  }
  function profileCropStyle(record){const crop=profileCrop(record);return `--photo-x:${crop.x}%;--photo-y:${crop.y}%;--photo-zoom:${crop.zoom};`;}
  function profileCropValue(){
    const crop=profileCrop({photoCrop:{x:val('fPhotoX'),y:val('fPhotoY'),zoom:val('fPhotoZoom')}});
    return {x:Math.round(crop.x),y:Math.round(crop.y),zoom:Math.round(crop.zoom*100)/100};
  }
  function galleryPreview(items,type='place',coverImage=''){
    if(!items.length) return `<div class="gallery-empty">${icon('images')}<span>Inga bilder i galleriet ännu.</span></div>`;
    return items.map((item,index)=>{const src=item.src||item.url,selected=type==='place'&&src===coverImage;return `<article class="gallery-admin-item${selected?' cover-selected':''}" data-gallery-index="${index}"><img src="${esc(src)}" alt="" loading="lazy" onerror="this.closest('article').classList.add('image-error')"><div><label><span>Bildtext</span><input type="text" value="${esc(item.caption||'')}" data-gallery-caption="${index}" placeholder="Vilka, var och när?"></label><div class="gallery-item-actions">${type==='person'?`<button class="gallery-profile" type="button" data-gallery-profile="${index}">${icon('user-round')} Använd som profilbild</button>`:''}${type==='place'?`<button class="gallery-cover" type="button" data-gallery-cover="${index}">${icon(selected?'check':'image')} ${selected?'Vald som omslag':'Använd som omslag'}</button>`:''}<button class="gallery-remove" type="button" data-gallery-remove="${index}">${icon('trash-2')} Ta bort från galleriet</button></div></div></article>`;}).join('');
  }
  function galleryEditor(type,id,record,isNew){
    const items=images(imageText(record.images));
    const uploadAllowed=!isNew&&canReview();
    const uploadCopy=isNew?'Spara posten först. Därefter kan du ladda upp bilder.':uploadAllowed?'Välj en eller flera bilder i JPG, PNG eller WebP, högst 15 MB per bild. Bilderna blir offentliga när posten sparas.':'Du kan lägga till bildlänkar. En redaktör hanterar filuppladdning och publicering.';
    return `<div class="gallery-manager" data-gallery-manager data-entity-type="${type}" data-entity-id="${esc(id)}"><div class="gallery-admin-grid" data-gallery-preview>${galleryPreview(items,type,record.coverImage||'')}</div><div class="gallery-upload-card"><div><strong>Ladda upp bilder</strong><p>${esc(uploadCopy)}</p></div><div class="gallery-upload-fields"><label class="field"><span>Bildfiler</span><input type="file" accept="image/jpeg,image/png,image/webp" data-gallery-file multiple${uploadAllowed?'':' disabled'}><small class="field-help" data-gallery-file-summary>Inga bilder valda</small></label><label class="field"><span>Gemensam bildtext (valfri)</span><input type="text" data-gallery-upload-caption placeholder="Personer, plats och ungefärligt år"${uploadAllowed?'':' disabled'}></label><button class="secondary-button" type="button" data-gallery-upload${uploadAllowed?'':' disabled'}>${icon('upload')} Ladda upp bilder</button></div><p class="gallery-upload-state" data-gallery-upload-state aria-live="polite"></p></div><details class="gallery-link-entry"><summary>Lägg till eller kontrollera bildadress</summary><label class="field"><span>En bild per rad</span><textarea id="fImages" data-gallery-source placeholder="https://…/bild.jpg | Bildtext">${esc(imageText(record.images))}</textarea><small class="field-help">Format: bildadress | bildtext. Befintliga länkar fortsätter fungera.</small></label></details></div>`;
  }
  function coverImageEditor(id,record,isNew){
    const cover=record.coverImage||'';
    const uploadAllowed=!isNew&&canReview();
    const help=isNew?'Spara platsen först. Därefter kan du ladda upp en omslagsbild.':uploadAllowed?'Välj gärna en liggande bild. Den läggs även automatiskt i platsens galleri.':'En redaktör behöver ladda upp och publicera omslagsbilden.';
    return `<div class="cover-image-manager" data-cover-manager data-place-id="${esc(id)}"><div class="cover-image-preview${cover?' has-image':''}" data-cover-preview>${cover?`<img src="${esc(cover)}" alt="Förhandsvisning av omslagsbild">`:icon('image')}</div><div class="cover-image-controls"><strong>Omslagsbild</strong><p>${esc(help)}</p><div class="cover-image-actions"><label class="secondary-button${uploadAllowed?'':' disabled'}">${icon('image-plus')} Välj bild<input type="file" accept="image/jpeg,image/png,image/webp" data-cover-file${uploadAllowed?'':' disabled'} hidden></label><button class="primary-button" type="button" data-cover-upload${uploadAllowed?'':' disabled'}>${icon('upload')} Ladda upp</button><button class="text-button cover-remove" type="button" data-cover-remove${cover?'':' hidden'}>Ta bort omslagsbild</button></div><span class="cover-upload-state" data-cover-state aria-live="polite"></span><details class="gallery-link-entry cover-link-entry"><summary>Använd en befintlig bildadress</summary><label class="field"><span>Bildadress</span><input id="fCoverImage" type="text" value="${esc(cover)}" data-cover-url placeholder="https://…/gard.jpg"></label></details></div></div>`;
  }
  function profileImageEditor(id,record,isNew){
    const uploadAllowed=!isNew&&canReview();
    const photo=record.photo||'/assets/person-placeholder.svg';
    const crop=profileCrop(record);
    const help=isNew?'Spara personen först. Därefter kan du ladda upp profilbilden.':uploadAllowed?'JPG, PNG eller WebP, högst 15 MB. Bilden läggs även i personens galleri.':'En redaktör behöver ladda upp och publicera profilbilden.';
    return `<div class="profile-image-manager" data-profile-manager data-person-id="${esc(id)}"><div class="profile-image-preview" data-profile-crop-preview style="${profileCropStyle(record)}"><img src="${esc(photo)}" alt="Förhandsvisning av profilbild" data-profile-preview></div><div class="profile-image-controls"><strong>Profilbild</strong><p>${esc(help)}</p><div class="profile-image-actions"><label class="secondary-button${uploadAllowed?'':' disabled'}">${icon('image-plus')} Välj bild<input type="file" accept="image/jpeg,image/png,image/webp" data-profile-file${uploadAllowed?'':' disabled'} hidden></label><button class="primary-button" type="button" data-profile-upload${uploadAllowed?'':' disabled'}>${icon('upload')} Ladda upp</button>${record.photo?`<button class="text-button profile-remove" type="button" data-profile-remove>Ta bort profilbild</button>`:''}</div><span class="profile-upload-state" data-profile-state aria-live="polite"></span><div class="profile-crop-controls"><div class="profile-crop-heading"><strong>Anpassa utsnitt</strong><button class="text-button" type="button" data-profile-crop-reset>Återställ</button></div><label><span>Zoom</span><input id="fPhotoZoom" type="range" min="1" max="3" step="0.05" value="${crop.zoom}" data-profile-crop><output data-profile-crop-output="zoom">${crop.zoom.toFixed(2)}×</output></label><label><span>Flytta i sidled</span><input id="fPhotoX" type="range" min="0" max="100" step="1" value="${crop.x}" data-profile-crop><output data-profile-crop-output="x">${Math.round(crop.x)}%</output></label><label><span>Flytta upp/ned</span><input id="fPhotoY" type="range" min="0" max="100" step="1" value="${crop.y}" data-profile-crop><output data-profile-crop-output="y">${Math.round(crop.y)}%</output></label><small>Justeringen ändrar bara hur bilden beskärs. Originalbilden finns kvar.</small></div><details class="gallery-link-entry profile-link-entry"><summary>Använd en befintlig bildadress</summary><label class="field"><span>Bildadress</span><input id="fPhoto" type="text" value="${esc(record.photo||'')}" data-profile-url placeholder="https://…/portratt.jpg"></label></details></div></div>`;
  }
  function refreshGalleryManager(manager){
    const source=manager.querySelector('[data-gallery-source]');
    const preview=manager.querySelector('[data-gallery-preview]');
    if(source&&preview){preview.innerHTML=galleryPreview(images(source.value),manager.dataset.entityType,document.getElementById('fCoverImage')?.value.trim()||'');icons();}
  }
  function setCoverPreview(src){
    const manager=document.querySelector('[data-cover-manager]'),preview=manager?.querySelector('[data-cover-preview]'),remove=manager?.querySelector('[data-cover-remove]');
    if(!preview)return;preview.classList.toggle('has-image',!!src);preview.innerHTML=src?`<img src="${esc(src)}" alt="Förhandsvisning av omslagsbild">`:icon('image');if(remove)remove.hidden=!src;icons();
  }
  function previewCoverFile(input){
    const file=input.files?.[0];if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Välj en bild i JPG-, PNG- eller WebP-format.',true);input.value='';return;}
    if(file.size>15*1024*1024){toast('Bilden får vara högst 15 MB.',true);input.value='';return;}
    setCoverPreview(URL.createObjectURL(file));
  }
  async function uploadCoverImage(button){
    const manager=button.closest('[data-cover-manager]');
    const fileInput=manager?.querySelector('[data-cover-file]');
    const stateEl=manager?.querySelector('[data-cover-state]');
    const file=fileInput?.files?.[0];
    if(!file){toast('Välj en omslagsbild först.',true);return;}
    button.disabled=true;button.innerHTML=`<span class="spinner small"></span> Laddar upp`;if(stateEl)stateEl.textContent='Laddar upp bilden…';
    try{
      const name=document.getElementById('fName')?.value.trim()||'platsen';
      const item=await window.FamilyData.uploadPublicImage(file,'place',manager.dataset.placeId,`Omslagsbild för ${name}`);
      const coverField=document.getElementById('fCoverImage');if(coverField)coverField.value=item.src;
      setCoverPreview(item.src);
      const gallery=document.querySelector('[data-gallery-manager][data-entity-type="place"]');
      const source=gallery?.querySelector('[data-gallery-source]');
      if(source){const items=images(source.value);if(!items.some(row=>row.src===item.src))items.unshift(item);source.value=imageText(items);refreshGalleryManager(gallery);}
      fileInput.value='';if(stateEl)stateEl.textContent='Uppladdad. Spara platsen för att publicera omslagsbilden.';toast('Omslagsbilden är uppladdad. Spara platsen för att publicera ändringen.');
    }catch(error){if(stateEl)stateEl.textContent='';toast(error.message||'Omslagsbilden kunde inte laddas upp.',true);}
    finally{button.disabled=false;button.innerHTML=`${icon('upload')} Ladda upp`;icons();}
  }
  function updateGalleryCaption(input){
    const manager=input.closest('[data-gallery-manager]');
    const source=manager?.querySelector('[data-gallery-source]');
    if(!source)return;
    const items=images(source.value),index=Number(input.dataset.galleryCaption);
    if(!items[index])return;
    items[index].caption=input.value.trim();source.value=imageText(items);
  }
  function updateGalleryFileSummary(input){
    const count=input.files?.length||0;
    const summary=input.closest('.field')?.querySelector('[data-gallery-file-summary]');
    if(summary)summary.textContent=count?`${count} ${count===1?'bild vald':'bilder valda'}`:'Inga bilder valda';
  }
  async function uploadGalleryImages(button){
    const manager=button.closest('[data-gallery-manager]');
    const fileInput=manager?.querySelector('[data-gallery-file]');
    const captionInput=manager?.querySelector('[data-gallery-upload-caption]');
    const source=manager?.querySelector('[data-gallery-source]');
    const state=manager?.querySelector('[data-gallery-upload-state]');
    const files=Array.from(fileInput?.files||[]);
    if(!files.length){toast('Välj minst en bildfil först.',true);return;}
    const caption=captionInput.value.trim();
    const items=images(source.value),failures=[];
    button.disabled=true;
    for(let index=0;index<files.length;index+=1){
      const file=files[index];
      button.innerHTML=`<span class="spinner small"></span> ${index+1} av ${files.length}`;
      if(state)state.textContent=`Laddar upp ${index+1} av ${files.length}: ${file.name}`;
      try{
        const item=await window.FamilyData.uploadPublicImage(file,manager.dataset.entityType,manager.dataset.entityId,caption);
        if(!items.some(row=>row.src===item.src))items.push(item);
        source.value=imageText(items);refreshGalleryManager(manager);
      }catch(error){failures.push({file,error});}
    }
    const uploaded=files.length-failures.length;
    if(uploaded){
      fileInput.value='';captionInput.value='';updateGalleryFileSummary(fileInput);
      if(state)state.textContent=`${uploaded} ${uploaded===1?'bild är uppladdad':'bilder är uppladdade'}. Spara posten för att publicera galleriet.`;
      toast(`${uploaded} ${uploaded===1?'bild är uppladdad':'bilder är uppladdade'}. Spara posten för att publicera.`);
    }
    if(failures.length){
      const failedNames=failures.map(row=>row.file.name).join(', ');
      if(state)state.textContent=`${uploaded} uppladdade. Kunde inte ladda upp: ${failedNames}`;
      toast(`${failures.length} ${failures.length===1?'bild kunde':'bilder kunde'} inte laddas upp.`,true);
    }
    button.disabled=false;button.innerHTML=`${icon('upload')} Ladda upp bilder`;icons();
  }
  function setProfilePreview(manager,src){
    const preview=manager?.querySelector('[data-profile-preview]');
    if(preview) preview.src=src||'/assets/person-placeholder.svg';
  }
  function updateProfileCrop(manager){
    const preview=manager?.querySelector('[data-profile-crop-preview]');
    if(!preview)return;
    const crop=profileCropValue();
    preview.style.setProperty('--photo-x',`${crop.x}%`);
    preview.style.setProperty('--photo-y',`${crop.y}%`);
    preview.style.setProperty('--photo-zoom',crop.zoom);
    const xOutput=manager.querySelector('[data-profile-crop-output="x"]');
    const yOutput=manager.querySelector('[data-profile-crop-output="y"]');
    const zoomOutput=manager.querySelector('[data-profile-crop-output="zoom"]');
    if(xOutput)xOutput.value=`${crop.x}%`;
    if(yOutput)yOutput.value=`${crop.y}%`;
    if(zoomOutput)zoomOutput.value=`${crop.zoom.toFixed(2)}×`;
  }
  function resetProfileCrop(button){
    const manager=button.closest('[data-profile-manager]');
    [['fPhotoX','50'],['fPhotoY','50'],['fPhotoZoom','1']].forEach(([id,value])=>{const input=document.getElementById(id);if(input)input.value=value;});
    updateProfileCrop(manager);
  }
  function previewProfileFile(input){
    const file=input.files?.[0]; if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Välj en bild i JPG-, PNG- eller WebP-format.',true);input.value='';return;}
    if(file.size>15*1024*1024){toast('Bilden får vara högst 15 MB.',true);input.value='';return;}
    setProfilePreview(input.closest('[data-profile-manager]'),URL.createObjectURL(file));
  }
  async function uploadProfileImage(button){
    const manager=button.closest('[data-profile-manager]');
    const fileInput=manager?.querySelector('[data-profile-file]');
    const stateEl=manager?.querySelector('[data-profile-state]');
    const file=fileInput?.files?.[0];
    if(!file){toast('Välj en profilbild först.',true);return;}
    button.disabled=true;button.innerHTML=`<span class="spinner small"></span> Laddar upp`;if(stateEl)stateEl.textContent='Laddar upp bilden…';
    try{
      const name=document.getElementById('fName')?.value.trim()||'personen';
      const item=await window.FamilyData.uploadPublicImage(file,'person',manager.dataset.personId,`Porträtt av ${name}`,{maxDimension:960,quality:.84});
      const photoField=document.getElementById('fPhoto');if(photoField)photoField.value=item.src;
      setProfilePreview(manager,item.src);
      const gallery=document.querySelector('[data-gallery-manager][data-entity-type="person"]');
      const source=gallery?.querySelector('[data-gallery-source]');
      if(source){const items=images(source.value);if(!items.some(row=>row.src===item.src))items.unshift(item);source.value=imageText(items);refreshGalleryManager(gallery);}
      fileInput.value='';if(stateEl)stateEl.textContent='Uppladdad. Spara personen för att publicera profilbilden.';toast('Profilbilden är uppladdad. Spara personen för att publicera ändringen.');
    }catch(error){if(stateEl)stateEl.textContent='';toast(error.message||'Profilbilden kunde inte laddas upp.',true);}
    finally{button.disabled=false;button.innerHTML=`${icon('upload')} Ladda upp`;icons();}
  }

  function route(){
    const hashRoute=decodeURIComponent(location.hash.slice(1)).replace(/^\/+|\/+$/g,'');
    const raw=hashRoute || (isFile() ? '' : location.pathname.replace(/^\/admin\/?/,''));
    const parts=raw.replace(/^\/+|\/+$/g,'').split('/').filter(Boolean);
    if(parts[0]==='personer') return {name:'people',id:parts[1]||null};
    if(parts[0]==='gardar') return {name:'places',id:parts[1]||null};
    if(parts[0]==='andringar') return {name:'changes'};
    if(parts[0]==='anvandare') return {name:'members'};
    return {name:'dashboard'};
  }
  function bindArchiveFilter(input,filter){
    if(!input) return;
    let composing=false;
    const update=()=>{if(!composing)filter();};
    input.addEventListener('compositionstart',()=>{composing=true;});
    input.addEventListener('compositionend',()=>{composing=false;filter();});
    ['input','search','change'].forEach(type=>input.addEventListener(type,update));
    input.addEventListener('keyup',update);
  }
  function navigate(name,id){
    const base={dashboard:'',people:'personer',places:'gardar',changes:'andringar',members:'anvandare'}[name]||'';
    const url=adminUrl([base,id].filter(Boolean).join('/'));
    if(isFile()) location.hash=url.slice(1); else history.pushState({},'',url);
    renderRoute();
    window.scrollTo({top:0,behavior:'auto'});
  }

  async function refreshData(showToast=false){
    if(!state.status?.user) return;
    saveActiveEditorDraft();
    ui.loading.hidden=false;
    try{
      const [snapshot,overview]=await Promise.all([window.FamilyData.loadSnapshot(),window.FamilyData.loadAdminOverview()]);
      const deletedPeople=new Set(snapshot?.deleted?.people||[]);
      const deletedPlaces=new Set(snapshot?.deleted?.places||[]);
      state.people=Object.fromEntries(Object.entries({...fallbackPeople,...(snapshot?.people||{})}).filter(([id])=>!deletedPeople.has(id)));
      const places=new Map(fallbackPlaces.map(item=>[item.id,item]));
      (snapshot?.places||[]).forEach(item=>places.set(item.id,{...(places.get(item.id)||{}),...item}));
      const units=new Map(fallbackUnits.map(item=>[item.id,item]));
      (snapshot?.units||[]).forEach(item=>units.set(item.id,{...(units.get(item.id)||{}),...item}));
      state.places=[...places.values()].filter(item=>!deletedPlaces.has(item.id));
      const visibleUnits=[...units.values()].map(unit=>({...unit,persons:(unit.persons||[]).filter(id=>!deletedPeople.has(id))})).filter(unit=>unit.persons.length);
      const visibleUnitIds=new Set(visibleUnits.map(unit=>unit.id));
      state.units=visibleUnits.map(unit=>({...unit,children:(unit.children||[]).filter(id=>visibleUnitIds.has(id))}));
      state.overview=overview; state.ready=true;
      renderRoute(); if(showToast) toast('Familjearkivet är uppdaterat.');
    }catch(error){ toast(error.message||'Familjearkivet kunde inte hämtas.',true); }
    finally{ ui.loading.hidden=true; }
  }

  function showAuth(status){
    state.status=status;
    const signedIn=!!status?.user;
    const recovering=!!status?.passwordRecovery;
    ui.password.hidden=!recovering;ui.login.hidden=signedIn||recovering;ui.app.hidden=!signedIn||recovering;
    if(recovering) return;
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
    const filter=()=>{const q=normalizeSearch(document.getElementById('adminSearch').value);const branch=document.getElementById('branchFilter').value;document.querySelectorAll('#peopleRows tr').forEach(row=>row.hidden=!(row.dataset.search.includes(q)&&(!branch||row.dataset.branch===branch)));};
    bindArchiveFilter(document.getElementById('adminSearch'),filter); document.getElementById('branchFilter').addEventListener('change',filter);
  }
  function personRow([id,p]){ const hay=normalizeSearch([p.name,...personAliases(p),...(p.formerNames||[]),p.born,p.died,p.place,p.role].join(' '));const hasPhoto=p.photo&&!/person-placeholder\.svg$/i.test(p.photo),imageCount=(p.images||[]).length+(hasPhoto?1:0),aliases=personAliases(p);return `<tr data-search="${esc(hay)}" data-branch="${esc(p.branch||'shared')}"><td><div class="entity-cell"><img class="entity-avatar" src="${esc(p.photo||'/assets/person-placeholder.svg')}" alt=""><span><strong>${esc(p.name)}</strong><small>${esc(aliases.length?`Även ${aliases.slice(0,2).join(', ')}`:(p.role||'Person'))}${imageCount?` · ${imageCount} ${imageCount===1?'bild':'bilder'}`:''}</small></span></div></td><td data-label="Levnadsår">${esc([p.born,p.died].filter(Boolean).join(' – ')||'Saknas')}</td><td data-label="Plats">${esc(p.place||'Ej angivet')}</td><td data-label="Släktled"><span class="badge">${esc(labels[p.branch]||'Gemensamt')}</span></td><td data-label="Status"><span class="badge ${p.status==='confirmed'?'green':'amber'}">${esc(p.status||'open')}</span></td><td class="table-action"><button class="row-action" data-edit-person="${esc(id)}">Redigera</button></td></tr>`; }

  function renderPlaces(){
    const places=[...state.places].sort((a,b)=>a.name.localeCompare(b.name,'sv'));
    ui.content.innerHTML=heading('Gårdar och platser','Samla gårdshistorik, namnformer, kartpunkter, källor och kopplade berättelser.',`<button class="primary-button" data-create="place">${icon('map-pin-plus')} Ny plats</button>`)+
      `<div class="toolbar"><div class="search-box">${icon('search')}<input id="adminSearch" type="search" placeholder="Sök gård, socken eller område"></div><select class="filter-select" id="mapFilter"><option value="">Alla kartstatusar</option><option value="mapped">Med kartpunkt</option><option value="unmapped">Utan kartpunkt</option></select></div>
      <div class="table-shell"><table class="data-table"><thead><tr><th>Plats</th><th>Område</th><th>Sekundära namn</th><th>Karta</th><th></th></tr></thead><tbody id="placeRows">${places.map(placeRow).join('')}</tbody></table></div>`;
    const filter=()=>{const q=normalizeSearch(document.getElementById('adminSearch').value);const map=document.getElementById('mapFilter').value;document.querySelectorAll('#placeRows tr').forEach(row=>row.hidden=!(row.dataset.search.includes(q)&&(!map||row.dataset.map===map)));};
    bindArchiveFilter(document.getElementById('adminSearch'),filter); document.getElementById('mapFilter').addEventListener('change',filter);
  }
  function placeRow(p){const mapped=Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)),aliases=uniqueNames(p.aliases||[],p.name);const hay=normalizeSearch([p.name,...aliases,...(p.formerNames||[]),p.area].join(' '));const imageCount=(p.images||[]).length;return `<tr data-search="${esc(hay)}" data-map="${mapped?'mapped':'unmapped'}"><td><div class="entity-cell"><span class="entity-avatar entity-icon">${icon('landmark')}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.note||'Platskort')}${imageCount?` · ${imageCount} ${imageCount===1?'bild':'bilder'}`:''}</small></span></div></td><td data-label="Område">${esc(p.area||'Ej angivet')}</td><td data-label="Sekundära namn">${esc(aliases.slice(0,3).join(', ')||'Saknas')}</td><td data-label="Karta"><span class="badge ${mapped?'green':'amber'}">${mapped?'Kartlagd':'Saknas'}</span></td><td class="table-action"><button class="row-action" data-edit-place="${esc(p.id)}">Redigera</button></td></tr>`;}

  function personOptions(selected=''){ return `<option value="">Ingen vald</option>`+Object.entries(state.people).sort((a,b)=>a[1].name.localeCompare(b[1].name,'sv')).map(([id,p])=>`<option value="${esc(id)}"${id===selected?' selected':''}>${esc(p.name)}${p.born?` (${esc(p.born)})`:''}</option>`).join(''); }
  function personPickerLabel(id){const p=state.people[id];if(!p)return '';const meta=[p.born,p.role].filter(Boolean).join(' · ');return `${p.name}${meta?` (${meta})`:''}`;}
  function personPickerSearch(id,p){return normalizeSearch([p.name,...personAliases(p),...(p.formerNames||[]),p.born,p.died,p.role,p.place,id].filter(Boolean).join(' '));}
  function uniqueIds(values){return [...new Set((values||[]).filter(Boolean))];}
  function unitForPerson(personId){return state.units.find(unit=>(unit.persons||[]).includes(personId));}
  function parentUnitsFor(unitId){return state.units.filter(unit=>(unit.children||[]).includes(unitId));}
  function unitBranch(unit){
    if(!unit)return 'shared';
    if(unit.branch&&unit.branch!=='shared')return unit.branch;
    if(typeof MOTHER_UNITS!=='undefined'&&MOTHER_UNITS.has(unit.id))return 'mother';
    if(typeof FATHER_UNITS!=='undefined'&&FATHER_UNITS.has(unit.id))return 'father';
    return 'shared';
  }
  function unitLane(unit){
    if(!unit)return '';
    if(unit.lane)return unit.lane;
    if(typeof MOTHER_MOTHER_UNITS!=='undefined'&&MOTHER_MOTHER_UNITS.has(unit.id))return 'mother-mother';
    if(typeof MOTHER_FATHER_UNITS!=='undefined'&&MOTHER_FATHER_UNITS.has(unit.id))return 'mother-father';
    if(typeof FATHER_MOTHER_UNITS!=='undefined'&&FATHER_MOTHER_UNITS.has(unit.id))return 'father-mother';
    if(typeof FATHER_FATHER_UNITS!=='undefined'&&FATHER_FATHER_UNITS.has(unit.id))return 'father-father';
    return '';
  }
  function personBranch(personId){
    const person=state.people[personId];
    if(person?.branch&&person.branch!=='shared')return person.branch;
    return unitBranch(unitForPerson(personId));
  }
  function personRelations(current,currentId=''){
    const siblingId=val('fSibling'),childId=val('fChild'),partnerId=val('fPartner');
    let parentIds=uniqueIds([val('fParent1'),val('fParent2')]);
    const sibling=state.people[siblingId];
    const siblingUnit=unitForPerson(siblingId);
    if(siblingId&&!parentIds.length){
      parentIds=uniqueIds(sibling?.parents||[]);
      if(!parentIds.length&&siblingUnit){
        parentIds=uniqueIds(parentUnitsFor(siblingUnit.id).flatMap(unit=>unit.persons||[])).slice(0,2);
      }
    }
    const chosenIds=[...parentIds,partnerId,childId,siblingId].filter(Boolean);
    if(new Set(chosenIds).size!==chosenIds.length)throw new Error('Samma person kan inte väljas i flera olika relationer.');
    const partnerUnit=unitForPerson(partnerId);
    if(partnerUnit&&(partnerUnit.persons||[]).length>1&&!(partnerUnit.persons||[]).includes(currentId))throw new Error('Den valda maken eller makan ingår redan i ett parkort.');
    let branch=val('fBranch');
    if(branch==='shared'){
      const inherited=[siblingId,childId,partnerId,...parentIds].map(personBranch).find(value=>value&&value!=='shared');
      if(inherited)branch=inherited;
    }
    return {
      parentIds,partnerId,childId,siblingId,branch,siblingUnit,partnerUnit,
      childIds:uniqueIds([...(current.children||[]),childId]),
      siblingIds:uniqueIds([...(current.siblings||[]),siblingId])
    };
  }
  function personTreePlacement(personId,relations,direct){
    const currentUnit=unitForPerson(personId);
    const existingParentUnitIds=uniqueIds(relations.parentIds.map(id=>unitForPerson(id)?.id));
    const unplacedParentIds=relations.parentIds.filter(id=>!unitForPerson(id));
    const parentUnitIds=[...existingParentUnitIds];
    if(relations.siblingUnit)parentUnitsFor(relations.siblingUnit.id).forEach(unit=>parentUnitIds.push(unit.id));
    const childUnits=uniqueIds(relations.childIds.map(id=>unitForPerson(id)?.id)).map(id=>state.units.find(unit=>unit.id===id)).filter(Boolean);
    const unplacedChildIds=relations.childIds.filter(id=>!unitForPerson(id));
    const childUnit=childUnits[0];
    const referenceUnit=currentUnit||relations.partnerUnit||relations.siblingUnit||childUnit||state.units.find(unit=>parentUnitIds.includes(unit.id));
    const parentGenerations=parentUnitIds.map(id=>state.units.find(unit=>unit.id===id)?.gen).filter(Number.isFinite);
    const generation=currentUnit?.gen??relations.partnerUnit?.gen??(parentGenerations.length?Math.max(...parentGenerations)+1:relations.siblingUnit?.gen??(Number.isFinite(childUnit?.gen)?childUnit.gen-1:8));
    const unitId=currentUnit?.id||relations.partnerUnit?.id||`u_${personId}`;
    const branchDirect=!!(direct||currentUnit?.direct||currentUnit?.heir||relations.siblingUnit?.direct||relations.siblingUnit?.heir);
    const parentUnitsToCreate=unplacedParentIds.length?[{
      id:`u_parents_${personId}`,personIds:unplacedParentIds,generation:generation-1,
      branch:relations.branch,lane:unitLane(referenceUnit),direct:branchDirect,childUnitIds:[unitId]
    }]:[];
    parentUnitsToCreate.forEach(unit=>parentUnitIds.push(unit.id));
    return {
      unitId,generation,branch:relations.branch,lane:unitLane(referenceUnit),direct:branchDirect,
      parentUnitIds:uniqueIds(parentUnitIds),parentUnitsToCreate,
      childUnitIds:[...childUnits.map(unit=>unit.id),...unplacedChildIds.map(id=>`u_${id}`)],
      childUnitsToCreate:unplacedChildIds.map(id=>{const branch=personBranch(id);return {id:`u_${id}`,personId:id,generation:generation+1,branch:branch==='shared'?relations.branch:branch,lane:unitLane(referenceUnit),direct:!!state.people[id]?.direct};}),
      parentIds:relations.parentIds,childIds:relations.childIds,
      partnerId:relations.partnerId,siblingIds:relations.siblingIds
    };
  }
  function enhancePersonPicker(select,excludeId=''){
    if(!select||select.classList.contains('is-enhanced'))return;
    select.classList.add('person-picker-native','is-enhanced');select.setAttribute('aria-hidden','true');select.tabIndex=-1;
    const picker=document.createElement('div');picker.className='person-picker';
    const fieldLabel=select.closest('.field')?.querySelector(':scope > span')?.textContent?.trim()||'person';
    picker.innerHTML=`<input class="person-picker-input" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" placeholder="Sök ${esc(fieldLabel.toLocaleLowerCase('sv'))}..."><button class="person-picker-clear" type="button" aria-label="Rensa val" title="Rensa val">×</button><div class="person-picker-results" role="listbox" hidden></div>`;
    select.insertAdjacentElement('afterend',picker);
    const input=picker.querySelector('.person-picker-input'),results=picker.querySelector('.person-picker-results');let activeIndex=-1;
    const close=()=>{results.hidden=true;input.setAttribute('aria-expanded','false');activeIndex=-1;};
    const choose=id=>{select.value=id||'';input.value=personPickerLabel(select.value);select.dispatchEvent(new Event('change',{bubbles:true}));close();};
    const show=()=>{const query=normalizeSearch(input.value);const rows=Object.entries(state.people).filter(([id,p])=>id!==excludeId&&(!query||personPickerSearch(id,p).includes(query))).sort((a,b)=>a[1].name.localeCompare(b[1].name,'sv')).slice(0,40);results.innerHTML=rows.length?rows.map(([id,p])=>{const aliases=personAliases(p).slice(0,2),meta=[p.born,p.role,aliases.length?`även ${aliases.join(', ')}`:''].filter(Boolean).join(' · ');return `<button type="button" class="person-picker-option" role="option" data-person-picker-id="${esc(id)}"><strong>${esc(p.name)}</strong>${meta?`<span>${esc(meta)}</span>`:''}</button>`;}).join(''):'<span class="person-picker-empty">Ingen person matchar sökningen.</span>';results.hidden=false;input.setAttribute('aria-expanded','true');activeIndex=-1;};
    input.value=personPickerLabel(select.value);
    input.addEventListener('focus',()=>{if(select.value&&input.value===personPickerLabel(select.value))input.select();show();});
    input.addEventListener('input',show);
    input.addEventListener('keydown',event=>{const options=[...results.querySelectorAll('.person-picker-option')];if(event.key==='Escape'){close();return;}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(results.hidden)show();if(!options.length)return;activeIndex=event.key==='ArrowDown'?Math.min(activeIndex+1,options.length-1):Math.max(activeIndex-1,0);options.forEach((option,index)=>option.classList.toggle('active',index===activeIndex));options[activeIndex]?.scrollIntoView({block:'nearest'});}else if(event.key==='Enter'&&options.length){event.preventDefault();choose(options[Math.max(activeIndex,0)]?.dataset.personPickerId);}});
    results.addEventListener('pointerdown',event=>{const option=event.target.closest('[data-person-picker-id]');if(!option)return;event.preventDefault();choose(option.dataset.personPickerId);});
    results.addEventListener('click',event=>{const option=event.target.closest('[data-person-picker-id]');if(option&&select.value!==option.dataset.personPickerId)choose(option.dataset.personPickerId);});
    picker.querySelector('.person-picker-clear').addEventListener('click',()=>{choose('');input.focus();show();});input.addEventListener('blur',()=>setTimeout(()=>{close();input.value=personPickerLabel(select.value);},300));
  }
  function enhancePersonPickers(excludeId=''){document.querySelectorAll('select[data-person-picker]').forEach(select=>enhancePersonPicker(select,excludeId));}
  function field(label,id,value='',wide=false,type='text',help=''){return `<label class="field${wide?' full':''}"><span>${esc(label)}</span>${type==='textarea'?`<textarea id="${id}">${esc(value)}</textarea>`:`<input id="${id}" type="${type}" value="${esc(value)}">`}${help?`<small class="field-help">${esc(help)}</small>`:''}</label>`;}
  function renderPersonEditor(id){
    const isNew=id==='ny'; const p=isNew?{name:'',branch:'shared',status:'working',parents:[],isLiving:true,visibility:'family'}:state.people[id]; if(!p){navigate('people');return;}
    const title=isNew?'Ny person':p.name;
    ui.content.innerHTML=`<div class="editor-page">${heading(title,isNew?'Skapa en ny person med ett stabilt internt ID.':'Uppdatera personens samlade arkivuppgifter.',`<button class="secondary-button" data-go="people">${icon('arrow-left')} Till registret</button>`)}<form id="personForm" class="editor-layout"><div class="editor-card">
      <section class="editor-section"><h2>Grunduppgifter</h2><p>Huvudnamnet används i rubriker, register och länkar. Tidigare huvudnamn bevaras automatiskt så att äldre hänvisningar fortsätter fungera.</p><div class="form-grid">${field('Huvudnamn','fName',p.name)}${field('Sekundära namn','fAliases',aliasText(p,'person'),true,'textarea','Ett namn per rad, exempelvis äldre stavning, flicknamn eller tilltalsnamn.')}${field('Roll eller relation','fRole',p.role||'')}${field('Huvudplats eller gård','fPlace',p.place||'')}${field('Född','fBorn',p.born||'')}${field('Avliden','fDied',p.died||'')}<label class="field"><span>Släktled</span><select id="fBranch"><option value="mother"${p.branch==='mother'?' selected':''}>Bengtsson-ledet</option><option value="father"${p.branch==='father'?' selected':''}>Nilsson-ledet</option><option value="shared"${!['mother','father'].includes(p.branch)?' selected':''}>Gemensamt</option></select></label><label class="field"><span>Bevisstatus</span><select id="fStatus"><option value="confirmed"${p.status==='confirmed'?' selected':''}>Bekräftat</option><option value="likely"${p.status==='likely'?' selected':''}>Starkt sannolikt</option><option value="working"${p.status==='working'?' selected':''}>Arbetsantagande</option><option value="open"${p.status==='open'?' selected':''}>Öppet spår</option></select></label><label class="field"><span>Direkt led till Axel</span><select id="fDirect"><option value="yes"${p.direct?' selected':''}>Ja</option><option value="no"${!p.direct?' selected':''}>Nej</option></select></label><label class="field"><span>Levnadsstatus</span><select id="fLiving"><option value="yes"${p.isLiving?' selected':''}>Levande</option><option value="no"${!p.isLiving?' selected':''}>Avliden</option></select></label><label class="field full"><span>Synlighet</span><select id="fVisibility"><option value="family"${p.visibility==='family'?' selected':''}>Endast inloggad familj</option><option value="public"${p.visibility==='public'?' selected':''}>Offentlig</option><option value="private"${p.visibility==='private'?' selected':''}>Privat för redaktionen</option></select></label></div></section>
      <section class="editor-section"><h2>Relationer</h2><p>Sök på namn, sekundärt namn, födelseår eller plats. Relationerna sparas med personernas interna ID och påverkas därför inte av namnändringar. När du lägger till ett barn eller syskon kopplas relationen automatiskt åt båda håll.</p><div class="form-grid"><label class="field"><span>Förälder 1</span><select id="fParent1" data-person-picker>${personOptions(p.parents?.[0])}</select></label><label class="field"><span>Förälder 2</span><select id="fParent2" data-person-picker>${personOptions(p.parents?.[1])}</select></label><label class="field full"><span>Make eller maka</span><select id="fPartner" data-person-picker>${personOptions(p.partner||'')}</select></label><label class="field"><span>${isNew?'Befintligt barn':'Lägg till barn'}</span><select id="fChild" data-person-picker>${personOptions()}</select><small class="field-help">${p.children?.length?`${p.children.length} barn finns redan kopplade. `:''}Personen placeras som förälder ovanför barnets familjekort.</small></label><label class="field"><span>${isNew?'Befintligt syskon':'Lägg till syskon'}</span><select id="fSibling" data-person-picker>${personOptions()}</select><small class="field-help">${p.siblings?.length?`${p.siblings.length} syskon finns redan kopplade. `:''}Personen placeras bredvid syskonet och ärver dess kända föräldragren.</small></label></div></section>
      <section class="editor-section"><h2>Berättelse och källor</h2><p>En uppgift per rad. Datum i livslinjen skrivs som datum: notering.</p><div class="form-grid">${field('Livshistoria','fStory',(p.story||[]).join('\n'),true,'textarea')}${field('Livslinje','fTimeline',pairText(p.timeline),true,'textarea')}${field('Fakta','fFacts',pairText(p.facts),true,'textarea')}${field('Källor','fSources',(p.sources||[]).map(x=>typeof x==='string'?x:x.text||x.citation||'').filter(Boolean).join('\n'),true,'textarea')}${field('Osäkerheter och öppna spår','fUncertainties',(p.uncertainties||[]).join('\n'),true,'textarea')}</div></section>
      <section class="editor-section"><h2>Bilder</h2><p>Välj personens profilbild och samla porträtt, familjefoton och dokumentbilder i galleriet.</p>${profileImageEditor(id,p,isNew)}${galleryEditor('person',id,p,isNew)}</section></div>
      <aside class="editor-side"><div class="save-card"><h3>Spara</h3><p class="save-note">${canReview()?'Ändringen publiceras direkt och registreras i historiken.':'Ändringen skickas till en redaktör för granskning innan den publiceras.'} Utkastet sparas automatiskt i den här fliken medan du arbetar.</p><button class="primary-button" type="submit">${canReview()?'Publicera ändring':'Skicka för granskning'}</button></div>${!isNew?`<div class="save-card"><h3>Publik sida</h3><a class="secondary-button" href="${esc(publicUrl('person',p))}">${icon('external-link')} Öppna personsida</a></div><div class="save-card danger-zone"><h3>Ta bort person</h3><p class="save-note">${canReview()?'Personen tas bort från webbplatsen och alla familjekopplingar städas.':'En begäran skickas till en redaktör för godkännande.'}</p><button class="danger-button" type="button" data-delete-entity="person" data-entity-id="${esc(id)}" data-entity-name="${esc(p.name)}">${icon('trash-2')} Ta bort person</button></div>`:''}</aside></form></div>`;
    const form=document.getElementById('personForm');
    restoreEditorDraft(form,'person',id);
    refreshRestoredMedia(form);
    enhancePersonPickers(isNew?'':id);
    form.addEventListener('submit',event=>savePerson(event,id,p));
  }

  async function savePerson(event,id,current){
    event.preventDefault(); const button=event.submitter; button.disabled=true;
    const name=document.getElementById('fName').value.trim(); if(!name){toast('Personen behöver ett namn.',true);button.disabled=false;return;}
    const isNew=id==='ny'; const finalId=isNew?entityId('person'):id;
    let relations;
    try{relations=personRelations(current,isNew?'':id);}
    catch(error){toast(error.message,true);button.disabled=false;return;}
    const aliases=editedAliases(val('fAliases'),name,current);const direct=val('fDirect')==='yes';const payload={...clone(current),name,slug:current.slug||uniqueSlug('person',name),aliases,alt:aliases.join(' / '),formerNames:formerNames(current,name),role:val('fRole'),place:val('fPlace'),born:val('fBorn'),died:val('fDied'),branch:relations.branch,status:val('fStatus'),direct,isLiving:val('fLiving')==='yes',visibility:val('fVisibility'),parents:relations.parentIds,children:relations.childIds,siblings:relations.siblingIds,partner:relations.partnerId,story:rows(val('fStory')),timeline:pairs(val('fTimeline')),facts:pairs(val('fFacts')),sources:rows(val('fSources')),uncertainties:rows(val('fUncertainties')),photo:val('fPhoto'),photoCrop:profileCropValue(),images:images(val('fImages'))};
    const currentUnit=unitForPerson(finalId);
    const missingParentPlacement=relations.parentIds.some(parentId=>{const parentUnit=unitForPerson(parentId);return !currentUnit||!parentUnit||!(parentUnit.children||[]).includes(currentUnit.id);});
    const hasNewTreeRelation=isNew||relations.childId||relations.siblingId||missingParentPlacement||relations.parentIds.some(parentId=>!(current.parents||[]).includes(parentId))||(relations.partnerId&&relations.partnerId!==current.partner);
    if(hasNewTreeRelation)payload.treePlacement=personTreePlacement(finalId,relations,direct);
    try{const result=await window.FamilyData.submitChange('person',finalId,payload,isNew?'create':'update');clearEditorDraft(event.currentTarget);toast(result.mode==='published'?publishedMessage('Personen',payload.visibility):'Ändringen är skickad för granskning.');await refreshData();navigate('people',result.mode==='published'?finalId:null);}catch(error){toast(error.message||'Ändringen kunde inte sparas.',true);}finally{button.disabled=false;}
  }

  function renderPlaceEditor(id){
    const isNew=id==='ny'; const p=isNew?{name:'',aliases:[],story:[],visibility:'public'}:state.places.find(row=>row.id===id); if(!p){navigate('places');return;}
    ui.content.innerHTML=`<div class="editor-page">${heading(isNew?'Ny plats':p.name,isNew?'Skapa ett nytt gårds- eller platskort.':'Samla platsens historia och geografiska uppgifter.',`<button class="secondary-button" data-go="places">${icon('arrow-left')} Till registret</button>`)}<form id="placeForm" class="editor-layout"><div class="editor-card">
      <section class="editor-section"><h2>Grunduppgifter</h2><p>Huvudnamnet används i rubriker, register och länkar. Tidigare huvudnamn bevaras automatiskt.</p><div class="form-grid">${field('Huvudnamn','fName',p.name)}${field('Område','fArea',p.area||'')}${field('Latitud','fLat',p.lat??'',false,'text')}${field('Longitud','fLng',p.lng??'',false,'text')}${field('Sekundära namn','fAliases',aliasText(p),true,'textarea','Ett namn per rad, exempelvis äldre stavning eller annan gårdsbeteckning.')}<label class="field full"><span>Synlighet</span><select id="fVisibility"><option value="public"${p.visibility==='public'?' selected':''}>Offentlig</option><option value="family"${p.visibility==='family'?' selected':''}>Endast inloggad familj</option><option value="private"${p.visibility==='private'?' selected':''}>Privat för redaktionen</option></select></label></div></section>
      <section class="editor-section"><h2>Platsens historia</h2><p>Sammanfatta platsen först och bygg därefter ut berättelse och tidslinje.</p><div class="form-grid">${field('Kort sammanfattning','fNote',p.note||'',true,'textarea')}${field('Historia','fStory',(p.story||[]).join('\n'),true,'textarea')}${field('Tidslinje','fTimeline',pairText(p.timeline),true,'textarea')}${field('Källor','fSources',(p.sources||[]).map(x=>typeof x==='string'?x:x.text||x.citation||'').filter(Boolean).join('\n'),true,'textarea')}${field('Osäkerheter och öppna spår','fUncertainties',(p.uncertainties||[]).join('\n'),true,'textarea')}</div></section>
      <section class="editor-section"><h2>Bilder och sidhuvud</h2><p>Samla gårdsbilder, kartor och dokument med tydliga bildtexter. En liggande galleribild kan användas som platsens omslag.</p>${coverImageEditor(id,p,isNew)}${galleryEditor('place',id,p,isNew)}</section></div>
      <aside class="editor-side"><div class="save-card"><h3>Spara</h3><p class="save-note">${canReview()?'Platskortet publiceras direkt.':'Platskortet skickas för granskning.'} Utkastet sparas automatiskt i den här fliken medan du arbetar.</p><button class="primary-button" type="submit">${canReview()?'Publicera ändring':'Skicka för granskning'}</button></div>${!isNew?`<div class="save-card"><h3>Publik sida</h3><a class="secondary-button" href="${esc(publicUrl('place',p))}">${icon('external-link')} Öppna platssida</a></div><div class="save-card danger-zone"><h3>Ta bort plats</h3><p class="save-note">${canReview()?'Platsen tas bort från webbplatsen. Personernas historiska fritext bevaras.':'En begäran skickas till en redaktör för godkännande.'}</p><button class="danger-button" type="button" data-delete-entity="place" data-entity-id="${esc(id)}" data-entity-name="${esc(p.name)}">${icon('trash-2')} Ta bort plats</button></div>`:''}</aside></form></div>`;
    const form=document.getElementById('placeForm');
    restoreEditorDraft(form,'place',id);
    refreshRestoredMedia(form);
    form.addEventListener('submit',event=>savePlace(event,id,p));
  }
  async function savePlace(event,id,current){
    event.preventDefault();const button=event.submitter;button.disabled=true;const name=val('fName');if(!name){toast('Platsen behöver ett namn.',true);button.disabled=false;return;}
    const lat=val('fLat'),lng=val('fLng');if((lat&&!lng)||(!lat&&lng)||Number.isNaN(Number(lat))||Number.isNaN(Number(lng))){toast('Fyll i både latitud och longitud med giltiga tal.',true);button.disabled=false;return;}
    const isNew=id==='ny',finalId=isNew?entityId('place'):id;const payload={...clone(current),id:finalId,name,slug:current.slug||uniqueSlug('place',name),area:val('fArea'),visibility:val('fVisibility'),aliases:editedAliases(val('fAliases'),name,current),formerNames:formerNames(current,name),note:val('fNote'),story:rows(val('fStory')),timeline:pairs(val('fTimeline')),sources:rows(val('fSources')),uncertainties:rows(val('fUncertainties')),coverImage:val('fCoverImage'),images:images(val('fImages'))};if(lat){payload.lat=Number(lat);payload.lng=Number(lng);}else{delete payload.lat;delete payload.lng;}
    try{const result=await window.FamilyData.submitChange('place',finalId,payload,isNew?'create':'update');clearEditorDraft(event.currentTarget);toast(result.mode==='published'?publishedMessage('Platsen',payload.visibility):'Platsen är skickad för granskning.');await refreshData();navigate('places',result.mode==='published'?finalId:null);}catch(error){toast(error.message||'Platsen kunde inte sparas.',true);}finally{button.disabled=false;}
  }
  function val(id){return document.getElementById(id)?.value.trim()||'';}

  function renderChanges(){
    const changes=state.overview.changes;
    ui.content.innerHTML=heading('Ändringar',canReview()?'Granska bidrag och följ vad som har publicerats.':'Följ statusen för dina inskickade ändringar.')+`<section class="panel-card"><div class="panel-head"><h2>${changes.length} registrerade ändringar</h2></div><div class="panel-body activity-list">${changes.map(row=>activity(row,canReview())).join('')||'<div class="empty-state">Inga ändringar finns ännu.</div>'}</div></section>`;
  }
  function renderMembers(){
    if(!canManageUsers()){navigate('dashboard');return;}
    ui.content.innerHTML=heading('Användare','Hantera vilka familjemedlemmar som får bidra, publicera och administrera.')+`<div class="table-shell"><table class="data-table"><thead><tr><th>Familjemedlem</th><th>Roll</th><th>Registrerad</th></tr></thead><tbody>${state.overview.profiles.map(profile=>`<tr><td><strong>${esc(profile.display_name||'Namnlös användare')}</strong></td><td data-label="Roll"><select data-member-role="${esc(profile.id)}"><option value="contributor"${profile.role==='contributor'?' selected':''}>Bidragsgivare</option><option value="editor"${profile.role==='editor'?' selected':''}>Redaktör</option><option value="admin"${profile.role==='admin'?' selected':''}>Administratör</option></select></td><td data-label="Registrerad">${new Date(profile.created_at).toLocaleDateString('sv-SE')}</td></tr>`).join('')}</tbody></table></div>`;
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
  async function handleDelete(button){
    const type=button.dataset.deleteEntity,id=button.dataset.entityId,name=button.dataset.entityName||'posten';
    const noun=type==='person'?'personen':'platsen';
    const consequence=canReview()
      ? `Detta tar bort ${noun} från webbplatsen. Åtgärden kan inte ångras från adminpanelen.`
      : `Detta skickar en begäran om att ta bort ${noun} till en redaktör.`;
    if(!window.confirm(`Vill du ta bort ${name}?\n\n${consequence}`))return;
    button.disabled=true;
    try{
      const result=await window.FamilyData.deleteArchiveEntity(type,id,{name});
      clearEditorDraft(button.closest('form'));
      navigate(type==='person'?'people':'places');
      if(result.mode==='published')await refreshData();
      toast(result.mode==='published'?`${name} är borttagen från webbplatsen.`:'Begäran om borttagning är skickad för granskning.');
    }catch(error){toast(error.message||'Posten kunde inte tas bort.',true);button.disabled=false;}
  }
  function bind(){
    document.getElementById('adminLoginForm').addEventListener('submit',async event=>{event.preventDefault();const message=document.getElementById('loginMessage'),button=event.submitter||event.currentTarget.querySelector('[type="submit"]');message.textContent='Loggar in...';button.disabled=true;try{await window.FamilyData.signInWithPassword(document.getElementById('adminEmail').value.trim(),document.getElementById('adminPassword').value);message.textContent='';}catch(error){message.textContent=error.message||'Inloggningen misslyckades.';}finally{button.disabled=false;}});
    document.getElementById('forgotPassword').addEventListener('click',async event=>{const email=document.getElementById('adminEmail').value.trim(),message=document.getElementById('loginMessage');if(!email){message.textContent='Fyll i din e-postadress först.';document.getElementById('adminEmail').focus();return;}event.currentTarget.disabled=true;message.textContent='Skickar återställningslänk...';try{await window.FamilyData.sendPasswordReset(email);message.textContent='Ett mejl har skickats. Följ länken för att välja lösenord.';}catch(error){message.textContent=error.message||'Länken kunde inte skickas.';}finally{event.currentTarget.disabled=false;}});
    document.getElementById('passwordRecoveryForm').addEventListener('submit',async event=>{event.preventDefault();const password=document.getElementById('newPassword').value,confirm=document.getElementById('newPasswordConfirm').value,message=document.getElementById('passwordMessage'),button=event.submitter||event.currentTarget.querySelector('[type="submit"]');if(password!==confirm){message.textContent='Lösenorden är inte likadana.';return;}button.disabled=true;message.textContent='Sparar lösenord...';try{await window.FamilyData.updatePassword(password);message.textContent='';toast('Lösenordet är sparat.');}catch(error){message.textContent=error.message||'Lösenordet kunde inte sparas.';}finally{button.disabled=false;}});
    document.getElementById('adminSignOut').addEventListener('click',()=>window.FamilyData.signOut());
    document.getElementById('refreshButton').addEventListener('click',()=>refreshData(true));
    const closeMenu=()=>document.getElementById('sidebar').classList.remove('open');
    document.getElementById('menuButton').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
    document.getElementById('sidebarScrim').addEventListener('click',closeMenu);
    document.addEventListener('click',event=>{
      const nav=event.target.closest('[data-route]');if(nav){event.preventDefault();navigate(nav.dataset.route);closeMenu();return;}
      const go=event.target.closest('[data-go]');if(go){navigate(go.dataset.go);return;}
      const create=event.target.closest('[data-create]');if(create){navigate(create.dataset.create==='person'?'people':'places','ny');return;}
      const person=event.target.closest('[data-edit-person]');if(person){navigate('people',person.dataset.editPerson);return;}
      const place=event.target.closest('[data-edit-place]');if(place){navigate('places',place.dataset.editPlace);return;}
      const review=event.target.closest('[data-review]');if(review){handleReview(review);return;}
      const deleteEntity=event.target.closest('[data-delete-entity]');if(deleteEntity){handleDelete(deleteEntity);return;}
      const removeImage=event.target.closest('[data-gallery-remove]');if(removeImage){const manager=removeImage.closest('[data-gallery-manager]'),source=manager.querySelector('[data-gallery-source]'),items=images(source.value),removed=items[Number(removeImage.dataset.galleryRemove)],cover=document.getElementById('fCoverImage');items.splice(Number(removeImage.dataset.galleryRemove),1);source.value=imageText(items);if(cover&&removed?.src===cover.value){cover.value='';setCoverPreview('');}refreshGalleryManager(manager);return;}
      const profileImage=event.target.closest('[data-gallery-profile]');if(profileImage){const manager=profileImage.closest('[data-gallery-manager]'),item=images(manager.querySelector('[data-gallery-source]').value)[Number(profileImage.dataset.galleryProfile)],field=document.getElementById('fPhoto'),profileManager=document.querySelector('[data-profile-manager]');if(item&&field){field.value=item.src;setProfilePreview(profileManager,item.src);toast('Bilden används som profilbild när du sparar posten.');}return;}
      const coverImage=event.target.closest('[data-gallery-cover]');if(coverImage){const manager=coverImage.closest('[data-gallery-manager]'),item=images(manager.querySelector('[data-gallery-source]').value)[Number(coverImage.dataset.galleryCover)],field=document.getElementById('fCoverImage');if(item&&field){field.value=item.src;setCoverPreview(item.src);refreshGalleryManager(manager);toast('Bilden används som omslag när du sparar platsen.');}return;}
      const uploadImage=event.target.closest('[data-gallery-upload]');if(uploadImage){uploadGalleryImages(uploadImage);return;}
      const uploadProfile=event.target.closest('[data-profile-upload]');if(uploadProfile){uploadProfileImage(uploadProfile);return;}
      const uploadCover=event.target.closest('[data-cover-upload]');if(uploadCover){uploadCoverImage(uploadCover);return;}
      const resetCrop=event.target.closest('[data-profile-crop-reset]');if(resetCrop){resetProfileCrop(resetCrop);return;}
      const removeProfile=event.target.closest('[data-profile-remove]');if(removeProfile){const manager=removeProfile.closest('[data-profile-manager]'),field=document.getElementById('fPhoto');if(field)field.value='';setProfilePreview(manager,'');removeProfile.remove();manager.querySelector('[data-profile-state]').textContent='Profilbilden tas bort när du sparar personen.';return;}
      const removeCover=event.target.closest('[data-cover-remove]');if(removeCover){const field=document.getElementById('fCoverImage'),gallery=document.querySelector('[data-gallery-manager][data-entity-type="place"]');if(field)field.value='';setCoverPreview('');if(gallery)refreshGalleryManager(gallery);return;}
    });
    document.addEventListener('input',event=>{if(event.target.matches('[data-gallery-caption]'))updateGalleryCaption(event.target);else if(event.target.matches('[data-gallery-source]'))refreshGalleryManager(event.target.closest('[data-gallery-manager]'));else if(event.target.matches('[data-profile-url]'))setProfilePreview(event.target.closest('[data-profile-manager]'),event.target.value.trim());else if(event.target.matches('[data-profile-crop]'))updateProfileCrop(event.target.closest('[data-profile-manager]'));else if(event.target.matches('[data-cover-url]')){setCoverPreview(event.target.value.trim());const gallery=document.querySelector('[data-gallery-manager][data-entity-type="place"]');if(gallery)refreshGalleryManager(gallery);}if(event.target.closest('#personForm,#placeForm'))scheduleEditorDraft();});
    document.addEventListener('change',event=>{if(event.target.matches('[data-profile-file]'))previewProfileFile(event.target);else if(event.target.matches('[data-cover-file]'))previewCoverFile(event.target);else if(event.target.matches('[data-gallery-file]'))updateGalleryFileSummary(event.target);if(event.target.closest('#personForm,#placeForm'))scheduleEditorDraft();});
    document.addEventListener('change',async event=>{const select=event.target.closest('[data-member-role]');if(!select)return;select.disabled=true;try{await window.FamilyData.updateMemberRole(select.dataset.memberRole,select.value);toast('Användarens roll är uppdaterad.');await refreshData();}catch(error){toast(error.message||'Rollen kunde inte ändras.',true);}finally{select.disabled=false;}});
    addEventListener('popstate',renderRoute);addEventListener('hashchange',renderRoute);addEventListener('pagehide',saveActiveEditorDraft);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveActiveEditorDraft();});
    document.addEventListener('family-auth-change',event=>showAuth(event.detail));
    icons();
  }
  bind(); showAuth(window.FamilyData?.status?.()||{});
})();
