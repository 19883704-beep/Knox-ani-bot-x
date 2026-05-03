// info-table.js — Tabla de Información + Dev Panel (Firebase isolated)
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth';

const FB_CONFIG = {
    apiKey: "AIzaSyCr1bcF_Lc1lKNoTmVYqIduwDqZIxK-mrM",
    authDomain: "cerberusai-87db2.firebaseapp.com",
    projectId: "cerberusai-87db2",
    storageBucket: "cerberusai-87db2.firebasestorage.app",
    messagingSenderId: "942100846980",
    appId: "1:942100846980:web:b1437acb40fc973a0d25d1"
};

const $el = id => document.getElementById(id);
const toast = msg => { try { window.showToast?.(msg); } catch(_){} };
const nav = view => { try { window.Navigation?.switchView(view); } catch(_){} };

let _db = null, _auth = null;

try {
    const app = initializeApp(FB_CONFIG, 'animesao-pro');
    _db = getFirestore(app);
    _auth = getAuth(app);
} catch(e) { console.warn('[InfoTable] Firebase init error:', e.message); }

// ── Default data ─────────────────────────────────────────────────────
function defBoard() {
    return { titulo: '🚀 Nueva actualización disponible', descripcion: 'Hemos mejorado la precisión de las recomendaciones con IA y la velocidad de búsqueda. También añadimos nuevas funciones que te encantarán. 🤍', fecha: '03 de mayo, 2026', tipo: 'Actualización', firma: '¡Gracias por ser parte de AniBot! 😊' };
}
function defInfo() {
    const d = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    return { nombre: 'AniBot', version: 'v2.0', apiStatus: 'Conectada', iaStatus: 'Activa', servidor: 'Online', ultimaActualizacion: `Hoy, ${d}`, proximaActualizacion: 'Próximamente' };
}
function defNotas() {
    return { items: [{ texto: 'Estamos trabajando en una nueva función de seguimiento de animes.', fecha: '02/05' }, { texto: 'Optimización de velocidad y precisión en recomendaciones.', fecha: '01/05' }, { texto: 'Próximamente: integración con más APIs de anime.', fecha: '30/04' }] };
}

// ── Firebase helpers ──────────────────────────────────────────────────
async function waitDb(maxMs = 5000) {
    const t = Date.now();
    while (!_db && Date.now() - t < maxMs) await new Promise(r => setTimeout(r, 100));
    return !!_db;
}

async function fetchPublicData() {
    if (!(await waitDb())) return { board: defBoard(), info: defInfo(), notas: defNotas() };
    try {
        const [b, i, n] = await Promise.all([
            getDoc(doc(_db, 'public', 'board')),
            getDoc(doc(_db, 'public', 'info')),
            getDoc(doc(_db, 'public', 'notas'))
        ]);
        return { board: b.exists() ? b.data() : defBoard(), info: i.exists() ? i.data() : defInfo(), notas: n.exists() ? n.data() : defNotas() };
    } catch(e) {
        console.warn('[InfoTable] read error:', e.message);
        return { board: defBoard(), info: defInfo(), notas: defNotas() };
    }
}

// ── Rendering helpers ─────────────────────────────────────────────────
function statusColor(v) {
    if (['Conectada','Activa','Online'].includes(v)) return '#4ade80';
    if (['Desconectada','Inactiva','Offline'].includes(v)) return '#f87171';
    return '#fbbf24';
}

function renderBoard(b) {
    const s = (id, v) => { const el = $el(id); if (el) el.textContent = v || ''; };
    s('it-board-date',  b.fecha);
    s('it-board-badge', b.tipo || 'Actualización');
    s('it-board-title', b.titulo);
    s('it-board-desc',  b.descripcion);
    s('it-board-firma', b.firma);
}

