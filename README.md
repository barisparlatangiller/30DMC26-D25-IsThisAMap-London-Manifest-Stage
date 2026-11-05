# Is a stage a map? Manifest at OVO Arena Wembley

**#30DayMapChallenge 2026 · Day 25 · Is this a map? · London**
Live: https://barisparlatangiller.github.io/30DMC26-D25-IsThisAMap-London-Manifest-Stage/

The six members of Manifest during *Intro & Hileli* (live, OVO Arena Wembley) are mapped on a 24 × 24 m stage plan,
in sync with the YouTube video. Each performer leaves a pastel heat trail in her colour, so the song draws its own map.

| Member | Colour |
|---|---|
| Hilal | purple |
| Mina | red |
| Esin | yellow |
| Zeynep Oktay | blue |
| Sueda | green |
| Lidya | pink |

## Data (`data/`)
* `Konumlar_2SN.gpkg`: 798 positions, one per performer every 2 s from 0:26 to 4:50 of the video. There are 162 direct
  observations; the rest are interpolated. Each position has a state (clear, approximate, silhouette, not visible), a
  stage zone and a height.
* `Konumlar_Linelar.gpkg`: one smoothed path per performer (61–79 m).
* `Sahne.gpkg`, `Sahne_Merdiven.gpkg`: approximate stage plan with main stage, runway, front block, raised platform
  (+3.3 m) and stairs.

All layers are hand-drawn from the video by Barış Parlatangiller, in EPSG:27700.

## Method
`pipeline/prepare.py` turns the plan 90° clockwise so the back of the stage is north and the audience south. It is a
rotation, not a mirror, so left and right stay as the camera sees them. It then writes `docs/data/stage.json`.

The page draws the stage on a canvas. Positions run through a Catmull-Rom curve between the 2 s samples, and the
YouTube player's clock drives the time.

Heat: every sample counts for 2 s as a radial glow that fades to zero 1.8 m from the performer. Glows are weighted
by certainty: clear 1.0, approximate 0.6, silhouette 0.4. "Not visible" samples are left out of the heat map.

## Limits
Screen positions are not surveyed coordinates. Camera cuts and people out of frame make every point an estimate,
and the stage dimensions are approximate.

The video belongs to the artists and rights holders and is only embedded with the YouTube player.

Barış Parlatangiller · built with Claude
