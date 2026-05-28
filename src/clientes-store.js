/**
 * clientes-store.js — almacenamiento local (JSON) de los CLIENTES y sus CAJAS.
 *
 * Modelo:
 *   Cliente = { id, codigo (ej "L210"), nombreVisible (ej "Lu"), cajas: [...] }
 *   Caja    = { id, usuario (login en el casino), sistema (nombre del sistema: "Casino"/"Europa"),
 *               userId (ID en el casino), divisas: ["ARS",...], montosRapidos: [500000,...],
 *               grupoId, notas }
 *
 * `sistema` referencia por NOMBRE a un sistema configurado en la pantalla 1 (systems-store).
 * `montosRapidos` = los botones de carga rápida que se le muestran al operador para esa caja.
 *
 * Se guarda en data/clientes.json (gitignored).
 */
const crypto = require('crypto');
const { db } = require('./db');

const FILE = 'sqlite:clientes'; // compat (ya no es un archivo)

function load() {
  const clientes = db.prepare('SELECT * FROM clientes ORDER BY ord ASC').all().map((r) => {
    let telegram = { chatId: '', enabled: false };
    let cajas = [];
    try { if (r.telegram) telegram = JSON.parse(r.telegram); } catch (e) {}
    try { if (r.cajas) cajas = JSON.parse(r.cajas); } catch (e) {}
    if (!telegram) telegram = { chatId: '', enabled: false }; // backfill
    return { id: r.id, codigo: r.codigo, nombreVisible: r.nombreVisible, createdAt: r.createdAt, telegram, cajas };
  });
  return { clientes };
}

const _saveTx = db.transaction((data) => {
  db.prepare('DELETE FROM clientes').run();
  const ins = db.prepare(
    'INSERT INTO clientes (id,codigo,nombreVisible,createdAt,telegram,cajas,ord) VALUES (@id,@codigo,@nombreVisible,@createdAt,@telegram,@cajas,@ord)'
  );
  (data.clientes || []).forEach((c, i) => ins.run({
    id: c.id,
    codigo: c.codigo,
    nombreVisible: c.nombreVisible || '',
    createdAt: c.createdAt || null,
    telegram: JSON.stringify(c.telegram || { chatId: '', enabled: false }),
    cajas: JSON.stringify(c.cajas || []),
    ord: i,
  }));
});
function save(data) { _saveTx(data); }

