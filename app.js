/* ===================== PERSISTENCIA (IndexedDB) =====================
   Toda la "state" de la app (sondeos, paso actual, tema, etc.) se guarda
   en IndexedDB bajo una única clave. IndexedDB persiste en el dispositivo
   incluso cerrando la app o reiniciando el teléfono, y funciona 100%
   offline (no depende de red).
   Se incluye un fallback automático a localStorage por si IndexedDB no
   estuviera disponible (algunos modos de navegación privada). =========== */
const DB_NAME = 'sev-campo-db';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const STATE_KEY = 'app-state';

let _dbPromise = null;
function openDb(){
  if(_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject)=>{
    if(!('indexedDB' in window)){ resolve(null); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if(!db.objectStoreNames.contains(STORE_NAME)){
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=>{ console.warn('IndexedDB no disponible, se usará localStorage', req.error); resolve(null); };
  });
  return _dbPromise;
}

async function idbGet(key){
  const db = await openDb();
  if(!db) return undefined;
  return new Promise((resolve)=>{
    try{
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> resolve(undefined);
    }catch(e){ resolve(undefined); }
  });
}

async function idbSet(key, value){
  const db = await openDb();
  if(!db) return false;
  return new Promise((resolve)=>{
    try{
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = ()=> resolve(false);
    }catch(e){ resolve(false); }
  });
}

async function saveState(){
  // No persistimos overlayIds/drawerOpen/formValue transitorios como críticos,
  // pero se guardan igual para continuar exactamente donde quedó el usuario.
  const snapshot = {
    theme: state.theme,
    sevs: state.sevs,
    currentSevId: state.currentSevId,
    screen: (state.screen==='new') ? 'home' : state.screen, // no persistimos un draft a mitad de crear
    manualMode: state.manualMode,
    overlayIds: state.overlayIds
  };
  const ok = await idbSet(STATE_KEY, snapshot);
  if(!ok){
    try{ localStorage.setItem(STATE_KEY, JSON.stringify(snapshot)); }catch(e){ /* almacenamiento lleno o no disponible */ }
  }
}

let _saveTimer = null;
function scheduleSave(){
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveState, 250);
}

async function loadState(){
  let snap = await idbGet(STATE_KEY);
  if(!snap){
    try{
      const raw = localStorage.getItem(STATE_KEY);
      if(raw) snap = JSON.parse(raw);
    }catch(e){ /* ignore */ }
  }
  return snap || null;
}

/* ===================== DATOS BASE ===================== */
const AB2_LIST = [2,3,4,5,6,8,10,13,16,20,25,32,40,50,65,80,100,125,160,200,250,320,400,500];
const MN_SHAPES = { 0.5:'circle', 5:'square', 20:'triangle' };
const MN_COLORS_DARK  = { 0.5:'#5AA9E6', 5:'#3ED991', 20:'#FFB238' };
const MN_COLORS_FIELD = { 0.5:'#0A4A87', 5:'#0A6B38', 20:'#A85200' };
function mnColors(){ return state.theme==='field' ? MN_COLORS_FIELD : MN_COLORS_DARK; }
function chartPalette(){
  return state.theme==='field'
    ? { gridMajor:'#0A0D0A', gridMinor:'#B7BBAE', axisText:'#0A0D0A', axisLine:'#0A0D0A', dimText:'#33392F' }
    : { gridMajor:'#33424A', gridMinor:'#1E2A2F', axisText:'#6E8087', axisLine:'#455158', dimText:'#8FA0A6' };
}
function drawMarker(shape, x, y, r, color, opacity){
  if(shape==='square'){ const s=r*1.7; return `<rect x="${(x-s/2).toFixed(1)}" y="${(y-s/2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="${color}" opacity="${opacity}"/>`; }
  if(shape==='triangle'){ const s=r*2.1, h=s*0.87; return `<polygon points="${x.toFixed(1)},${(y-h*0.62).toFixed(1)} ${(x-s/2).toFixed(1)},${(y+h*0.38).toFixed(1)} ${(x+s/2).toFixed(1)},${(y+h*0.38).toFixed(1)}" fill="${color}" opacity="${opacity}"/>`; }
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
}

function buildSteps(){
  const steps = [];
  AB2_LIST.forEach(ab2=>{
    const mns = [];
    if(ab2 <= 65) mns.push(0.5);
    if(ab2 >= 50 && ab2 <= 250) mns.push(5);
    if(ab2 >= 200) mns.push(20);
    mns.sort((a,b)=>a-b).forEach(mn=> steps.push({ab2, mn2:mn, splice: mns.length>1}));
  });
  return steps;
}
const STEPS = buildSteps();

function kFactor(ab2, mn2){
  return Math.PI * (ab2*ab2 - mn2*mn2) / (2*mn2);
}

