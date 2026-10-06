# Hardcore Geografi: build plan

The level design and rules come from `Hardcore_Geografi_plan.md`. This file covers how to build it.

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
tools/build-data.mjs
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
| 5 | Norway outline, free zoom | all kommuner (borders hidden) | "4621" | — |
| 6 | Norway outline, free zoom | all kommuner (borders hidden) | "4621" | — |

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

## Later (not in v1)

- Bonus levels for bydeler in Oslo, Bergen, Trondheim and Stavanger.
- Export/import of progress.
- Hosting on GitHub Pages so it can be played on a phone.
