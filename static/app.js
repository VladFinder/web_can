async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

const els = {
  make: document.getElementById('make'),
  model: document.getElementById('model'),
  generationRow: document.getElementById('generation-row'),
  generation: document.getElementById('generation'),
  makeCustomWrap: document.getElementById('make-custom'),
  makeCustomInput: document.getElementById('make_name'),
  modelCustomWrap: document.getElementById('model-custom'),
  modelCustomInput: document.getElementById('model_name'),
  genCustomWrap: document.getElementById('generation-custom'),
  genCustomInput: document.getElementById('generation_name'),
  addParamBtn: document.getElementById('add-param'),
  paramsContainer: document.getElementById('params-container'),
  form: document.getElementById('submit-form'),
  status: document.getElementById('status'),
  dbCheck: document.getElementById('db-check'),
  paramList: document.getElementById('param-list'),
  existingList: document.getElementById('existing-params'),
  existingInfo: document.getElementById('existing-info'),
};

// In-memory parameter cache: name -> id
let paramIndex = new Map();
let paramItems = [];

function setStatus(msg, ok = true) {
  els.status.textContent = msg;
  els.status.className = ok ? 'status ok' : 'status err';
}

function setDbCheck(msg, ok = true) {
  els.dbCheck.textContent = msg;
  els.dbCheck.className = ok ? 'muted' : 'err';
}

async function initDbCheck() {
  try {
    const makes = await fetchJSON('/api/makes');
    setDbCheck(`Р‘Р” РґРѕСЃС‚СѓРїРЅР°. РњР°СЂРѕРє: ${makes.length}.`);
  } catch (e) {
    setDbCheck(`Р‘Р” РЅРµРґРѕСЃС‚СѓРїРЅР°: ${e.message}. РџРѕРјРµСЃС‚РёС‚Рµ db.sqlite РІ РєРѕСЂРµРЅСЊ РёР»Рё Р·Р°РґР°Р№С‚Рµ WEB_CAN_DB.`, false);
  }
}

async function loadMakes() {
  els.make.innerHTML = '';
  const makes = await fetchJSON('/api/makes');
  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'вЂ” РІС‹Р±РµСЂРёС‚Рµ РјР°СЂРєСѓ вЂ”';
  def.disabled = true;
  def.selected = true;
  els.make.appendChild(def);
  for (const m of makes) {
    const o = document.createElement('option');
    o.value = m; o.textContent = m;
    els.make.appendChild(o);
  }
  const custom = document.createElement('option');
  custom.value = '__custom__'; custom.textContent = 'Р”СЂСѓРіРѕРµ (РІРІРµСЃС‚Рё РІСЂСѓС‡РЅСѓСЋ)';
  els.make.appendChild(custom);
}

async function loadModels(make) {
  els.model.disabled = true;
  els.model.innerHTML = '';
  els.generationRow.style.display = 'none';
  els.generation.innerHTML = '';
  if (!make || make === '__custom__') {
    els.model.disabled = false;
    const custom = document.createElement('option');
    custom.value = '__custom__'; custom.textContent = 'Р”СЂСѓРіРѕРµ (РІРІРµСЃС‚Рё РІСЂСѓС‡РЅСѓСЋ)';
    els.model.appendChild(custom);
    return;
  }
  const models = await fetchJSON(`/api/models?make=${encodeURIComponent(make)}`);
  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'вЂ” РІС‹Р±РµСЂРёС‚Рµ РјРѕРґРµР»СЊ вЂ”';
  def.disabled = true;
  def.selected = true;
  els.model.appendChild(def);
  for (const m of models) {
    const o = document.createElement('option');
    o.value = m; o.textContent = m;
    els.model.appendChild(o);
  }
  const custom = document.createElement('option');
  custom.value = '__custom__'; custom.textContent = 'Р”СЂСѓРіРѕРµ (РІРІРµСЃС‚Рё РІСЂСѓС‡РЅСѓСЋ)';
  els.model.appendChild(custom);
  els.model.disabled = false;
}

