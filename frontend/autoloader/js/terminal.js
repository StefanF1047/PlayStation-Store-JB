/* Terminal view: black screen, append-only text.
 *
 * The app's normal UI is still in the DOM (hidden by CSS), because the
 * jailbreak logic binds to those elements. This file only renders text.
 */
(function (g) {
'use strict';
var W = g.WKAL = g.WKAL || {};
var t0 = Date.now();

function termEl() { return document.getElementById('term'); }

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function stamp() {
  var d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

function line(text, cls) {
  var t = termEl();
  if (!t) return;
  var atBottom = (t.scrollTop + t.clientHeight + 8) >= t.scrollHeight;
  var row = document.createElement('div');
  if (cls) row.className = cls;
  row.textContent = text;
  t.appendChild(row);
  if (atBottom) t.scrollTop = t.scrollHeight;
}

function clsFor(kind) {
  if (kind === 'error') return 'err';
  if (kind === 'warning') return 'warn';
  if (kind === 'success') return 'ok';
  return '';
}

/* ---- hook the app's logging/progress ---------------------------------- */

var origLog = W.uiLog;
W.uiLog = function (message, type) {
  try { if (origLog) origLog(message, type); } catch (e) {}
  if (message) line('[' + stamp() + '] ' + String(message), clsFor(type));
  return null;
};

var origProgress = W.updateProgress;
W.updateProgress = function (percent, message, snap) {
  try { if (origProgress) origProgress(percent, message, snap); } catch (e) {}
  var p = Math.round(Number(percent) || 0);
  var msg = message ? String(message) : '';
  if (p >= (W.__termPct || 0) + 10 || (msg && msg !== (W.__termMsg || ''))) {
    W.__termPct = p;
    W.__termMsg = msg;
    line('[' + stamp() + '] ' + p + '%  ' + msg, 'dim');
  }
  return null;
};

var origOk = W.finishProgressSuccess;
W.finishProgressSuccess = function (message) {
  try { if (origOk) origOk(message); } catch (e) {}
  line('[' + stamp() + '] OK  ' + (message || 'done'), 'ok');
  return null;
};

var origFail = W.finishProgressFail;
W.finishProgressFail = function (message) {
  try { if (origFail) origFail(message); } catch (e) {}
  line('[' + stamp() + '] FAIL  ' + (message || 'failed'), 'err');
  return null;
};

/* ---- mirror the hidden legacy UI's status line ------------------------ */

var lastStatus = '';
setInterval(function () {
  try {
    var el = document.getElementById('statusMsg');
    var txt = el ? String(el.textContent || '').trim() : '';
    if (txt && txt !== lastStatus) {
      lastStatus = txt;
      line('[' + stamp() + '] ' + txt, '');
    }
  } catch (e) {}
}, 400);

/* ---- header ----------------------------------------------------------- */

window.addEventListener('load', function () {
  var ver = '';
  try {
    var v = document.getElementById('appVer');
    if (v) ver = String(v.textContent || '').replace(/^v/, '');
  } catch (e0) {}
  line('PlayStation Store' + (ver && ver.indexOf('[[') < 0 ? '  v' + ver : ''), 'ok');

  var fw = '';
  try { var f = W.detectFirmware && W.detectFirmware(); fw = f ? f.str : ''; } catch (e1) {}
  line('chain: relapse   firmware: ' + (fw || 'unknown'), 'dim');
  line('auto-start ON   closes when the payload is loaded', 'dim');
  line('', 'dim');

  var st = -1;
  try { st = (typeof applicationCache !== 'undefined' && applicationCache) ? applicationCache.status : -1; } catch (e2) {}
  line('[' + stamp() + '] ready in ' + (Date.now() - t0) + 'ms (cache status ' + st + ')', 'dim');
});
})(typeof window !== 'undefined' ? window : this);