function renderInfo(info) {
    const card = $el('it-info-card');
    if (!card) return;
    const dot = v => `<span class="it-dot" style="background:${statusColor(v)}"></span>`;
    const rows = [
        { icon: '⊙', label: 'Nombre de la app',       val: info.nombre || 'AniBot' },
        { icon: '⌨',  label: 'Versión actual',         val: `<span class="it-ver-badge">${info.version || 'v2.0'}</span>` },
        { icon: '⚡', label: 'API (Gemini)',            val: `${dot(info.apiStatus)}<span class="it-status-text">${info.apiStatus || 'Conectada'}</span>` },
        { icon: '🌐', label: 'Estado de la IA',        val: `${dot(info.iaStatus)}<span class="it-status-text">${info.iaStatus || 'Activa'}</span>` },
        { icon: '🖥',  label: 'Servidor',               val: `${dot(info.servidor)}<span class="it-status-text">${info.servidor || 'Online'}</span>` },
        { icon: '📅', label: 'Última actualización',   val: info.ultimaActualizacion || '—' },
        { icon: '🕐', label: 'Próxima actualización',  val: info.proximaActualizacion || 'Próximamente' }
    ];
    card.innerHTML = rows.map((r, i) => `
        ${i ? '<div class="it-divider"></div>' : ''}
        <div class="it-row">
            <div class="it-row-left">
                <span class="it-row-icon">${r.icon}</span>
                <span class="it-row-label">${r.label}</span>
            </div>
            <div class="it-row-val">${r.val}</div>
        </div>`).join('');
}

function renderNotas(notas) {
    const list = $el('it-notas-list');
    if (!list) return;
    const items = notas.items || [];
    list.innerHTML = items.length
        ? items.map(item => `
            <div class="it-nota-item">
                <span class="it-nota-dot"></span>
                <span class="it-nota-text">${item.texto}</span>
                <span class="it-nota-date">${item.fecha}</span>
            </div>`).join('')
        : '<p class="it-notas-empty">Sin notas por ahora.</p>';
}

// ── InfoTableManager (exposed globally) ──────────────────────────────
let _cachedData = null;

const InfoTableManager = {
    async open() {
        nav('view-info-table');
        await this.load();
    },

    async load() {
        const loading = $el('it-loading'), content = $el('it-content');
        if (loading) loading.style.display = 'flex';
        if (content) content.style.display = 'none';
        try {
            _cachedData = await fetchPublicData();
            renderBoard(_cachedData.board);
            renderInfo(_cachedData.info);
            renderNotas(_cachedData.notas);
        } catch(e) { console.warn('[InfoTable] load error:', e); }
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';
    }
};
window.InfoTableManager = InfoTableManager;

// ── Dev Panel ─────────────────────────────────────────────────────────
let _tapCount = 0, _tapTimer = null;

function setupHiddenTrigger() {
    const sub = $el('it-subtitle');
    if (!sub) return;
    sub.addEventListener('click', () => {
        _tapCount++;
        clearTimeout(_tapTimer);
        if (_tapCount >= 5) {
            _tapCount = 0;
            showDevLogin();
        } else {
            _tapTimer = setTimeout(() => { _tapCount = 0; }, 2000);
        }
    });
}

function showDevLogin() {
    const m = $el('dev-login-modal');
    if (m) { m.style.display = 'flex'; $el('dev-email')?.focus(); }
}

function hideDevLogin() {
    const m = $el('dev-login-modal');
    if (m) m.style.display = 'none';
    const e = $el('dev-email'), p = $el('dev-password'), err = $el('dev-login-error');
    if (e) e.value = ''; if (p) p.value = ''; if (err) err.textContent = '';
}