async function loadGenerations(make, model) {
  els.generationRow.style.display = 'none';
  els.generation.innerHTML = '';
  if (!make || !model || make === '__custom__' || model === '__custom__') {
    els.generationRow.style.display = '';
    const custom = document.createElement('option');
    custom.value = '__custom__'; custom.textContent = 'Р”СЂСѓРіРѕРµ (РІРІРµСЃС‚Рё РІСЂСѓС‡РЅСѓСЋ)';
    els.generation.appendChild(custom);
    return null;
  }
  const gens = await fetchJSON(`/api/generations?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`);
  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'вЂ” РІС‹Р±РµСЂРёС‚Рµ РїРѕРєРѕР»РµРЅРёРµ вЂ”';
  def.disabled = true;
  def.selected = true;
  els.generation.appendChild(def);
  for (const g of gens) {
    const o = document.createElement('option');
    o.value = String(g.id);
    o.textContent = g.label || `generation ${g.id}`;
    els.generation.appendChild(o);
  }
  const custom = document.createElement('option');
  custom.value = '__custom__'; custom.textContent = 'Р”СЂСѓРіРѕРµ (РІРІРµСЃС‚Рё РІСЂСѓС‡РЅСѓСЋ)';
  els.generation.appendChild(custom);
  els.generationRow.style.display = '';
  // After list shown, clear existing params view until user selects a generation
  if (els.existingList) els.existingList.innerHTML = '';
  if (els.existingInfo) els.existingInfo.textContent = 'Р’С‹Р±РµСЂРёС‚Рµ РїРѕРєРѕР»РµРЅРёРµ, С‡С‚РѕР±С‹ СѓРІРёРґРµС‚СЊ СЃРїРёСЃРѕРє.';
}

async function loadParameters() {
  const params = await fetchJSON('/api/parameters?limit=2000');
  els.paramList.innerHTML = '';
  paramIndex.clear();
  for (const p of params) {
    const opt = document.createElement('option');
    opt.value = p.name;
    els.paramList.appendChild(opt);
    if (!paramIndex.has(p.name)) paramIndex.set(p.name, p.id);
  }
  const custom = document.createElement('option');
  custom.value = 'Р”СЂСѓРіРѕРµ (РІРІРµСЃС‚Рё РІСЂСѓС‡РЅСѓСЋ)';
  els.paramList.appendChild(custom);
}

function currentVehicleId() {
  if (els.generation && els.generation.value && els.generation.value !== '__custom__') {
    return parseInt(els.generation.value, 10);
  }
  return null;
}

els.make.addEventListener('change', async () => {
  const isCustom = els.make.value === '__custom__';
  els.makeCustomWrap.style.display = isCustom ? '' : 'none';
  await loadModels(els.make.value);
});

els.model.addEventListener('change', async () => {
  const isCustom = els.model.value === '__custom__';
  els.modelCustomWrap.style.display = isCustom ? '' : 'none';
  await loadGenerations(els.make.value, els.model.value);
});

if (els.generation) {
  els.generation.addEventListener('change', () => {
    const isCustom = els.generation.value === '__custom__';
    els.genCustomWrap.style.display = isCustom ? '' : 'none';
    const gid = currentVehicleId();
    if (gid) loadExistingParams(gid); else { if (els.existingList) els.existingList.innerHTML = ''; if (els.existingInfo) els.existingInfo.textContent = 'РљР°СЃС‚РѕРјРЅРѕРµ РўРЎ РёР»Рё РїРѕРєРѕР»РµРЅРёРµ РЅРµ РІС‹Р±СЂР°РЅРѕ.'; }
  });
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('РћС‚РїСЂР°РІРєР°...', true);

  try {
    const vehicleId = currentVehicleId();
    let generationLabel = null;
    if (els.generation && els.generation.selectedOptions && els.generation.selectedOptions.length) {
      generationLabel = els.generation.selectedOptions[0].textContent;
    }
    const payload = {
      vehicle_id: vehicleId,
      make: els.make.value === '__custom__' ? null : els.make.value,
      make_custom: els.makeCustomInput.value || null,
      model: els.model.value === '__custom__' ? null : els.model.value,
      model_custom: els.modelCustomInput.value || null,
      generation_label: generationLabel,
      generation_custom: els.genCustomInput.value || null,
      items: paramItems.map(it => it.toJSON())
    };

    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `РћС€РёР±РєР° ${res.status}`);
    }
    const data = await res.json();
    setStatus(`РЎРѕС…СЂР°РЅРµРЅРѕ (${data.saved || 0} С€С‚.).`, true);
    els.form.reset();
    els.model.disabled = true;
    if (els.generationRow) els.generationRow.style.display = 'none';
    if (els.generation) els.generation.innerHTML = '';
    // reset param items
    els.paramsContainer.innerHTML = '';
    paramItems = [];
    addParamItem();
  } catch (err) {
    setStatus(err.message || String(err), false);
  }
});

