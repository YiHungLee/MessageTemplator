/* === 狀態 === */
let templates = [];
let editingId = null;
let editorTags = [];
let editorVars = [];
let activeTagFilter = null;
let composeTemplate = null;
let composeEdited = false;
let tagSuggestHideTimer = null;

const API = '/api';

/* === 初始化 === */
document.addEventListener('DOMContentLoaded', () => {
  loadTemplates();
  setupBodyDropZone();
  startHeartbeat();
});

/* === 心跳：通知伺服器瀏覽器仍開啟 === */
function startHeartbeat() {
  const ping = () => fetch(`${API}/heartbeat`, { method: 'POST' }).catch(() => {});
  ping();
  setInterval(ping, 5000);
}

async function loadTemplates() {
  const res = await fetch(`${API}/templates`);
  templates = await res.json();
  renderAll();
}

function renderAll() {
  renderTagPool();
  renderTemplateCards();
  renderEditorSidebar();
}

/* === 頁面切換 === */
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  if (view === 'generate') {
    closeCompose();
    renderAll();
  } else {
    renderEditorSidebar();
    if (!editingId) newTemplate();
  }
}

/* ============================================================
   產生信件
   ============================================================ */

function renderTagPool() {
  const pool = document.getElementById('tag-pool');
  const tagCounts = {};
  templates.forEach(t => t.tags.forEach(tag => {
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }));
  pool.innerHTML = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) =>
      `<button class="tag ${activeTagFilter === tag ? 'active' : ''}" onclick="toggleTagFilter('${escHtml(tag)}')">${escHtml(tag)} (${count})</button>`
    ).join('');
}

function toggleTagFilter(tag) {
  activeTagFilter = activeTagFilter === tag ? null : tag;
  renderTagPool();
  renderTemplateCards();
}

function filterTemplates() {
  renderTemplateCards();
}

function renderTemplateCards() {
  const container = document.getElementById('template-cards');
  const query = document.getElementById('search-input').value.trim().toLowerCase();

  let filtered = templates;
  if (activeTagFilter) {
    filtered = filtered.filter(t => t.tags.includes(activeTagFilter));
  }
  if (query) {
    filtered = filtered.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      t.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="no-results">沒有找到符合的模板</div>';
    return;
  }

  container.innerHTML = filtered.map(t => `
    <div class="template-card" onclick="openCompose('${t.id}')">
      <h3>${escHtml(t.name)}</h3>
      ${t.description ? `<div class="card-desc">${escHtml(t.description)}</div>` : ''}
      <div class="card-tags">
        ${t.tags.map(tag => `<span class="card-tag">${escHtml(tag)}</span>`).join('')}
      </div>
      ${t.variables.length ? `<div class="card-vars">填入項目：${t.variables.map(v => v.name).join('、')}</div>` : ''}
    </div>
  `).join('');
}

/* --- 填寫 & 預覽 --- */
function openCompose(id) {
  composeTemplate = templates.find(t => t.id === id);
  if (!composeTemplate) return;
  composeEdited = false;

  document.getElementById('template-cards').classList.add('hidden');
  document.getElementById('tag-pool').classList.add('hidden');
  document.querySelector('.search-bar').classList.add('hidden');
  document.getElementById('compose-panel').classList.remove('hidden');

  document.getElementById('compose-title').textContent = composeTemplate.name;

  const varContainer = document.getElementById('variable-inputs');
  varContainer.innerHTML = composeTemplate.variables.map(v => `
    <div class="var-group">
      <label>${escHtml(v.name)}</label>
      <input type="text" data-var="${escHtml(v.name)}" placeholder="${escHtml(v.placeholder || '')}" oninput="updatePreview()">
    </div>
  `).join('');

  updatePreview();
  hideComposeEditBtns();
}

function closeCompose() {
  document.getElementById('compose-panel').classList.add('hidden');
  document.getElementById('template-cards').classList.remove('hidden');
  document.getElementById('tag-pool').classList.remove('hidden');
  document.querySelector('.search-bar').classList.remove('hidden');
  composeTemplate = null;
  composeEdited = false;
}

function updatePreview() {
  if (!composeTemplate) return;
  let text = composeTemplate.body;
  document.querySelectorAll('#variable-inputs input').forEach(input => {
    const varName = input.dataset.var;
    const value = input.value || `{{${varName}}}`;
    text = text.replaceAll(`{{${varName}}}`, value);
  });
  document.getElementById('compose-output').value = text;
}

function markEdited() {
  composeEdited = true;
  document.getElementById('btn-update-template').classList.remove('hidden');
  document.getElementById('btn-save-new').classList.remove('hidden');
}

function hideComposeEditBtns() {
  document.getElementById('btn-update-template').classList.add('hidden');
  document.getElementById('btn-save-new').classList.add('hidden');
}

async function copyEmail() {
  const text = document.getElementById('compose-output').value;
  try {
    await navigator.clipboard.writeText(text);
    showToast('已複製到剪貼簿');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('已複製到剪貼簿');
  }
}