/* ===================== ESTADO ===================== */
let state = {
  screen:'home',           // home | list | new | carga
  theme:'dark',             // dark | field (alto contraste para sol)
  sevs: [],                 // { id, nombre, gps, historialGps, fecha, lecturas:{}, stepIndex }
  currentSevId: null,
  drawerOpen:false,
  manualMode:false,
  overlayIds: [],
  formValue:'',
  formI:'',
  formDV:'',
  newSevDraft:null
};

function uid(){ return 's'+Math.random().toString(36).slice(2,9); }
function fmtCoord(v){ return v.toFixed(5); }
function fmtGps(sev){ return sev.gps ? (fmtCoord(sev.gps.lat)+', '+fmtCoord(sev.gps.lon)) : 'sin GPS'; }
function nowStr(){
  const d = new Date();
  return d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}) + ' ' + d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
}

function currentSev(){ return state.sevs.find(s=>s.id===state.currentSevId); }

function lecturaKey(ab2,mn2){ return ab2+'_'+mn2; }

function sevProgress(sev){
  const total = STEPS.length;
  const done = Object.keys(sev.lecturas).length;
  return {done, total, pct: Math.round(done/total*100)};
}

/* ===================== GPS (real, navigator.geolocation) =====================
   Usa la API real del dispositivo. Funciona sin conexión a Internet: el GPS
   de hardware no requiere red (puede tardar más en obtener el primer fix
   sin asistencia de red, pero no falla por estar offline).
   Devuelve una Promise que resuelve con {lat, lon, prec, ts} o rechaza con
   un objeto {code, message} para que la UI pueda mostrar el error y ofrecer
   reintentar / continuar sin GPS. ============================================= */
function getGpsFix(opts){
  opts = opts || {};
  return new Promise((resolve, reject)=>{
    if(!('geolocation' in navigator)){
      reject({ code:'UNSUPPORTED', message:'Este dispositivo/navegador no soporta geolocalización.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          prec: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
          ts: pos.timestamp || Date.now()
        });
      },
      (err)=>{
        // err.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
        let code = 'UNKNOWN', message = 'No se pudo obtener la posición GPS.';
        if(err.code===1){ code='PERMISSION_DENIED'; message='Permiso de ubicación denegado. Habilitalo en los ajustes del navegador para capturar coordenadas GPS.'; }
        else if(err.code===2){ code='POSITION_UNAVAILABLE'; message='No se pudo determinar la posición (sin señal GPS). Podés reintentar o continuar sin GPS.'; }
        else if(err.code===3){ code='TIMEOUT'; message='Se agotó el tiempo de espera buscando señal GPS. Podés reintentar o continuar sin GPS.'; }
        reject({ code, message });
      },
      { enableHighAccuracy: true, timeout: opts.timeout || 15000, maximumAge: 0 }
    );
  });
}

/* ===================== RENDER ROOT ===================== */
function render(){
  const app = document.getElementById('app');
  app.className = state.theme==='field' ? 'theme-field' : '';
  app.innerHTML = '';
  if(state.screen==='home') app.appendChild(renderHome());
  else if(state.screen==='list') app.appendChild(renderList());
  else if(state.screen==='new') app.appendChild(renderNew());
  else if(state.screen==='carga') app.appendChild(renderCarga());
  scheduleSave();
}

/* ===================== TOAST ===================== */
function showToast(msg, ms){
  const app = document.getElementById('app');
  if(!app) return;
  const prev = app.querySelector('.toast');
  if(prev) prev.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  app.appendChild(t);
  requestAnimationFrame(()=> t.classList.add('show'));
  setTimeout(()=>{
    t.classList.remove('show');
    setTimeout(()=> t.remove(), 250);
  }, ms || 2600);
}

/* ===================== HOME ===================== */
function renderHome(){
  const el = document.createElement('div');
  el.className = 'screen home';
  el.innerHTML = `
    <div class="home-brand">
      <div class="mark">SEV · SCHLUMBERGER</div>
      <h1>Campo</h1>
      <p>Visualización y cálculo de resistividad — offline</p>
    </div>
    <div class="home-actions">
      <button class="btn-major primary" id="btnNuevo">
        <div>Nuevo SEV<small>Captura GPS y arranca la carga</small></div>
        <span class="chev">›</span>
      </button>
      <button class="btn-major" id="btnContinuar">
        <div>Continuar SEV<small>${state.sevs.length} guardado${state.sevs.length===1?'':'s'} en este dispositivo</small></div>
        <span class="chev">›</span>
      </button>
    </div>
    <div class="home-footer">ARES II · MODO CAMPO</div>
  `;
  el.querySelector('#btnNuevo').onclick = ()=>{ startNewSev(); };
  el.querySelector('#btnContinuar').onclick = ()=>{ state.screen='list'; render(); };
  return el;
}