async function init() {
  await initDbCheck();
  try {
    await Promise.all([loadMakes(), loadParameters()]);
  } catch (e) {}
  addParamItem();
}

init();

// ------ Multi-param support ------
function addParamItem() {
  const idx = paramItems.length + 1;
  const node = document.createElement('div');
  node.className = 'param-item';
  node.innerHTML = `
    <div class="param-title">РџР°СЂР°РјРµС‚СЂ #${idx}</div>
    <div class="param-grid">
      <div>
        <label>РџР°СЂР°РјРµС‚СЂ</label>
        <input list="param-list" class="param-input" placeholder="РЅР°РїСЂРёРјРµСЂ: РћР±РѕСЂРѕС‚С‹ РґРІРёРіР°С‚РµР»СЏ" />
        <div class="row" style="display:none; margin-top:6px;">
          <label>РЎРІРѕС‘ РЅР°Р·РІР°РЅРёРµ</label>
          <input class="param-custom" placeholder="Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ" />
        </div>
      </div>
      <div>
        <label>CAN ID</label>
        <input class="can-id" placeholder="0x123" />
      </div>
      <div>
        <label>Р¤РѕСЂРјСѓР»Р°</label>
        <input class="formula" placeholder="(value * 0.1) - 40" />
      </div>
      <div>
        <label>РќР°РїСЂР°РІР»РµРЅРёРµ С‡С‚РµРЅРёСЏ</label>
        <select class="endian">
          <option value="" disabled selected>вЂ” РІС‹Р±РµСЂРёС‚Рµ endianness вЂ”</option>
          <option value="little">Little-endian</option>
          <option value="big">Big-endian</option>
        </select>
        <div class="hint">Little-endian вЂ” РјР»Р°РґС€РёР№ Р±Р°Р№С‚/Р±РёС‚ РёРґС‘С‚ РїРµСЂРІС‹Рј; Big-endian вЂ” СЃС‚Р°СЂС€РёР№ Р±Р°Р№С‚/Р±РёС‚ РёРґС‘С‚ РїРµСЂРІС‹Рј.</div>
      </div>
    </div>
    <div class="row" style="margin-top:8px;">
      <label>Р’С‹Р±РѕСЂ Р±Р°Р№С‚РѕРІ Рё Р±РёС‚РѕРІ</label>
      <div class="bitgrid"></div>
      <div class="hint">РљР»РёРє РїРѕ Р±Р°Р№С‚Сѓ вЂ” РІС‹Р±СЂР°С‚СЊ РІСЃРµ Р±РёС‚С‹. РљР»РёРє РїРѕ Р±РёС‚Сѓ вЂ” С‡Р°СЃС‚РёС‡РЅС‹Р№ РІС‹Р±РѕСЂ.</div>
    </div>
    <div class="param-actions"><button type="button" class="remove-param">РЈРґР°Р»РёС‚СЊ</button></div>
  `;

  const item = makeParamItem(node);
  paramItems.push(item);
  els.paramsContainer.appendChild(node);
}

