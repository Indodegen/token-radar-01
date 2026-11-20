![make.fun](https://make.fun/badge/token-radar-01.svg)
![Rank](https://make.fun/badge/token-radar-01/Indodegen/token-radar-01/rank.svg)
![Reward](https://make.fun/badge/token-radar-01/Indodegen/token-radar-01/reward.svg)

# Token Radar — the pre-token board

The best token launch radar: every protocol that records no token, ranked by
what its token would be worth if its record stayed as it is, with a concrete
farm plan for each one.

[Token Radar on make.fun](https://make.fun/bounty/token-radar-01)

## What it is

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama
snapshot at `/input/snapshot.json` — 758 protocols, 40 of them on the house
watchlist — and writes:

- `board.json`: 209 ranked rows. Every row is a protocol that records no
  token and is not a wrapped, staked, bridged or exchange product. All 40
  watchlist protocols are covered, plus 169 more the radar finds below the
  $50M floor, including version-named protocols the watchlist skips by name.
- `data.js`: the same board for the dashboard, plus the set-aside lists.
- `dashboard/`: a static, offline page — sortable and filterable board,
  a detail view for every protocol with its value breakdown and six-step
  farm plan, the model explained, and the set-aside sections.
- `dossier.json`: built with `buildDossier` from `vendor/makefun-board.ts`.

## The value model

```
implied value = TVL × category multiple × growth factor × age factor × chain factor
```

- **Category multiple**: the median market-cap-to-TVL ratio of the
  protocols in the same category whose token already trades, taken from the
  snapshot itself at run time (overall median when a category has fewer than
  three trading tokens). Capped at 1.00× TVL.
- **Growth factor**: 1 + half the seven-day TVL change, clamped to
  0.80–1.60.
- **Age factor**: 1 + a quarter of the share of four years since DefiLlama
  began tracking the protocol, up to 1.25.
- **Chain factor**: 1 + 0.04 per extra chain, up to 1.20.

Nothing about a protocol's name decides its value. The board separates the
protocols whose token already trades (set aside, shown with the multiple they
earn) from the ones still to come.

## Farm plans

Each row carries six concrete steps with what they cost (gas estimates per
chain) and how long they take — funding the wallet, the protocol's core
action, a second feature, a weekly cadence for 8–12 weeks, and a record
of every receipt. Steps are written per category (DEXs, lending, yield,
risk curators, RWA, CDPs, derivatives, prediction markets and more).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Then serve `out/` and open `dashboard/` in a browser.

## License

MIT — see [LICENSE](LICENSE).
