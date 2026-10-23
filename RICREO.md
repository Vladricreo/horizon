# Ricreo · personalizzazioni su Horizon

Tema basato su [Shopify Horizon](https://github.com/Shopify/horizon). Tutto il codice custom usa il prefisso
`rc-` ed è in **file nuovi**, così gli aggiornamenti di Horizon si possono unire senza conflitti.

## Cosa c'è

| Funzione | File | Dove si usa |
| --- | --- | --- |
| Hero con ricerca su tutto il catalogo (nome, modello, codice ricambio), chip "Più cercati", link ai ricambi auto, griglia di icone (solo desktop) | `sections/rc-hero-search.liquid` | Homepage |
| Griglia categorie a icone | `sections/rc-category-grid.liquid` | Homepage |
| Cerca per veicolo (marca/modello) che ricorda l'auto | `sections/rc-vehicle-finder.liquid`, `assets/rc-garage.js` | Collezioni auto e microcar |
| Punti di forza / Come funziona (3 stili) | `sections/rc-features.liquid` | Homepage, ovunque |
| Punti chiave con icone automatiche | `blocks/rc-feature-list.liquid`, `blocks/_rc-feature.liquid` | Pagina prodotto |
| "Spesso acquistati insieme" basato su prodotto **e** carrello | `blocks/rc-bundle.liquid`, `snippets/rc-bundle-row.liquid` | Pagina prodotto |
| Upsell nel carrello + barra spedizione gratuita | `snippets/rc-cart-upsell.liquid`, `snippets/rc-upsell-card.liquid`, `sections/rc-cart-upsell.liquid` | Drawer e pagina carrello |
| Logica aggiunta al carrello / bundle, barra spedizione animata (`<rc-ship-bar>`) | `assets/rc-upsell.js` | — |
| Badge "Compatibile con la tua …" (solo conferme, mai inviti) | `blocks/rc-compat.liquid` (pagina prodotto), blocco *Liquid personalizzato* nelle card | Prodotto, collezione, ricerca, consigliati |
| Icone | `snippets/rc-icon.liquid` | — |
| Token globali (`--rc-accent`, `--rc-accent-2`, `--rc-accent-ink`, `--rc-accent-tint`), animazione icona carrello, stile badge compatibilità | `snippets/rc-global.liquid` | Tutto il sito |

## Stile globale

- **Accento**: Impostazioni tema → *Ricreo · Stile*. Lo usano tutte le sezioni e i blocchi `rc-*`;
  il campo "Colore d'accento" di una singola sezione/blocco, se compilato, lo sovrascrive solo lì.
- **Palette** (Impostazioni tema → Colori): sfondo `#FAFAF7`, testo `#14161B`, `color1` `#22252B`
  (sfondo footer), `color2` `#FFF1EB` (tinta accento: badge saldi), `color3` `#E4E2DC` (bordi, badge esaurito).
- **Font**: titoli e sottotitoli Space Grotesk, testo Inter 16px.
- **Raggi**: card 16, immagini prodotto 12, input 12, popover 16, bottoni 14.
- **Movimento**: nessuna animazione continua. Gli effetti partono solo da un'azione del cliente
  (hover, aggiunta al carrello, soglia spedizione raggiunta). Tutti i file `rc-*` rispettano
  `prefers-reduced-motion`.
- **Mobile prima di tutto**: sotto i 750px la hero mette la ricerca in alto e i chip su una riga
  scorrevole, le categorie sono tessere compatte a 2 colonne, i punti di forza una riga di chip,
  i passaggi righe icona + testo.

## Categorie e collezioni

La homepage punta a queste collezioni Shopify:
`casa-cucina`, `auto`, `microcar`, `camper-nautica`, `moto`, `giardino-trappole`, `tech-scrivania`,
`fai-da-te-design` (create il 24/10/2026; Microcar contiene i 9 prodotti microcar).
*Ricreo · Cerca veicolo* è nel template collezione standard e compare solo nelle collezioni elencate
nella sua impostazione "Mostra solo nelle collezioni" (oggi `auto, microcar`).

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
- **Veicolo**: quando il cliente cerca con *Cerca veicolo*, il veicolo viene salvato nel browser e come
  attributo carrello `Veicolo` (lo vedi nell'ordine). I suggerimenti nel carrello danno priorità
  ai prodotti con un tag che contiene il veicolo, es. `volkswagen-golf-7`.
- **Compatibilità** (badge): tag prodotto nel formato `marca-modello` (`volkswagen-golf-7`, anche più
  specifico come `volkswagen-golf-7-2015-2020`), più generico (`volkswagen-golf`, solo marca `volkswagen`)
  oppure `universale`. Senza tag vale il titolo: se contiene marca e modello ("… per Citroën Ami, Opel
  Rocks-e e Fiat Topolino") il prodotto è compatibile. Il badge compare solo quando c'è una corrispondenza.
- **Marche/modelli** di *Cerca veicolo*: blocchi *Marca e modelli* nella sezione (un modello per riga),
  presi dai titoli del catalogo Ricreo (schema `inventory` su Supabase).
- La soglia della spedizione gratuita è nella valuta principale del negozio.

## File di Horizon modificati (da ricontrollare a ogni aggiornamento)

1. `snippets/cart-drawer.liquid` — una riga dopo `{% render 'cart-products', context: 'drawer' %}`:
   ```liquid
   {% render 'rc-cart-upsell', context: 'drawer' %}
   ```
2. `config/settings_schema.json` — gruppi *Ricreo · Stile* e *Ricreo · Upsell carrello* aggiunti in fondo all'array.
3. `layout/theme.liquid` — una riga subito dopo `{%- render 'color-palette' -%}`:
   ```liquid
   {%- render 'rc-global' -%}
   ```
4. `templates/index.json`, `templates/product.json`, `templates/cart.json`, `templates/collection.json`,
   `templates/search.json`, `sections/header-group.json` — configurazione del negozio
   (sezioni e blocchi Ricreo). Sono dati, non codice: in caso di conflitto tieni la nostra versione.

## Aggiornare Horizon

```bash
git config merge.ours.driver true   # una volta per clone, attiva .gitattributes
git fetch upstream
git merge upstream/main
```

- I template JSON e `settings_data.json` restano i nostri grazie a `.gitattributes`.
- Se `cart-drawer.liquid` o `layout/theme.liquid` vanno in conflitto: prendi la versione di Horizon e
  reinserisci la riga indicata sopra.
- Se `settings_schema.json` va in conflitto: prendi la versione di Horizon e riaggiungi in fondo i
  gruppi `Ricreo · Stile` e `Ricreo · Upsell carrello` (ognuno è un unico oggetto JSON).
- Se un aggiornamento cambia la struttura dei template prodotto/carrello, riaggiungi i blocchi
  dall'editor del tema: si trovano nella categoria **Ricreo**.

Dipendenze verso Horizon usate da `rc-upsell.js` (stabili, ma da verificare dopo un aggiornamento importante):
`@shopify/events` (`CartLinesUpdateEvent`, `StandardEvents`), `@theme/money-formatting` (`formatMoney`),
l'elemento `cart-items-component[data-section-id]` e l'input `product-form-component input[name="id"]`.
