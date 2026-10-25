/* AI-assisted source. Review, understand and disclose assistance in Assignment 2. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ui = Object.fromEntries(['start','stop','download','status','state','elapsed','count','goal','details','ax','ay','az','atotal'].map(id => [id,$(id)]));
  let rows = [], recording = false, pending = false, started = 0, origin = 0;
  let lastValid = 0, skipped = 0, timer = null, session = 0;
  const finiteTriple = a => a && [a.x,a.y,a.z].every(v => typeof v === 'number' && Number.isFinite(v));
  function controls() {
    ui.start.disabled = recording || pending;
    ui.stop.disabled = !recording;
    ui.download.disabled = recording || pending || !rows.length;
  }
  function stop(message = 'Recording stopped. Download your CSV before leaving.') {
    if (!recording && !pending) return;
    session++; pending = false;
    if (recording) ui.elapsed.textContent = ((performance.now()-started)/1000).toFixed(1)+' s';
    recording = false;
    clearInterval(timer);
    window.removeEventListener('devicemotion', motion);
    ui.state.textContent = 'STOPPED'; ui.status.textContent = message;
    ui.details.textContent = `${rows.length} saved · ${skipped} unavailable readings skipped. Time is UTC; acceleration excludes gravity.`;
    controls();
  }
  function motion(event) {
    if (!recording) return;
    if (document.visibilityState !== 'visible') { stop('Stopped: page hidden or screen locked. Download this session, then Start again.'); return; }
    // Reject synthetic DOM events; there is no demo or fake-data mode.
    if (!event.isTrusted) return;
    const a = event.acceleration;
    if (!finiteTriple(a)) { skipped++; return; }
    const magnitude = Math.hypot(a.x,a.y,a.z);
    if (!Number.isFinite(magnitude)) { skipped++; return; }
    const now = performance.now(); lastValid = now;
    rows.push([new Date(origin + now-started).toISOString(),a.x,a.y,a.z,magnitude]);
    ui.count.textContent = rows.length.toLocaleString();
    for (const [id,value] of [['ax',a.x],['ay',a.y],['az',a.z],['atotal',magnitude]]) ui[id].textContent = value.toFixed(3);
    ui.goal.textContent = rows.length >= 1000 ? 'Target reached: 1,000+ valid readings. You can Stop and download.' : `${(1000-rows.length).toLocaleString()} more readings to reach 1,000`;
    ui.status.textContent = 'Recording real motion readings. Keep Safari visible and the screen awake.';
    ui.details.textContent = `${skipped} unavailable readings skipped · latest timestamp: ${rows[rows.length-1][0]}`;
  }
  ui.start.addEventListener('click', async () => {
    if (recording || pending) return;
    if (!window.isSecureContext) { ui.status.textContent = 'HTTPS required. Upload all three web files to an HTTPS host and open that URL in Safari.'; return; }
    if (typeof window.DeviceMotionEvent === 'undefined') { ui.status.textContent = 'Motion API unavailable in this browser. Test in Safari on an actual iPhone.'; return; }
    if (document.visibilityState !== 'visible') return;
    if (rows.length && !window.confirm('Start a new session and replace the current readings? Cancel to download them first.')) return;
    pending = true; controls();
    const attempt = ++session;
    ui.status.textContent = 'Requesting motion access…';
    try {
      // Called directly from this Start-button gesture, before any unrelated await.
      if (typeof window.DeviceMotionEvent.requestPermission === 'function') {
        const permission = await window.DeviceMotionEvent.requestPermission();
        if (attempt !== session) return;
        if (permission !== 'granted') throw new Error('Motion permission denied. Allow motion access for this website in Safari, then retry.');
      }
      if (attempt !== session || document.visibilityState !== 'visible') return;
      rows = []; skipped = 0; started = performance.now(); origin = Date.now(); lastValid = started;
      recording = true; pending = false;
      ui.count.textContent = '0'; ui.elapsed.textContent = '0.0 s';
      for (const id of ['ax','ay','az','atotal']) ui[id].textContent = '—';
      ui.goal.textContent = 'Target: at least 1,000 real readings';
      ui.details.textContent = 'Started UTC: '+new Date(origin).toISOString();
      ui.state.textContent = 'RECORDING'; ui.status.textContent = 'Waiting for real acceleration readings excluding gravity…';
      window.addEventListener('devicemotion', motion);
      timer = setInterval(() => {
        if (document.visibilityState !== 'visible') { stop('Stopped: page hidden or screen locked. Start again explicitly.'); return; }
        const now = performance.now();
        ui.elapsed.textContent = ((now-started)/1000).toFixed(1)+' s';
        if (now-lastValid > 8000) stop('Stopped: no valid gravity-excluded readings for 8 seconds. Check Safari permission and sensor support. Gravity-inclusive data is not substituted.');
      }, 200);
      controls();
    } catch (error) {
      if (attempt !== session) return;
      pending = false; ui.state.textContent = 'ACCESS ERROR';
      ui.status.textContent = error.message || 'Could not access motion sensors. Check Safari permissions and HTTPS, then retry.';
      controls();
    }
  });
  ui.stop.addEventListener('click', () => stop());
  ui.download.addEventListener('click', () => {
    if (recording || pending || !rows.length) return;
    try {
      const csv = 'time,ax,ay,az,atotal\r\n'+rows.map(row => row.join(',')).join('\r\n')+'\r\n';
      const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      const link = document.createElement('a'); link.href = url;
      link.download = 'walking-'+new Date(origin).toISOString().replace(/[:.]/g,'-')+'.csv';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url),60000);
      ui.status.textContent = 'CSV download requested. Check Safari Downloads or use Share → Save to Files if it opens a preview.';
    } catch { ui.status.textContent = 'Download failed. Keep this page open and try Download CSV again.'; }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') stop('Stopped: Safari was backgrounded or the screen locked. Download this session, then tap Start for a new one.');
  });
  window.addEventListener('pagehide', () => stop('Stopped: page left. Download retained readings if this page is restored.'));
  window.addEventListener('beforeunload', event => {
    if (rows.length || recording) { event.preventDefault(); event.returnValue = ''; }
  });
  controls();
})();
