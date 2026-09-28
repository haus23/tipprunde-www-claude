// @ts-check
/**
 * runde.tips – progressive enhancement.
 *
 * The pages are complete without this script. It adds:
 * - auto-submit for the player / match pickers
 * - closing the championship menu with Escape or an outside click
 * - background revalidation of the page data (stale-while-revalidate):
 *   on load if the served data is already stale, when the tab becomes visible
 *   or the window gets focus, when the network comes back, when the page is
 *   restored from the back/forward cache, and periodically for running
 *   championships while the page is visible
 * - online / offline indication
 * - service worker registration (offline fallback)
 */

const LIVE_STALE_MS = 30_000;
const ARCHIVE_STALE_MS = 60 * 60_000;
const POLL_MS = 2 * 60_000;
const MIN_GAP_MS = 10_000;

const body = document.body;
const isLive = body.hasAttribute('data-live');
const staleAfter = isLive ? LIVE_STALE_MS : ARCHIVE_STALE_MS;

/** @param {string} text @param {'info' | 'warn'} kind */
function showBanner(text, kind) {
  const status = document.getElementById('status');
  if (!status) return;
  status.replaceChildren();
  const p = document.createElement('p');
  p.className = `banner ${kind}`;
  p.textContent = text;
  status.append(p);
}

function clearBanner() {
  document.getElementById('status')?.replaceChildren();
}

/** @param {string} text */
function toast(text) {
  const el = document.createElement('p');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 3000);
}

function dataTime() {
  return Number(body.dataset.time) || 0;
}

/** @param {number} ms */
function formatTime(ms) {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(ms);
}

// --- Pickers ----------------------------------------------------------------

/**
 * Keyboard users change a closed <select> with arrow keys, which fires
 * `change` on every step in some browsers. Only navigate on Enter / blur in
 * that case; pointer and touch selections navigate immediately.
 * @param {ParentNode} root
 */
function bindPickers(root) {
  for (const form of root.querySelectorAll('form[data-autosubmit]')) {
    const select = form.querySelector('select');
    if (!(form instanceof HTMLFormElement) || !select) continue;
    let keyboardChange = false;
    let dirty = false;
    select.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && dirty) {
        event.preventDefault();
        form.requestSubmit();
      } else if (event.key !== 'Tab') {
        keyboardChange = true;
      }
    });
    select.addEventListener('pointerdown', () => {
      keyboardChange = false;
    });
    select.addEventListener('change', () => {
      if (keyboardChange) {
        // Reveal the submit button as an explicit affordance.
        dirty = true;
        form.classList.add('is-dirty');
      } else {
        form.requestSubmit();
      }
    });
    select.addEventListener('blur', () => {
      if (dirty) form.requestSubmit();
    });
  }
}

bindPickers(document);

// --- Championship menu -------------------------------------------------------

for (const menu of document.querySelectorAll('details[data-menu]')) {
  if (!(menu instanceof HTMLDetailsElement)) continue;
  const summary = menu.querySelector('summary');
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      summary?.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (menu.open && event.target instanceof Node && !menu.contains(event.target)) {
      menu.open = false;
    }
  });
  menu.addEventListener('focusout', (event) => {
    if (menu.open && event.relatedTarget instanceof Node && !menu.contains(event.relatedTarget)) {
      menu.open = false;
    }
  });
}

// --- Normalized URLs -----------------------------------------------------------

if (body.dataset.replaceUrl) {
  history.replaceState(history.state, '', body.dataset.replaceUrl);
}

// --- Revalidation --------------------------------------------------------------

const main = document.querySelector('main');
let snapshot = main?.innerHTML ?? '';
let lastCheck = 0;
/** @type {Promise<void> | undefined} */
let running;
/** @type {Document | undefined} */
let pending;

/** Keep open/closed disclosure state across a content swap. */
function openStates() {
  return [...document.querySelectorAll('main details')].map((d) => /** @type {HTMLDetailsElement} */ (d).open);
}

/** @param {Document} doc */
function apply(doc) {
  const next = doc.querySelector('main');
  if (!main || !next) return;

  // Do not swap under an open native picker; wait until it loses focus.
  const active = document.activeElement;
  if (active instanceof HTMLSelectElement && main.contains(active)) {
    pending = doc;
    active.addEventListener('blur', () => pending && setTimeout(() => pending && apply(pending)), { once: true });
    return;
  }
  pending = undefined;

  const nextTime = doc.body.dataset.time;
  if (nextTime) body.dataset.time = nextTime;
  const time = doc.getElementById('data-time');
  const currentTime = document.getElementById('data-time');
  if (time && currentTime) currentTime.replaceWith(document.importNode(time, true));

  const nextStatus = doc.getElementById('status');
  if (nextStatus?.firstElementChild) {
    document
      .getElementById('status')
      ?.replaceChildren(...[...nextStatus.children].map((c) => document.importNode(c, true)));
  } else if (navigator.onLine) {
    clearBanner();
  }

  if (next.innerHTML === snapshot) return;

  const states = openStates();
  const focusedHref = active instanceof HTMLAnchorElement && main.contains(active) ? active.getAttribute('href') : null;
  snapshot = next.innerHTML;
  main.replaceChildren(...[...next.childNodes].map((n) => document.importNode(n, true)));
  const details = document.querySelectorAll('main details');
  if (details.length === states.length) {
    details.forEach((d, ix) => {
      /** @type {HTMLDetailsElement} */ (d).open = !!states[ix];
    });
  }
  if (focusedHref) {
    const target = main.querySelector(`a[href="${CSS.escape(focusedHref)}"]`);
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  }
  bindPickers(main);
  toast('Daten aktualisiert');
}

async function revalidate(force = false) {
  if (running || document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (!force && (now - lastCheck < MIN_GAP_MS || now - dataTime() < staleAfter)) return;
  lastCheck = now;

  running = (async () => {
    try {
      const response = await fetch(location.href, {
        cache: 'no-cache',
        headers: { 'x-revalidate': '1' },
      });
      if (response.headers.get('x-sw-fallback')) throw new Error('offline');
      if (!response.ok && response.status !== 404) {
        showBanner(
          'Die Daten konnten gerade nicht aktualisiert werden. Angezeigt wird der letzte bekannte Stand.',
          'warn',
        );
        return;
      }
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      apply(doc);
    } catch {
      showBanner(`Keine Verbindung. Angezeigt wird der Stand von ${formatTime(dataTime() || Date.now())} Uhr.`, 'warn');
    } finally {
      running = undefined;
    }
  })();
  await running;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') revalidate();
});
window.addEventListener('focus', () => revalidate());
window.addEventListener('pageshow', (event) => {
  if (event.persisted) revalidate();
});
window.addEventListener('online', () => {
  clearBanner();
  revalidate(true);
});
window.addEventListener('offline', () => {
  showBanner(`Du bist offline. Angezeigt wird der Stand von ${formatTime(dataTime() || Date.now())} Uhr.`, 'warn');
});

if (!navigator.onLine || body.hasAttribute('data-sw-fallback')) {
  showBanner(`Du bist offline. Angezeigt wird der Stand von ${formatTime(dataTime() || Date.now())} Uhr.`, 'warn');
}

// The edge may have served stale data while refreshing it; pick up the result.
if (dataTime() && Date.now() - dataTime() > staleAfter) {
  setTimeout(() => revalidate(), 1500);
}
if (isLive) {
  setInterval(() => revalidate(), POLL_MS);
}

// --- Service worker -------------------------------------------------------------

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