/* ===================== LIST ===================== */
function renderList(){
  const el = document.createElement('div');
  el.className = 'screen';
  const overlayMode = state.overlayIds.length>0;
  el.innerHTML = `
    <div class="topbar">
      <div class="icon-btn" id="back">‹</div>
      <div class="topbar-title">Sondeos guardados<small>Tocá uno para continuar · mantené para comparar</small></div>
    </div>
    <div class="list-wrap" id="listWrap"></div>
    <div class="list-footer" id="listFooter"></div>
  `;
  const wrap = el.querySelector('#listWrap');
  if(state.sevs.length===0){
    wrap.innerHTML = `<div class="empty-hint">No hay sondeos todavía.<br>Tocá "Nuevo SEV" para empezar.</div>`;
  } else {
    state.sevs.slice().reverse().forEach(sev=>{
      const p = sevProgress(sev);
      const card = document.createElement('div');
      card.className = 'sev-card' + (p.pct===100?' done':'');
      const checked = state.overlayIds.includes(sev.id);
      card.innerHTML = `
        <div class="check-overlay ${checked?'on':''}" data-ov="${sev.id}">${checked?'✓':''}</div>
        <div class="dot"></div>
        <div class="sev-card-body">
          <div class="name">${sev.nombre}</div>
          <div class="meta">${sev.fecha} · ${fmtGps(sev)}</div>
        </div>
        <div class="pct">${p.done}/${p.total}</div>
      `;
      card.onclick = (e)=>{
        if(e.target.closest('[data-ov]')){
          const id = sev.id;
          const idx = state.overlayIds.indexOf(id);
          if(idx>=0) state.overlayIds.splice(idx,1); else state.overlayIds.push(id);
          render();
          return;
        }
        state.currentSevId = sev.id;
        state.screen='carga';
        state.manualMode=false;
        syncFormFromCurrentStep();
        render();
      };
      wrap.appendChild(card);
    });
  }
  const footer = el.querySelector('#listFooter');
  if(state.overlayIds.length>0){
    footer.innerHTML = `<button class="btn-block accent" id="verComp">Ver comparación (${state.overlayIds.length})</button>`;
    footer.querySelector('#verComp').onclick = ()=>{
      // abre el primero en modo carga con overlay activo
      state.currentSevId = state.overlayIds[0];
      state.screen='carga';
      syncFormFromCurrentStep();
      render();
    };
  } else {
    footer.innerHTML = `<button class="btn-block" id="tickHint" disabled>Tildá 2-3 sondeos para superponerlos en el gráfico</button>`;
  }
  el.querySelector('#back').onclick = ()=>{ state.screen='home'; render(); };
  return el;
}

/* ===================== NEW SEV ===================== */
function startNewSev(){
  const count = state.sevs.length+1;
  state.newSevDraft = {
    id: uid(),
    nombre: 'SEV-' + String(count).padStart(2,'0'),
    gps: null,
    gpsStatus: 'loading',   // loading | ok | error | skipped
    gpsError: null,
    historialGps:[],
    fecha: nowStr(),
    lecturas: {},
    stepIndex: 0
  };
  state.screen='new';
  render();
  requestDraftGps();
}

async function requestDraftGps(){
  const d = state.newSevDraft;
  if(!d) return;
  d.gpsStatus = 'loading';
  d.gpsError = null;
  render();
  try{
    const fix = await getGpsFix();
    // el draft pudo haber cambiado (usuario canceló) entre tanto
    if(state.newSevDraft !== d) return;
    d.gps = fix;
    d.historialGps.push(fix);
    d.gpsStatus = 'ok';
  }catch(err){
    if(state.newSevDraft !== d) return;
    d.gpsStatus = 'error';
    d.gpsError = err.message || 'No se pudo obtener la posición GPS.';
  }
  render();
}

