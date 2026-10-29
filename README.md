# Why Me? - a simple game of challenges

Phone-on-the-table party game. Pick a deck, tap the card, do the challenge.
`done` faces one side of the table, `failed` the opposite side. Failing (or running out of time) means a penalty.
No accounts, no points, no backend game sessions: the whole game state lives in the browser (localStorage).

## Run

Requirements: Node.js 18+ (no runtime npm dependencies).

```bash
node server.js            # http://localhost:3000, admin at /admin
PORT=8080 node server.js  # other port
```

On first start the server copies `seed/*.json` into `data/` (packs, default penalties, ideas).
`data/` is your database: back it up, do not commit it.

## Admin password

The password is never stored in plain text; `data/admin.json` holds a scrypt hash.

* **Recommended:** `npm run set-password -- "your long password"` (min 8 chars). Writes `data/admin.json`.
* **Or** start the server the first time with `ADMIN_PASSWORD="..." node server.js` (only used when `data/admin.json` does not exist yet).
* **Otherwise** a random password is generated on first start and written to `data/initial-admin-password.txt`
  (file mode 600). Read it, log in, then run `set-password` (which deletes that file).

Sessions are an HttpOnly, SameSite=Strict cookie (`whyme_admin`), valid for `sessionHours` from `config.json`.
Behind HTTPS set `COOKIE_SECURE=1`. Login is rate limited.

## Configuration

`config.json`:

| key | meaning |
| --- | --- |
| `contactEmail` | address shown in the Contact section (single place to change it) |
| `port` | default port (env `PORT` wins) |
| `sessionHours` | admin session length |
| `maxIdeaLength` | max characters of a submitted idea |
| `maxUploadBytes` | max pack image size (png / jpeg / webp) |

Env: `PORT`, `ADMIN_PASSWORD`, `WHYME_DATA_DIR` (data folder, default `./data`), `COOKIE_SECURE`.

## Admin panel (`/admin`)

* **Packs:** name, description, image upload, published flag, cards (optional title, text, optional timer in seconds, optional info, DUO flag), pack penalties.
  New packs start hidden; tick *Published* to show them to players.
* **Import cards:** JSON or CSV, *Append* or *Replace*.
* **Ideas:** challenges sent by players from the landing page.
* **Default penalties:** used when a pack has none, by *Own*, and mixed into *Random*.

## Pack / import schema

Pack (as stored in `data/packs.json`):

```json
{
  "id": "legless-lizard",
  "name": "Legless Lizard",
  "description": "Party challenges for brave players.",
  "image": "/packs/legless-lizard.png",
  "published": true,
  "cards": [
    { "id": "ll02", "title": "Picture Perfect!", "text": "The group chooses a picture for you. You have 3 minutes to recreate it as beautifully as possible.", "timeSeconds": 180, "info": "Optional explanation." },
    { "id": "ll12", "title": "DUO CARD: Same Word!", "text": "Wait until someone draws the matching card. ...", "duo": true, "info": "..." },
    { "id": "ll13", "title": "DUO CARD: Same Word!", "text": "Wait until someone draws the matching card. ...", "duo": true, "info": "..." }
  ],
  "penalties": ["Drink 3 shots."]
}
```

Import JSON: `{ "cards": [...], "penalties": [...] }`, or a plain array of cards or strings.
`text` required (max 500 chars), `title` optional (max 80 chars, shown large above the text; cards without it look as before),
`timeSeconds` optional positive number (max 3600), `info` optional (max 1000 chars), `duo` optional boolean.
Duplicate cards (same title and text) are skipped, except DUO cards (`"duo": true`), which come in pairs: both copies are kept and get distinct ids.

Import CSV (header row required, comma or semicolon, quote values containing commas):

```csv
type,title,text,timeSeconds,info,duo
card,Opera Time!,"Sing your last message as an opera aria.",45,"Read it from your phone.",
card,,Invent a new word and use it in three sentences.,,,
card,DUO CARD: Same Word!,Wait until someone draws the matching card...,,,true
card,DUO CARD: Same Word!,Wait until someone draws the matching card...,,,true
penalty,,Do 10 jumping jacks.,,,
```

`type` is `card` (default) or `penalty`. `title` and `duo` columns are optional; old 4-column files still import.

The two official decks (Legless Lizard, Eight Legged Octopus) are generated from the PDF with
`python3 scripts/build-decks.py /path/to/decks.pdf` (needs `pdftotext`), which writes `seed/packs.json` and `data/packs.json`.
Deck art is `public/packs/<id>.png`, rendered from the Figma deck designs.

## Game rules implemented

* Modes: any published pack, **Random** (mix of all packs, choose the number of cards), **Own** (cards written on the phone, stored locally).
* Number of cards and a Timers on/off switch in the menu.
* A challenge never repeats within a game (dedup by card id within a pack; Random also dedups equal texts across packs). DUO cards are the exception by design: both copies stay in the deck. Failed cards do not return.
* Pressing Play shows a short tear-open animation of the selected deck (about 2.4 s, tap to skip, short fade with `prefers-reduced-motion`). It is not replayed when a game is restored or the page is refreshed.
* Timer only on cards with `timeSeconds`; it starts when tapped; at zero the card counts as failed and a penalty is shown.
  The timer pauses when the app is hidden (call, lock screen, refresh) and shows *Resume timer*.
* Refresh, closing the tab or rotating restores the exact game state.
* PWA: installable, works offline after the first visit (service worker caches the app and the packs).

## Tests

```bash
npm install            # installs Playwright (dev only)
npx playwright install chromium
npm test               # tests/e2e.js, starts its own server on a temp data dir
node tests/capture.js  # regenerates media/ screenshots and demo video (server must be running)
```

## Credits

Font: Fraunces (SIL Open Font License), bundled in `public/fonts/`. Title lettering from the Figma design.
