/**
 * Ricreo · Upsell
 * - <rc-upsell>: quick-add cards inside the cart drawer / cart page
 * - <rc-bundle>: "Frequently bought together" on the product page
 *
 * Adds to cart the same way Horizon's product form does (AJAX add + CartLinesUpdateEvent),
 * so the cart drawer re-renders, auto-opens and animates the new rows with no core changes.
 */

import { CartLinesUpdateEvent, StandardEvents } from '@shopify/events';
import { formatMoney } from '@theme/money-formatting';

/** @returns {string[]} */
function cartSectionIds() {
  return [...document.querySelectorAll('cart-items-component')]
    .map((el) => (el instanceof HTMLElement ? el.dataset.sectionId : ''))
    .filter((id) => typeof id === 'string' && id.length > 0);
}

/**
 * @param {{ id: string | number, quantity: number }[]} lines
 * @param {HTMLElement} source - Element the cart event is dispatched from
 * @param {'product' | 'cart'} context
 */
export async function addLines(lines, source, context = 'product') {
  const sections = cartSectionIds();
  const deferred = CartLinesUpdateEvent.createPromise();

  source.dispatchEvent(
    new CartLinesUpdateEvent({
      action: 'add',
      context,
      lines: lines.map((line) => ({ merchandiseId: String(line.id), quantity: line.quantity })),
      promise: deferred.promise,
    })
  );

  // `Theme` is a global `const` declared in snippets/scripts.liquid (not a window property).
  const routes = typeof Theme !== 'undefined' ? Theme.routes : {};
  const addUrl = routes.cart_add_url || '/cart/add.js';
  const cartUrl = `${routes.cart_url || '/cart'}.json`;

  try {
    const response = await fetch(addUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: lines, sections: sections.join(',') }),
    });
    const data = await response.json();
    const cart = await fetch(cartUrl, { headers: { Accept: 'application/json' } }).then((r) => r.json());
    const failed = Boolean(data.status);

    deferred.resolve({
      cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
      detail: {
        items: cart.items,
        sections: failed ? undefined : data.sections,
        didError: failed,
        source: 'rc-upsell',
        itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      },
    });

    if (failed) throw new Error(data.description || data.message || 'Impossibile aggiungere al carrello');
    return cart;
  } catch (error) {
    deferred.reject?.(error);
    throw error;
  }
}

/** @param {HTMLElement} host @param {number} cents */
function money(host, cents) {
  const format = host.dataset.moneyFormat || '€{{amount_with_comma_separator}}';
  const currency = host.dataset.currency || 'EUR';
  return formatMoney(cents, format, currency);
}

/** @param {HTMLElement | null} errorEl @param {string} message */
function showError(errorEl, message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
  window.setTimeout(() => (errorEl.hidden = true), 5000);
}

/** Price markup for a variant option / hidden input carrying data-price and data-compare. */
function priceHtml(/** @type {HTMLElement} */ host, /** @type {number} */ price, /** @type {number} */ compare) {
  const compareHtml = compare > price ? `<s>${money(host, compare)}</s>` : '';
  return `${compareHtml}<span>${money(host, price)}</span>`;
}

/** @param {HTMLElement | null} field */
function selectedVariantData(field) {
  if (field instanceof HTMLSelectElement) {
    const option = field.selectedOptions[0];
    return {
      id: field.value,
      price: Number(option?.dataset.price || 0),
      compare: Number(option?.dataset.compare || 0),
    };
  }
  if (field instanceof HTMLInputElement) {
    return { id: field.value, price: Number(field.dataset.price || 0), compare: Number(field.dataset.compare || 0) };
  }
  return null;
}

/* ------------------------------------------------------------------------------------------ */

class RcUpsell extends HTMLElement {
  #abort = new AbortController();

  connectedCallback() {
    const signal = this.#abort.signal;
    this.addEventListener('click', this.#onClick, { signal });
    this.addEventListener('change', this.#onChange, { signal });

    // On the cart page this element lives in its own section: refresh it after any cart change.
    // In the drawer, Horizon re-renders the whole drawer section, so nothing to do there.
    if (this.dataset.sectionId && this.dataset.context === 'page') {
      document.addEventListener(StandardEvents.cartLinesUpdate, this.#onCartUpdate, { signal });
    }
  }

  disconnectedCallback() {
    this.#abort.abort();
  }

  /** @param {Event} event */
  #onChange = (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.matches('[data-rc-variant]')) return;
    const card = select.closest('.rc-up-card');
    const data = selectedVariantData(select);
    const button = card?.querySelector('[data-rc-add]');
    const price = card?.querySelector('[data-rc-price]');
    if (!data) return;
    if (button instanceof HTMLElement) button.dataset.variantId = data.id;
    if (price) price.innerHTML = priceHtml(this, data.price, data.compare);
  };

  /** @param {MouseEvent} event */
  #onClick = async (event) => {
    const target = /** @type {Element} */ (event.target);

    const arrow = target.closest('[data-rc-scroll]');
    if (arrow instanceof HTMLElement) {
      const track = this.querySelector('[data-rc-track]');
      const card = track?.querySelector('.rc-up-card');
      const step = (card?.getBoundingClientRect().width || 260) + 10;
      track?.scrollBy({ left: step * Number(arrow.dataset.rcScroll), behavior: 'smooth' });
      return;
    }

    const button = target.closest('[data-rc-add]');
    if (!(button instanceof HTMLButtonElement) || button.getAttribute('aria-busy') === 'true') return;

    button.setAttribute('aria-busy', 'true');
    try {
      await addLines([{ id: button.dataset.variantId || '', quantity: 1 }], button, 'cart');
      button.classList.add('is-added');
    } catch (error) {
      showError(this.querySelector('[data-rc-error]'), error instanceof Error ? error.message : String(error));
    } finally {
      button.removeAttribute('aria-busy');
    }
  };

  /** @param {Event & { promise?: Promise<unknown> }} event */
  #onCartUpdate = async (event) => {
    try {
      await event.promise;
    } catch {
      return;
    }
    const id = this.dataset.sectionId;
    const response = await fetch(`${window.location.pathname}?section_id=${id}`);
    const html = new DOMParser().parseFromString(await response.text(), 'text/html');
    const fresh = html.querySelector('rc-upsell');
    const host = this.closest('.shopify-section');
    if (fresh) this.replaceWith(fresh);
    else if (host) host.innerHTML = '';
  };
}

