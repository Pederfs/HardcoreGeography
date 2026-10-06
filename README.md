# Hardcore Geografi

Lær alle fylker, kommuner og kommunenummer i Norge. Ingen nåde, ingen hast.

## Spill

Enten:

- dobbeltklikk `index.html`, eller
- start en lokal server i denne mappen og åpne <http://localhost:8000>:

  ```
  python3 -m http.server 8000
  ```

Legg til `?test` i adressen (<http://localhost:8000/?test>) for å låse opp alle nivåer mens du prøver spillet. Fremgangen lagres i nettleseren.

## Bygg kartdata på nytt

```
node tools/build-data.mjs   # fylker og kommuner -> data/norge.js
node tools/build-oslo.mjs   # Oslos bydeler og postnummer -> data/oslo.js
```

Se [PLAN.md](PLAN.md) for regler, nivåer og hvordan koden er bygd opp.

Kartgrunnlag: Kartverket (CC BY 4.0), via [robhop/fylker-og-kommuner](https://github.com/robhop/fylker-og-kommuner). Kommuneliste: SSB.
Bydeler i Oslo: SSBs grunnkretser og bydelskobling (CC BY 4.0). Postnummerområder: Posten/Kartverket via Geonorge (CC BY 4.0).
