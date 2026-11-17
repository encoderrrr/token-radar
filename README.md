# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/encoderrrr/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/encoderrrr/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 226 pre-token protocols by implied value from a sealed DefiLlama snapshot — category multiples, growth and maturity — with a filterable dashboard, farm plans and a dossier.

## Run it

```sh
node --experimental-strip-types main.ts --input snapshot.json --output /output
```

The program reads the sealed snapshot, scores it with the radar-2 model and writes `board.json`, `dashboard/data.js`, the dashboard itself and `dossier.json` into the output directory. It runs twice and writes identical bytes on both runs; it reads no network, no file outside its input, and takes no key. Node.js 22.18 or later.

## How it works

The board covers the snapshot's whole 40-protocol watchlist plus 186 early finds below the $50M floor — every rankable pre-token protocol the snapshot carries. A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id, no symbol); exchanges and version-named pools are excluded, and the live-token protocols are set aside in their own view, by market cap.

Implied value follows only from the snapshot's own figures:

```
implied value = TVL × category multiple × growth × maturity
```

- **Category multiple** — the median market-cap-to-TVL ratio of the token-trading protocols in the same category, shrunk halfway toward the global median (0.214); a category with fewer than three trading comps takes the global median. Clamped to [0.05, 1.5].
- **Growth** — the 7-day TVL change, clamped to −50%…+100% and halved.
- **Maturity** — 0.6 for a new protocol rising to 1.0 for one listed at least three years ago; a protocol with no listing date is counted at 365 days.

No name is special-cased: the same formula scores every row, and the dashboard prints the category table the snapshot produced, so the multiple is auditable from the data. Each row carries a seven-step farm plan with a cost and a time, tailored to the protocol's category, capital tier and age.

The dashboard is a dark, filterable board (search, category, chain, watchlist-only, sortable columns) with a detail view per protocol — value breakdown recomputed from the row's own figures, plus its farm plan — and the model panel with the formula and the category multiples. Its state lives in the URL hash, so each screenshot is a plain URL.

## Screenshots

Four views, committed in `screenshots/` and copied into the output by the program:

1. `1-board.jpg` — the ranked board
2. `2-detail.jpg` — the top protocol's value breakdown and farm plan
3. `3-filtered.jpg` — the board filtered to RWA
4. `4-model.jpg` — the model panel: formula and category multiples

Taken at 1440×900 with Chrome for Testing 157.0.8103.15 via Playwright.

---

<sub>Entered on [make.fun](https://make.fun/?ref=65vbztbk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
