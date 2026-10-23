/**
 * Ricreo · Garage
 * - <rc-vehicle-finder>: make/model picker shown only in the auto categories; remembers the vehicle
 * - <rc-compat>: "Compatibile con la tua …" badge on product cards and the product page. It only ever
 *   confirms a match, so non-automotive products (home, garden, desk…) never show vehicle prompts.
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

/** @param {Vehicle | null} vehicle */
function writeGarage(vehicle) {
  try {
    if (vehicle) localStorage.setItem(GARAGE_KEY, JSON.stringify(vehicle));
    else localStorage.removeItem(GARAGE_KEY);
  } catch {
    // Storage unavailable (private mode): the finder still works, it just won't remember.
  }
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { vehicle } }));
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

/** @param {string} value */
function words(value) {
  return handleize(value)
    .split('-')
    .filter((word) => word.length > 1);
}

/** @param {Vehicle} vehicle */
function shortLabel(vehicle) {
  return vehicle.model || vehicle.brand;
}

/**
 * Tags like `volkswagen-golf-7` (or broader `volkswagen-golf`, brand-only `volkswagen`) fit a saved
 * Volkswagen Golf 7. Untagged products fall back to the title ("… per Citroën Ami, Opel Rocks-e"):
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

const CHECK_ICON =
  '<svg class="rc-compat__icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

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
    const tags = (this.dataset.tags || '').split('|').map(handleize).filter(Boolean);
    const state = vehicle ? compatibility(tags, vehicle, this.dataset.title) : null;

    this.hidden = !state;
    this.dataset.tone = state ? 'ok' : '';
    if (!state || !vehicle) {
      this.innerHTML = '';
      return;
    }

    const name = escapeHtml(shortLabel(vehicle));
    this.innerHTML =
      state === 'universal'
        ? `${CHECK_ICON}<span>Universale: va bene anche per la tua <strong>${name}</strong></span>`
        : `${CHECK_ICON}<span>Compatibile con la tua <strong>${name}</strong></span>`;
  }
}

/* ------------------------------------------------------------------------------------------ */

class RcVehicleFinder extends HTMLElement {
  #abort = new AbortController();
  /** @type {{brand: string, models: string[]}[]} */
  #vehicles = [];

  connectedCallback() {
    const signal = this.#abort.signal;
    try {
      this.#vehicles = JSON.parse(this.querySelector('[data-rc-vehicles]')?.textContent || '[]');
    } catch {
      this.#vehicles = [];
    }

    const brand = this.#brand;
    if (brand) {
      this.#vehicles.forEach((v) => brand.add(new Option(v.brand, v.brand)));
      brand.addEventListener('change', () => this.#populateModels(brand.value), { signal });
    }
    this.querySelector('[data-rc-vf-form]')?.addEventListener('submit', this.#onSubmit, { signal });
    this.querySelector('[data-rc-vf-change]')?.addEventListener('click', () => this.#showForm(true), { signal });
    this.querySelector('[data-rc-vf-clear]')?.addEventListener('click', () => this.#clear(), { signal });
    document.addEventListener(CHANGE_EVENT, () => this.#render(), { signal });

    this.#render();
  }

  disconnectedCallback() {
    this.#abort.abort();
  }

  get #brand() {
    return /** @type {HTMLSelectElement | null} */ (this.querySelector('[data-rc-vf-brand]'));
  }

  get #model() {
    return /** @type {HTMLSelectElement | null} */ (this.querySelector('[data-rc-vf-model]'));
  }

  /** @param {Vehicle} vehicle */
  #searchUrl(vehicle) {
    const params = new URLSearchParams({
      q: [vehicle.brand, vehicle.model].filter(Boolean).join(' '),
      type: 'product',
      'options[prefix]': 'last',
    });
    return `${this.dataset.searchUrl || '/search'}?${params}`;
  }

  /**
   * @param {string} brandName
   * @param {string} [selected]
   */
  #populateModels(brandName, selected = '') {
    const model = this.#model;
    const submit = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-rc-vf-submit]'));
    if (!model) return;
    const vehicle = this.#vehicles.find((v) => v.brand === brandName);
    model.length = 0;
    model.add(new Option(vehicle ? 'Tutti i modelli' : 'Modello', ''));
    vehicle?.models.forEach((name) => model.add(new Option(name, name, false, name === selected)));
    model.disabled = !vehicle;
    if (submit) submit.disabled = !vehicle;
  }

  #render() {
    const saved = readGarage();
    const label = this.querySelector('[data-rc-vf-label]');
    const go = /** @type {HTMLAnchorElement | null} */ (this.querySelector('[data-rc-vf-go]'));
    if (label) label.textContent = saved?.label || '';
    if (go && saved) go.href = this.#searchUrl(saved);

    if (saved && this.#brand && this.#vehicles.some((v) => v.brand === saved.brand)) {
      this.#brand.value = saved.brand;
      this.#populateModels(saved.brand, saved.model);
    }
    this.#showForm(!saved);
  }

  /** @param {boolean} show */
  #showForm(show) {
    const form = /** @type {HTMLElement | null} */ (this.querySelector('[data-rc-vf-form]'));
    const saved = /** @type {HTMLElement | null} */ (this.querySelector('[data-rc-vf-saved]'));
    if (form) form.hidden = !show;
    if (saved) saved.hidden = show || !readGarage();
    if (show && readGarage()) this.#brand?.focus();
  }

  /** @param {SubmitEvent} event */
  #onSubmit = async (event) => {
    event.preventDefault();
    const brand = this.#brand?.value || '';
    if (!brand) return;
    const model = this.#model?.value || '';
    /** @type {Vehicle} */
    const vehicle = { brand, model, year: '', label: [brand, model].filter(Boolean).join(' ') };
    writeGarage(vehicle);

    if (this.dataset.saveToCart === 'true') {
      // Best effort: the vehicle shows up on the order, but never delay navigation for long.
      await Promise.race([this.#saveToCart(vehicle.label), new Promise((r) => setTimeout(r, 1200))]);
    }
    window.location.href = this.#searchUrl(vehicle);
  };

  #clear() {
    writeGarage(null);
    if (this.dataset.saveToCart === 'true') this.#saveToCart('');
  }

  /** @param {string} label */
  #saveToCart(label) {
    return fetch(this.dataset.cartUpdateUrl || '/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ attributes: { Veicolo: label } }),
    }).catch(() => {});
  }
}

if (!customElements.get('rc-compat')) customElements.define('rc-compat', RcCompat);
if (!customElements.get('rc-vehicle-finder')) customElements.define('rc-vehicle-finder', RcVehicleFinder);