function renderNew(){
  const el = document.createElement('div');
  el.className='screen';
  const d = state.newSevDraft;

  let gpsBoxHtml = '';
  if(d.gpsStatus === 'loading'){
    gpsBoxHtml = `
      <div class="gps-box">
        <div class="gps-row">
          <div class="gps-icon loading">📍</div>
          <div>
            <div class="gps-coords">Buscando señal GPS…</div>
            <div class="gps-precision">Puede tardar unos segundos, incluso sin datos móviles</div>
          </div>
        </div>
      </div>`;
  } else if(d.gpsStatus === 'ok'){
    gpsBoxHtml = `
      <div class="gps-box">
        <div class="gps-row">
          <div class="gps-icon">📍</div>
          <div>
            <div class="gps-coords">${fmtCoord(d.gps.lat)}, ${fmtCoord(d.gps.lon)}</div>
            <div class="gps-precision">${d.gps.prec!=null? '± '+d.gps.prec+' m · ':''}capturado ${new Date(d.gps.ts).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>
        </div>
        <button class="btn-ghost" id="remedir">↻ Re-medir posición</button>
      </div>`;
  } else if(d.gpsStatus === 'skipped'){
    gpsBoxHtml = `
      <div class="gps-box">
        <div class="gps-row">
          <div class="gps-icon error">📍</div>
          <div>
            <div class="gps-coords">Sin posición GPS</div>
            <div class="gps-nogps-badge">SIN GPS</div>
          </div>
        </div>
        <button class="btn-ghost" id="remedir">↻ Intentar obtener GPS</button>
      </div>`;
  } else {
    // error
    gpsBoxHtml = `
      <div class="gps-box">
        <div class="gps-row">
          <div class="gps-icon error">📍</div>
          <div>
            <div class="gps-coords">No se pudo obtener la posición</div>
          </div>
        </div>
        <div class="gps-error-box">
          <p>${d.gpsError || 'No se pudo obtener la posición GPS.'}</p>
          <div class="gps-error-actions">
            <button class="btn-ghost" id="reintentar">↻ Reintentar</button>
            <button class="btn-ghost" id="continuarSinGps">Continuar sin GPS</button>
          </div>
        </div>
      </div>`;
  }

  el.innerHTML = `
    <div class="topbar">
      <div class="icon-btn" id="back">‹</div>
      <div class="topbar-title">Nuevo SEV</div>
    </div>
    <div class="new-sev-body">
      <div class="field">
        <label>Nombre del punto</label>
        <input type="text" id="nameInput" value="${d.nombre}">
      </div>
      <div class="field">
        <label>Posición GPS</label>
        ${gpsBoxHtml}
      </div>
    </div>
    <div class="new-sev-footer">
      <button class="btn-block accent" id="empezar">Comenzar carga de datos</button>
    </div>
  `;
  el.querySelector('#back').onclick = ()=>{ state.newSevDraft=null; state.screen='home'; render(); };
  el.querySelector('#nameInput').oninput = (e)=>{ d.nombre = e.target.value; };

  const remedirBtn = el.querySelector('#remedir');
  if(remedirBtn) remedirBtn.onclick = ()=> requestDraftGps();
  const reintentarBtn = el.querySelector('#reintentar');
  if(reintentarBtn) reintentarBtn.onclick = ()=> requestDraftGps();
  const continuarSinGpsBtn = el.querySelector('#continuarSinGps');
  if(continuarSinGpsBtn) continuarSinGpsBtn.onclick = ()=>{
    d.gpsStatus = 'skipped';
    d.gps = null;
    render();
  };

  el.querySelector('#empezar').onclick = ()=>{
    if(d.gpsStatus === 'loading') return; // esperar a que resuelva o el usuario decida
    // si nunca se resolvió GPS y tampoco se marcó explícitamente "sin GPS", lo tratamos como sin GPS
    if(d.gpsStatus === 'error') { d.gpsStatus = 'skipped'; d.gps = null; }
    state.sevs.push(d);
    state.currentSevId = d.id;
    state.newSevDraft = null;
    state.screen='carga';
    state.manualMode=false;
    syncFormFromCurrentStep();
    render();
    scheduleSave();
  };
  return el;
}

/* ===================== CARGA ===================== */
function syncFormFromCurrentStep(){
  const sev = currentSev(); if(!sev) return;
  const step = STEPS[sev.stepIndex];
  const key = lecturaKey(step.ab2, step.mn2);
  const lec = sev.lecturas[key];
  state.manualMode = lec ? lec.modo==='manual' : false;
  state.formValue = lec ? String(lec.resistividad) : '';
  state.formI = lec && lec.I!=null ? String(lec.I) : '';
  state.formDV = lec && lec.dV!=null ? String(lec.dV) : '';
}

// Determina si hay un valor cargado en el formulario que todavía no fue confirmado
// (nuevo, o distinto del que ya está guardado para ese punto). Eso es lo único
// que pinta el tilde de verde; si coincide con lo guardado (o está vacío) queda gris.
function isFormDirty(savedLec){
  if(state.manualMode){
    const I = parseFloat(state.formI), dV = parseFloat(state.formDV);
    if(isNaN(I) || isNaN(dV) || I===0) return false;
    if(!savedLec || savedLec.modo!=='manual') return true;
    return (savedLec.I !== I) || (savedLec.dV !== dV);
  } else {
    if(state.formValue === '' || state.formValue===null) return false;
    const rho = parseFloat(state.formValue);
    if(isNaN(rho) || rho<0) return false;
    if(!savedLec || savedLec.modo!=='directo') return true;
    return savedLec.resistividad !== rho;
  }
}

