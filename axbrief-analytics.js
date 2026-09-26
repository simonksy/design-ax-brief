/* First-party funnel telemetry — plain JS, no dependency, no cookie, ~1KB.
 *
 * Exposes window.axTrack(name, props). Events are batched and flushed with
 * sendBeacon so a reader who taps through to Patreon or closes the tab still has
 * their last event recorded. Everything here is best-effort and silent: telemetry
 * must never throw into the app, log to the console, or delay a render.
 *
 * Loaded as a normal <script> BEFORE the Babel-compiled app, so window.axTrack
 * already exists by the time the first component mounts. On the static preview
 * (python3 -m http.server, no Worker) POSTs to /api/e 404 harmlessly.
 */
(function () {
  var ENDPOINT = '/api/e';
  var queue = [];
  var timer = null;
  var FLUSH_MS = 2000;

  // 'small' = the carousel at /, 'large' = the full-bleed card page at /large.
  var variant = /large/.test(location.pathname) ? 'large' : 'small';

  function send(batch) {
    if (!batch.length) return;
    var payload = JSON.stringify({ events: batch });
    try {
      if (navigator.sendBeacon &&
          navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }))) return;
    } catch (e) { /* fall through to fetch */ }
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        credentials: 'same-origin',
        keepalive: true,
      }).catch(function () {});
    } catch (e) { /* offline, blocked, or no Worker — telemetry is expendable */ }
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    var batch = queue;
    queue = [];
    send(batch);
  }

  window.axTrack = function (name, props) {
    if (!name) return;
    var e = { name: String(name), variant: variant };
    if (props) {
      if (props.section) e.section = String(props.section);
      if (props.cardId) e.cardId = String(props.cardId);
    }
    queue.push(e);
    // 20 is the server's per-batch cap; flushing at it keeps rows from being dropped.
    if (queue.length >= 20) return flush();
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  };

  // Flush on the way out. 'visibilitychange' is the reliable one on mobile Safari,
  // where 'unload' and 'beforeunload' often never fire.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);

  window.axTrack('page_view');
})();
