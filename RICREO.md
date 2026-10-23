# Ricreo · personalizzazioni su Horizon

Tema basato su [Shopify Horizon](https://github.com/Shopify/horizon). Tutto il codice custom usa il prefisso
`rc-` ed è in **file nuovi**, così gli aggiornamenti di Horizon si possono unire senza conflitti.

## Cosa c'è

| Funzione | File | Dove si usa |
| --- | --- | --- |
| Hero interattivo: auto in SVG con zone cliccabili, cambio colore, ricerca per marca/modello/anno o codice OEM, "garage" che ricorda l'auto | `sections/rc-hero-garage.liquid`, `assets/rc-hero-garage.js` | Homepage |
| Griglia categorie a icone (bento) | `sections/rc-category-grid.liquid` | Homepage |
| Punti di forza / Come funziona (3 stili) | `sections/rc-features.liquid` | Homepage, ovunque |
| Punti chiave con icone automatiche | `blocks/rc-feature-list.liquid`, `blocks/_rc-feature.liquid` | Pagina prodotto |
| "Spesso acquistati insieme" basato su prodotto **e** carrello | `blocks/rc-bundle.liquid`, `snippets/rc-bundle-row.liquid` | Pagina prodotto |
| Upsell nel carrello + barra spedizione gratuita | `snippets/rc-cart-upsell.liquid`, `snippets/rc-upsell-card.liquid`, `sections/rc-cart-upsell.liquid` | Drawer e pagina carrello |
| Logica aggiunta al carrello / bundle | `assets/rc-upsell.js` | — |
| Icone | `snippets/rc-icon.liquid` | — |

## Come si configurano i dati

- **Articoli abbinabili** (upsell e bundle): crea il metafield prodotto `custom.abbinabili`
  di tipo *Lista di riferimenti prodotto*. In alternativa vengono letti i *prodotti complementari*
  dell'app Shopify **Search & Discovery**. Se non c'è nulla si usa la collezione di riserva
  (Impostazioni tema → *Ricreo · Upsell carrello*).
- **Punti chiave con icone**: metafield `custom.punti_chiave` (*Lista di testo a riga singola*)
  oppure un normale elenco puntato nella descrizione prodotto.
  - `Titolo: dettaglio` → titolo in grassetto + dettaglio.
  - L'icona è scelta dalle parole chiave (garanzia → scudo, LED → lampadina, montaggio → chiave…).
  - Per forzarla: `[shield] Garanzia 2 anni`. Icone: `car wrench shield truck bulb layers disc drop
    sparkle spray bolt sun ruler leaf seat wheel engine palette star tag gift check`.
- **Veicolo**: quando il cliente cerca per auto, il veicolo viene salvato nel browser e come
  attributo carrello `Veicolo` (lo vedi nell'ordine). I suggerimenti nel carrello danno priorità
  ai prodotti con un tag che contiene il veicolo, es. `volkswagen-golf-7`.
- **Marche/modelli** dell'hero: blocchi *Marca e modelli* nella sezione (un modello per riga).
  Con la destinazione "Collezione filtrata per tag" il link diventa `/collections/<base>/<marca-modello>`.
- La soglia della spedizione gratuita è nella valuta principale del negozio.

## File di Horizon modificati (da ricontrollare a ogni aggiornamento)

1. `snippets/cart-drawer.liquid` — una riga dopo `{% render 'cart-products', context: 'drawer' %}`:
   ```liquid
   {% render 'rc-cart-upsell', context: 'drawer' %}
   ```
2. `config/settings_schema.json` — gruppo *Ricreo · Upsell carrello* aggiunto in fondo all'array.
3. `templates/index.json`, `templates/product.json`, `templates/cart.json` — configurazione del negozio
   (sezioni e blocchi Ricreo). Sono dati, non codice: in caso di conflitto tieni la nostra versione.

## Aggiornare Horizon

```bash
git config merge.ours.driver true   # una volta per clone, attiva .gitattributes
git fetch upstream
git merge upstream/main
```

- I template JSON e `settings_data.json` restano i nostri grazie a `.gitattributes`.
- Se `cart-drawer.liquid` va in conflitto: prendi la versione di Horizon e reinserisci la riga sopra.
- Se `settings_schema.json` va in conflitto: prendi la versione di Horizon e riaggiungi in fondo il
  gruppo `Ricreo · Upsell carrello` (è tutto in un unico oggetto JSON).
- Se un aggiornamento cambia la struttura dei template prodotto/carrello, riaggiungi i blocchi
  dall'editor del tema: si trovano nella categoria **Ricreo**.

Dipendenze verso Horizon usate da `rc-upsell.js` (stabili, ma da verificare dopo un aggiornamento importante):
`@shopify/events` (`CartLinesUpdateEvent`, `StandardEvents`), `@theme/money-formatting` (`formatMoney`),
l'elemento `cart-items-component[data-section-id]` e l'input `product-form-component input[name="id"]`.