function reverseSubstitute(text) {
  if (!composeTemplate) return text;
  document.querySelectorAll('#variable-inputs input').forEach(input => {
    const varName = input.dataset.var;
    const value = input.value;
    if (value) {
      text = text.replaceAll(value, `{{${varName}}}`);
    }
  });
  return text;
}

async function updateFromCompose() {
  if (!composeTemplate) return;
  const rawOutput = document.getElementById('compose-output').value;
  const restoredBody = reverseSubstitute(rawOutput);
  await fetch(`${API}/templates/${composeTemplate.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...composeTemplate, body: restoredBody }),
  });
  await loadTemplates();
  composeTemplate = templates.find(t => t.id === composeTemplate.id);
  composeEdited = false;
  hideComposeEditBtns();
  showToast('模板已更新');
}

async function saveAsNewFromCompose() {
  if (!composeTemplate) return;
  const rawOutput = document.getElementById('compose-output').value;
  const restoredBody = reverseSubstitute(rawOutput);
  const newName = composeTemplate.name + '（副本）';
  await fetch(`${API}/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: newName,
      description: composeTemplate.description,
      tags: composeTemplate.tags,
      variables: composeTemplate.variables,
      body: restoredBody,
    }),
  });
  await loadTemplates();
  composeEdited = false;
  hideComposeEditBtns();
  showToast('已新增為新模板');
}

/* ============================================================
   模板編輯器
   ============================================================ */

function renderEditorSidebar() {
  const list = document.getElementById('editor-template-list');
  list.innerHTML = templates.map(t =>
    `<button class="editor-tpl-item ${editingId === t.id ? 'active' : ''}" onclick="loadTemplateForEdit('${t.id}')">${escHtml(t.name)}</button>`
  ).join('');
}

function newTemplate() {
  editingId = null;
  editorTags = [];
  editorVars = [];
  document.getElementById('tpl-name').value = '';
  document.getElementById('tpl-desc').value = '';
  document.getElementById('tpl-tag-input').value = '';
  document.getElementById('tpl-body').value = '';
  document.getElementById('btn-delete-tpl').classList.add('hidden');
  renderEditorTags();
  renderEditorVars();
  renderVarChips();
  renderEditorSidebar();
}

function loadTemplateForEdit(id) {
  const t = templates.find(t => t.id === id);
  if (!t) return;
  editingId = t.id;
  editorTags = [...t.tags];
  editorVars = t.variables.map(v => ({ ...v }));
  document.getElementById('tpl-name').value = t.name;
  document.getElementById('tpl-desc').value = t.description;
  document.getElementById('tpl-body').value = t.body;
  document.getElementById('btn-delete-tpl').classList.remove('hidden');
  renderEditorTags();
  renderEditorVars();
  renderVarChips();
  renderEditorSidebar();
}

/* Tags */
function renderEditorTags() {
  document.getElementById('tpl-tags-display').innerHTML = editorTags.map((tag, i) =>
    `<span class="tag-chip">${escHtml(tag)} <span class="remove-tag" onclick="removeEditorTag(${i})">&#215;</span></span>`
  ).join('');
}

function handleTagKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = document.getElementById('tpl-tag-input');
    const tag = input.value.trim();
    if (tag && !editorTags.includes(tag)) {
      editorTags.push(tag);
      renderEditorTags();
    }
    input.value = '';
    hideTagSuggestions();
  }
}

function removeEditorTag(index) {
  editorTags.splice(index, 1);
  renderEditorTags();
}

/* --- 標籤建議 --- */
function getAllExistingTags() {
  const tagSet = new Set();
  templates.forEach(t => t.tags.forEach(tag => tagSet.add(tag)));
  return [...tagSet];
}

function showTagSuggestions() {
  const input = document.getElementById('tpl-tag-input');
  const query = input.value.trim().toLowerCase();
  const container = document.getElementById('tag-suggestions');

  if (!query) {
    hideTagSuggestions();
    return;
  }

  const allTags = getAllExistingTags();
  // 過濾：包含輸入文字、且尚未被使用的標籤
  const suggestions = allTags.filter(tag =>
    tag.toLowerCase().includes(query) && !editorTags.includes(tag)
  );

  if (suggestions.length === 0) {
    hideTagSuggestions();
    return;
  }

  container.innerHTML = suggestions.map(tag => {
    // 高亮匹配部分
    const idx = tag.toLowerCase().indexOf(query);
    const before = tag.substring(0, idx);
    const match = tag.substring(idx, idx + query.length);
    const after = tag.substring(idx + query.length);
    return `<div class="tag-suggestion-item" onmousedown="selectTagSuggestion('${escAttr(tag)}')">${escHtml(before)}<span class="match-highlight">${escHtml(match)}</span>${escHtml(after)}</div>`;
  }).join('');

  container.classList.remove('hidden');
}

