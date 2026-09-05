(function(){
  const config = window.FAMILY_ARCHIVE_CONFIG || {};
  const state = {client:null,user:null,profile:null,connected:false,passwordRecovery:false,lastSnapshotAt:0,refreshPromise:null};

  function configured(){
    return Boolean(config.supabaseUrl && config.supabasePublishableKey && window.supabase?.createClient);
  }
  function emit(name, detail){ document.dispatchEvent(new CustomEvent(name,{detail})); }
  function contentFromRow(row){ return {...(row.content || {}), name:row.name, slug:row.slug}; }
  function uniqueNames(values, primaryName=''){
    const primaryKey = String(primaryName || '').trim().toLocaleLowerCase('sv');
    const seen = new Set();
    return values.flatMap(value=>Array.isArray(value) ? value : [value]).map(value=>String(value || '').trim()).filter(value=>{
      const key = value.toLocaleLowerCase('sv');
      if(!key || key === primaryKey || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function personAliases(row){
    const explicit = Array.isArray(row.content?.aliases) ? row.content.aliases : [];
    return uniqueNames(explicit.length ? explicit : [row.alt_name || row.content?.alt || ''], row.name);
  }

  async function loadSnapshot(){
    if(!state.client) return null;
    const [peopleResult, placesResult, unitsResult] = await Promise.all([
      state.client.from('people').select('id,name,slug,alt_name,branch,is_direct,is_living,visibility,content'),
      state.client.from('places').select('id,name,slug,area,latitude,longitude,visibility,content'),
      state.client.from('family_units').select('id,generation,branch,person_ids,child_unit_ids,content')
    ]);
    const error = peopleResult.error || placesResult.error || unitsResult.error;
    if(error) throw error;
    return {
      people:Object.fromEntries((peopleResult.data || []).map(row=>{
        const aliases = personAliases(row);
        return [row.id,{
          ...contentFromRow(row), aliases, alt:aliases.join(' / '), branch:row.branch,
          direct:row.is_direct, isLiving:row.is_living, visibility:row.visibility
        }];
      })),
      places:(placesResult.data || []).map(row=>({
        ...contentFromRow(row), id:row.id, area:row.area || row.content?.area || '',
        ...(row.latitude == null ? {} : {lat:row.latitude}), ...(row.longitude == null ? {} : {lng:row.longitude}),
        visibility:row.visibility
      })),
      units:(unitsResult.data || []).map(row=>({
        ...(row.content || {}), id:row.id, gen:row.generation, branch:row.branch,
        persons:row.person_ids || [], children:row.child_unit_ids || []
      }))
    };
  }

  async function refreshSnapshot(){
    if(!state.client) return null;
    if(state.refreshPromise) return state.refreshPromise;
    state.refreshPromise = loadSnapshot().then(snapshot=>{
      state.connected = true;
      state.lastSnapshotAt = Date.now();
      emit('family-data-ready',snapshot);
      return snapshot;
    }).finally(()=>{ state.refreshPromise = null; });
    return state.refreshPromise;
  }

  function refreshWhenActive(){
    if(document.visibilityState === 'hidden' || Date.now() - state.lastSnapshotAt < 5000) return;
    refreshSnapshot().catch(error=>{
      emit('family-data-status',{mode:'error',message:'Kunde inte uppdatera familjearkivet',error});
    });
  }

  async function refreshProfile(){
    if(!state.user){ state.profile = null; return; }
    const {data} = await state.client.from('profiles').select('display_name,role').eq('id',state.user.id).maybeSingle();
    state.profile = data || {display_name:state.user.email,role:'contributor'};
  }

  async function init(){
    if(!configured()){
      emit('family-data-status',{mode:'local',message:'Lokalt läge'});
      return;
    }
    state.client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
    const {data:{session}} = await state.client.auth.getSession();
    state.user = session?.user || null;
    await refreshProfile();
    state.client.auth.onAuthStateChange(async (authEvent, sessionValue)=>{
      state.user = sessionValue?.user || null;
      if(authEvent === 'PASSWORD_RECOVERY') state.passwordRecovery = true;
      if(authEvent === 'SIGNED_OUT') state.passwordRecovery = false;
      await refreshProfile();
      if(authEvent === 'SIGNED_IN' || authEvent === 'USER_UPDATED'){
        try{ await refreshSnapshot(); }catch{}
      }
      emit('family-auth-change',status());
    });
    try{
      await refreshSnapshot();
      emit('family-data-status',{mode:'shared',message:'Ansluten till familjearkivet'});
    }catch(error){
      emit('family-data-status',{mode:'error',message:'Kunde inte läsa familjearkivet',error});
    }
    emit('family-auth-change',status());
    window.addEventListener('focus',refreshWhenActive);
    window.addEventListener('pageshow',refreshWhenActive);
    document.addEventListener('visibilitychange',refreshWhenActive);
  }

  function status(){
    return {configured:configured(),connected:state.connected,user:state.user,profile:state.profile,passwordRecovery:state.passwordRecovery};
  }
  async function signInWithPassword(email,password){
    if(!state.client) throw new Error('Databasen är inte ansluten ännu.');
    const {error} = await state.client.auth.signInWithPassword({email,password});
    if(error) throw new Error('Fel användarnamn eller lösenord.');
  }
  async function sendPasswordReset(email){
    if(!state.client) throw new Error('Databasen är inte ansluten ännu.');
    const redirectTo = location.protocol === 'file:' ? undefined : `${location.origin}/admin/`;
    const options = redirectTo ? {redirectTo} : {};
    const {error} = await state.client.auth.resetPasswordForEmail(email,options);
    if(error) throw error;
  }
  async function updatePassword(password){
    if(!state.client || !state.user) throw new Error('Länken är inte längre giltig. Begär en ny återställningslänk.');
    const {error} = await state.client.auth.updateUser({password});
    if(error) throw error;
    state.passwordRecovery = false;
    emit('family-auth-change',status());
  }
  async function sendMagicLink(email){
    if(!state.client) throw new Error('Databasen är inte ansluten ännu.');
    const redirectTo = location.protocol === 'file:' ? undefined : `${location.origin}${location.pathname}`;
    const {error} = await state.client.auth.signInWithOtp({email,options:redirectTo ? {emailRedirectTo:redirectTo} : {}});
    if(error) throw error;
  }
  async function signOut(){ if(state.client) await state.client.auth.signOut(); }

  function safeMediaName(name){
    const parts = String(name || 'bild.jpg').split('.');
    const extension = parts.length > 1 ? `.${parts.pop().toLowerCase()}` : '';
    const stem = parts.join('.').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'bild';
    return `${stem}${extension}`;
  }

  async function uploadPublicImage(file, entityType, entityId, caption=''){
    if(!state.client || !state.user) throw new Error('Du behöver logga in först.');
    if(!['editor','admin'].includes(state.profile?.role)) throw new Error('En redaktör behöver publicera bilder i det offentliga galleriet.');
    if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Välj en bild i JPG-, PNG- eller WebP-format.');
    if(file.size > 15 * 1024 * 1024) throw new Error('Bilden får vara högst 15 MB.');
    if(!['person','place'].includes(entityType) || !entityId) throw new Error('Bilden behöver kopplas till en person eller gård.');
    const token = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `${state.user.id}/${entityType}/${entityId}/${token}-${safeMediaName(file.name)}`;
    const bucket = state.client.storage.from('family-public-media');
    const {error:uploadError} = await bucket.upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
    if(uploadError) throw uploadError;
    const {data:urlData} = bucket.getPublicUrl(path);
    const mediaRow = {
      storage_path:`family-public-media/${path}`,caption:caption || null,visibility:'public',publish_status:'published',uploaded_by:state.user.id,
      ...(entityType === 'person' ? {person_id:entityId} : {place_id:entityId})
    };
    const {error:metadataError} = await state.client.from('media').insert(mediaRow);
    if(metadataError){
      await bucket.remove([path]);
      throw metadataError;
    }
    return {src:urlData.publicUrl,caption:caption || '',storagePath:mediaRow.storage_path};
  }

  async function loadAdminOverview(){
    if(!state.client || !state.user) throw new Error('Du behöver logga in först.');
    const role = state.profile?.role || 'contributor';
    const ownOnly = role === 'contributor';
    let changesQuery = state.client
      .from('change_requests')
      .select('id,entity_type,entity_id,operation,status,proposed_data,review_note,created_at,reviewed_at,submitted_by')
      .order('created_at',{ascending:false})
      .limit(100);
    if(ownOnly) changesQuery = changesQuery.eq('submitted_by',state.user.id);
    const requests = [changesQuery];
    if(role === 'editor' || role === 'admin'){
      requests.push(state.client.from('revisions').select('id,entity_type,entity_id,action,changed_by,created_at').order('created_at',{ascending:false}).limit(40));
    }
    if(role === 'admin'){
      requests.push(state.client.from('profiles').select('id,display_name,role,created_at,updated_at').order('display_name'));
    }
    const results = await Promise.all(requests);
    const error = results.find(result=>result.error)?.error;
    if(error) throw error;
    return {
      changes:results[0].data || [],
      revisions:(role === 'editor' || role === 'admin') ? (results[1]?.data || []) : [],
      profiles:role === 'admin' ? (results.at(-1)?.data || []) : []
    };
  }

  async function reviewChange(id,statusValue,note=''){
    if(!state.client || !state.user) throw new Error('Du behöver logga in först.');
    if(!['editor','admin'].includes(state.profile?.role)) throw new Error('Du saknar behörighet att granska ändringar.');
    if(!['approved','rejected'].includes(statusValue)) throw new Error('Ogiltig granskningsstatus.');
    const {data:request,error:loadError} = await state.client.from('change_requests').select('*').eq('id',id).single();
    if(loadError) throw loadError;
    if(statusValue === 'approved'){
      if(request.operation === 'delete'){
        const table = request.entity_type === 'person' ? 'people' : request.entity_type === 'place' ? 'places' : null;
        if(!table) throw new Error('Den här typen av radering stöds inte ännu.');
        const {error:deleteError} = await state.client.from(table).delete().eq('id',request.entity_id);
        if(deleteError) throw deleteError;
      }else{
        await submitChange(request.entity_type,request.entity_id,request.proposed_data,request.operation);
      }
    }
    const {error} = await state.client.from('change_requests').update({
      status:statusValue,reviewed_by:state.user.id,reviewed_at:new Date().toISOString(),review_note:note || null
    }).eq('id',id);
    if(error) throw error;
  }

  async function updateMemberRole(id,role){
    if(!state.client || state.profile?.role !== 'admin') throw new Error('Endast administratörer kan ändra roller.');
    if(!['contributor','editor','admin'].includes(role)) throw new Error('Ogiltig roll.');
    const {error} = await state.client.from('profiles').update({role}).eq('id',id);
    if(error) throw error;
  }

  async function submitChange(entityType, entityId, payload, operation='update'){
    if(!state.client || !state.user) return {mode:'local'};
    const role = state.profile?.role || 'contributor';
    if(role === 'editor' || role === 'admin'){
      if(entityType === 'person'){
        const aliases = uniqueNames(payload.aliases || payload.alt || [],payload.name);
        const content = {...payload,aliases,alt:aliases.join(' / ')};
        const row = {
          id:entityId, slug:payload.slug || entityId.replaceAll('_','-'), name:payload.name,
          alt_name:aliases.join(' / ') || null, branch:payload.branch || 'shared', is_direct:!!payload.direct,
          is_living:!!payload.isLiving, visibility:payload.visibility || 'public', content,
          updated_by:state.user.id
        };
        const {error} = await state.client.from('people').upsert(row); if(error) throw error;
      }else if(entityType === 'place'){
        const content = {...payload,aliases:uniqueNames(payload.aliases || [],payload.name)};
        const row = {
          id:entityId, slug:payload.slug || entityId.replaceAll('_','-'), name:payload.name,
          area:payload.area || null, latitude:payload.lat ?? null, longitude:payload.lng ?? null,
          visibility:payload.visibility || 'public', content, updated_by:state.user.id
        };
        const {error} = await state.client.from('places').upsert(row); if(error) throw error;
      }
      return {mode:'published'};
    }
    const {error} = await state.client.from('change_requests').insert({
      entity_type:entityType, entity_id:entityId, operation, proposed_data:payload,
      submitted_by:state.user.id
    });
    if(error) throw error;
    return {mode:'pending'};
  }

  window.FamilyData = {init,status,loadSnapshot,refreshSnapshot,loadAdminOverview,signInWithPassword,sendPasswordReset,updatePassword,sendMagicLink,signOut,uploadPublicImage,submitChange,reviewChange,updateMemberRole};
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
