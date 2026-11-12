/* Run with Node: node tests/test_launcher_recovery.js */
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'frontend/autoloader/js/launcher.js'),'utf8');
const payload=fs.readFileSync(path.join(root,'frontend/autoloader/payloads/elf-launcher.elf'));
const start=payload.indexOf(Buffer.from('<!DOCTYPE html>')), end=payload.indexOf(0,start);
assert(start>=0);
const html=payload.subarray(start,end<0?payload.length:end).toString('utf8');
function setup(state,up,wantOpen) {
  const calls={send:0,resend:0,open:0,fetch:0,urls:[],timers:[]};
  const W={state:Object.assign({launcherHttpOpenStarted:false},state),els:{progressLabel:{textContent:''}},
    CHOICE_PAYLOAD_MANAGER:'payload-manager',BUNDLED_ELFLAUNCHER_VER:'2.1.6',CONSOLE_LAUNCHER_URI:'file:///data/elf-launcher/elf-launcher.elf',
    t:k=>k,uiLog:()=>{},beginPayloadLoading:()=>{},uiSetPayload:()=>{},consoleHttpBase:p=>'http://127.0.0.1:'+p+'/',withCacheBust:u=>u};
  class Image {set src(url){calls.urls.push(url);} }
  const context={WKAL:W,document:{getElementById:()=>null},Image,
    fetch:()=>{calls.fetch++;return {catch:()=>{}};},setTimeout:(f,ms)=>calls.timers.push([f,ms])};
  vm.createContext(context);vm.runInContext(source,context);
  const realSend=W.elboot.sendInstalled;
  W.elboot.sendInstalled=cb=>{calls.send++;if(cb)cb(true);};
  W.elboot.waitUp=(ms,cb)=>cb(up);
  W.launcher.requestResendAutoload=name=>{assert.strictEqual(name,'elf-launcher.elf');calls.resend++;return true;};
  W.launcher.browserWantsOpen=cb=>cb(wantOpen);
  W.launcher.openWhenHttpReady=(...args)=>{assert.strictEqual(args[6],false,'no automatic ELF resend');calls.open++;};
  return {W,calls,realSend};
}
{
  const {W}=setup({},true,true);
  assert(W.launcher.httpResponseReady({status:200,responseText:html},'elf-launcher'));
  assert(!W.launcher.httpResponseReady({status:404,responseText:html},'elf-launcher'));
  assert(!W.launcher.httpResponseReady({status:200,responseText:html.replace(/<title>[^<]*<\/title>/,'<title>Wrong page</title>')},'elf-launcher'));
}
for(const wantOpen of [true,false]) {
  const {W,calls}=setup({elInstalledFirst:true},true,wantOpen);
  W.launcher.openElfLauncherPage();W.launcher.openElfLauncherPage();
  assert.strictEqual(calls.send,1);assert.strictEqual(calls.resend,0);
  assert.strictEqual(calls.open,wantOpen?1:0);assert.strictEqual(calls.fetch,0,'WK must never trigger EL AutoPayload');
  if(!wantOpen)assert.strictEqual(W.els.progressLabel.textContent,'elfReady');
}
{
  const {W,calls}=setup({elInstalledFirst:true},false,true);W.launcher.openElfLauncherPage();
  assert.strictEqual(calls.send,1);assert.strictEqual(calls.resend,0,'slow EL must never be restarted automatically');assert.strictEqual(calls.fetch,0);
  assert.strictEqual(W.state.elInstalledFirst,true);assert.strictEqual(calls.open,1);
}
for(const state of [{elfHttpAlreadyUp:true},{elInstalledFirst:false}]) {
  const {W,calls}=setup(state,true,true);W.launcher.openElfLauncherPage();
  assert.strictEqual(calls.send,0);assert.strictEqual(calls.resend,0);assert.strictEqual(calls.fetch,0);assert.strictEqual(calls.open,1);
}
{
  const {W,calls,realSend}=setup({},true,true);realSend();realSend();
  assert.deepStrictEqual(calls.urls,['http://127.0.0.1:9021/data/elf-launcher/elf-launcher.elf']);
  calls.timers.forEach(([f])=>f());assert.strictEqual(calls.urls.length,1,'no duplicate launch retries');
  assert(W.elboot.installedFirstOk('relapse'));assert(!W.elboot.installedFirstOk('umtx2'));
}
{
  const {W,calls}=setup({},true,true);W.launcher.probeElfLauncherHttp=cb=>cb(false);
  W.launcher.openNow();assert.strictEqual(calls.send,1);assert.strictEqual(calls.fetch,0);assert.strictEqual(calls.open,1);
}
for(const method of ['ensureRunning','openNow']) {
  const {W,calls}=setup({},false,true);W.launcher.probeElfLauncherHttp=cb=>cb(false);
  W.launcher[method](()=>{});
  assert.strictEqual(calls.send,1);assert.strictEqual(calls.resend,0,'no automatic relaunch on timeout');assert.strictEqual(calls.fetch,0);
}
for(const file of ['launcher.js','core.js','main.js']) {
  const text=fs.readFileSync(path.join(root,'frontend/autoloader/js',file),'utf8');
  for(const forbidden of ['CONSOLE_MIRROR','elMirrorFirst','spawnAutoRun','W.elauto','/mirror/','/trigger-auto','/boot-auto','/auto-run.elf'])
    assert(!text.includes(forbidden),file+' must not contain '+forbidden);
  assert.strictEqual(text.replace(/\r\n/g,'\n'),fs.readFileSync(path.join(root,'docs/js',file),'utf8').replace(/\r\n/g,'\n'));
}
const installer=fs.readFileSync(path.join(root,'src/app_installer.c'),'utf8');
assert(installer.includes('"/data/elf-launcher/elf-launcher.elf")'));
assert(!/seed_registry_elf_to_path\([^;]+"\/data\/elf-launcher\/mirror\//s.test(installer));
assert(!installer.includes('"/data/elf-launcher/auto.list"'),'WK must not edit EL payload selection');
assert(!installer.includes('/auto-run.elf'));
const defaults=html.slice(html.indexOf('var DELAY_MAX='),html.indexOf('function storeAutoDelay'));
const ctx={LANG:'en',localStorage:{getItem:()=>''},sessionStorage:{getItem:()=>''},document:{cookie:''}};
vm.createContext(ctx);vm.runInContext(defaults,ctx);assert.strictEqual(ctx.autoDelaySec(),0);
console.log('PASS: launcher-only root bootstrap, no mirror/auto requests, once-only send, slow-start no-resend, existing/bundled, leave-closed, synced docs, installer isolation, zero delay');