/* ------------------------------------------------------------------------------------------ */

class RcBundle extends HTMLElement {
  #abort = new AbortController();
  /** @type {Record<string, {price: number, compare: number, available: boolean}>} */
  #mainVariants = {};

  connectedCallback() {
    const signal = this.#abort.signal;
    try {
      this.#mainVariants = JSON.parse(this.querySelector('[data-rc-main-variants]')?.textContent || '{}');
    } catch {
      this.#mainVariants = {};
    }

    this.addEventListener('change', this.#onChange, { signal });
    this.querySelector('[data-rc-bundle-add]')?.addEventListener('click', this.#onAdd, { signal });
    document.addEventListener(StandardEvents.productSelect, this.#onProductSelect, { signal });
    this.#update();
  }

  disconnectedCallback() {
    this.#abort.abort();
  }

  get #mainVariantInput() {
    const form = document.querySelector(`product-form-component[data-product-id="${this.dataset.productId}"]`);
    const input = form?.querySelector('input[name="id"]');
    return input instanceof HTMLInputElement ? input : null;
  }

  get #mainVariantId() {
    return this.#mainVariantInput?.value || Object.keys(this.#mainVariants)[0] || '';
  }

  /** @param {Event & { promise?: Promise<unknown> }} event */
  #onProductSelect = async (event) => {
    try {
      await event.promise;
    } catch {
      // Variant change failed or was superseded; recalc with whatever is selected now.
    }
    this.#update();
  };

  /** @param {Event} event */
  #onChange = (event) => {
    const field = event.target;
    if (field instanceof HTMLSelectElement && field.matches('[data-rc-variant]')) {
      const row = field.closest('[data-rc-bundle-item]');
      const data = selectedVariantData(field);
      const price = row?.querySelector('[data-rc-price]');
      if (price && data) price.innerHTML = priceHtml(this, data.price, data.compare);
    }
    this.#update();
  };

  #selectedLines() {
    /** @type {{id: string, quantity: number, price: number, compare: number}[]} */
    const lines = [];

    const mainCheck = this.querySelector('[data-rc-bundle-main]');
    const main = this.#mainVariants[this.#mainVariantId];
    if (mainCheck instanceof HTMLInputElement && mainCheck.checked && main?.available !== false) {
      lines.push({ id: this.#mainVariantId, quantity: 1, price: main?.price || 0, compare: main?.compare || 0 });
    }

    this.querySelectorAll('[data-rc-bundle-item]').forEach((row) => {
      const check = row.querySelector('[data-rc-bundle-check]');
      if (!(check instanceof HTMLInputElement) || !check.checked) return;
      const data = selectedVariantData(row.querySelector('[data-rc-variant]'));
      if (data?.id) lines.push({ ...data, quantity: 1 });
    });

    return lines;
  }

  #update() {
    const main = this.#mainVariants[this.#mainVariantId];
    const mainPrice = this.querySelector('[data-rc-main-price]');
    if (main && mainPrice) mainPrice.textContent = money(this, main.price);

    const lines = this.#selectedLines();
    const total = lines.reduce((sum, line) => sum + line.price, 0);
    const compare = lines.reduce((sum, line) => sum + Math.max(line.compare, line.price), 0);

    const totalEl = this.querySelector('[data-rc-total]');
    const compareEl = /** @type {HTMLElement | null} */ (this.querySelector('[data-rc-compare]'));
    const countEl = this.querySelector('[data-rc-count]');
    const button = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-rc-bundle-add]'));
    const label = this.querySelector('[data-rc-cta-label]');

    if (totalEl) totalEl.textContent = money(this, total);
    if (compareEl) {
      compareEl.hidden = compare <= total;
      compareEl.textContent = money(this, compare);
    }
    if (countEl) countEl.textContent = lines.length ? `(${lines.length} ${lines.length === 1 ? 'articolo' : 'articoli'})` : '';
    if (button) {
      button.disabled = lines.length === 0;
      button.classList.remove('is-added');
    }
    if (label) {
      label.textContent = lines.length > 1 ? `Aggiungi ${lines.length} articoli` : lines.length === 1 ? 'Aggiungi al carrello' : 'Seleziona un articolo';
    }
  }

  #onAdd = async () => {
    const button = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-rc-bundle-add]'));
    const lines = this.#selectedLines();
    if (!button || !lines.length || button.getAttribute('aria-busy') === 'true') return;

    button.setAttribute('aria-busy', 'true');
    try {
      await addLines(
        lines.map(({ id, quantity }) => ({ id, quantity })),
        button,
        'product'
      );
      button.classList.add('is-added');
      const label = this.querySelector('[data-rc-cta-label]');
      if (label) label.textContent = 'Aggiunti al carrello ✓';
    } catch (error) {
      showError(this.querySelector('[data-rc-error]'), error instanceof Error ? error.message : String(error));
    } finally {
      button.removeAttribute('aria-busy');
    }
  };
}

if (!customElements.get('rc-upsell')) customElements.define('rc-upsell', RcUpsell);
if (!customElements.get('rc-bundle')) customElements.define('rc-bundle', RcBundle);
