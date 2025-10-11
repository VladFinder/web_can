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
  param: document.getElementById('param'),
  paramList: document.getElementById('param-list'),
  paramCustomContainer: document.getElementById('param-custom'),
  paramCustomInput: document.getElementById('param_name'),
  can_id: document.getElementById('can_id'),
  formula: document.getElementById('formula'),
  endian: document.getElementById('endian'),
  notes: document.getElementById('notes'),
  form: document.getElementById('submit-form'),
  status: document.getElementById('status'),
  dbCheck: document.getElementById('db-check'),
  bitgrid: document.getElementById('bitgrid'),
};

// In-memory parameter cache: name -> id
let paramIndex = new Map();
let selectedBytes = new Set();
let selectedBits = new Set(); // absolute 0..63

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
    setDbCheck(`БД доступна. Марок: ${makes.length}.`);
  } catch (e) {
    setDbCheck(`БД недоступна: ${e.message}. Поместите db.sqlite в корень или задайте WEB_CAN_DB.`, false);
  }
}

function renderBitGrid() {
  if (!els.bitgrid) return;
  els.bitgrid.innerHTML = '';
  for (let b = 0; b < 8; b++) {
    const wrap = document.createElement('div');
    wrap.className = 'byte';

    const bits = document.createElement('div');
    bits.className = 'bits';

    const box = document.createElement('div');
    box.className = 'byte-box';
    box.title = `Byte ${b}`;
    box.addEventListener('click', () => {
      let allSelected = true;
      for (let bit = 0; bit < 8; bit++) {
        const idx = b * 8 + bit;
        if (!selectedBits.has(idx)) { allSelected = false; break; }
      }
      if (allSelected) {
        for (let bit = 0; bit < 8; bit++) selectedBits.delete(b * 8 + bit);
        selectedBytes.delete(b);
      } else {
        for (let bit = 0; bit < 8; bit++) selectedBits.add(b * 8 + bit);
        selectedBytes.add(b);
      }
      updateByteVisual(wrap, b);
    });

    for (let bit = 0; bit < 8; bit++) {
      const dot = document.createElement('div');
      dot.className = 'bit';
      const idx = b * 8 + bit;
      dot.title = `Byte ${b}, Bit ${bit}`;
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedBits.has(idx)) selectedBits.delete(idx); else selectedBits.add(idx);
        let count = 0;
        for (let k = 0; k < 8; k++) if (selectedBits.has(b * 8 + k)) count++;
        if (count === 8) selectedBytes.add(b); else if (count === 0) selectedBytes.delete(b);
        updateByteVisual(wrap, b);
      });
      bits.appendChild(dot);
    }

    wrap.appendChild(bits);
    wrap.appendChild(box);
    els.bitgrid.appendChild(wrap);
    updateByteVisual(wrap, b);
  }
}

function updateByteVisual(wrap, b) {
  const bits = wrap.querySelectorAll('.bit');
  let count = 0;
  for (let i = 0; i < 8; i++) {
    const idx = b * 8 + i;
    const el = bits[i];
    if (selectedBits.has(idx)) { el.classList.add('selected'); count++; }
    else { el.classList.remove('selected'); }
  }
  const box = wrap.querySelector('.byte-box');
  box.classList.remove('full', 'partial');
  if (count === 8) box.classList.add('full');
  else if (count > 0) box.classList.add('partial');
}

async function loadMakes() {
  els.make.innerHTML = '';
  const makes = await fetchJSON('/api/makes');
  const def = document.createElement('option');
  def.value = '';
  def.textContent = '— выберите марку —';
  def.disabled = true;
  def.selected = true;
  els.make.appendChild(def);
  for (const m of makes) {
    const o = document.createElement('option');
    o.value = m; o.textContent = m;
    els.make.appendChild(o);
  }
}

async function loadModels(make) {
  els.model.disabled = true;
  els.model.innerHTML = '';
  els.generationRow.style.display = 'none';
  els.generation.innerHTML = '';
  if (!make) return;
  const models = await fetchJSON(`/api/models?make=${encodeURIComponent(make)}`);
  const def = document.createElement('option');
  def.value = '';
  def.textContent = '— выберите модель —';
  def.disabled = true;
  def.selected = true;
  els.model.appendChild(def);
  for (const m of models) {
    const o = document.createElement('option');
    o.value = m; o.textContent = m;
    els.model.appendChild(o);
  }
  els.model.disabled = false;
}