// ── Helpers de parseo de campos "lista separada por comas" ──
function parseMontos(v) {
  if (Array.isArray(v)) return v.map((n) => Number(n)).filter((n) => !isNaN(n) && n > 0);
  return String(v || '')
    .split(/[,;\s]+/)
    .map((s) => Number(String(s).replace(/[^\d.]/g, '')))
    .filter((n) => !isNaN(n) && n > 0);
}
function parseDivisas(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  return String(v || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function newId(prefix) {
  return prefix + '_' + crypto.randomBytes(5).toString('hex');
}

// ─────────────── Clientes ───────────────

function list() {
  return load();
}

function get(id) {
  return load().clientes.find((c) => c.id === id) || null;
}

function getByCodigo(codigo) {
  const cod = String(codigo || '').trim();
  return load().clientes.find((c) => String(c.codigo).toLowerCase() === cod.toLowerCase()) || null;
}

function createCliente({ codigo, nombreVisible }) {
  const data = load();
  const cod = String(codigo || '').trim();
  if (!cod) throw new Error('codigo requerido');
  if (data.clientes.some((c) => String(c.codigo).toLowerCase() === cod.toLowerCase())) {
    throw new Error(`Ya existe un cliente con código "${cod}"`);
  }
  const cliente = {
    id: newId('c'),
    codigo: cod,
    nombreVisible: String(nombreVisible || '').trim(),
    createdAt: new Date().toISOString(),
    telegram: { chatId: '', enabled: false },
    cajas: [],
  };
  data.clientes.push(cliente);
  save(data);
  return cliente;
}

function updateCliente(id, patch) {
  const data = load();
  const c = data.clientes.find((x) => x.id === id);
  if (!c) return null;
  if (patch.codigo !== undefined) {
    const cod = String(patch.codigo).trim();
    if (cod && data.clientes.some((x) => x.id !== id && String(x.codigo).toLowerCase() === cod.toLowerCase())) {
      throw new Error(`Ya existe otro cliente con código "${cod}"`);
    }
    if (cod) c.codigo = cod;
  }
  if (patch.nombreVisible !== undefined) c.nombreVisible = String(patch.nombreVisible).trim();
  save(data);
  return c;
}

function removeCliente(id) {
  const data = load();
  const before = data.clientes.length;
  data.clientes = data.clientes.filter((c) => c.id !== id);
  save(data);
  return data.clientes.length < before;
}

/** Configura el grupo de Telegram del cliente (aviso de carga). patch: { chatId?, enabled? } */
function setTelegram(id, patch) {
  const data = load();
  const c = data.clientes.find((x) => x.id === id);
  if (!c) return null;
  if (!c.telegram) c.telegram = { chatId: '', enabled: false };
  if (patch.chatId !== undefined) c.telegram.chatId = String(patch.chatId).trim();
  if (patch.enabled !== undefined) c.telegram.enabled = !!patch.enabled;
  save(data);
  return c;
}

// ─────────────── Cajas (dentro de un cliente) ───────────────

function addCaja(clienteId, caja) {
  const data = load();
  const c = data.clientes.find((x) => x.id === clienteId);
  if (!c) return null;
  const k = {
    id: newId('k'),
    usuario: String(caja.usuario || '').trim(),
    sistema: String(caja.sistema || '').trim(),
    userId: String(caja.userId || '').trim(),
    divisas: parseDivisas(caja.divisas),
    montosRapidos: parseMontos(caja.montosRapidos),
    grupoId: String(caja.grupoId || '').trim(),
    notas: String(caja.notas || '').trim(),
  };
  c.cajas.push(k);
  save(data);
  return k;
}

function updateCaja(clienteId, cajaId, patch) {
  const data = load();
  const c = data.clientes.find((x) => x.id === clienteId);
  if (!c) return null;
  const k = c.cajas.find((x) => x.id === cajaId);
  if (!k) return null;
  if (patch.usuario !== undefined) k.usuario = String(patch.usuario).trim();
  if (patch.sistema !== undefined) k.sistema = String(patch.sistema).trim();
  if (patch.userId !== undefined) k.userId = String(patch.userId).trim();
  if (patch.divisas !== undefined) k.divisas = parseDivisas(patch.divisas);
  if (patch.montosRapidos !== undefined) k.montosRapidos = parseMontos(patch.montosRapidos);
  if (patch.grupoId !== undefined) k.grupoId = String(patch.grupoId).trim();
  if (patch.notas !== undefined) k.notas = String(patch.notas).trim();
  save(data);
  return k;
}

function removeCaja(clienteId, cajaId) {
  const data = load();
  const c = data.clientes.find((x) => x.id === clienteId);
  if (!c) return false;
  const before = c.cajas.length;
  c.cajas = c.cajas.filter((k) => k.id !== cajaId);
  save(data);
  return c.cajas.length < before;
}

/**
 * Importa filas (ya parseadas) agrupándolas por código de cliente.
 * Cada fila: { codigo, nombreVisible, usuario, sistema, userId, divisas, grupoId, montosRapidos }
 * - Cliente: se busca/crea por `codigo` (case-insensitive). nombreVisible se actualiza si viene.
 * - Caja: se identifica por (sistema + userId) dentro del cliente → si existe, se ACTUALIZA; si no, se AGREGA.
 *
 * @param {Array} rows
 * @param {boolean} dryRun  si true, NO guarda — solo devuelve el resumen de lo que haría.
 */
function importRows(rows, dryRun = false) {
  const data = load();
  const summary = { clientesCreados: 0, clientesActualizados: 0, cajasAgregadas: 0, cajasActualizadas: 0, filas: rows.length, errores: [] };
  const touchedClientes = new Set();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const cod = String(r.codigo || '').trim();
    const userId = String(r.userId || '').trim();
    if (!cod) { summary.errores.push(`Fila ${i + 1}: sin código de cliente`); continue; }

    let cliente = data.clientes.find((c) => String(c.codigo).toLowerCase() === cod.toLowerCase());
    if (!cliente) {
      cliente = { id: newId('c'), codigo: cod, nombreVisible: String(r.nombreVisible || '').trim(), createdAt: new Date().toISOString(), cajas: [] };
      data.clientes.push(cliente);
      summary.clientesCreados++;
    } else {
      if (r.nombreVisible && cliente.nombreVisible !== String(r.nombreVisible).trim()) {
        cliente.nombreVisible = String(r.nombreVisible).trim();
      }
      if (!touchedClientes.has(cliente.id)) summary.clientesActualizados++;
    }
    touchedClientes.add(cliente.id);

    // Caja: identificar por sistema+userId (el ID del casino es único por sistema).
    if (!r.usuario && !userId) continue; // fila solo con datos de cliente, sin caja
    const sistema = String(r.sistema || '').trim();
    let caja = cliente.cajas.find((k) => userId && String(k.userId) === userId && String(k.sistema).toLowerCase() === sistema.toLowerCase());
    const payload = {
      usuario: String(r.usuario || '').trim(),
      sistema,
      userId,
      divisas: parseDivisas(r.divisas),
      montosRapidos: parseMontos(r.montosRapidos),
      grupoId: String(r.grupoId || '').trim(),
    };
    if (caja) {
      Object.assign(caja, payload);
      summary.cajasActualizadas++;
    } else {
      cliente.cajas.push({ id: newId('k'), notas: '', ...payload });
      summary.cajasAgregadas++;
    }
  }

  if (!dryRun) save(data);
  summary.totalClientes = data.clientes.length;
  return summary;
}

module.exports = {
  list, get, getByCodigo,
  createCliente, updateCliente, removeCliente, setTelegram,
  addCaja, updateCaja, removeCaja,
  importRows, parseMontos, parseDivisas, seed: save, FILE,
};