async function devLogin() {
    const emailEl = $el('dev-email'), pwEl = $el('dev-password');
    const errEl = $el('dev-login-error'), btn = $el('dev-login-btn');
    const email = emailEl?.value.trim(), password = pwEl?.value;
    if (!email || !password) { if (errEl) errEl.textContent = 'Completa todos los campos.'; return; }
    if (btn) { btn.textContent = 'Verificando...'; btn.disabled = true; }
    if (errEl) errEl.textContent = '';

    if (!(await waitDb(3000))) {
        if (errEl) errEl.textContent = 'Error de conexión. Intenta de nuevo.';
        if (btn) { btn.textContent = 'Acceder al panel'; btn.disabled = false; }
        return;
    }

    try {
        await signInWithEmailAndPassword(_auth, email, password);
        try {
            const snap = await getDoc(doc(_db, 'dev_access', 'config'));
            const allowed = snap.exists() ? (snap.data().emails || []) : [];
            if (allowed.length > 0 && !allowed.includes(email)) {
                await fbSignOut(_auth);
                if (errEl) errEl.textContent = 'Acceso denegado. No autorizado.';
                if (btn) { btn.textContent = 'Acceder al panel'; btn.disabled = false; }
                return;
            }
        } catch(_) { /* allow if doc missing */ }
        hideDevLogin();
        openDevPanel(email);
    } catch(e) {
        const codes = { 'auth/user-not-found': 'Email o contraseña incorrectos.', 'auth/wrong-password': 'Email o contraseña incorrectos.', 'auth/invalid-credential': 'Email o contraseña incorrectos.', 'auth/too-many-requests': 'Demasiados intentos. Espera un momento.', 'auth/network-request-failed': 'Sin conexión.' };
        if (errEl) errEl.textContent = codes[e.code] || 'Credenciales incorrectas.';
        if (btn) { btn.textContent = 'Acceder al panel'; btn.disabled = false; }
    }
}

async function openDevPanel(email) {
    const panel = $el('dev-panel');
    if (panel) panel.style.display = 'flex';
    const emailEl = $el('dp-user-email');
    if (emailEl) emailEl.textContent = email;
    await loadPanelData();
}

async function loadPanelData() {
    if (!_cachedData) _cachedData = await fetchPublicData();
    const { board: b = {}, info: inf = {}, notas } = _cachedData;
    const set = (id, v) => { const el = $el(id); if (el) el.value = v || ''; };
    set('dp-board-title', b.titulo); set('dp-board-desc', b.descripcion);
    set('dp-board-fecha', b.fecha);  set('dp-board-tipo', b.tipo); set('dp-board-firma', b.firma);
    set('dp-info-nombre', inf.nombre); set('dp-info-version', inf.version);
    set('dp-info-ultima', inf.ultimaActualizacion); set('dp-info-proxima', inf.proximaActualizacion);
    const setSel = (id, val) => { const el = $el(id); if (!el) return; for (const o of el.options) { if (o.text === val) { o.selected = true; break; } } };
    setSel('dp-info-api', inf.apiStatus); setSel('dp-info-ia', inf.iaStatus); setSel('dp-info-servidor', inf.servidor);
    renderNotasEditor(notas?.items || []);
}

function renderNotasEditor(items) {
    const container = $el('dp-notas-container');
    if (!container) return;
    container.querySelectorAll('.dp-nota-row').forEach(el => el.remove());
    const addBtn = $el('dp-add-nota');
    items.forEach(item => { const row = makeNotaRow(item.texto, item.fecha); if (addBtn) container.insertBefore(row, addBtn); });
}