function renderCarga(){
  const el = document.createElement('div');
  el.className='screen';
  const sev = currentSev();
  const step = STEPS[sev.stepIndex];
  const key = lecturaKey(step.ab2, step.mn2);
  const savedLec = sev.lecturas[key];
  const p = sevProgress(sev);

  el.innerHTML = `
    <div class="topbar carga-topbar">
      <div class="icon-btn" id="openDrawer">☰</div>
      <div class="topbar-title" style="text-align:center;">${sev.nombre}<small>${p.done}/${p.total} puntos cargados</small></div>
      <div class="icon-btn" id="themeToggle" title="${state.theme==='field'?'Volver a modo oscuro':'Modo campo (alto contraste)'}">${state.theme==='field'?'🌙':'☀'}</div>
    </div>
    <div class="chart-zone">
      <div class="chart-legend">
        <span style="color:${mnColors()[0.5]}">● MN 0.5</span>
        <span style="color:${mnColors()[5]}">■ MN 5</span>
        <span style="color:${mnColors()[20]}">▲ MN 20</span>
      </div>
      <div id="chartHolder" style="width:100%;height:100%;"></div>
    </div>
    <div class="panel">
      <div class="step-row">
        <div class="step-vals">
          <div class="step-val"><div class="lab">AB/2 (m)</div><div class="num">${step.ab2}</div></div>
          <div class="step-val"><div class="lab">MN/2 (m)</div><div class="num mn">${step.mn2}${step.splice?`<span class="splice-flag">EMPALME</span>`:''}</div></div>
        </div>
        <div class="step-progress">PASO ${sev.stepIndex+1}/${STEPS.length}</div>
      </div>

      <div style="display:flex; gap:10px; align-items:center;">
        <div class="readout ${state.manualMode?'manual':''}" style="flex:1;" id="readoutBox"></div>
        <div class="toggle-manual ${state.manualMode?'on':''}" id="toggleManual" title="Carga manual (I y ΔV)">⚡</div>
        <button class="confirm-btn ${isFormDirty(savedLec) ? 'ready' : ''}" id="confirmBtn">✓</button>
      </div>

      <div class="nav-row">
        <button class="nav-btn" id="prevStep" ${sev.stepIndex===0?'disabled':''}>‹ ANTERIOR</button>
        <button class="nav-btn" id="nextStep" ${sev.stepIndex===STEPS.length-1?'disabled':''}>SIGUIENTE ›</button>
      </div>
    </div>
    <div class="drawer-backdrop" id="backdrop"></div>
    <div class="drawer" id="drawer"></div>
  `;

  const confirmBtn = el.querySelector('#confirmBtn');

  // readout box content
  const readoutBox = el.querySelector('#readoutBox');
  if(!state.manualMode){
    readoutBox.innerHTML = `
      <div class="readout-main">
        <label>RESISTIVIDAD APARENTE</label>
        <input type="number" inputmode="decimal" id="rhoInput" placeholder="0.0" value="${state.formValue}">
      </div>
      <div class="unit-suffix">Ω·m</div>
    `;
    readoutBox.querySelector('#rhoInput').oninput = (e)=>{
      state.formValue = e.target.value;
      confirmBtn.classList.toggle('ready', isFormDirty(savedLec));
    };
  } else {
    const ab2=step.ab2, mn2=step.mn2;
    const I = parseFloat(state.formI), dV = parseFloat(state.formDV);
    let computed = null;
    if(!isNaN(I) && !isNaN(dV) && I!==0){
      computed = kFactor(ab2,mn2) * Math.abs(dV) / I;
    }
    readoutBox.innerHTML = `
      <div class="manual-fields">
        <div class="mf"><label>CORRIENTE I (mA)</label><input type="number" inputmode="decimal" id="iInput" placeholder="0.0" value="${state.formI}"></div>
        <div class="mf"><label>ΔV (mV)</label><input type="number" inputmode="decimal" id="dvInput" placeholder="0.0" value="${state.formDV}"></div>
      </div>
    `;
    const computedNote = document.createElement('div');
    computedNote.className='manual-computed';
    computedNote.innerHTML = computed!=null ? `ρₐ calculada: <b>${computed.toFixed(2)} Ω·m</b>` : `ρₐ calculada: <b>—</b>`;
    // append below via panel restructure: put note under readout row
    el.querySelector('.panel').insertBefore(computedNote, el.querySelector('.nav-row'));

    const iInputEl = readoutBox.querySelector('#iInput');
    const dvInputEl = readoutBox.querySelector('#dvInput');
    function recomputeManual(){
      state.formI = iInputEl.value; state.formDV = dvInputEl.value;
      const I2 = parseFloat(state.formI), dV2 = parseFloat(state.formDV);
      let c = null;
      if(!isNaN(I2) && !isNaN(dV2) && I2!==0) c = kFactor(ab2,mn2) * Math.abs(dV2) / I2;
      computedNote.innerHTML = c!=null ? `ρₐ calculada: <b>${c.toFixed(2)} Ω·m</b>` : `ρₐ calculada: <b>—</b>`;
      confirmBtn.classList.toggle('ready', isFormDirty(savedLec));
    }
    iInputEl.oninput = recomputeManual;
    dvInputEl.oninput = recomputeManual;
  }

  // toggle manual
  el.querySelector('#toggleManual').onclick = ()=>{
    state.manualMode = !state.manualMode;
    render();
  };

  el.querySelector('#themeToggle').onclick = ()=>{
    state.theme = state.theme==='field' ? 'dark' : 'field';
    render();
  };

  // confirm
  el.querySelector('#confirmBtn').onclick = ()=>{ confirmCurrentStep(); };

  // nav
  el.querySelector('#prevStep').onclick = ()=>{ sev.stepIndex = Math.max(0, sev.stepIndex-1); syncFormFromCurrentStep(); render(); };
  el.querySelector('#nextStep').onclick = ()=>{ sev.stepIndex = Math.min(STEPS.length-1, sev.stepIndex+1); syncFormFromCurrentStep(); render(); };

  // drawer
  const drawer = el.querySelector('#drawer');
  const backdrop = el.querySelector('#backdrop');
  drawer.appendChild(renderDrawerContent(sev));
  if(state.drawerOpen){ drawer.classList.add('open'); backdrop.classList.add('open'); }
  el.querySelector('#openDrawer').onclick = ()=>{ state.drawerOpen=true; render(); };
  backdrop.onclick = ()=>{ state.drawerOpen=false; render(); };

  // chart
  const chartData = getChartSeries();
  el.querySelector('#chartHolder').appendChild(buildChartSvg(chartData, {ab2:step.ab2, mn2:step.mn2}));

  return el;
}

