# Is a stage a map? Manifest at OVO Arena Wembley

**#30DayMapChallenge 2026 · Day 25 · Is this a map? · London**
Live: https://barisparlatangiller.github.io/30DMC26-D25-IsThisAMap-London-Manifest-Stage/

The six members of Manifest during *Intro & Hileli* (live, OVO Arena Wembley) are mapped on a 24 × 24 m stage plan,
in sync with the YouTube video. Each performer leaves footprints in her colour: a circle wherever she stopped, growing with the time she stood there, so the song draws its own map. The default view is the plan from above.

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

The page draws the stage in perspective, as seen from the audience: the floor (with the colour map) is projected row by row,
the platform is lifted to +3.3 m with its stairs, and each performer is a spotlight with a pool of light, a glowing figure and
her name. Positions run through a Catmull-Rom curve between the 2 s samples, and the YouTube player's clock drives the time;
between the player's coarse time reports the page runs its own clock, so the motion stays smooth. The timeline shows the song as
six lanes (bright where a performer was clearly seen), with the key moments on top. Fonts are self-hosted (Manrope, JetBrains Mono).

`pipeline/video.mjs` renders the LinkedIn video (12 s, 1080 × 1350) and three stills from the page in video mode (`?video=1`,
no player): `node pipeline/video.mjs` → `media/`.

Heat: every sample counts for 2 s as a radial glow that fades to zero 3.2 m from the performer. Glows are weighted
by certainty: clear 1.0, approximate 0.6, silhouette 0.4. "Not visible" samples are left out of the heat map.
Each spot of the floor takes the colour of whoever spent the most time there (saturated versions of the six colours), brighter
where more time was spent in total.

Footprints: consecutive samples within 0.9 m of where a stop began form one stop. Each stop is a circle in her colour whose
area grows with the time spent (2 s: 0.5 m across, 30 s: 2 m, 60 s: 2.8 m); stops of 20 s or more show their duration.

## Sync with the video
The positions were noted on a clock that drifts against the published video. `prepare.py` stores ten anchor moments (`WARP_`),
checked by eye against the video and confirmed again on 24 Nov: silhouettes 0:27, first step down 0:56, all six on the main stage
1:09, solo 2:31, regroup 2:44, front edge 3:33, the run 3:42, front block 3:48, widest line 4:15, final pose 4:54.
The formations at 1:09 (V), 2:31 and 2:44 (pairs on the sides, Hilal centre front), 3:33 (W, briefly; by 3:35 one wide line with Zeynep and Hilal at the right end) and the run in three rows at 3:42
were read again from the video and override the notes in those windows (step 6 in `prepare.py`). The stage stays dark until 0:27
and the six open out on the platform from 0:32.

## Limits
Screen positions are not surveyed coordinates. Camera cuts and people out of frame make every point an estimate,
and the stage dimensions are approximate.

The video belongs to the artists and rights holders and is only embedded with the YouTube player.

Barış Parlatangiller · built with Claude