function makeParamItem(node) {
  const input = node.querySelector('.param-input');
  const customWrap = node.querySelector('.row');
  const customInput = node.querySelector('.param-custom');
  const canId = node.querySelector('.can-id');
  const formula = node.querySelector('.formula');
  const endian = node.querySelector('.endian');
  const bitgrid = node.querySelector('.bitgrid');
  const removeBtn = node.querySelector('.remove-param');

  // Per-item selection state
  const bits = new Set();

  function updateVisualByte(wrap, b) {
    const dots = wrap.querySelectorAll('.bit');
    let count = 0;
    for (let i = 0; i < 8; i++) {
      const idx = b * 8 + i;
      const el = dots[i];
      if (bits.has(idx)) { el.classList.add('selected'); count++; }
      else { el.classList.remove('selected'); }
    }
    const box = wrap.querySelector('.byte-box');
    box.classList.remove('full', 'partial');
    if (count === 8) box.classList.add('full');
    else if (count > 0) box.classList.add('partial');
  }

  // Build grid
  for (let b = 0; b < 8; b++) {
    const wrap = document.createElement('div');
    wrap.className = 'byte';
    const dots = document.createElement('div'); dots.className = 'bits';
    const box = document.createElement('div'); box.className = 'byte-box'; box.title = `Byte ${b}`;
    box.addEventListener('click', () => {
      let full = true; for (let i=0;i<8;i++){ if(!bits.has(b*8+i)){ full=false; break; } }
      if (full){ for(let i=0;i<8;i++) bits.delete(b*8+i); } else { for(let i=0;i<8;i++) bits.add(b*8+i); }
      updateVisualByte(wrap,b);
    });
    for (let i=0;i<8;i++){
      const d = document.createElement('div'); d.className='bit';
      const idx = b*8+i; d.title = `Byte ${b}, Bit ${i}`;
      d.addEventListener('click', (e)=>{ e.stopPropagation(); if(bits.has(idx)) bits.delete(idx); else bits.add(idx); updateVisualByte(wrap,b); });
      dots.appendChild(d);
    }
    wrap.appendChild(dots); wrap.appendChild(box);
    bitgrid.appendChild(wrap);
    updateVisualByte(wrap,b);
  }

  input.addEventListener('input', () => {
    const v = input.value.trim();
    const isCustom = v && (!paramIndex.has(v) || v === 'Р”СЂСѓРіРѕРµ (РІРІРµСЃС‚Рё РІСЂСѓС‡РЅСѓСЋ)');
    customWrap.style.display = isCustom ? '' : 'none';
    if (v === 'Р”СЂСѓРіРѕРµ (РІРІРµСЃС‚Рё РІСЂСѓС‡РЅСѓСЋ)') customInput.focus();
  });

  removeBtn.addEventListener('click', () => {
    node.remove();
    const i = paramItems.indexOf(api); if (i>=0) paramItems.splice(i,1);
  });

  const api = {
    toJSON(){
      const name = input.value.trim();
      const match = paramIndex.has(name);
      const paramId = match ? paramIndex.get(name) : null;
      const isCustom = !match || name === 'Р”СЂСѓРіРѕРµ (РІРІРµСЃС‚Рё РІСЂСѓС‡РЅСѓСЋ)';
      const customName = isCustom ? (customInput.value.trim() || (name === 'Р”СЂСѓРіРѕРµ (РІРІРµСЃС‚Рё РІСЂСѓС‡РЅСѓСЋ)' ? '' : name)) : null;
      const endianVal = endian.value;
      if (!canId.value.trim()) throw new Error('РЈРєР°Р¶РёС‚Рµ CAN ID РґР»СЏ РѕРґРЅРѕРіРѕ РёР· РїР°СЂР°РјРµС‚СЂРѕРІ.');
      if (!endianVal) throw new Error('Р’С‹Р±РµСЂРёС‚Рµ РЅР°РїСЂР°РІР»РµРЅРёРµ С‡С‚РµРЅРёСЏ РґР»СЏ РѕРґРЅРѕРіРѕ РёР· РїР°СЂР°РјРµС‚СЂРѕРІ.');
      return {
        parameter_id: paramId,
        parameter_name: customName || undefined,
        can_id: canId.value.trim(),
        formula: formula.value || null,
        endian: endianVal,
        notes: null,
        selected_bits: Array.from(bits).sort((a,b)=>a-b),
        selected_bytes: Array.from(new Set(Array.from(bits).map(x=>Math.floor(x/8)))).sort((a,b)=>a-b),
      };
    }
  };
  return api;
}

if (els.addParamBtn) {
  els.addParamBtn.addEventListener('click', addParamItem);
}

async function loadExistingParams(generationId){
  try{
    const items = await fetchJSON(`/api/generation-parameters?generation_id=${encodeURIComponent(generationId)}`);
    if (els.existingList){
      els.existingList.innerHTML = '';
      for (const it of items){
        const li = document.createElement('li');
        const name = document.createElement('span'); name.textContent = it.name;
        const badge = document.createElement('span'); badge.className='badge'; badge.textContent = `x${it.entries}`;
        li.appendChild(name); li.appendChild(badge);
        els.existingList.appendChild(li);
      }
    }
    if (els.existingInfo){ els.existingInfo.textContent = items.length ? `РќР°Р№РґРµРЅРѕ: ${items.length}` : 'РќРµС‚ РїР°СЂР°РјРµС‚СЂРѕРІ РґР»СЏ СЌС‚РѕРіРѕ РїРѕРєРѕР»РµРЅРёСЏ.'; }
  }catch(e){
    if (els.existingInfo) els.existingInfo.textContent = `РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё: ${e.message}`;
  }
}