function updateConfirmState(){
  // solo re-renderiza el botón de confirmar sin perder foco del input de texto —
  // en este prototipo simplificamos re-renderizando completo salvo mientras se tipea.
}

function getChartSeries(){
  const series = [];
  const ids = state.overlayIds.length>0 ? Array.from(new Set([state.currentSevId, ...state.overlayIds])) : [state.currentSevId];
  ids.forEach((id,i)=>{
    const sev = state.sevs.find(s=>s.id===id);
    if(!sev) return;
    const points = STEPS.map(st=>{
      const lec = sev.lecturas[lecturaKey(st.ab2, st.mn2)];
      return lec ? {ab2:st.ab2, mn2:st.mn2, rho:lec.resistividad} : null;
    }).filter(Boolean);
    series.push({ id, nombre: sev.nombre, points, dim: i>0 });
  });
  return series;
}

function confirmCurrentStep(){
  const sev = currentSev();
  const step = STEPS[sev.stepIndex];
  const key = lecturaKey(step.ab2, step.mn2);
  let rho, I=null, dV=null, modo;
  if(state.manualMode){
    I = parseFloat(state.formI); dV = parseFloat(state.formDV);
    if(isNaN(I) || isNaN(dV) || I===0) return;
    rho = kFactor(step.ab2, step.mn2) * Math.abs(dV) / I;
    modo='manual';
  } else {
    rho = parseFloat(state.formValue);
    if(isNaN(rho) || rho<0) return;
    modo='directo';
  }
  sev.lecturas[key] = { ab2:step.ab2, mn2:step.mn2, resistividad:rho, I, dV, modo, ts:Date.now() };
  if(sev.stepIndex < STEPS.length-1){
    sev.stepIndex++;
    syncFormFromCurrentStep();
  }
  render();
}

/* ---------- Drawer content ---------- */
function renderDrawerContent(sev){
  const wrap = document.createElement('div');
  wrap.style.display='contents';
  const p = sevProgress(sev);
  const head = document.createElement('div');
  head.className='drawer-head';
  head.innerHTML = `<h3>${sev.nombre}</h3><p>${p.done}/${p.total} puntos · ${fmtGps(sev)}</p>`;
  const list = document.createElement('div');
  list.className='drawer-list';
  STEPS.forEach((st,i)=>{
    const key = lecturaKey(st.ab2, st.mn2);
    const lec = sev.lecturas[key];
    const row = document.createElement('div');
    row.className = 'drawer-row' + (lec?' filled':'') + (i===sev.stepIndex?' active':'');
    row.innerHTML = `
      <div class="idx">${i+1}</div>
      <div class="ab">${st.ab2} m</div>
      <div class="mn" style="color:${mnColors()[st.mn2]}">${st.mn2}</div>
      <div class="rho">${lec? lec.resistividad.toFixed(1)+' Ω·m' : '—'}</div>
      <div class="st">${lec ? (lec.modo==='manual' ? '⚡' : '✓') : ''}</div>
    `;
    row.onclick = ()=>{ sev.stepIndex = i; syncFormFromCurrentStep(); state.drawerOpen=false; render(); };
    list.appendChild(row);
  });
  const foot = document.createElement('div');
  foot.className='drawer-foot';
  foot.innerHTML = `<button class="btn-block" id="exportBtn">Exportar CSV</button>`;
  wrap.appendChild(head); wrap.appendChild(list); wrap.appendChild(foot);
  setTimeout(()=>{
    const btn = foot.querySelector('#exportBtn');
    if(btn) btn.onclick = ()=> exportCsv(sev);
  },0);
  return wrap;
}