function makeNotaRow(texto = '', fecha = '') {
    const row = document.createElement('div');
    row.className = 'dp-nota-row';
    row.innerHTML = `<div class="dp-nota-inputs"><input type="text" class="dp-input dp-nota-texto" value="${texto.replace(/"/g,'&quot;')}" placeholder="Texto de la nota..."><input type="text" class="dp-input dp-nota-fecha-input" value="${fecha}" placeholder="DD/MM" style="width:72px;flex-shrink:0"></div><button class="dp-nota-del" title="Eliminar"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    row.querySelector('.dp-nota-del').addEventListener('click', () => row.remove());
    return row;
}

async function saveBoard() {
    const btn = $el('dp-save-board');
    if (btn) { btn.textContent = 'Guardando...'; btn.disabled = true; }
    try {
        await setDoc(doc(_db, 'public', 'board'), { titulo: $el('dp-board-title')?.value || '', descripcion: $el('dp-board-desc')?.value || '', fecha: $el('dp-board-fecha')?.value || '', tipo: $el('dp-board-tipo')?.value || '', firma: $el('dp-board-firma')?.value || '' });
        toast('✅ Pizarrón actualizado'); _cachedData = null;
    } catch(e) { toast('Error: ' + e.message); }
    if (btn) { btn.textContent = 'Guardar pizarrón'; btn.disabled = false; }
}

async function saveInfo() {
    const btn = $el('dp-save-info');
    if (btn) { btn.textContent = 'Guardando...'; btn.disabled = true; }
    const getSel = id => { const el = $el(id); return el ? el.options[el.selectedIndex]?.text || '' : ''; };
    try {
        await setDoc(doc(_db, 'public', 'info'), { nombre: $el('dp-info-nombre')?.value || '', version: $el('dp-info-version')?.value || '', apiStatus: getSel('dp-info-api'), iaStatus: getSel('dp-info-ia'), servidor: getSel('dp-info-servidor'), ultimaActualizacion: $el('dp-info-ultima')?.value || '', proximaActualizacion: $el('dp-info-proxima')?.value || '' });
        toast('✅ Información actualizada'); _cachedData = null;
    } catch(e) { toast('Error: ' + e.message); }
    if (btn) { btn.textContent = 'Guardar información'; btn.disabled = false; }
}

async function saveNotas() {
    const btn = $el('dp-save-notas');
    if (btn) { btn.textContent = 'Guardando...'; btn.disabled = true; }
    const items = Array.from(document.querySelectorAll('.dp-nota-row')).map(r => ({ texto: r.querySelector('.dp-nota-texto')?.value || '', fecha: r.querySelector('.dp-nota-fecha-input')?.value || '' })).filter(i => i.texto.trim());
    try {
        await setDoc(doc(_db, 'public', 'notas'), { items });
        toast('✅ Notas actualizadas'); _cachedData = null;
    } catch(e) { toast('Error: ' + e.message); }
    if (btn) { btn.textContent = 'Guardar notas'; btn.disabled = false; }
}

async function devLogout() {
    try { if (_auth) await fbSignOut(_auth); } catch(_) {}
    const p = $el('dev-panel'); if (p) p.style.display = 'none';
    toast('Sesión cerrada');
}

// ── Setup (runs after DOM ready — modules are deferred) ───────────────
function setup() {
    // Back button
    $el('it-back-btn')?.addEventListener('click', () => nav('view-settings'));

    // Refresh button
    $el('it-refresh-btn')?.addEventListener('click', () => { _cachedData = null; InfoTableManager.load(); });

    // Visit site button
    $el('it-visit-btn')?.addEventListener('click', () => window.open('https://animesao.replit.app', '_blank'));

    // Tutorials button
    $el('it-tutorials-btn')?.addEventListener('click', () => toast('Tutoriales disponibles próximamente'));

    // Hidden dev trigger (5 taps on subtitle)
    setupHiddenTrigger();

    // Dev login modal
    $el('dev-login-btn')?.addEventListener('click', devLogin);
    $el('dev-login-cancel')?.addEventListener('click', hideDevLogin);
    $el('dev-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') devLogin(); });

    // Dev panel controls
    $el('dp-back-btn')?.addEventListener('click', () => { const p = $el('dev-panel'); if (p) p.style.display = 'none'; });
    $el('dp-logout-btn')?.addEventListener('click', devLogout);
    $el('dp-save-board')?.addEventListener('click', saveBoard);
    $el('dp-save-info')?.addEventListener('click', saveInfo);
    $el('dp-save-notas')?.addEventListener('click', saveNotas);
    $el('dp-add-nota')?.addEventListener('click', () => {
        const container = $el('dp-notas-container'), addBtn = $el('dp-add-nota');
        const row = makeNotaRow();
        if (container && addBtn) container.insertBefore(row, addBtn);
    });
}

setup();