async function loadGenerations(make, model) {
  els.generationRow.style.display = 'none';
  els.generation.innerHTML = '';
  if (!make || !model) return null;
  const gens = await fetchJSON(`/api/generations?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`);
  if (gens.length === 0) return null;
  const def = document.createElement('option');
  def.value = '';
  def.textContent = '— выберите поколение —';
  def.disabled = true;
  def.selected = true;
  els.generation.appendChild(def);
  for (const g of gens) {
    const o = document.createElement('option');
    o.value = String(g.id);
    o.textContent = g.label || `generation ${g.id}`;
    els.generation.appendChild(o);
  }
  els.generationRow.style.display = '';
  return null;
}

async function loadParameters() {
  // Load first 200 for datalist
  const params = await fetchJSON('/api/parameters?limit=200');
  els.paramList.innerHTML = '';
  paramIndex.clear();
  for (const p of params) {
    const opt = document.createElement('option');
    opt.value = p.name;
    els.paramList.appendChild(opt);
    if (!paramIndex.has(p.name)) paramIndex.set(p.name, p.id);
  }
  // Add a bottom option for custom entry
  const custom = document.createElement('option');
  custom.value = 'Другое (ввести вручную)';
  els.paramList.appendChild(custom);
}

async function resolveParameterIdByName(name) {
  if (!name) return { id: null, isCustom: false };
  if (name === 'Другое (ввести вручную)') return { id: null, isCustom: true };
  if (paramIndex.has(name)) return { id: paramIndex.get(name), isCustom: false };
  try {
    const res = await fetchJSON(`/api/parameters?query=${encodeURIComponent(name)}&limit=50`);
    const exact = res.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (exact) return { id: exact.id, isCustom: false };
    return { id: null, isCustom: true };
  } catch (e) {
    return { id: null, isCustom: true };
  }
}

function currentVehicleId() {
  // vehicle_id now represents generationId
  return els.generation.value ? parseInt(els.generation.value, 10) : null;
}

els.make.addEventListener('change', async () => {
  await loadModels(els.make.value);
});

els.model.addEventListener('change', async () => {
  await loadGenerations(els.make.value, els.model.value);
});

els.param.addEventListener('input', () => {
  const v = els.param.value.trim();
  const isCustom = v && (!paramIndex.has(v) || v === 'Другое (ввести вручную)');
  els.paramCustomContainer.style.display = isCustom ? '' : 'none';
  if (v === 'Другое (ввести вручную)') {
    els.paramCustomInput.focus();
  } else if (!isCustom) {
    els.paramCustomInput.value = '';
  }
});

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('Отправка...', true);

  try {
    const vehicleId = currentVehicleId();
    const paramName = els.param.value.trim();
    const { id: parameterId, isCustom } = await resolveParameterIdByName(paramName);
    const customName = isCustom ? (els.paramCustomInput.value.trim() || (paramName === 'Другое (ввести вручную)' ? '' : paramName)) : null;

    if (!vehicleId) throw new Error('Выберите марку/модель/поколение.');
    if (!parameterId && !customName) throw new Error('Параметр не найден. Укажите своё название.');
    const canId = els.can_id.value.trim();
    if (!canId) throw new Error('Укажите CAN ID.');
    const endian = els.endian.value;
    if (!endian) throw new Error('Выберите направление чтения (endianness).');

    const payload = {
      vehicle_id: vehicleId,
      parameter_id: parameterId,
      parameter_name: customName || undefined,
      can_id: canId,
      formula: els.formula.value || null,
      endian,
      notes: els.notes.value || null,
      selected_bytes: Array.from(selectedBytes).sort((a,b)=>a-b),
      selected_bits: Array.from(selectedBits).sort((a,b)=>a-b),
    };

    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `Ошибка ${res.status}`);
    }
    const data = await res.json();
    setStatus(`Сохранено (id=${data.id}).`, true);
    els.form.reset();
    els.model.disabled = true;
    if (els.generationRow) els.generationRow.style.display = 'none';
    if (els.generation) els.generation.innerHTML = '';
    selectedBytes.clear();
    selectedBits.clear();
    renderBitGrid();
  } catch (err) {
    setStatus(err.message || String(err), false);
  }
});

async function init() {
  await initDbCheck();
  try {
    await Promise.all([loadMakes(), loadParameters()]);
  } catch (e) {
    // Already indicated in DB check block
  }
  renderBitGrid();
}

init();
