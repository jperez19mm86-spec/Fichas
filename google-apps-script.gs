/**
 * Apps Script para "Venta de Fichas" — registra cada carga/rechazo en pestañas por mes.
 *
 * INSTALACIÓN (una sola vez):
 *  1. Abrí tu Google Sheet.
 *  2. Menú: Extensiones → Apps Script.
 *  3. Borrá lo que haya y pegá TODO este archivo. Guardá (💾, ícono de diskette).
 *  4. Implementar → Nueva implementación → ⚙ Tipo: "Aplicación web".
 *       - Descripción: venta-fichas
 *       - Ejecutar como: Yo (tu cuenta)
 *       - Quién tiene acceso: Cualquier persona
 *     → Implementar → Autorizar acceso (elegí tu cuenta → "Permitir").
 *  5. Copiá la "URL de la aplicación web" (termina en /exec).
 *  6. Pegá esa URL en venta-fichas: variable SHEET_WEBHOOK_URL (en Railway → Variables).
 *
 * Si EDITÁS este script después: Implementar → Administrar implementaciones → ✏ Editar →
 * Versión: "Nueva versión" → Implementar (la URL no cambia).
 */

// (Opcional) Secreto compartido. Si lo completás acá, poné el MISMO valor en SHEET_SECRET de venta-fichas.
var SHEET_SECRET = '';

var HEADERS = ['Fecha', 'Hora', 'Estado', 'Cliente', 'Código', 'Caja/Usuario', 'Sistema', 'Monto', 'Divisa', 'Saldo', 'Motivo', 'ID'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (lockErr) { /* sigue igual: mejor escribir que perder el dato */ }
  try {
    var data = JSON.parse(e.postData.contents);
    if (SHEET_SECRET && String(data.secret || '') !== SHEET_SECRET) {
      return _json({ ok: false, error: 'unauthorized' });
    }
    var tz = data.tz || 'America/Argentina/Buenos_Aires';
    var when = data.fecha ? new Date(data.fecha) : new Date();

    var tabName = Utilities.formatDate(when, tz, 'yyyy-MM'); // pestaña por mes: 2026-06
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName, 0); // la pestaña más nueva queda primera
      sheet.appendRow(HEADERS);
      var head = sheet.getRange(1, 1, 1, HEADERS.length);
      head.setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
      head.createFilter(); // filtro (embudo) → permite filtrar por Cliente, Estado, etc.
      sheet.setColumnWidth(1, 90); sheet.setColumnWidth(2, 70); sheet.setColumnWidth(4, 170);
    }

    var estado = data.estado === 'cargado' ? '✅ Cargado'
               : (data.estado === 'rechazado' ? '❌ Rechazado' : (data.estado || ''));
    sheet.appendRow([
      Utilities.formatDate(when, tz, 'dd/MM/yyyy'),
      Utilities.formatDate(when, tz, 'HH:mm:ss'),
      estado,
      data.cliente || '',
      data.codigo || '',
      data.cajaUsuario || '',
      data.sistema || '',
      Number(data.monto) || 0,
      data.divisa || '',
      (data.saldo === '' || data.saldo == null) ? '' : Number(data.saldo),
      data.motivo || '',
      data.id || ''
    ]);
    return _json({ ok: true, tab: tabName });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function doGet() { return _json({ ok: true, service: 'venta-fichas-sheets' }); }

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
