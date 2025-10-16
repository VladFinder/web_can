// Utilities
async function fetchJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`); return r.json(); }

// Elements
const els = {
  make: document.getElementById('make'), model: document.getElementById('model'),
  generationRow: document.getElementById('generation-row'), generation: document.getElementById('generation'),
  makeCustomWrap: document.getElementById('make-custom'), makeCustomInput: document.getElementById('make_name'),
  modelCustomWrap: document.getElementById('model-custom'), modelCustomInput: document.getElementById('model_name'),
  genCustomWrap: document.getElementById('generation-custom'), genCustomInput: document.getElementById('generation_name'),
  addParamBtn: document.getElementById('add-param'), paramsContainer: document.getElementById('params-container'),
  form: document.getElementById('submit-form'), status: document.getElementById('status'), dbCheck: document.getElementById('db-check'),
  paramList: document.getElementById('param-list'), existingList: document.getElementById('existing-params'), existingInfo: document.getElementById('existing-info'),
  openExistingBtn: document.getElementById('open-existing'), drawer: document.getElementById('drawer'), backdrop: document.getElementById('backdrop'), closeDrawerBtn: document.getElementById('close-drawer'),
  themeToggle: document.getElementById('theme-toggle'),
};

// State
let paramIndex = new Map();
let paramItems = [];

// Helpers
function setStatus(msg, ok=true){ if(!els.status) return; els.status.textContent=msg; els.status.className= ok?'status ok':'status err'; }
function setDbCheck(msg, ok=true){ if(!els.dbCheck) return; els.dbCheck.textContent=msg; els.dbCheck.className= ok?'muted':'err'; }

// Initial DB reachability
async function initDbCheck(){ try{ const makes=await fetchJSON('/api/makes'); setDbCheck(`БД доступна. Марок: ${makes.length}.`);} catch(e){ setDbCheck(`БД недоступна: ${e.message}. Поместите db.sqlite в корень или задайте WEB_CAN_DB.`, false);} }

// Loaders
async function loadMakes(){ els.make.innerHTML=''; const makes=await fetchJSON('/api/makes'); const def=document.createElement('option'); def.value=''; def.textContent='— выберите марку —'; def.disabled=true; def.selected=true; els.make.appendChild(def); for(const m of makes){ const o=document.createElement('option'); o.value=m; o.textContent=m; els.make.appendChild(o);} const custom=document.createElement('option'); custom.value='__custom__'; custom.textContent='Другое (ввести вручную)'; els.make.appendChild(custom); }
async function loadModels(make){ els.model.disabled=true; els.model.innerHTML=''; els.generationRow.style.display='none'; els.generation.innerHTML=''; if(!make || make==='__custom__'){ els.model.disabled=false; const custom=document.createElement('option'); custom.value='__custom__'; custom.textContent='Другое (ввести вручную)'; custom.selected=true; els.model.appendChild(custom); if(els.modelCustomWrap) els.modelCustomWrap.style.display=''; els.generationRow.style.display=''; els.generation.innerHTML=''; const gOpt=document.createElement('option'); gOpt.value='__custom__'; gOpt.textContent='Другое (ввести вручную)'; gOpt.selected=true; els.generation.appendChild(gOpt); if(els.genCustomWrap) els.genCustomWrap.style.display=''; return;} const models=await fetchJSON(`/api/models?make=${encodeURIComponent(make)}`); const def=document.createElement('option'); def.value=''; def.textContent='— выберите модель —'; def.disabled=true; def.selected=true; els.model.appendChild(def); for(const m of models){ const o=document.createElement('option'); o.value=m; o.textContent=m; els.model.appendChild(o);} const custom=document.createElement('option'); custom.value='__custom__'; custom.textContent='Другое (ввести вручную)'; els.model.appendChild(custom); els.model.disabled=false; if(els.modelCustomWrap) els.modelCustomWrap.style.display='none'; if(els.genCustomWrap) els.genCustomWrap.style.display='none'; }
async function loadGenerations(make, model){ els.generationRow.style.display='none'; els.generation.innerHTML=''; if(!make || !model || make==='__custom__' || model==='__custom__'){ els.generationRow.style.display=''; const custom=document.createElement('option'); custom.value='__custom__'; custom.textContent='Другое (ввести вручную)'; custom.selected=true; els.generation.appendChild(custom); if(els.genCustomWrap) els.genCustomWrap.style.display=''; return null;} const gens=await fetchJSON(`/api/generations?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`); const def=document.createElement('option'); def.value=''; def.textContent='— выберите поколение —'; def.disabled=true; def.selected=true; els.generation.appendChild(def); for(const g of gens){ const o=document.createElement('option'); o.value=String(g.id); o.textContent=g.label || `generation ${g.id}`; els.generation.appendChild(o);} const custom=document.createElement('option'); custom.value='__custom__'; custom.textContent='Другое (ввести вручную)'; els.generation.appendChild(custom); els.generationRow.style.display=''; }
async function loadParameters(){ const params=await fetchJSON('/api/parameters?limit=2000'); els.paramList.innerHTML=''; paramIndex.clear(); for(const p of params){ const opt=document.createElement('option'); opt.value=p.name; els.paramList.appendChild(opt); if(!paramIndex.has(p.name)) paramIndex.set(p.name,p.id);} const custom=document.createElement('option'); custom.value='Другое (ввести вручную)'; els.paramList.appendChild(custom); }
async function loadBusTypes(){ try{return await fetchJSON('/api/bus-types');}catch{return[]} }
async function loadCanBuses(){ try{return await fetchJSON('/api/can-buses');}catch{return[]} }
async function loadDimensionTypes(){ try{return await fetchJSON('/api/dimensions');}catch{return[]} }

// Vehicle state
function currentVehicleId(){ if(els.generation && els.generation.value && els.generation.value!=='__custom__') return parseInt(els.generation.value,10); return null; }

// Events
els.make.addEventListener('change', async()=>{ const isCustom=els.make.value==='__custom__'; els.makeCustomWrap.style.display=isCustom?'':'none'; await loadModels(els.make.value); });
els.model.addEventListener('change', async()=>{ const isCustom=els.model.value==='__custom__'; els.modelCustomWrap.style.display=isCustom?'':'none'; await loadGenerations(els.make.value, els.model.value); });
if(els.generation){ els.generation.addEventListener('change',()=>{ const isCustom=els.generation.value==='__custom__'; els.genCustomWrap.style.display=isCustom?'':'none'; const gid=currentVehicleId(); if(els.drawer && els.drawer.classList.contains('open')){ if(gid) loadExistingParams(gid); else { if(els.existingList) els.existingList.innerHTML=''; if(els.existingInfo) els.existingInfo.textContent='Кастомное ТС или поколение не выбрано.'; } } }); }

// Submit
els.form.addEventListener('submit', async (e)=>{ e.preventDefault(); setStatus('Отправка...', true); try{ const vehicleId=currentVehicleId(); let generationLabel=null; if(els.generation && els.generation.selectedOptions && els.generation.selectedOptions.length){ generationLabel=els.generation.selectedOptions[0].textContent; } const payload={ vehicle_id: vehicleId, make: els.make.value==='__custom__'? null: els.make.value, make_custom: els.makeCustomInput.value||null, model: els.model.value==='__custom__'? null: els.model.value, model_custom: els.modelCustomInput.value||null, generation_label: generationLabel, generation_custom: els.genCustomInput.value||null, items: paramItems.map(it=>it.toJSON()) };
  const res=await fetch('/api/submissions',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
  if(!res.ok){ const detail=await res.json().catch(()=>({})); throw new Error(detail.detail || `Ошибка ${res.status}`); }
  const data=await res.json(); setStatus(`Сохранено (${data.saved || 0} шт.).`, true);
  els.form.reset(); els.model.disabled=true; if(els.generationRow) els.generationRow.style.display='none'; if(els.generation) els.generation.innerHTML=''; els.paramsContainer.innerHTML=''; paramItems=[]; addParamItem(); const gid=currentVehicleId(); if(els.drawer && els.drawer.classList.contains('open') && gid) loadExistingParams(gid);
} catch(err){ setStatus(err.message || String(err), false);} });

// Init
async function init(){ await initDbCheck(); try{ await Promise.all([loadMakes(), loadParameters()]); }catch(e){} addParamItem(); initTheme(); }
init();

// Add parameter item
function addParamItem(){ const idx=paramItems.length+1; const node=document.createElement('div'); node.className='param-item'; node.innerHTML=`
    <div class="param-title">Параметр #${idx}</div>
    <div class="param-grid three">
      <div>
        <label>Параметр</label>
        <input list="param-list" class="param-input" placeholder="например: Обороты двигателя" />
        <div class="row" style="display:none; margin-top:6px;">
          <label>Своё название</label>
          <input class="param-custom" placeholder="Введите название" />
        </div>
      </div>
      <div>
        <label>CAN ID</label>
        <input class="can-id" placeholder="0x123" />
      </div>
      <div>
        <label>Формула</label>
        <input class="formula" placeholder="(value * 0.1) - 40" />
      </div>
      <div>
        <label>Направление чтения</label>
        <select class="endian">
          <option value="" disabled selected>— выберите endianness —</option>
          <option value="little">Little-endian</option>
          <option value="big">Big-endian</option>
        </select>
      </div>
      <div>
        <label>ID 29-bit</label>
        <input type="checkbox" class="is29bit" />
      </div>
      <div>
        <label>Тип шины</label>
        <select class="bus-type"></select>
      </div>
      <div>
        <label>Скорость шины</label>
        <select class="bus-speed"></select>
      </div>
      <div>
        <label>Размерность (ед.)</label>
        <select class="dimension"></select>
      </div>
      <div>
        <label>Смещение (бит)</label>
        <input type="number" min="0" max="63" step="1" class="offset-bits" placeholder="0" />
      </div>
      <div>
        <label>Длина (бит)</label>
        <input type="number" min="0" max="64" step="1" class="length-bits" placeholder="0" />
      </div>
    </div>
    <div class="row" style="margin-top:8px;">
      <label>Выбор байтов и битов</label>
      <div class="bitgrid"></div>
      <div class="hint">Клик по байту — выбрать все биты. Клик по биту — частичный выбор.</div>
    </div>
    <div class="param-actions"><button type="button" class="remove-param">Удалить</button></div>
  `; const item=makeParamItem(node); paramItems.push(item); els.paramsContainer.appendChild(node); }

function makeParamItem(node){ const input=node.querySelector('.param-input'); const customWrap=node.querySelector('.row'); const customInput=node.querySelector('.param-custom'); const canId=node.querySelector('.can-id'); const formula=node.querySelector('.formula'); const endian=node.querySelector('.endian'); const is29bit=node.querySelector('.is29bit'); const busType=node.querySelector('.bus-type'); const busSpeed=node.querySelector('.bus-speed'); const dimension=node.querySelector('.dimension'); const bitgrid=node.querySelector('.bitgrid'); const removeBtn=node.querySelector('.remove-param'); const offsetBits=node.querySelector('.offset-bits'); const lengthBits=node.querySelector('.length-bits');
  const bits=new Set();
  function updateVisualByte(wrap,b){ const dots=wrap.querySelectorAll('.bit'); let count=0; for(let i=0;i<8;i++){ const idx=b*8+i; const el=dots[i]; if(bits.has(idx)){ el.classList.add('selected'); count++; } else { el.classList.remove('selected'); } } const box=wrap.querySelector('.byte-box'); box.classList.remove('full','partial'); if(count===8) box.classList.add('full'); else if(count>0) box.classList.add('partial'); }
  for(let b=0;b<8;b++){ const wrap=document.createElement('div'); wrap.className='byte'; const dots=document.createElement('div'); dots.className='bits'; const box=document.createElement('div'); box.className='byte-box'; box.title=`Byte ${b}`; box.addEventListener('click',()=>{ let full=true; for(let i=0;i<8;i++){ if(!bits.has(b*8+i)){ full=false; break; } } if(full){ for(let i=0;i<8;i++) bits.delete(b*8+i);} else { for(let i=0;i<8;i++) bits.add(b*8+i);} updateVisualByte(wrap,b); updateOffsetLengthFromBits(); }); for(let i=0;i<8;i++){ const d=document.createElement('div'); d.className='bit'; const idx=b*8+i; d.title=`Byte ${b}, Bit ${i}`; d.addEventListener('click',(e)=>{ e.stopPropagation(); if(bits.has(idx)) bits.delete(idx); else bits.add(idx); updateVisualByte(wrap,b); updateOffsetLengthFromBits(); }); dots.appendChild(d);} wrap.appendChild(dots); wrap.appendChild(box); bitgrid.appendChild(wrap); updateVisualByte(wrap,b); }
  (async()=>{ const [types,buses,dims]=await Promise.all([loadBusTypes(), loadCanBuses(), loadDimensionTypes()]); busType.innerHTML=''; if(types.length){ for(const t of types){ const o=document.createElement('option'); o.value=t.id; o.textContent=t.name; busType.appendChild(o);} } else { const o1=document.createElement('option'); o1.value='0'; o1.textContent='Основная'; busType.appendChild(o1); const o2=document.createElement('option'); o2.value='1'; o2.textContent='Вспомогательная'; busType.appendChild(o2);} busSpeed.innerHTML=''; for(const b of buses){ const o=document.createElement('option'); o.value=b.id; o.textContent = (b.baudrate ?? '') + (b.name?` (${b.name})`: ''); busSpeed.appendChild(o);} dimension.innerHTML=''; const ddef=document.createElement('option'); ddef.value=''; ddef.textContent='— выберите тип —'; ddef.disabled=true; ddef.selected=true; dimension.appendChild(ddef); for(const d of dims){ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; dimension.appendChild(o);} })();
  function refreshAllBytes(){ const wraps=bitgrid.querySelectorAll('.byte'); for(let b=0;b<wraps.length;b++){ updateVisualByte(wraps[b],b);} }
  function applyOffsetLengthToBits(){ const off=parseInt(offsetBits.value,10); const len=parseInt(lengthBits.value,10); if(isNaN(off)||isNaN(len)||len<=0){ bits.clear(); refreshAllBytes(); return;} bits.clear(); const end=Math.min(64, off+len); for(let i=off;i<end;i++) bits.add(i); refreshAllBytes(); }
  function updateOffsetLengthFromBits(){ if(bits.size===0){ offsetBits.value=''; lengthBits.value=''; return;} const arr=Array.from(bits).sort((a,b)=>a-b); const off=arr[0]; const len=arr[arr.length-1]-arr[0]+1; offsetBits.value=String(off); lengthBits.value=String(len); }
  offsetBits.addEventListener('input', applyOffsetLengthToBits); lengthBits.addEventListener('input', applyOffsetLengthToBits);
  input.addEventListener('input',()=>{ const v=input.value.trim(); const isCustom=v && (!paramIndex.has(v) || v==='Другое (ввести вручную)'); customWrap.style.display=isCustom?'':''; if(v==='Другое (ввести вручную)') customInput.focus(); });
  removeBtn.addEventListener('click',()=>{ node.remove(); const i=paramItems.indexOf(api); if(i>=0) paramItems.splice(i,1); });
  const api={ toJSON(){ const name=input.value.trim(); const match=paramIndex.has(name); const paramId=match? paramIndex.get(name): null; const isCustom=!match || name==='Другое (ввести вручную)'; const customName=isCustom? (customInput.value.trim() || (name==='Другое (ввести вручную)'? '' : name)) : null; const endianVal=endian.value; if(!canId.value.trim()) throw new Error('Укажите CAN ID для одного из параметров.'); if(!endianVal) throw new Error('Выберите направление чтения для одного из параметров.'); return { parameter_id:paramId, parameter_name:customName||undefined, can_id:canId.value.trim(), formula:formula.value||null, endian:endianVal, is29bit: is29bit.checked, bus_type_id:busType.value||null, can_bus_id:busSpeed.value||null, offset_bits: offsetBits.value!==''? parseInt(offsetBits.value,10): null, length_bits: lengthBits.value!==''? parseInt(lengthBits.value,10): null, dimension_id: dimension.value||null, notes:null, selected_bits:Array.from(bits).sort((a,b)=>a-b), selected_bytes:Array.from(new Set(Array.from(bits).map(x=>Math.floor(x/8)))).sort((a,b)=>a-b), }; } }; return api; }

// Drawer
function openDrawer(){ if(!els.drawer) return; els.drawer.classList.add('open'); if(els.backdrop) els.backdrop.classList.add('show'); const gid=currentVehicleId(); if(gid) loadExistingParams(gid); else { if(els.existingList) els.existingList.innerHTML=''; if(els.existingInfo) els.existingInfo.textContent='Кастомное ТС или поколение не выбрано.'; } }
function closeDrawer(){ if(!els.drawer) return; els.drawer.classList.remove('open'); if(els.backdrop) els.backdrop.classList.remove('show'); }
if(els.openExistingBtn) els.openExistingBtn.addEventListener('click', openDrawer);
if(els.closeDrawerBtn) els.closeDrawerBtn.addEventListener('click', closeDrawer);
if(els.backdrop) els.backdrop.addEventListener('click', closeDrawer);
async function loadExistingParams(generationId){ try{ const items=await fetchJSON(`/api/generation-parameters?generation_id=${encodeURIComponent(generationId)}`); if(els.existingList){ els.existingList.innerHTML=''; for(const it of items){ const li=document.createElement('li'); const name=document.createElement('span'); name.textContent=it.name; const badge=document.createElement('span'); badge.className='badge'; badge.textContent=`x${it.entries}`; li.appendChild(name); li.appendChild(badge); els.existingList.appendChild(li);} } if(els.existingInfo){ els.existingInfo.textContent = items.length ? `Найдено: ${items.length}` : 'Нет параметров для этого поколения.'; } }catch(e){ if(els.existingInfo) els.existingInfo.textContent = `Ошибка загрузки: ${e.message}`; } }

// Theme
function applyTheme(theme){ const root=document.documentElement; if(theme==='light') root.setAttribute('data-theme','light'); else if(theme==='dark') root.setAttribute('data-theme','dark'); else root.removeAttribute('data-theme'); updateThemeLabel(); }
function updateThemeLabel(){ if(!els.themeToggle) return; const cur=document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: light)').matches? 'light':'dark'); els.themeToggle.textContent = cur==='light'? '🌞 Светлая':'🌙 Тёмная'; }
function initTheme(){ const saved=localStorage.getItem('theme'); if(saved){ applyTheme(saved);} else { updateThemeLabel(); } if(els.themeToggle){ els.themeToggle.addEventListener('click', ()=>{ const cur=document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: light)').matches? 'light':'dark'); const next=cur==='light'?'dark':'light'; applyTheme(next); localStorage.setItem('theme', next); }); } }
