(function (g) {
'use strict';
var W = g.WKAL = g.WKAL || {};
W.launcher = W.launcher || {};

W.launcher.httpResponseReady = function (xhr, label) {
  if (!xhr || xhr.status !== 200) return false;
  var body = xhr.responseText || '';
  if (label === 'elf-launcher') {
    if (body.length < 8000) return false;
    return /<title>\s*ELF Launcher(?:\s+v?\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)?\s*<\/title>/i.test(body)
      && (/id=["']banner["']|id=["']ftitle["']/i.test(body) || body.length > 20000);
  }
  if (label === 'payload-manager') {
    if (body.length < 256) return false;
    return /PLDMGR|Payload Manager|payload-manager/i.test(body);
  }
  if (body.length < 256) return false;
  return /<html|Payload|PLDMGR|payload/i.test(body);
};

W.launcher.navigateLocalHttp = function (url, label, portHint) {
  var navUrl = (label === 'elf-launcher') ? url : W.withCacheBust(url);
  if (label === 'elf-launcher') {
    try {
      var wkv = W.selfupd && W.selfupd.currentAppVersion ? W.selfupd.currentAppVersion() : '';
      if (wkv) navUrl = String(navUrl).split('#')[0] + '#wkver=' + encodeURIComponent(wkv);
    } catch (eV) {}
  }
  W.uiLog('Opening ' + label + ' at ' + navUrl + ' ...', 'info');
  var target = window;
  try { if (window.top && window.top !== window) target = window.top; } catch (eTop) { target = window; }
  try { target.location.replace(navUrl); return; } catch (e1) {}
  try { target.location.href = navUrl; return; } catch (e2) {}
  try { window.open(navUrl, '_top'); } catch (e3) {
    W.uiLog('Could not open browser to :' + portHint + ' - open ' + label + ' manually.', 'warning');
  }
};

W.launcher.revealLogPanel = function () {
  /* Quiet UI: keep debug log hidden. */
  try {
    var wrap = document.getElementById('logWrapper');
    if (wrap) wrap.hidden = true;
  } catch (eR) {}
};

W.launcher.requestResendAutoload = function (name) {
  name = name || (W.state.elInstalledFirst ? 'elf-launcher.elf' : W.autoloadElfName());
  W.uiLog('Re-send requested: ' + name + ' -> elfldr :9021', 'info');
  try {
    var w = W.els.exploit && W.els.exploit.contentWindow;
    if (w) {
      w.postMessage({ type: 'wkal', kind: 'resend-autoload', name: name }, '*');
      return true;
    }
  } catch (e) {}
  W.uiLog('Could not reach exploit iframe for re-send', 'warning');
  return false;
};

/* Proven openWhenHttpReady timings kept intact. */
W.launcher.openWhenHttpReady = function (url, label, portHint, maxWaitMs, firstDelayMs, settleMs, allowAutoResend) {
  var started = Date.now();
  var minWait = typeof firstDelayMs === 'number' ? firstDelayMs : 500;
  var settle = typeof settleMs === 'number' ? settleMs : 0;
  var opened = false;
  var done = false;
  var autoResendUsed = allowAutoResend === false;
  var waitSec = Math.max(1, Math.round(maxWaitMs / 1000));
  W.uiLog('Waiting for ' + label + ' HTTP :' + portHint + ' (max ' + waitSec + 's) ...', 'info');

  function offerRetry(reason) {
    if (done && opened) return;
    done = true;
    W.launcher.revealLogPanel();
    W.uiLog(label + ' HTTP :' + portHint + ' not ready after ' + waitSec
      + 's (' + reason + '). Jailbreak still succeeded.', 'warning');
    if (W.els.statusMsg) {
      try { W.els.statusMsg.textContent = W.t('pageNotOpen', { label: label }); } catch (eS) {}
    }
    if (W.els.successMsg) {
      try {
        W.els.successMsg.hidden = false;
        W.els.successMsg.textContent = W.t('jbOkNoAnswer', { label: label, port: portHint });
      } catch (eOk) {}
    }
    try {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = W.t('retrySendOpen', { label: label, port: portHint });
      btn.className = 'ghost';
      btn.onclick = function () {
        try { btn.disabled = true; btn.textContent = W.t('resending'); } catch (eB) {}
        W.launcher.requestResendAutoload();
        setTimeout(function () {
          W.launcher.openWhenHttpReady(url, label, portHint, maxWaitMs, 3000, settle, false);
        }, 6000);
      };
      if (W.els.logContainer) W.els.logContainer.appendChild(btn);
    } catch (eBtn) {}
  }

  function lastChanceNavigate(reason) {
    if (opened) return;
    W.uiLog(label + ' opening :' + portHint + ' (' + reason + ') ...', 'warning');
    opened = true; done = true;
    try { if (label === 'elf-launcher' && W.uiSetPayload) W.uiSetPayload('plLauncher', 'READY', true); } catch (eChip) {}
    W.launcher.navigateLocalHttp(url, label, portHint);
  }

  function onGiveUp(reason) {
    if (opened || done) return;
    if (label === 'elf-launcher') {
      if (W.state.elfHttpAlreadyUp) { lastChanceNavigate(reason); return; }
      if (!autoResendUsed) {
        autoResendUsed = true;
        W.uiLog('Auto-retry: re-sending elf-launcher.elf to :9021 ...', 'warning');
        W.launcher.requestResendAutoload('elf-launcher.elf');
        started = Date.now();
        setTimeout(attempt, 4000);
        return;
      }
      offerRetry(reason);
      return;
    }
    if (label === 'payload-manager') {
      if (!autoResendUsed) {
        autoResendUsed = true;
        W.uiLog('Auto-retry: re-sending pldmgr.elf to :9021 ...', 'warning');
        W.launcher.requestResendAutoload('pldmgr.elf');
        started = Date.now();
        setTimeout(attempt, 4000);
        return;
      }
      offerRetry(reason);
      return;
    }
    offerRetry(reason);
  }

  function doNavigate() {
    if (opened || done) return;
    opened = true; done = true;
    try { if (label === 'elf-launcher' && W.uiSetPayload) W.uiSetPayload('plLauncher', 'READY', true); } catch (eChip2) {}
    W.launcher.navigateLocalHttp(url, label, portHint);
  }

  function scheduleNavigate() {
    if (opened || done) return;
    if (settle > 0) {
      W.uiLog(label + ' HTTP ready - settling ' + settle + 'ms before open ...', 'info');
      setTimeout(function () { doNavigate(); }, settle);
    } else doNavigate();
  }

  function attempt() {
    if (opened || done) return;
    var elapsed = Date.now() - started;
    var giveUp = elapsed >= maxWaitMs;
    try {
      var xhr = new XMLHttpRequest();
      xhr.timeout = label === 'elf-launcher' ? 1000 : 5000;
      xhr.open('GET', W.withCacheBust(url), true);
      try { xhr.setRequestHeader('Cache-Control', 'no-cache'); } catch (eHdr) {}
      xhr.onload = function () {
        if (opened || done) return;
        if (W.launcher.httpResponseReady(xhr, label)) scheduleNavigate();
        else if (giveUp) onGiveUp('no ready document');
        else setTimeout(attempt, label === 'elf-launcher' ? 125 : 600);
      };
      xhr.onerror = function () {
        if (opened || done) return;
        if (giveUp) onGiveUp('connection failed');
        else setTimeout(attempt, label === 'elf-launcher' ? 125 : 600);
      };
      xhr.ontimeout = xhr.onerror;
      xhr.send();
    } catch (e) {
      if (opened || done) return;
      if (giveUp) onGiveUp('probe error');
      else setTimeout(attempt, label === 'elf-launcher' ? 125 : 600);
    }
  }
  setTimeout(attempt, minWait);
};

/* Quick probe for splash (3s, non-blocking). Prefer tiny /version then /auto-list. */
W.launcher.probeElfLauncherHttp = function (cb) {
  var done = false;
  function fin(up) {
    if (done) return;
    done = true;
    try { cb(!!up); } catch (e) {}
  }
  function tryFetch(url) {
    try {
      fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
        .then(function () { fin(true); })
        .catch(function () { /* try next */ });
      return true;
    } catch (e) { return false; }
  }
  if (!tryFetch('http://127.0.0.1:1000/version?t=' + Date.now())) {
    fin(false); return;
  }
  setTimeout(function () {
    if (done) return;
    tryFetch('http://127.0.0.1:1000/auto-list?t=' + Date.now());
  }, 600);
  setTimeout(function () { fin(false); }, 2000);
};


/* Elf Launcher "open page after jailbreak" Off => tip process only, no navigate.
   Default closed when unknown so a race never opens a broken :1000 page. */
W.launcher.browserWantsOpen = function (cb) {
  var done = false;
  function fin(open) { if (done) return; done = true; try { cb(!!open); } catch (e) {} }
  var v = '';
  try { v = localStorage.getItem('ps5elfs-browser') || ''; } catch (e0) {}
  if (!v) {
    try {
      var parts = String(document.cookie || '').split(';'), i, c;
      for (i = 0; i < parts.length; i++) {
        c = parts[i].replace(/^\s+/, '');
        if (c.indexOf('ps5elfs-browser=') === 0) v = decodeURIComponent(c.substring(17));
      }
    } catch (e1) {}
  }
  if (v === 'closed') { fin(false); return; }
  if (v === 'open') { fin(true); return; }
  /* Unknown: ask live EL if up; otherwise stay closed (never force-open). */
  try {
    fetch('http://127.0.0.1:1000/browser-pref?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && typeof j.open === 'boolean') {
          try { localStorage.setItem('ps5elfs-browser', j.open ? 'open' : 'closed'); } catch (e2) {}
          fin(j.open);
        } else fin(false);
      })
      .catch(function () { fin(false); });
  } catch (e3) { fin(false); return; }
  setTimeout(function () { fin(false); }, 400);
};

W.launcher.ensureRunning = function (cb) {
  /* Bootstrap EL only. Its own /data/elf-launcher config owns all payloads. */
  W.launcher.probeElfLauncherHttp(function (up) {
    if (up) { W.state.elfHttpAlreadyUp = true; if (cb) cb(true); return; }
    W.elboot.sendInstalled();
    W.elboot.waitUp(8000, function (up2) {
      W.state.elfHttpAlreadyUp = !!up2;
      if (cb) cb(!!up2);
    });
  });
};

W.launcher.probeElfldr = function (cb) {
  var done = false;
  function fin(up) { if (done) return; done = true; try { cb(!!up); } catch (e) {} }
  try {
    fetch('http://127.0.0.1:9021/?t=' + Date.now(), { method: 'GET', mode: 'no-cors', cache: 'no-store' })
      .then(function () { fin(true); })
      .catch(function () { fin(false); });
  } catch (e) { fin(false); return; }
  setTimeout(function () { fin(false); }, 250);
};

W.launcher.probeQuick = function (cb) {
  var done = false;
  function fin(up) { if (done) return; done = true; try { cb(!!up); } catch (e) {} }
  try {
    fetch('http://127.0.0.1:1000/version?t=' + Date.now(), { method: 'GET', mode: 'no-cors', cache: 'no-store' })
      .then(function () { fin(true); })
      .catch(function () { fin(false); });
  } catch (e) { fin(false); return; }
  setTimeout(function () { fin(false); }, 250);
};

W.autoloadElfName = function () {
  /* Prefer this run's choice (forceAutoloadName / state) over a drifted localStorage value. */
  if (W.state.forceAutoloadName === 'pldmgr.elf'
      || W.state.launcherChoice === W.CHOICE_PAYLOAD_MANAGER
      || (W.getLauncherChoice && W.getLauncherChoice() === W.CHOICE_PAYLOAD_MANAGER)) {
    return 'pldmgr.elf';
  }
  if (W.state.forceAutoloadName) return W.state.forceAutoloadName;
  /* The chain only produces the jailbreak + elfldr. The page itself sends
   * pldmgr.elf afterwards (see loadPldmgrAndClose). */
  return 'wkal-skip';
};

/* Any HTTP response from the port (even 404) means something is listening. */
W.launcher.probeAnyPort = function (port, ms, cb) {
  var done = false;
  function fin(ok) { if (done) return; done = true; try { cb(!!ok); } catch (e) {} }
  try {
    fetch('http://127.0.0.1:' + port + '/?t=' + Date.now(),
      { method: 'GET', mode: 'no-cors', cache: 'no-store' })
      .then(function () { fin(true); })
      .catch(function () { fin(false); });
  } catch (e) { fin(false); return; }
  setTimeout(function () { fin(false); }, typeof ms === 'number' ? ms : 900);
};

W.launcher.waitLauncherUp = function (port, totalMs, cb) {
  var start = Date.now();
  (function tick() {
    W.launcher.probeAnyPort(port, 900, function (up) {
      if (up) { cb(true); return; }
      if (Date.now() - start >= totalMs) { cb(false); return; }
      setTimeout(tick, 500);
    });
  })();
};

/* elfldr loads a payload from the console path (the installer seeds pldmgr
 * there). This is the path the original launcher flow used. */
W.launcher.tipDisk = function (cb) {
  try {
    var img = new Image();
    img.onload = img.onerror = function () { try { cb && cb(); } catch (e) {} };
    img.src = 'http://127.0.0.1:9021/data/elf-launcher/elf-launcher.elf?t=' + Date.now();
    W.elboot = W.elboot || {};
    W.elboot._img = img;
    setTimeout(function () { try { cb && cb(); } catch (e) {} }, 1500);
  } catch (e) { try { cb && cb(); } catch (e2) {} }
};

/* Ask elfldr (:9021) to load the Store-bundled payload by URL. */
W.launcher.tipBundled = function (name, cb) {
  var called = false;
  function done() { if (called) return; called = true; try { cb && cb(); } catch (e) {} }
  try {
    var m = String(location.pathname || '').match(/^(.*\/app\/[^/]+\/)/);
    var base = (location.origin || '') + (m ? m[1] : '/app/');
    var abs = base + 'payloads/' + name;
    var img = new Image();
    img.onload = img.onerror = done;
    img.src = 'http://127.0.0.1:9021/?uri=' + encodeURIComponent(abs) + '&t=' + Date.now();
    W.elboot = W.elboot || {};
    W.elboot._img2 = img;
    setTimeout(done, 1500);
  } catch (e) { done(); }
};

/* Close the browser and return to the PS5 home screen. The native request
 * (ShellUIUtil navigateToHome) is what actually dismisses WebKit cleanly;
 * window.close() is only a fallback. */
W.launcher.returnHome = function (cb) {
  var done = false;
  function fin(ok) { if (done) return; done = true; try { cb && cb(!!ok); } catch (e) {} }
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/home?t=' + Date.now(), true);
    xhr.timeout = 4000;
    xhr.onload = function () { fin(xhr.status === 200); };
    xhr.onerror = xhr.ontimeout = function () { fin(false); };
    xhr.send();
  } catch (e) { fin(false); }
  setTimeout(function () { try { window.close(); } catch (e) {} }, 900);
};

/* Post-jailbreak: hand pldmgr.elf to elfldr (:9021) and close the browser once
 * it is actually listening on :8084. The payload is 2.8 MB, so closing right
 * after the request would abort the load. */
W.launcher.loadPldmgrAndClose = function () {
  if (W.state.launcherHttpOpenStarted) return;
  W.state.launcherHttpOpenStarted = true;
  var name = W.POST_JB_PAYLOAD || 'pldmgr.elf';
  var PORT = 8084;
  var MAX_MS = 12000;

  function setMsg(text) {
    try {
      if (W.els.successMsg) {
        W.els.successMsg.hidden = false;
        W.els.successMsg.textContent = text;
      }
      if (W.els.statusMsg) W.els.statusMsg.textContent = '';
    } catch (eMsg) {}
  }

  function closeNow(reason) {
    setMsg('Payload Manager running - returning home');
    W.uiLog('[launch] ' + reason + ' - closing the browser', 'info');
    W.launcher.returnHome(function (ok) {
      W.uiLog(ok ? '[launch] returning home' : '[launch] home request failed (close manually)',
        ok ? 'success' : 'warning');
    });
  }

  function fail(reason) {
    /* Still close (the payload was already handed to elfldr), but say why so
     * a missing :8084 UI is visible instead of silent. */
    setMsg('Payload Manager did not answer on :' + PORT + ' - returning home');
    W.uiLog('[launch] ' + reason + ' - closing anyway', 'warning');
    setTimeout(function () {
      W.launcher.returnHome(function (ok) {
        W.uiLog(ok ? '[launch] returning home' : '[launch] home request failed (close manually)',
          ok ? 'success' : 'warning');
      });
    }, 1500);
  }

  W.launcher.probeAnyPort(PORT, 900, function (alreadyUp) {
    if (alreadyUp) { closeNow('already running on :' + PORT); return; }

    setMsg('Starting Payload Manager...');
    W.uiLog('[launch] sending ' + name + ' to elfldr :9021 ...', 'info');
    W.launcher.tipDisk();                       /* console copy (install seeds it) */
    setTimeout(function () {                    /* bundled copy as a fallback */
      W.launcher.tipBundled(name);
    }, 500);

    W.launcher.waitLauncherUp(PORT, MAX_MS, function (up) {
      if (up) closeNow(name + ' is up on :' + PORT);
      else fail(name + ' did not answer on :' + PORT);
    });
  });
};

/* Every post-jailbreak path ends here. */
W.launcher.openCompanionPage = function () {
  W.launcher.loadPldmgrAndClose();
};

/* Manual open button (hidden in this build) does the same thing. */
W.launcher.openNow = function () {
  W.state.launcherHttpOpenStarted = false;
  W.launcher.loadPldmgrAndClose();
};


W.launcher.onAutoloadResult = function (data) {
  W.state.autoloadPending = false;
  if (W.state.finished && !(data && data.ok)) return;
  W.state.finished = true;
  if (data.ok && W.state.mirrorTimer) {
    clearInterval(W.state.mirrorTimer);
    W.state.mirrorTimer = 0;
  }
  if (W.mirrors && W.mirrors.collapseP2jbStats) W.mirrors.collapseP2jbStats();
  if (data.ok) {
    if (W.els.failMsg) {
      try { W.els.failMsg.hidden = true; W.els.failMsg.textContent = ''; } catch (e0) {}
    }
    var name = W.autoloadElfName();
    if (W.state.elInstalledFirst && (data.skipped || name === 'wkal-skip')) {
      /* tip EL next; quiet */
    } else if (data.skipped || name === 'wkal-skip') {
      /* wkal-skip quiet */
    } else if (!(Number(data.bytes) > 0)) {
      W.uiLog('Autoload ok but send missing/skipped (bytes=' + String(data.bytes) + ')', 'warning');
    } else {
      W.uiLog('Sent ' + name + ' to elfldr :9021 (' + data.bytes + ' bytes).', 'success');
      try { if (W.uiSetPayload) W.uiSetPayload('plElfldr','READY',true); } catch (eElf) {}
    }
    W.finishProgressSuccess(W.t('jailbreakSuccess'));
    W.recordRun('ok');
    if (W.selfupd && W.selfupd.maybeApplyPending) W.selfupd.maybeApplyPending('autoload-ok');
  } else {
    var why = data.why || 'unknown error';
    W.uiLog('[ERROR] Autoload failed: ' + why, 'error');
    try { if (W.ui && W.ui.toast) W.ui.toast(W.t('jailbreakFail'), why, 'bad'); } catch (eT) {}
    W.finishProgressFail(W.t('jailbreakFail'));
    W.recordRun('fail');
    /* Safe retry only if early stage. */
    if (W.state.safeRetryLeft > 0 && W.state.progressPct < 32) {
      W.state.safeRetryLeft -= 1;
      W.uiLog('Safe retry left: ' + W.state.safeRetryLeft, 'warning');
      setTimeout(function () {
        try { location.reload(); } catch (e) {}
      }, 800);
    }
  }
  setTimeout(function () {
    if (!data.ok) return;
    if (W.state.updateOnlyMode || W.state.pendingSelfUpdate) {
      W.uiLog('[update] skipping companion open - update install only', 'info');
      return;
    }
    /* After elfldr: tip+open Elf Launcher (out of chain). */
    W.launcher.openCompanionPage();
  }, 0);
};


/* EL bootstrap only. No mirror, payload queue, auto trigger, or update. */
W.elboot = W.elboot || {};
W.elboot.installedFirstOk = function (chain) {
  return chain === 'relapse' || chain === 'wobkot' || chain === 'poops' || chain === 'p2jb';
};
W.elboot.sendInstalled = function (cb, force) {
  if (W.elboot._sent && !force) {
    /* already tipped this run */
    if (typeof cb === 'function') setTimeout(function () { try { cb(true); } catch (e0) {} }, 0);
    return;
  }
  var path = '/data/elf-launcher/elf-launcher.elf';
  /* tip from disk */
  try {
    var img = new Image();
    img.src = 'http://127.0.0.1:9021' + path + '?t=' + Date.now();
    W.elboot._img = img;
    W.elboot._sent = true;
  } catch (eTip) {
    W.uiLog('tip failed: ' + (eTip && eTip.message ? eTip.message : eTip), 'warning');
  }
  /* Also tip Store-bundled ELF via ?uri= so a deleted tile/disk ELF still starts. */
  try {
    var bundledName = W.POST_JB_PAYLOAD || 'pldmgr.elf';
    var base = (location.origin || '') + (location.pathname || '').replace(/\/[^/]*$/, '/');
    var abs = base + 'payloads/' + bundledName;
    if (W.state && W.state.APP_BASE) abs = W.state.APP_BASE + 'payloads/' + bundledName;
    try {
      var m = String(location.pathname || '').match(/^(.*\/app\/[^/]+\/)/);
      if (m) abs = (location.origin || '') + m[1] + 'payloads/' + bundledName;
    } catch (eP) {}
    var tip = 'http://127.0.0.1:9021/?uri=' + encodeURIComponent(abs) + '&t=' + Date.now();
    /* also tip bundled */
    var img2 = new Image();
    img2.src = tip;
    W.elboot._img2 = img2;
    W.elboot._sent = true;
  } catch (eB) {
    W.uiLog('bundled tip failed: ' + (eB && eB.message ? eB.message : eB), 'warning');
  }
  if (typeof cb === 'function') setTimeout(function () { try { cb(true); } catch (e2) {} }, 400);
};
W.elboot.waitUp = function (maxMs, cb) {
  var until = Date.now() + maxMs;
  (function tick() {
    W.launcher.probeElfLauncherHttp(function (up) {
      if (up) { cb(true); return; }
      if (Date.now() >= until) { cb(false); return; }
      setTimeout(tick, 500);
    });
  })();
};

})(typeof window !== 'undefined' ? window : this);
