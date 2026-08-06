# Where the facility data came from

`hospitals.json` seeds the Find care directory. Because a wrong coordinate sends
a sick person to the wrong place, this file records exactly where each value came
from and what is still unverified.

## Source

All 23 entries were taken from **OpenStreetMap** via the Nominatim search API on
**6 August 2026**, restricted to Burundi (`countrycodes=bi`).

Four of the facilities are also described in Wikipedia articles that cite a
specific OSM object. In every case the Wikipedia citation and the coordinate we
used resolve to the same OSM way, which is a useful independent check:

| Facility | OSM object | Cited by |
|---|---|---|
| Hôpital Prince Régent Charles | way 997079377 | [Wikipedia](https://en.wikipedia.org/wiki/Prince_Regent_Charles_Hospital) |
| Clinique Prince Louis Rwagasore | way 87173395 | [Wikipedia](https://en.wikipedia.org/wiki/Prince_Louis_Rwagasore_Clinical_Hospital) |
| Hôpital Militaire de Kamenge | way 122956893 | [Wikipedia](https://en.wikipedia.org/wiki/Kamenge_Military_Hospital) |
| CHUK / Hôpital Roi Khaled | way 122314639 | [Wikipedia](https://en.wikipedia.org/wiki/Kamenge_University_Hospital) |

## Licence and attribution — REQUIRED

OpenStreetMap data is published under the **Open Database License (ODbL 1.0)**.
Using it obliges us to credit the source visibly. The Find care screen carries
the line `Facility data © OpenStreetMap contributors`; do not remove it, and add
the same credit anywhere else this data is displayed.

<https://www.openstreetmap.org/copyright>

## What is NOT verified

Treat this as a solid starting point, not a finished directory.

- **No phone numbers.** Not one of the 23 entries has one, and OSM does not
  carry them for these facilities. Calling is the primary action on a facility
  card, so every card currently falls back to "No phone". This is the single
  biggest gap.
- **Nobody has confirmed these on the ground.** OSM is contributed by
  volunteers. A clinic may have moved, closed or been renamed since it was
  mapped, and some of these nodes were last touched years ago.
- **Coordinates point at the site, not the entrance.** For a large campus like
  CHUK the pin is the centre of the mapped area, which may be a few hundred
  metres from the gate a patient actually needs.
- **Opening hours are absent**, so the app cannot say whether somewhere is open.
- **Coverage is partial.** These are the facilities OSM happens to have. Real
  Bujumbura has many more health centres, and rural Bujumbura is barely covered.

## Before launch

1. Get phone numbers. The Ministry of Public Health facility list
   (`fbpsanteburundi.bi`) is the authoritative register and is worth requesting
   directly.
2. Have someone in Bujumbura confirm the top ten facilities exist at these
   coordinates and still operate.
3. Re-check the pin for anything on a large site, and prefer the entrance.

## Updating

Edit this file and `hospitals.json` together, then restart the backend — the
seeder in `src/config/seed.ts` only runs when the collection is empty, so an
existing deployment needs the collection cleared first. Every entry is validated
against `src/utils/hospitalData.ts` before anything is written, and a single bad
row aborts the whole seed.
