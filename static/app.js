async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

const els = {
  make: document.getElementById('make'),
  model: document.getElementById('model'),
  vehicleRow: document.getElementById('vehicle-row'),
  vehicle: document.getElementById('vehicle'),
  param: document.getElementById('param'),
  paramList: document.getElementById('param-list'),
  can_id: document.getElementById('can_id'),
  multiplier: document.getElementById('multiplier'),
  offset: document.getElementById('offset'),
  notes: document.getElementById('notes'),
  form: document.getElementById('submit-form'),
  status: document.getElementById('status'),
  dbCheck: document.getElementById('db-check'),
};

// In-memory parameter cache: name -> id
let paramIndex = new Map();

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
  els.vehicleRow.style.display = 'none';
  els.vehicle.innerHTML = '';
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

async function loadVehicles(make, model) {
  els.vehicleRow.style.display = 'none';
  els.vehicle.innerHTML = '';
  if (!make || !model) return null;
  const v = await fetchJSON(`/api/vehicles?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`);
  if (v.length === 0) return null;
  if (v.length === 1) {
    els.vehicle.dataset.singleId = String(v[0].id);
    return v[0].id;
  }
  els.vehicle.removeAttribute('data-single-id');
  els.vehicleRow.style.display = '';
  for (const item of v) {
    const o = document.createElement('option');
    o.value = String(item.id);
    o.textContent = `${item.make} ${item.model} (id=${item.id})`;
    els.vehicle.appendChild(o);
  }
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
}

async function resolveParameterIdByName(name) {
  if (!name) return null;
  if (paramIndex.has(name)) return paramIndex.get(name);
  try {
    const res = await fetchJSON(`/api/parameters?query=${encodeURIComponent(name)}&limit=50`);
    const exact = res.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact.id;
    return res.length ? res[0].id : null;
  } catch (e) {
    return null;
  }
}

function currentVehicleId() {
  if (els.vehicleRow.style.display === 'none') {
    return els.vehicle.dataset.singleId ? parseInt(els.vehicle.dataset.singleId, 10) : null;
  }
  return els.vehicle.value ? parseInt(els.vehicle.value, 10) : null;
}

els.make.addEventListener('change', async () => {
  await loadModels(els.make.value);
});

els.model.addEventListener('change', async () => {
  await loadVehicles(els.make.value, els.model.value);
});

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('Отправка...', true);

  try {
    const vehicleId = currentVehicleId();
    const paramName = els.param.value.trim();
    const parameterId = await resolveParameterIdByName(paramName);

    if (!vehicleId) throw new Error('Выберите марку/модель (ТС не найдено).');
    if (!parameterId) throw new Error('Параметр не найден в БД.');
    const canId = els.can_id.value.trim();
    if (!canId) throw new Error('Укажите CAN ID.');

    const payload = {
      vehicle_id: vehicleId,
      parameter_id: parameterId,
      can_id: canId,
      multiplier: els.multiplier.value !== '' ? parseFloat(els.multiplier.value) : null,
      offset: els.offset.value !== '' ? parseFloat(els.offset.value) : null,
      notes: els.notes.value || null,
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
    els.vehicleRow.style.display = 'none';
    els.vehicle.innerHTML = '';
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
}

init();

