# Hardcore Geografi: build plan

The level design and rules come from `Hardcore_Geografi_plan.md`. This file covers how to build it.

## Level changes (2026-10-06)

The user decided that numbers are not worth learning, so **every level that asks only for numbers is gone, except the postnummer bonus**. That means fylkesnummer (old Level 2) and kommunenummer/bydelsnummer (old Level 4). Hele Norge and Hardcore now ask by name ("Finn Voss"). Players see the levels numbered 1–4:

| Shown | Internal id | Contents |
|---|---|---|
| Nivå 1 | `1` | Fylker – navn |
| Nivå 2 | `3:<fylke>` | Kommuner in one fylke (bydeler for Oslo) |
| Nivå 3 | `5` | Hele Norge: 50 kommuner by name, fylke first, then kommune |
| Nivå 4 | `6` | Hardcore: all 357 by name, fylke first, one life |
| Bonus | `P:<bydel>` / `P:alle` | Postnummer i Oslo (the only level with numbers) |

The internal ids are unchanged so saved progress still works. The rest of this document uses the old level numbers. Level 1 unlocks Level 2 in every fylke. A fylke is finished and mastered when its Level 2 is passed. Level 3 opens when all fylker are finished. The postnummer bonus opens when Oslo's Level 2 is passed. Labels show names only.

**Herøy and Våler** each exist in two fylker. The question gives only the name, so in Levels 3–4 both fylker and both kommuner count as correct.

## Decisions

| Question | Decision |
|---|---|
| Language | Norwegian bokmål for all game text |
| Where it lives | This folder, as a git repo, edited in VS Code |
| How to play | Double-click `index.html`. Nothing to install, works offline |
| Lives vs. 100% rule | The first miss marks the round as "not perfect, won't unlock". You can keep playing to practise, and missed places still come back. A third miss ends the round. |
| Zoom | Scroll or pinch to zoom and drag to pan in every level. Levels 3 and 4 start zoomed to the chosen fylke, and you can't zoom out past where a level starts. *(Changed 2026-10-06: Oslo was too small to click without zoom.)* |
| Answered places | In rounds with 3 lives (Levels 1–5), what you've answered correctly stays green and can't be clicked, so you can't hit it by mistake. So each place is asked only once per round in Levels 1–4, and earlier misses are no longer added a second time at the end. *(Changed 2026-10-06.)* |

### Defaults I picked (easy to change)

- **Level 5 round length:** 50 random kommuner from the whole country, weighted toward ones you have missed before. A full 357 is already what Level 6 asks for.
- **Unlock chain:** L1 → L2 → (for each fylke) L3 → L4. Level 5 opens when all 15 fylker have passed Level 4. Level 6 opens after Level 5.
- **Losing "mastered":** Missing a kommune in Level 5 or 6 removes the "mastered" badge from its fylke until you pass that fylke's Level 4 again. Levels 5 and 6 stay open, so one bad click doesn't lock you out.
- **Oslo** is both fylke 03 and kommune 0301. Its Level 3 and 4 have one question each and pass straight away.

## Technology