function selectTagSuggestion(tag) {
  if (!editorTags.includes(tag)) {
    editorTags.push(tag);
    renderEditorTags();
  }
  document.getElementById('tpl-tag-input').value = '';
  hideTagSuggestions();
}

function hideTagSuggestions() {
  document.getElementById('tag-suggestions').classList.add('hidden');
}

function hideTagSuggestionsDelay() {
  // 延遲隱藏讓 mousedown 事件有機會觸發
  clearTimeout(tagSuggestHideTimer);
  tagSuggestHideTimer = setTimeout(hideTagSuggestions, 200);
}

/* Variables */
function renderEditorVars() {
  const container = document.getElementById('tpl-variables');
  container.innerHTML = editorVars.map((v, i) => `
    <div class="var-row">
      <input type="text" value="${escAttr(v.name)}" placeholder="變數名稱" oninput="updateVarName(${i}, this.value)">
      <input type="text" value="${escAttr(v.placeholder || '')}" placeholder="提示文字（選填）" onchange="editorVars[${i}].placeholder=this.value">
      <button class="remove-var" onclick="removeVariable(${i})">&#215;</button>
    </div>
  `).join('');
}

function updateVarName(index, value) {
  editorVars[index].name = value;
  renderVarChips();
}

function addVariable() {
  editorVars.push({ name: '', placeholder: '' });
  renderEditorVars();
  renderVarChips();
  const inputs = document.querySelectorAll('#tpl-variables .var-row:last-child input');
  if (inputs.length) inputs[0].focus();
}

function removeVariable(index) {
  editorVars.splice(index, 1);
  renderEditorVars();
  renderVarChips();
}

/* --- 拖曳式變數組件 --- */
function renderVarChips() {
  const container = document.getElementById('var-chips');
  const namedVars = editorVars.filter(v => v.name.trim());
  container.innerHTML = namedVars.map(v =>
    `<span class="var-chip-drag" draggable="true" data-var-name="${escAttr(v.name)}" title="拖曳到信件內容，或點擊插入">${escHtml(v.name)}</span>`
  ).join('');

  container.querySelectorAll('.var-chip-drag').forEach(chip => {
    chip.addEventListener('dragstart', (e) => {
      const varName = chip.dataset.varName;
      e.dataTransfer.setData('text/plain', `{{${varName}}}`);
      e.dataTransfer.effectAllowed = 'copy';
    });

    chip.addEventListener('click', () => {
      const varName = chip.dataset.varName;
      insertVarAtCursor(`{{${varName}}}`);
    });
  });
}

function insertVarAtCursor(text) {
  const textarea = document.getElementById('tpl-body');
  textarea.focus();
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);
  textarea.value = before + text + after;
  const newPos = start + text.length;
  textarea.selectionStart = newPos;
  textarea.selectionEnd = newPos;
}

function setupBodyDropZone() {
  const textarea = document.getElementById('tpl-body');
  if (!textarea) return;

  textarea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    textarea.classList.add('drag-over');
  });

  textarea.addEventListener('dragleave', () => {
    textarea.classList.remove('drag-over');
  });

  textarea.addEventListener('drop', (e) => {
    e.preventDefault();
    textarea.classList.remove('drag-over');
    const text = e.dataTransfer.getData('text/plain');
    if (!text) return;

    const pos = getDropPosition(textarea, e);
    const before = textarea.value.substring(0, pos);
    const after = textarea.value.substring(pos);
    textarea.value = before + text + after;
    const newPos = pos + text.length;
    textarea.selectionStart = newPos;
    textarea.selectionEnd = newPos;
    textarea.focus();
  });
}

function getDropPosition(textarea, event) {
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
    if (pos && pos.offsetNode === textarea) {
      return pos.offset;
    }
  }
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (range) {
      return range.startOffset;
    }
  }
  return textarea.selectionStart || textarea.value.length;
}

/* Save / Delete */
async function saveTemplate() {
  const name = document.getElementById('tpl-name').value.trim();
  if (!name) {
    showToast('請輸入模板名稱');
    document.getElementById('tpl-name').focus();
    return;
  }

  const variables = editorVars.filter(v => v.name.trim());

  const payload = {
    name,
    description: document.getElementById('tpl-desc').value.trim(),
    tags: editorTags,
    variables,
    body: document.getElementById('tpl-body').value,
  };

  if (editingId) {
    await fetch(`${API}/templates/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showToast('模板已更新');
  } else {
    const res = await fetch(`${API}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const created = await res.json();
    editingId = created.id;
    showToast('模板已建立');
  }

  await loadTemplates();
  document.getElementById('btn-delete-tpl').classList.remove('hidden');
}

async function deleteTemplate() {
  if (!editingId) return;
  if (!confirm('確定要刪除此模板嗎？')) return;
  await fetch(`${API}/templates/${editingId}`, { method: 'DELETE' });
  await loadTemplates();
  newTemplate();
  showToast('模板已刪除');
}

/* ============================================================
   工具函式
   ============================================================ */

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
