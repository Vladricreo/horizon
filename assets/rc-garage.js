/**
 * Ricreo · Garage (site-wide)
 * - <rc-garage-bar>: slim bar in the header group showing the saved vehicle, with change / clear
 *   and, on collection pages, a one-click "only parts for my car" filter
 * - <rc-compat>: compatibility badge on product cards and the product page, from product tags
 * The vehicle is saved by the hero finder (rc-hero-garage.js) under the same storage key.
 */

const GARAGE_KEY = 'rc-garage';
const CHANGE_EVENT = 'rc:garage-change';
const UNIVERSAL_TAGS = ['universale', 'universal', 'tutti-i-veicoli'];

/** @typedef {{brand: string, model: string, year: string, label: string}} Vehicle */

/** @returns {Vehicle | null} */
function readGarage() {
  try {
    const raw = localStorage.getItem(GARAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearGarage() {
  try {
    localStorage.removeItem(GARAGE_KEY);
  } catch {
    // Storage unavailable: nothing was saved anyway.
  }
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { vehicle: null } }));
}

/** @param {string} value */
function handleize(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** @param {Vehicle} vehicle */
function shortLabel(vehicle) {
  return vehicle.model || vehicle.brand;
}

/** @param {string} value */
function words(value) {
  return handleize(value)
    .split('-')
    .filter((word) => word.length > 1);
}

/**
 * Same tag convention as the cart upsell: a product tagged `volkswagen-golf-7` (or a broader
 * `volkswagen-golf`, or brand-only `volkswagen`) fits a saved Volkswagen Golf 7.
 * Untagged products fall back to the title ("… per Citroën Ami, Opel Rocks-e e Fiat Topolino"):
 * every word of brand and model must appear in it.
 * @param {string[]} tags - handleized product tags
 * @param {Vehicle} vehicle
 * @param {string} [title]
 * @returns {'match' | 'universal' | null}
 */
function compatibility(tags, vehicle, title = '') {
  if (tags.some((tag) => UNIVERSAL_TAGS.includes(tag))) return 'universal';

  if (title && vehicle.model) {
    const titleWords = new Set(words(title));
    const needed = [...words(vehicle.brand), ...words(vehicle.model)];
    if (needed.length && needed.every((word) => titleWords.has(word))) return 'match';
  }

  const brand = handleize(vehicle.brand);
  if (!brand) return null;

  // Brand only: we can't vouch for a specific model, so only brand-wide tags count.
  if (!vehicle.model) return tags.includes(brand) ? 'match' : null;

  const model = handleize(`${vehicle.brand} ${vehicle.model}`);
  const full = handleize(`${vehicle.brand} ${vehicle.model} ${vehicle.year || ''}`);
  const fits = tags.some(
    (tag) =>
      tag === model ||
      tag.startsWith(`${model}-`) ||
      (tag.startsWith(brand) && (full === tag || full.startsWith(`${tag}-`)))
  );
  return fits ? 'match' : null;
}

/** @param {string} text */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const ICONS = {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  car: '<path d="M5 16.5h14M3.5 16.5v-3.2c0-.6.2-1.1.6-1.5L6 9.6l1.4-3.1A2 2 0 0 1 9.2 5.3h5.6a2 2 0 0 1 1.8 1.2L18 9.6l1.9 2.2c.4.4.6.9.6 1.5v3.2"/><path d="M6 9.6h12"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
};

/** @param {keyof typeof ICONS} name */
function icon(name) {
  return `<svg class="rc-compat__icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

/* ------------------------------------------------------------------------------------------ */

class RcCompat extends HTMLElement {
  #abort = new AbortController();

  connectedCallback() {
    document.addEventListener(CHANGE_EVENT, () => this.#render(), { signal: this.#abort.signal });
    this.#render();
  }

  disconnectedCallback() {
    this.#abort.abort();
  }

  #render() {
    const vehicle = readGarage();
    const isCard = this.dataset.context === 'card';
    const finderUrl = this.dataset.finderUrl || '/#rc-finder';
    const tags = (this.dataset.tags || '').split('|').map(handleize).filter(Boolean);
    const state = vehicle ? compatibility(tags, vehicle, this.dataset.title) : null;
    const name = vehicle ? escapeHtml(shortLabel(vehicle)) : '';

    let html = '';
    let tone = '';
    if (state === 'match') {
      tone = 'ok';
      html = `${icon('check')}<span>Compatibile con la tua <strong>${name}</strong></span>`;
    } else if (state === 'universal') {
      tone = 'ok';
      html = `${icon('check')}<span>Universale: va bene anche per la tua <strong>${name}</strong></span>`;
    } else if (isCard) {
      // On cards we only ever confirm; unknown stays silent to keep the grid calm.
    } else if (vehicle) {
      tone = 'unknown';
      html = `${icon('info')}<span>Compatibilità con la tua <strong>${name}</strong> da verificare: controlla il codice OEM in descrizione.</span>`;
    } else {
      tone = 'empty';
      html = `${icon('car')}<span>Va bene per la tua auto? <a href="${escapeHtml(finderUrl)}">Scegli il tuo veicolo</a></span>`;
    }

    this.hidden = !html;
    this.dataset.tone = tone;
    this.innerHTML = html;
  }
}

/* ------------------------------------------------------------------------------------------ */

class RcGarageBar extends HTMLElement {
  #abort = new AbortController();

  connectedCallback() {
    const signal = this.#abort.signal;
    document.addEventListener(CHANGE_EVENT, () => this.#render(), { signal });
    this.querySelector('[data-rc-gbar-clear]')?.addEventListener('click', () => this.#clear(), { signal });
    this.#render();
  }

  disconnectedCallback() {
    this.#abort.abort();
  }

  #render() {
    const vehicle = readGarage();
    const saved = /** @type {HTMLElement | null} */ (this.querySelector('[data-rc-gbar-saved]'));
    const empty = /** @type {HTMLElement | null} */ (this.querySelector('[data-rc-gbar-empty]'));
    const clear = /** @type {HTMLElement | null} */ (this.querySelector('[data-rc-gbar-clear]'));
    const change = this.querySelector('[data-rc-gbar-change]');
    const filter = /** @type {HTMLAnchorElement | null} */ (this.querySelector('[data-rc-gbar-filter]'));

    this.hidden = !vehicle && this.dataset.showEmpty !== 'true';
    if (saved) saved.hidden = !vehicle;
    if (empty) empty.hidden = Boolean(vehicle);
    if (clear) clear.hidden = !vehicle;
    if (change) change.textContent = vehicle ? 'Cambia' : 'Scegli auto';

    const label = this.querySelector('[data-rc-gbar-label]');
    if (label) label.textContent = vehicle?.label || '';

    if (filter) {
      const base = (this.dataset.collectionUrl || '').replace(/\/$/, '');
      const tag = vehicle ? handleize([vehicle.brand, vehicle.model].filter(Boolean).join(' ')) : '';
      filter.hidden = !base || !tag;
      if (base && tag) {
        const active = (this.dataset.currentTags || '').split('|').map(handleize).includes(tag);
        filter.href = active ? base : `${base}/${tag}`;
        filter.textContent = active ? 'Mostra tutti i ricambi' : `Solo ricambi per ${shortLabel(/** @type {Vehicle} */ (vehicle))}`;
        filter.classList.toggle('is-active', active);
      }
    }
  }

  #clear() {
    clearGarage();
    const url = this.dataset.cartUpdateUrl;
    if (url) {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ attributes: { Veicolo: '' } }),
      }).catch(() => {});
    }
  }
}

if (!customElements.get('rc-compat')) customElements.define('rc-compat', RcCompat);
if (!customElements.get('rc-garage-bar')) customElements.define('rc-garage-bar', RcGarageBar);
