# Sirena City — Noches de Neón

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/idham92/sirena-city/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/idham92/sirena-city/reward.svg)](https://make.fun/bounty/gta6-01)

An original top-down 2D open-world crime game, built for the
[Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01). Pure
HTML5 canvas and vanilla JavaScript — no libraries, no network loads,
everything synthesised in code, including the sound.

Sirena is a neon harbour city that never sleeps. Marina Sol, who runs the
Café Litoral, has a plan to leave it all behind — and you are the driver.
Run her errands, steal the marked Coral GT, pick her up at the Casino
Coral and lose the Patrulla Sirena before you drop her at the lighthouse.
Then keep working: courier jobs pay by distance, forever.

## What is in the city

- A multi-screen road grid: signed buildings with lit windows, parks,
  parking lots, three piers and a lighthouse on the harbour edge.
- Traffic that drives the street graph, stops for obstacles and panics;
  pedestrians who stroll the pavements and flee gunfire and chaos.
- Any car can be taken: parked ones, and driven ones — the driver gets
  yanked out and runs. Handbrake turns, damage, smoke, fire and
  explosions included.
- A wanted system from 0 to 5 stars: witnessed crimes raise it, the
  police spawn by stars and chase, ram and bust; hide long enough and
  the heat decays. Busted means a fine and the Comisaría; wasted means
  the Hospital San Roque.
- On-foot combat: mouse aim, click to shoot, 12-round magazine, R to
  reload.
- A HUD with a live minimap (traffic, police, waypoint), wanted stars,
  health, cash, vehicle and weapon state, and the current objective.
- Dusk lighting with headlight glows and flashing patrol lights, screen
  shake, particles, and a WebAudio soundtrack of engine, siren, shots
  and a bass loop — no audio files.
- Progress saves to localStorage: cash, story progress and stats, with
  Continue on the title screen.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Walk or drive |
| Shift | Run |
| E | Talk, enter or leave a car |
| Space | Handbrake |
| Mouse / click | Aim / shoot |
| R | Reload |
| P / Esc | Pause |
| M | Mute |
| Enter / N | Continue / new game on the title screen |

## Run it

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

Then open http://localhost:8080 in desktop Chrome. The entry program is
`main.ts`: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` copies
`game/` and `screenshots/` to the output and writes the dossier.
