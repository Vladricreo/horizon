/**
 * Ricreo · Hero Garage
 * - Vehicle finder (brand → model → year) with "my garage" memory
 * - Interactive car: hotspots, zone cards, paint swatches, subtle tilt
 * Standalone custom element: no dependency on Horizon internals, so theme updates won't break it.
 */

const GARAGE_KEY = 'rc-garage';
const AUTOPLAY_INTERVAL = 3800;

/** @returns {{brand: string, model: string, year: string, label: string} | null} */
export function readGarage() {
  try {
    const raw = localStorage.getItem(GARAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** @param {{brand: string, model: string, year: string, label: string} | null} vehicle */
function writeGarage(vehicle) {
  try {
    if (vehicle) localStorage.setItem(GARAGE_KEY, JSON.stringify(vehicle));
    else localStorage.removeItem(GARAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the finder still works without memory.
  }
  document.dispatchEvent(new CustomEvent('rc:garage-change', { detail: { vehicle } }));
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

class RcHeroGarage extends HTMLElement {
  /** @type {{brand: string, models: string[]}[]} */
  #vehicles = [];
  /** @type {number | undefined} */
  #autoplayTimer;
  #userInteracted = false;
  #abort = new AbortController();

  connectedCallback() {
    const signal = this.#abort.signal;

    try {
      const json = this.querySelector('[data-rc-vehicles]')?.textContent || '[]';
      this.#vehicles = JSON.parse(json).map((/** @type {{brand: string, models: string[]}} */ v) => ({
        brand: v.brand,
        models: v.models.filter(Boolean),
      }));
    } catch {
      this.#vehicles = [];
    }

    this.#setupFinder(signal);
    this.#setupTabs(signal);
    this.#setupStage(signal);
    this.#renderGarage();

    document.addEventListener('shopify:block:select', this.#onEditorBlockSelect, { signal });
  }

  disconnectedCallback() {
    this.#abort.abort();
    window.clearInterval(this.#autoplayTimer);
  }

  /* ---------------------------------- Finder --------------------------------- */

  get #brandSelect() {
    return /** @type {HTMLSelectElement | null} */ (this.querySelector('[data-rc-brand]'));
  }

  get #modelSelect() {
    return /** @type {HTMLSelectElement | null} */ (this.querySelector('[data-rc-model]'));
  }

  get #yearSelect() {
    return /** @type {HTMLSelectElement | null} */ (this.querySelector('[data-rc-year]'));
  }

  /** @param {AbortSignal} signal */
  #setupFinder(signal) {
    const brand = this.#brandSelect;
    const model = this.#modelSelect;
    const year = this.#yearSelect;
    const form = /** @type {HTMLFormElement | null} */ (this.querySelector('[data-rc-vehicle-form]'));
    if (!brand || !model || !form) return;

    if (year) {
      const from = Number(this.dataset.yearFrom) || 1995;
      const current = new Date().getFullYear() + 1;
      for (let y = current; y >= from; y--) year.add(new Option(String(y), String(y)));
    }

    brand.addEventListener('change', () => this.#populateModels(brand.value), { signal });
    model.addEventListener('change', () => this.#syncSubmitState(), { signal });
    form.addEventListener('submit', (event) => this.#onFinderSubmit(event), { signal });

    const saved = readGarage();
    if (saved && this.#vehicles.some((v) => v.brand === saved.brand)) {
      brand.value = saved.brand;
      this.#populateModels(saved.brand, saved.model);
      if (year && saved.year) year.value = saved.year;
    }
  }

  /**
   * @param {string} brandName
   * @param {string} [selected]
   */
  #populateModels(brandName, selected = '') {
    const model = this.#modelSelect;
    if (!model) return;

    const vehicle = this.#vehicles.find((v) => v.brand === brandName);
    model.length = 0;
    model.add(new Option(vehicle ? 'Tutti i modelli' : 'Scegli', ''));
    vehicle?.models.forEach((name) => model.add(new Option(name, name, false, name === selected)));
    model.disabled = !vehicle;
    this.#syncSubmitState();
  }

  #syncSubmitState() {
    const submit = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-rc-submit]'));
    if (submit) submit.disabled = !this.#brandSelect?.value;
  }

  /** @param {{brand: string, model: string}} vehicle */
  #vehicleUrl(vehicle) {
    if (this.dataset.searchMode === 'tag') {
      const base = (this.dataset.tagCollectionUrl || '/collections/all').replace(/\/$/, '');
      return `${base}/${handleize([vehicle.brand, vehicle.model].filter(Boolean).join(' '))}`;
    }
    const query = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');
    const params = new URLSearchParams({ q: query, type: 'product', 'options[prefix]': 'last' });
    return `${this.dataset.searchUrl || '/search'}?${params}`;
  }

  /** @param {SubmitEvent} event */
  async #onFinderSubmit(event) {
    event.preventDefault();
    const brand = this.#brandSelect?.value || '';
    if (!brand) return;

    const vehicle = {
      brand,
      model: this.#modelSelect?.value || '',
      year: this.#yearSelect?.value || '',
      label: '',
    };
    vehicle.label = [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ');

    writeGarage(vehicle);

    const submit = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-rc-submit]'));
    if (submit) submit.setAttribute('aria-busy', 'true');

    if (this.dataset.saveToCart === 'true') {
      // Best effort: never block navigation for more than ~1.2s.
      await Promise.race([this.#saveVehicleToCart(vehicle.label), new Promise((r) => setTimeout(r, 1200))]);
    }

    window.location.href = this.#vehicleUrl(vehicle);
  }

  /** @param {string} label */
  #saveVehicleToCart(label) {
    return fetch(this.dataset.cartUpdateUrl || '/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ attributes: { Veicolo: label } }),
    }).catch(() => {});
  }

  #renderGarage() {
    const box = /** @type {HTMLElement | null} */ (this.querySelector('[data-rc-garage]'));
    if (!box) return;

    const saved = readGarage();
    box.hidden = !saved;
    if (!saved) return;

    const label = box.querySelector('[data-rc-garage-label]');
    if (label) label.textContent = saved.label;

    const go = /** @type {HTMLAnchorElement | null} */ (box.querySelector('[data-rc-garage-go]'));
    if (go) go.href = this.#vehicleUrl(saved);

    box.querySelector('[data-rc-garage-clear]')?.addEventListener(
      'click',
      () => {
        writeGarage(null);
        if (this.dataset.saveToCart === 'true') this.#saveVehicleToCart('');
        box.hidden = true;
      },
      { once: true }
    );
  }

  /* ----------------------------------- Tabs ---------------------------------- */

  /** @param {AbortSignal} signal */
  #setupTabs(signal) {
    const tabs = /** @type {HTMLButtonElement[]} */ ([...this.querySelectorAll('[data-rc-tab]')]);
    if (tabs.length < 2) return;

    const select = (/** @type {HTMLButtonElement} */ tab, focus = false) => {
      tabs.forEach((t) => {
        const active = t === tab;
        t.setAttribute('aria-selected', String(active));
        t.tabIndex = active ? 0 : -1;
        const panel = this.querySelector(`[data-rc-panel="${t.dataset.rcTab}"]`);
        if (panel instanceof HTMLElement) panel.hidden = !active;
      });
      if (focus) tab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab), { signal });
      tab.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          const step = event.key === 'ArrowRight' ? 1 : -1;
          const next = tabs[(index + step + tabs.length) % tabs.length];
          if (next) select(next, true);
        },
        { signal }
      );
    });
  }

  /* ---------------------------------- Stage ---------------------------------- */

  /** @param {AbortSignal} signal */
  #setupStage(signal) {
    const stage = /** @type {HTMLElement | null} */ (this.querySelector('[data-rc-stage]'));
    if (!stage) return;

    const triggers = /** @type {HTMLElement[]} */ ([...this.querySelectorAll('[data-rc-hotspot]')]);
    triggers.forEach((trigger) => {
      const activate = () => {
        this.#stopAutoplay();
        this.#activate(trigger.dataset.rcHotspot || '');
      };
      trigger.addEventListener('click', activate, { signal });
      trigger.addEventListener('focus', activate, { signal });
      if (trigger.classList.contains('rc-hotspot')) {
        trigger.addEventListener('pointerenter', activate, { signal });
      }
    });

    const first = triggers[0]?.dataset.rcHotspot;
    if (first) this.#activate(first);

    // Paint swatches
    this.querySelectorAll('[data-rc-paint]').forEach((swatch) => {
      swatch.addEventListener(
        'click',
        () => {
          if (!(swatch instanceof HTMLElement)) return;
          this.style.setProperty('--rc-paint', swatch.dataset.rcPaint || '');
          this.style.setProperty('--rc-paint-light', swatch.dataset.rcPaintLight || '');
          this.style.setProperty('--rc-paint-dark', swatch.dataset.rcPaintDark || '');
          this.querySelectorAll('[data-rc-paint]').forEach((s) =>
            s.setAttribute('aria-checked', String(s === swatch))
          );
        },
        { signal }
      );
    });

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Tilt follows the pointer on devices that can hover.
    const wrap = /** @type {HTMLElement | null} */ (this.querySelector('[data-rc-car-wrap]'));
    if (wrap && !reduceMotion && window.matchMedia('(hover: hover)').matches) {
      stage.addEventListener(
        'pointermove',
        (event) => {
          const rect = stage.getBoundingClientRect();
          const px = (event.clientX - rect.left) / rect.width - 0.5;
          const py = (event.clientY - rect.top) / rect.height - 0.5;
          wrap.style.setProperty('--ry', `${(px * 8).toFixed(2)}deg`);
          wrap.style.setProperty('--rx', `${(-py * 5).toFixed(2)}deg`);
        },
        { signal }
      );
      stage.addEventListener(
        'pointerleave',
        () => {
          wrap.style.setProperty('--ry', '0deg');
          wrap.style.setProperty('--rx', '0deg');
        },
        { signal }
      );
    }

    if (this.dataset.autoplay === 'true' && !reduceMotion && triggers.length > 1) {
      this.#startAutoplay();
      stage.addEventListener('pointerdown', () => this.#stopAutoplay(), { signal, once: true });
    }
  }

  /** @param {string} id */
  #activate(id) {
    const hotspot = /** @type {HTMLElement | null} */ (this.querySelector(`.rc-hotspot[data-rc-hotspot="${id}"]`));
    const zone = hotspot?.dataset.rcZone || '';
    const stage = /** @type {HTMLElement | null} */ (this.querySelector('[data-rc-stage]'));
    if (stage) stage.dataset.zone = zone;

    this.querySelectorAll('.rc-hotspot').forEach((el) =>
      el.classList.toggle('is-active', el instanceof HTMLElement && el.dataset.rcHotspot === id)
    );
    this.querySelectorAll('.rc-zone-nav__item').forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const active = el.dataset.rcHotspot === id;
      el.setAttribute('aria-selected', String(active));
      if (active && this.#userInteracted) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    this.querySelectorAll('[data-rc-card]').forEach((card) => {
      if (card instanceof HTMLElement) card.hidden = card.dataset.rcCard !== id;
    });
  }

  #startAutoplay() {
    const ids = [...this.querySelectorAll('.rc-hotspot')].map((el) => (el instanceof HTMLElement ? el.dataset.rcHotspot : ''));
    let index = 0;
    this.#autoplayTimer = window.setInterval(() => {
      // Pause while the hero is off screen or the tab is hidden.
      if (document.hidden || this.getBoundingClientRect().bottom < 0) return;
      index = (index + 1) % ids.length;
      const id = ids[index];
      if (id) this.#activate(id);
    }, AUTOPLAY_INTERVAL);
  }

  #stopAutoplay() {
    this.#userInteracted = true;
    window.clearInterval(this.#autoplayTimer);
  }

  /** @param {Event} event */
  #onEditorBlockSelect = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !this.contains(target)) return;
    const id = target.dataset.rcHotspot;
    if (!id) return;
    this.#stopAutoplay();
    this.#activate(id);
  };
}

if (!customElements.get('rc-hero-garage')) customElements.define('rc-hero-garage', RcHeroGarage);