- Plain HTML, CSS and JavaScript using classic `<script>` tags, because ES modules are blocked when a file is opened straight from disk (`file://`).
- **No libraries in the browser.** The map is drawn as SVG paths that are pre-projected when the data is built, and zoom/pan works by changing the SVG `viewBox`.
- **Progress** (unlocked levels, mastered fylker, how often you've missed each kommune, best Hardcore streak) is saved in `localStorage`. An export/import button for backups comes later.

## Map data

- **Source:** Kartverket's administrative boundaries for 2024 and later (15 fylker, 357 kommuner) from Geonorge, in GeoJSON. The 2024 fylke numbers are 03, 11, 15, 18, 31, 32, 33, 34, 39, 40, 42, 46, 50, 55, 56.
- **Done.** Run `node tools/build-data.mjs` to rebuild. It downloads into `tools/.cache/` (ignored by git):
  1. It takes the already-simplified kommune, fylke and Norway-outline shapes ("M" quality) from [robhop/fylker-og-kommuner](https://github.com/robhop/fylker-og-kommuner), which is based on Kartverket data, CC BY 4.0. The download is pinned to one exact version.
  2. It takes the official names from SSB's kommune list (Klass 131). The question uses the Norwegian name (for example "Nesseby"), and the label also shows the full official name ("Unjárga - Nesseby").
  3. It projects to UTM zone 33 and writes SVG paths in whole 100 m units.
  4. It writes `data/norge.js` (about 800 KB), which sets `window.NORGE = { bredde, hoyde, omriss, fylker, kommuner, kilde }`. Every kommune has `nr, navn, fullt, fylke, d, boks, punkt`, where `punkt` is where its label goes.
- The script stops with an error unless there are exactly 15 fylker and 357 unique kommuner, the numbers match SSB, every kommune's label point is inside its own fylke, and no question name is in more than one language.
- The game has to credit the sources. The text is in `NORGE.kilde`.

## File layout

```
index.html          menu and game screen
style.css
js/storage.js       saving and loading progress
js/map.js           drawing the SVG, zoom/pan, highlights, flashing, labels
js/quiz.js          round engine: question queue, lives, perfect flag, repeating misses
js/levels.js        settings for Levels 1–6 (what is asked, what is drawn, unlock rules)
js/main.js          screens, menu, wiring
data/norge.js       generated, do not edit by hand
data/oslo.js        generated: Oslo's bydeler and postnummer
tools/build-data.mjs
tools/build-oslo.mjs
tools/geo.mjs
```

## Round engine (`quiz.js`)

- A round starts with a list of questions, shuffled. Items you've missed before get extra weight in sampled rounds (Level 5).
- **Only the first click counts.** A click on the right place counts as correct. A wrong click costs a life, the right place flashes for 1 second, and then the game moves on.
- **Missed questions come back** 3–5 questions later in the same round.
- The round is **perfect** only with zero misses, and only a perfect round unlocks the next level.
- 3 misses ends the round, and you start again from zero.
- **Level 6:** one life, questions in random order, score = longest streak. Your best score is saved, and you are "Hardcore" if you get all 357 right.
- No timer anywhere.

## What each level shows

| Level | Map | Clickable | Question | After a correct click |
|---|---|---|---|---|
| 1 | Fylke borders | fylker | "Finn Vestland" | — |
| 2 | Fylke borders | fylker | "46" | — |
| 3 | Zoomed to one fylke, kommune borders | kommuner in that fylke | "Finn Voss" | — |
| 4 | Same as 3 | same | "4621" | label "4621 Voss" |
| 5 | Two steps: first only fylke borders, then the chosen fylke's kommuner. Free zoom | first fylker, then the kommuner in the fylke | "4621" with "Voss" below | — |
| 6 | Same two steps as 5 | same | "4621" | — |

**Two steps in Levels 5–6** (added 2026-10-06, also to make zooming lighter): you first click the fylke on a map that shows only fylke borders. If it is the right one, the map zooms in and shows only that fylke's kommuner. A wrong fylke counts as a miss on the kommune, because only the first click counts. The right fylke flashes, and the question comes back later in the round. After each question the map goes back to the fylke view, and green kommuner stay green.

There is never hover text or a highlight on hover. Kommuner you can't see are still clickable because they have a transparent fill.

## Build order

1. ✅ **Data:** the build script and `data/norge.js`, checked against the 357/15 counts.
2. ✅ **Map:** draw Norway and get zoom/pan working (mouse wheel, drag, pinch, +/− buttons, keys + − 0).
3. ✅ **Round engine:** lives, perfect flag, repeating misses, the 1-second flash. When the right answer is off-screen in Levels 5–6, the map zooms out briefly to show it.
4. ✅ **Levels 1–2** and the menu, plus saving progress.
5. ✅ **Levels 3–4:** fylke picker, zoom to fylke, number labels.
6. ✅ **Levels 5–6:** free zoom, hidden borders, losing "mastered", the streak record.
7. ⏳ **Polish:** the results dialog and the progress overview (with mastered stars) are done. Still to do: playtesting on a real phone and laptop.

**Testing:** add `?test` to the address to unlock every level.

## Oslo: bydeler and postnummer (added 2026-10-06)

Oslo is both fylke 03 and a single kommune (0301), so its Levels 3 and 4 used to have one question each. Now they use Oslo's 15 bydeler with SSB's numbers (030101–030115): Level 3 asks "Finn Frogner", and Level 4 asks "030105". Sentrum (030116) and Marka (030117) are SSB areas but not bydeler, so they are drawn grey and are never asked.

**Bonus: Postnummer i Oslo** unlocks when Oslo's Level 4 is passed. Each of the 445 postnummer that has its own area is placed in the bydel where its label point lies. There is one round per bydel (Sentrum and Marka get their own) plus "Hele Oslo". The rules are the same as Level 4: 3 lives, a label after each correct answer, and green areas that can't be clicked again.

**Data:** `tools/build-oslo.mjs` builds `data/oslo.js` (about 365 KB):
- It orders the grunnkretser and postnummerområder for Oslo from Geonorge's download API as GeoJSON in UTM 33.
- It merges the grunnkretser into bydeler using SSB's grunnkrets → bydel table (Klass 1 → 103), by removing the edges that neighbouring grunnkretser share. The script checks that the total area is the same before and after.
- Both datasets reach out into the fjord to the kommune border, so the game clips them to Oslo's coastline (the robhop "L" version). Label points must lie on land.
- Coordinates are in 10 m units, ten times finer than the rest of the map, so the smallest postnummer can be clicked. You can zoom in to about 2 m per screen pixel.
- Shared geometry helpers (projection, label points, SVG paths) live in `tools/geo.mjs` and are used by both build scripts.

## Satellite images (added 2026-10-06)

Levels 3–6 and the postnummer bonus show satellite images under the borders, so you can see coastlines, valleys, glaciers and towns. A 🛰 button in the zoom bar turns them off and on, and the choice is remembered.

- **Source:** Sentinel-2 cloudless 2024 from EOX (tiles.maps.eox.at). It is 10 m resolution, cloud-free, and covers all of Europe, under the CC BY-NC-SA 4.0 licence. The game is free and non-commercial, and the credit is shown on the map. Kartverket's "Norge i bilder" is better, but its API needs a Norge digitalt agreement.
- **Projection:** the tiles only exist in Web Mercator, and the map is in UTM 33. `js/satellitt.js` draws each tile on a canvas behind the map, split into 8×8 small pieces that are each placed with their own affine transform. The error is under half a pixel. `js/projeksjon.js` converts between longitude/latitude and map coordinates using the same formulas as the build scripts.
- The canvas reaches 25 % outside the frame and moves together with the map during zoom (same CSS transform). It is only redrawn sharply when the map is. While new tiles load, a coarser tile covers the same area.
- In Levels 3–4 (shown numbers), choosing the fylke uses the plain map, and the satellite image only appears once the right fylke is chosen. The text above the name is "Velg fylket", then "Finn kommunen".
- Borders are white on the image. Areas that are not asked about are darkened, and green and the other markings are semi-transparent.

## Later (not in v1)

- Bydeler for Bergen, Trondheim and Stavanger. SSB's grunnkrets → bydel table already includes them, so `build-oslo.mjs` can be extended.
- Export/import of progress.
- Hosting on GitHub Pages so it can be played on a phone.
