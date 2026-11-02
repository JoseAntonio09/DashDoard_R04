'use strict';

const STORAGE_KEY = 'dashboard_tareas_v2';
const STATUSES = ['Pendiente', 'En proceso', 'Finalizada', 'Cancelada'];
const PRIORITIES = ['Alta', 'Media', 'Baja'];
const $ = (id) => document.getElementById(id);
const makeId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const clamp = value => Math.min(100, Math.max(0, Number(value) || 0));
const moduleProgress = m => m.activities?.length ? 100 * m.activities.filter(a => a.done).length / m.activities.length : (m.done ? 100 : 0);
const normalizeModule = m => ({id:String(m.id || makeId()), name:m.name, detail:String(m.detail || ''), done: m.done === true || (!Array.isArray(m.activities) && clamp(m.progress) === 100), activities: Array.isArray(m.activities) ? m.activities.filter(a=>a && typeof a.name==='string').map(a=>({id:String(a.id||makeId()),name:a.name,done:a.done===true})) : []});

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter(t => t && typeof t.id === 'string' &&
      typeof t.description === 'string' && STATUSES.includes(t.status) &&
      PRIORITIES.includes(t.priority) &&
      (t.dueDate === '' || /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate))).map(t => ({...t, modules: Array.isArray(t.modules) ? t.modules.filter(m => m && typeof m.name === 'string').map(m => normalizeModule(m)) : []}));
  } catch (error) {
    console.error('No se pudieron leer las tareas:', error);
    return [];
  }
}

let tasks = loadTasks();
let editingId = null;
let draftModules = [];
const progressOf = task => task.modules.length ? task.modules.reduce((sum,m) => sum + moduleProgress(m),0)/task.modules.length : (task.status === "Finalizada" ? 100 : 0);

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch (error) {
    console.error('Error al guardar:', error);
    alert('No se pudieron guardar los cambios en localStorage.');
    return false;
  }
}

function updateTasks(nextTasks) {
  const previous = tasks;
  tasks = nextTasks;
  if (!persist()) {
    tasks = previous;
    return false;
  }
  render();
  return true;
}

function resetForm() {
  editingId = null;
  draftModules = [];
  renderModuleFields();
  $('taskForm').reset();
  $('formTitle').textContent = 'Nueva tarea';
  $('saveButton').textContent = 'Agregar tarea';
  $('cancelEdit').hidden = true;
}

$('taskForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const description = $('description').value.trim();
  if (!description) {
    alert('Escribe una descripción.');
    $('description').focus();
    return;
  }

  const data = {
    description,
    status: $('status').value,
    priority: $('priority').value,
    dueDate: $('dueDate').value,
    modules: draftModules.map(m => ({...m, name:m.name.trim(), detail:m.detail.trim(), done:m.done===true, activities:m.activities.map(a=>({...a,name:a.name.trim()}))}))
  };

  if (data.modules.some(m => !m.name || m.activities.some(a=>!a.name))) { alert('Todos los módulos y actividades deben tener un nombre.'); return; }
  if (editingId !== null) {
    if (!tasks.some(task => task.id === editingId)) {
      alert('La tarea ya no existe.');
      resetForm();
      return;
    }
    if (updateTasks(tasks.map(task => task.id === editingId ? {...task, ...data} : task))) resetForm();
  } else {
    const id = makeId();
    if (updateTasks([{id, ...data, createdAt: new Date().toISOString()}, ...tasks])) resetForm();
  }
});

$('cancelEdit').addEventListener('click', resetForm);
$('searchInput').addEventListener('input', render);
$('statusFilter').addEventListener('change', render);
$('priorityFilter').addEventListener('change', render);