async function exportCsv(sev){
  let rows = [['AB/2','MN/2','Resistividad_Ohm_m','Modo','Corriente_mA','DeltaV_mV','Lat','Lon','Timestamp']];
  const lat = sev.gps ? sev.gps.lat.toFixed(6) : '';
  const lon = sev.gps ? sev.gps.lon.toFixed(6) : '';
  STEPS.forEach(st=>{
    const lec = sev.lecturas[lecturaKey(st.ab2,st.mn2)];
    if(lec){
      rows.push([st.ab2, st.mn2, lec.resistividad.toFixed(3), lec.modo, lec.I??'', lec.dV??'', lat, lon, new Date(lec.ts).toISOString()]);
    }
  });
  const csv = rows.map(r=>r.join(',')).join('\n');
  const fileName = sev.nombre.replace(/[^a-zA-Z0-9_-]+/g,'_') + '.csv';

  // En iPhone (Safari) la descarga directa vía <a download> no siempre expone
  // un lugar accesible para el archivo. Usamos la Web Share API (hoja para
  // compartir/"Guardar en Archivos") cuando el navegador la soporta con archivos.
  try{
    const file = new File([csv], fileName, {type:'text/csv'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({ files:[file], title: sev.nombre, text:'Export CSV — ' + sev.nombre });
      return;
    }
  }catch(err){
    // Si el usuario cancela el share sheet, no hacemos fallback (no es un error real).
    if(err && err.name === 'AbortError') return;
    // en cualquier otro caso, seguimos con el fallback de descarga
  }

  // Fallback universal (Android/Chrome/Desktop y Safari sin soporte de Web Share con archivos):
  // descarga vía Blob + <a download>.
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
  showToast('CSV descargado: ' + fileName);
}

/* ===================== CHART (SVG log-log estilo papel bilog) ===================== */
function buildChartSvg(series, currentPoint){
  const W = 800, H = 620;
  const marginL = 56, marginR = 18, marginT = 14, marginB = 34;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;

  const xMinDec = 0;   // 10^0 = 1
  const xMaxDec = 3;   // 10^3 = 1000
  // rango Y dinámico según datos, con piso 1 - 10^3 por defecto
  let allRho = [];
  series.forEach(s=> s.points.forEach(p=> allRho.push(p.rho)));
  let yMinDec = 0, yMaxDec = 3;
  if(allRho.length){
    const mn = Math.min(...allRho), mx = Math.max(...allRho);
    yMinDec = Math.floor(Math.log10(Math.max(mn*0.5,0.1)));
    yMaxDec = Math.ceil(Math.log10(mx*1.8));
    if(yMaxDec-yMinDec<2){ yMaxDec = yMinDec+2; }
  }

  function xPix(ab2){ return marginL + (Math.log10(ab2)-xMinDec)/(xMaxDec-xMinDec)*plotW; }
  function yPix(rho){ return marginT + plotH - (Math.log10(rho)-yMinDec)/(yMaxDec-yMinDec)*plotH; }

  const pal = chartPalette();
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display:block;">`;

  // fondo panel
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`;

  // grid log-log estilo papel bilogarítmico: líneas menores en 2..9, mayores en potencias de 10
  for(let dec=xMinDec; dec<=xMaxDec; dec++){
    for(let m=1; m<=9; m++){
      const val = m*Math.pow(10,dec);
      if(Math.log10(val) > xMaxDec) continue;
      const x = xPix(val);
      const major = (m===1);
      svg += `<line x1="${x}" y1="${marginT}" x2="${x}" y2="${marginT+plotH}" stroke="${major?pal.gridMajor:pal.gridMinor}" stroke-width="${major?1:0.6}" opacity="${major?1:0.7}"/>`;
      if(major){
        svg += `<text x="${x}" y="${H-14}" fill="${pal.axisText}" font-size="12" font-weight="600" font-family="ui-monospace, Menlo, Consolas, monospace" text-anchor="middle">${val>=1000?val/1000+'k':val}</text>`;
      }
    }
  }
  for(let dec=yMinDec; dec<=yMaxDec; dec++){
    for(let m=1; m<=9; m++){
      const val = m*Math.pow(10,dec);
      if(Math.log10(val) > yMaxDec || Math.log10(val) < yMinDec) continue;
      const y = yPix(val);
      const major = (m===1);
      svg += `<line x1="${marginL}" y1="${y}" x2="${marginL+plotW}" y2="${y}" stroke="${major?pal.gridMajor:pal.gridMinor}" stroke-width="${major?1:0.6}" opacity="${major?1:0.7}"/>`;
      if(major){
        const label = val>=1000?(val/1000)+'k':val;
        svg += `<text x="${marginL-8}" y="${y+4}" fill="${pal.axisText}" font-size="12" font-weight="600" font-family="ui-monospace, Menlo, Consolas, monospace" text-anchor="end">${label}</text>`;
      }
    }
  }
  // ejes
  svg += `<line x1="${marginL}" y1="${marginT}" x2="${marginL}" y2="${marginT+plotH}" stroke="${pal.axisLine}" stroke-width="1.5"/>`;
  svg += `<line x1="${marginL}" y1="${marginT+plotH}" x2="${marginL+plotW}" y2="${marginT+plotH}" stroke="${pal.axisLine}" stroke-width="1.5"/>`;
  svg += `<text x="${marginL+plotW/2}" y="${H-1}" fill="${pal.dimText}" font-size="11" font-weight="600" font-family="ui-monospace, Menlo, Consolas, monospace" text-anchor="middle">AB/2 (m)</text>`;

  // series
  const colors = mnColors();
  series.forEach((s)=>{
    if(s.points.length===0) return;
    // separar en segmentos por mn2 consecutivos ordenados por ab2
    const sorted = [...s.points].sort((a,b)=>a.ab2-b.ab2);
    const byMn = {};
    sorted.forEach(p=>{ (byMn[p.mn2] = byMn[p.mn2]||[]).push(p); });
    const opacity = s.dim ? 0.5 : 1;
    Object.entries(byMn).forEach(([mn,pts])=>{
      const color = colors[mn] || '#999';
      const shape = MN_SHAPES[mn] || 'circle';
      const path = pts.map((p,i)=> (i===0?'M':'L') + xPix(p.ab2).toFixed(1) + ',' + yPix(p.rho).toFixed(1)).join(' ');
      svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="${s.dim?1.6:2.6}" opacity="${opacity}"/>`;
      pts.forEach(p=>{
        svg += drawMarker(shape, xPix(p.ab2), yPix(p.rho), s.dim?3.2:5, color, opacity);
      });
    });
    if(s.dim){
      const last = sorted[sorted.length-1];
      svg += `<text x="${xPix(last.ab2)+6}" y="${yPix(last.rho)}" fill="${pal.dimText}" font-size="10" font-weight="600" font-family="ui-monospace, Menlo, Consolas, monospace">${s.nombre}</text>`;
    }
  });

  // punto actual (paso activo) resaltado si aún no tiene valor
  if(currentPoint){
    const x = xPix(currentPoint.ab2);
    svg += `<line x1="${x}" y1="${marginT}" x2="${x}" y2="${marginT+plotH}" stroke="${state.theme==='field'?'#A32A0C':'#FFB238'}" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7"/>`;
  }

  svg += `</svg>`;
  const holder = document.createElement('div');
  holder.style.width='100%'; holder.style.height='100%';
  holder.innerHTML = svg;
  return holder;
}

