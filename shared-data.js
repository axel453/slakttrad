(function(){
  const config = window.FAMILY_ARCHIVE_CONFIG || {};
  const state = {client:null,user:null,profile:null,connected:false};

  function configured(){
    return Boolean(config.supabaseUrl && config.supabasePublishableKey && window.supabase?.createClient);
  }
  function emit(name, detail){ document.dispatchEvent(new CustomEvent(name,{detail})); }
  function contentFromRow(row){ return {...(row.content || {}), name:row.name, slug:row.slug}; }

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
      people:Object.fromEntries((peopleResult.data || []).map(row=>[row.id,{
        ...contentFromRow(row), alt:row.alt_name || row.content?.alt || '', branch:row.branch,
        direct:row.is_direct, isLiving:row.is_living, visibility:row.visibility
      }])),
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
    state.client.auth.onAuthStateChange(async (_event, sessionValue)=>{
      state.user = sessionValue?.user || null;
      await refreshProfile();
      emit('family-auth-change',status());
    });
    try{
      const snapshot = await loadSnapshot();
      state.connected = true;
      emit('family-data-ready',snapshot);
      emit('family-data-status',{mode:'shared',message:'Ansluten till familjearkivet'});
    }catch(error){
      emit('family-data-status',{mode:'error',message:'Kunde inte läsa familjearkivet',error});
    }
    emit('family-auth-change',status());
  }

  function status(){
    return {configured:configured(),connected:state.connected,user:state.user,profile:state.profile};
  }
  async function sendMagicLink(email){
    if(!state.client) throw new Error('Databasen är inte ansluten ännu.');
    const redirectTo = location.protocol === 'file:' ? undefined : `${location.origin}${location.pathname}`;
    const {error} = await state.client.auth.signInWithOtp({email,options:redirectTo ? {emailRedirectTo:redirectTo} : {}});
    if(error) throw error;
  }
  async function signOut(){ if(state.client) await state.client.auth.signOut(); }

  async function submitChange(entityType, entityId, payload, operation='update'){
    if(!state.client || !state.user) return {mode:'local'};
    const role = state.profile?.role || 'contributor';
    if(role === 'editor' || role === 'admin'){
      if(entityType === 'person'){
        const row = {
          id:entityId, slug:payload.slug || entityId.replaceAll('_','-'), name:payload.name,
          alt_name:payload.alt || null, branch:payload.branch || 'shared', is_direct:!!payload.direct,
          is_living:!!payload.isLiving, visibility:payload.visibility || 'public', content:payload,
          updated_by:state.user.id
        };
        const {error} = await state.client.from('people').upsert(row); if(error) throw error;
      }else if(entityType === 'place'){
        const row = {
          id:entityId, slug:payload.slug || entityId.replaceAll('_','-'), name:payload.name,
          area:payload.area || null, latitude:payload.lat ?? null, longitude:payload.lng ?? null,
          visibility:payload.visibility || 'public', content:payload, updated_by:state.user.id
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

  window.FamilyData = {init,status,loadSnapshot,sendMagicLink,signOut,submitChange};
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