function formatDate(iso) {
  if (!iso) return 'Sin vencimiento';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function isOverdue(task) {
  if (!task.dueDate || ['Finalizada', 'Cancelada'].includes(task.status)) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  return task.dueDate < today;
}

function renderSummary() {
  const counts = Object.fromEntries(STATUSES.map(status => [status, tasks.filter(t => t.status === status).length]));
  $('totalCount').textContent = tasks.length;
  $('pendingCount').textContent = counts.Pendiente;
  $('progressCount').textContent = counts['En proceso'];
  $('completedCount').textContent = counts.Finalizada;
  $('cancelledCount').textContent = counts.Cancelada;
  const eligible = tasks.length - counts.Cancelada;
  const percent = eligible ? Math.round((counts.Finalizada / eligible) * 100) : 0;
  $('completionText').textContent = `${percent}%`;
  $('completionFill').style.width = `${percent}%`;
  $('completionBar').setAttribute('aria-valuenow', String(percent));
  const active = tasks.filter(t => t.status !== 'Cancelada');
  const overall = active.length ? active.reduce((sum,t) => sum + progressOf(t),0)/active.length : 0;
  $('overallText').textContent = `${Math.round(overall)}%`;
  $('overallFill').style.width = `${overall}%`;
}

function makePill(label, cssClass) {
  const span = document.createElement('span');
  span.className = `pill ${cssClass}`;
  span.textContent = label;
  return span;
}

function render() {
  renderSummary();
  const query = $('searchInput').value.trim().toLocaleLowerCase('es');
  const status = $('statusFilter').value;
  const priority = $('priorityFilter').value;
  const visible = tasks.filter(task =>
    task.description.toLocaleLowerCase('es').includes(query) &&
    (!status || task.status === status) &&
    (!priority || task.priority === priority)
  );

  const list = $('taskList');
  const expanded = new Set([...list.querySelectorAll('details[open]')].map(el=>el.dataset.taskId));
  list.replaceChildren();
  $('resultCount').textContent = `${visible.length} resultado${visible.length === 1 ? '' : 's'}`;
  $('emptyMessage').hidden = visible.length > 0;

  for (const task of visible) {
    const article = document.createElement('article');
    article.className = 'task';
    const content = document.createElement('div');
    content.className = 'task-content';
    const description = document.createElement('p');
    description.className = 'task-description';
    description.textContent = task.description; // Evita inyectar HTML de usuarios
    const meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.append(
      makePill(task.status, `status-${task.status.toLowerCase().replaceAll(' ', '-')}`),
      makePill(`Prioridad ${task.priority}`, `priority-${task.priority.toLowerCase()}`)
    );
    const due = document.createElement('span');
    due.className = `due${isOverdue(task) ? ' overdue' : ''}`;
    due.textContent = `Vence: ${formatDate(task.dueDate)}${isOverdue(task) ? ' · VENCIDA' : ''}`;
    meta.append(due);
    content.append(description, meta);
    if (task.modules.length) {
      const progress = progressOf(task);
      const progressLabel = document.createElement('p');
      progressLabel.className = 'module-progress-label';
      progressLabel.textContent = `Avance de tarea: ${progress.toFixed(1)}% · ${task.modules.length} módulo(s)`;
      const bar = document.createElement('div'); bar.className = 'progress-track small-track';
      const fill = document.createElement('div'); fill.className = 'module-fill'; fill.style.width = `${progress}%`; bar.append(fill);
      const details = document.createElement('details'); details.className = 'module-details'; details.dataset.taskId=task.id;details.open=expanded.has(task.id);
      const summary = document.createElement('summary'); summary.textContent = 'Ver detalles de módulos'; details.append(summary);
      for (const m of task.modules) {
        const item = document.createElement('div'); item.className = 'module-item';
        const head = document.createElement('div'); head.className = 'module-item-head';
        const name = document.createElement('strong'); name.textContent = m.name;
        const percent = document.createElement('span'); percent.textContent = `${Math.round(moduleProgress(m))}%`;
        head.append(name, percent);
        const note = document.createElement('p'); note.textContent = m.detail || 'Sin detalles';
        const track = document.createElement('div'); track.className = 'progress-track small-track';
        const inner = document.createElement('div'); inner.className = 'module-fill'; inner.style.width = `${Math.round(moduleProgress(m))}%`; track.append(inner);
        item.append(head, note, track);
        if (m.activities.length) {
          for (const activity of m.activities) {
            const label=document.createElement('label');label.className='check-line';
            const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=activity.done;
            checkbox.onchange=()=>toggleActivity(task.id,m.id,activity.id,checkbox.checked);
            label.append(checkbox,document.createTextNode(activity.name));item.append(label);
          }
        } else {
          const label=document.createElement('label');label.className='check-line';
          const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=m.done;
          checkbox.onchange=()=>toggleModule(task.id,m.id,checkbox.checked);
          label.append(checkbox,document.createTextNode('Módulo finalizado'));item.append(label);
        }
        details.append(item);
      }
      content.append(progressLabel, bar, details);
    }

    const buttons = document.createElement('div');
    buttons.className = 'task-buttons';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn secondary';
    edit.textContent = 'Editar';
    edit.addEventListener('click', () => editTask(task.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn danger';
    remove.textContent = 'Eliminar';
    remove.addEventListener('click', () => deleteTask(task.id));
    buttons.append(edit, remove);
    article.append(content, buttons);
    list.append(article);
  }
}

function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingId = id;
  $('description').value = task.description;
  $('status').value = task.status;
  $('priority').value = task.priority;
  $('dueDate').value = task.dueDate;
  draftModules = task.modules.map(m => ({...m,activities:m.activities.map(a=>({...a}))}));
  renderModuleFields();
  $('formTitle').textContent = 'Editar tarea';
  $('saveButton').textContent = 'Guardar cambios';
  $('cancelEdit').hidden = false;
  $('description').focus();
  $('taskForm').scrollIntoView({behavior:'smooth', block:'center'});
}

function deleteTask(id) {
  if (!confirm('¿Seguro que deseas eliminar esta tarea?')) return;
  if (updateTasks(tasks.filter(t => t.id !== id)) && editingId === id) resetForm();
}

render();

function renderModuleFields() {
  const container = $('moduleFields'); container.replaceChildren();
  const field = (text, el) => {const label=document.createElement('label'); label.textContent=text;label.append(el);return label;};
  draftModules.forEach((module, index) => {
    const row=document.createElement('div');row.className='module-editor-row';
    const heading=document.createElement('div');heading.className='module-item-head';
    const title=document.createElement('strong');title.textContent=`Módulo ${index+1} · ${Math.round(moduleProgress(module))}%`;
    const remove=document.createElement('button');remove.type='button';remove.className='btn danger';remove.textContent='Quitar módulo';
    remove.onclick=()=>{draftModules.splice(index,1);renderModuleFields();};heading.append(title,remove);
    const grid=document.createElement('div');grid.className='module-grid';
    const name=document.createElement('input');name.value=module.name;name.required=true;name.maxLength=120;name.placeholder='Nombre del módulo';name.oninput=()=>module.name=name.value;
    const detail=document.createElement('textarea');detail.value=module.detail;detail.maxLength=1000;detail.placeholder='Detalles del módulo';detail.oninput=()=>module.detail=detail.value;
    grid.append(field('Nombre',name),field('Detalles',detail));
    const complete=document.createElement('label');complete.className='check-line';
    const check=document.createElement('input');check.type='checkbox';check.checked=module.done;check.disabled=module.activities.length>0;
    check.onchange=()=>{module.done=check.checked;renderModuleFields();};
    complete.append(check,document.createTextNode('Marcar módulo como finalizado (cuando no tiene actividades)'));
    const actions=document.createElement('div');actions.className='activity-list';
    module.activities.forEach((activity,i)=>{
      const line=document.createElement('div');line.className='activity-row';
      const tick=document.createElement('input');tick.type='checkbox';tick.checked=activity.done;tick.setAttribute('aria-label','Actividad finalizada');
      tick.onchange=()=>{activity.done=tick.checked;renderModuleFields();};
      const text=document.createElement('input');text.value=activity.name;text.placeholder='Descripción de la actividad';text.maxLength=200;text.required=true;text.oninput=()=>activity.name=text.value;
      const del=document.createElement('button');del.type='button';del.className='btn secondary';del.textContent='Quitar';del.onclick=()=>{module.activities.splice(i,1);renderModuleFields();};
      line.append(tick,text,del);actions.append(line);
    });
    const add=document.createElement('button');add.type='button';add.className='btn secondary';add.textContent='+ Agregar actividad';
    add.onclick=()=>{if(module.activities.length>=100)return alert('Máximo 100 actividades por módulo');module.activities.push({id:makeId(),name:'',done:false});module.done=false;renderModuleFields();};
    row.append(heading,grid,complete,actions,add);container.append(row);
  });
}
$('addModule').addEventListener('click', () => {
  if (draftModules.length >= 100) return alert('Máximo 100 módulos por tarea.');
  draftModules.push({id:makeId(),name:'',detail:'',done:false,activities:[]});renderModuleFields();
});

function toggleModule(taskId,moduleId,done) {
  updateTasks(tasks.map(t=>t.id!==taskId?t:{...t,modules:t.modules.map(m=>m.id!==moduleId?m:{...m,done})}));
}
function toggleActivity(taskId,moduleId,activityId,done) {
  updateTasks(tasks.map(t=>t.id!==taskId?t:{...t,modules:t.modules.map(m=>m.id!==moduleId?m:{...m,activities:m.activities.map(a=>a.id!==activityId?a:{...a,done})})}));
}


/* ===== EXPORTACIÓN DE REPORTES ===== */
function exportTasks() {
  if (!$('exportFiltered').checked) return tasks;
  const query = $('searchInput').value.trim().toLocaleLowerCase('es');
  const status = $('statusFilter').value;
  const priority = $('priorityFilter').value;
  return tasks.filter(t => t.description.toLocaleLowerCase('es').includes(query) &&
    (!status || t.status === status) && (!priority || t.priority === priority));
}

function reportRows(selected) {
  const rows = [];
  for (const task of selected) {
    rows.push(['Tarea',task.description,'',task.status,task.priority,formatDate(task.dueDate),`${progressOf(task).toFixed(1)}%`]);
    for (const mod of task.modules) {
      const progress = moduleProgress(mod);
      rows.push(['Módulo',task.description,mod.name,progress === 100 ? 'Finalizado' : 'En proceso','','',`${progress.toFixed(1)}%`]);
      if (mod.detail) rows.push(['Detalle',task.description,mod.name,mod.detail,'','','']);
      for (const act of mod.activities) {
        rows.push(['Actividad',task.description,`${mod.name} / ${act.name}`,act.done?'Finalizada':'Pendiente','','',act.done?'100%':'0%']);
      }
    }
  }
  return rows;
}

function downloadCSV() {
  const selected = exportTasks();
  if (!selected.length) return alert('No hay tareas para exportar.');
  const active = selected.filter(t=>t.status!=='Cancelada');
  const avg = active.length ? active.reduce((s,t)=>s+progressOf(t),0)/active.length : 0;
  const rows = [
    ['Reporte de tareas y módulos'],
    ['Generado',new Date().toLocaleString('es-MX')],
    ['Total de tareas',selected.length],
    ['Avance general',`${avg.toFixed(1)}%`],
    [],
    ['Tipo','Tarea','Módulo / Actividad','Estado / Detalle','Prioridad','Vencimiento','Avance'],
    ...reportRows(selected)
  ];
  const csv = '\uFEFF' + rows.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'reporte-tareas.csv'; document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function printReport() {
  const selected = exportTasks();
  if (!selected.length) return alert('No hay tareas para imprimir.');
  const active = selected.filter(t=>t.status!=='Cancelada');
  const avg = active.length ? active.reduce((s,t)=>s+progressOf(t),0)/active.length : 0;
  const report = document.createElement('section');
  report.className = 'print-report';
  const heading = document.createElement('h1'); heading.textContent = 'Reporte de tareas y módulos';
  const summary = document.createElement('p');
  summary.textContent = `Generado: ${new Date().toLocaleString('es-MX')} | Tareas: ${selected.length} | Avance general: ${avg.toFixed(1)}%`;
  report.append(heading,summary);
  for (const task of selected) {
    const block=document.createElement('article');block.className='print-task';
    const title=document.createElement('h2');title.textContent=task.description;
    const meta=document.createElement('p');meta.textContent=`${task.status} · Prioridad ${task.priority} · Vence: ${formatDate(task.dueDate)} · Avance ${progressOf(task).toFixed(1)}%`;
    block.append(title,meta);
    for (const mod of task.modules) {
      const modBlock=document.createElement('div');modBlock.className='print-module';
      const modTitle=document.createElement('h3');modTitle.textContent=`${mod.name} — ${moduleProgress(mod).toFixed(1)}%`;
      const detail=document.createElement('p');detail.textContent=mod.detail || 'Sin detalles';
      modBlock.append(modTitle,detail);
      if(mod.activities.length){
        const list=document.createElement('ul');
        for(const a of mod.activities){const li=document.createElement('li');li.textContent=`${a.done?'✓':'○'} ${a.name} — ${a.done?'100%':'0%'}`;list.append(li);}
        modBlock.append(list);
      } else {
        const state=document.createElement('p');state.textContent=mod.done?'Módulo finalizado':'Módulo pendiente';modBlock.append(state);
      }
      block.append(modBlock);
    }
    report.append(block);
  }
  document.body.append(report);
  const cleanup=()=>{report.remove();window.removeEventListener('afterprint',cleanup);};
  window.addEventListener('afterprint',cleanup);
  window.print();
}

$('exportExcel').addEventListener('click',downloadCSV);
$('exportPdf').addEventListener('click',printReport);