/* ===================== INIT ===================== */
(async function init(){
  try{
    const saved = await loadState();
    if(saved){
      state.theme = saved.theme || state.theme;
      state.sevs = Array.isArray(saved.sevs) ? saved.sevs : [];
      state.currentSevId = saved.currentSevId || null;
      state.overlayIds = Array.isArray(saved.overlayIds) ? saved.overlayIds : [];
      state.manualMode = !!saved.manualMode;
      // Restauramos la pantalla donde el usuario había quedado, siempre que
      // los datos referenciados todavía existan (continuidad exacta).
      if(saved.screen === 'carga' && state.currentSevId && currentSev()){
        state.screen = 'carga';
        syncFormFromCurrentStep();
      } else if(saved.screen === 'list'){
        state.screen = 'list';
      } else {
        state.screen = 'home';
      }
    }
  }catch(e){
    console.warn('No se pudo restaurar el estado guardado:', e);
  }
  render();
})();

/* ===================== SERVICE WORKER ===================== */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./service-worker.js').then((reg)=>{
      // Revisa si hay una versión nueva del service worker y, cuando esté
      // lista, avisa para recargar y tomar la nueva caché.
      reg.addEventListener('updatefound', ()=>{
        const newWorker = reg.installing;
        if(!newWorker) return;
        newWorker.addEventListener('statechange', ()=>{
          if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
            showToast('Nueva versión disponible. Se aplicará al reabrir la app.');
          }
        });
      });
    }).catch((err)=>{
      console.warn('No se pudo registrar el service worker:', err);
    });
  });
}
