# Adversarial Critique v2 — DEEPER vs References

Goal: every moment should be wow-inducing, interactive, reactive. Compared against Noita, Terraria, Deep Rock Galactic, Dome Keeper, Motherload/SteamWorld Dig 2, Spelunky, Celeste/Hades.

## Moment-by-moment teardown

### 1. Dig hit (core loop, 100s per minute)
- **Terraria**: hit has directional debris, dust puff opposite cursor, micro camera kick, distinct sound per material + pitch variance, tool recoil sprite kick.
- **Before**: random debris, no directional bias, same spark count, camera static.
- **Now**: `spawnBreakDebris(cx,cy,mat,big,aimAngle)` — debris flies opposite aim with spread 1.2 rad, speed 120-400. `spawnRecoil` tweens toolSpr scale 1.12→1 in 90ms. `doCameraKick` 0.7+ tier*0.32 on effective hit, 1.2 on hard_fail. Spark count scales with tier. Hitstop 18- + tier*5 ms (Celeste freeze) without breaking flow.

### 2. Debris & aftermath
- **Noita/Terraria**: debris has weight, family tint, settles, aftermath scar persists.
- **Before**: 3 chunks random velocity, one dust.
- **Now**: directional bias, tint by family, big breaks 8 chunks, dust angled. `spawnAftermathMark` fade to persistent scar via syncAftermath (capped 200). `spawnDebrisBurst` on big chains.

### 3. Pickup / vacuum / magnet streak
- **Motherload**: rising pitch, tractor beam visual, combo counter.
- **Before**: single sparkle, flat pickup sound.
- **Now**: `spawnPickupBurst` scales n=1-3 by resource tier, ring for tier>=4, tint by tier. `spawnMagnetStreak` hue shifts at streak 5/10, double sparkle at 5+, ring pulse, particle life scales with streak. Audio: `playMagnetStreak(streak)` rate 0.95+min(0.65,streak*0.08), extra pickup octave at 5+. Pickup sound rate 0.88+min(0.5,streak*0.06). Camera micro-kick at streak>=5.

### 4. Recoil / heavy machinery feel
- **Deep Rock Galactic**: weight, recoil pushes camera opposite aim, tool kicks, chassis squish on landing.
- **Before**: shake only on digRecoil event.
- **Now**: `doCameraKick` opposite aim, strength 0.8+tier*0.3. `spawnHeavyLanding` dust ring scaled 2.5+tier*0.9, second dust puff, chassis tween scaleY 0.82→1.12→1 in 70ms yoyo (squish). `playLanding` extra debris sound on heavy. `doHitStop` 30+tier*6 on tier>=4 landing.

### 5. Shake / hitstop / camera curves
- **Celeste/Hades**: hitstop curves, camera kick decay pow(0.0008,dt), freeze frames on impact.
- **Before**: shake only, no hitstop.
- **Now**: WorldScene fields `hitStopMs/hitStopDuration/cameraKickX/Y`. `doHitStop(duration)` guarded by reducedMotion. `doCameraKick(ax,ay,str)` opposite aim. Update: hitStop decays, dt *=0.02 during freeze, sim.step skipped during first 65% of freeze for true freeze frame. Kick decays pow(0.0008,dt). Applied to `centerOn` with rig facing offset.

### 6. Breakthrough (>=4 cells)
- **SteamWorld Dig 2**: breakthrough has double ring, zoom punch 1.08, slow-mo, screen flash.
- **Before**: single sparkle burst, 10 shards.
- **Now**: `spawnBreakthrough` burst 1.2→5.5 scale 620ms, ring 0.5→6, ring2 0.3→4.5 delay 80ms, 14 shards + 6 chunks. Audio `playBreakthrough(count)` pitch 0.95+min(0.35,count*0.04), extra wow_chain at 6+. WorldScene: hitstop 90ms (130ms if >=8), shake 10/14, zoomTo 1.08 (1.12 if >=8) in 80ms then back 1 in 180/240ms, toast for >=6.

### 7. Chain reaction
- **Noita**: chain escalates pitch, debris burst, combo counter, screen shake grows.
- **Before**: toast CHAIN xN, shake 6+count*0.5.
- **Now**: `playChain(count)` debris tick every 2 counts, rate 0.9+min(0.7,count*0.06). `play("wow_chain")` pitch 0.85+min(0.6,count*0.045) gain 0.5+min(0.4,count*0.04). Debris burst mul min(3,count/3) if >=6. Hitstop 60+min(90,count*7). Camera kick 3.2+count*0.35. Shake 6+count*0.6.

### 8. Tier acquisition (Dome Keeper identity)
- **Dome Keeper**: tier switch has distinct color, freeze, ring, banner, weight.
- **Before**: ring tint by tier%4, no chassis flash.
- **Now**: 8-color palette, ring 0.5→3.5+tier*0.5 900ms, second ring 0.3→2.5+tier*0.3 delay 120ms, 8+tier sparkles radial speed 80+tier*20. Chassis tint 220ms. Audio `playTierAcquire` rate 0.82+tier*0.07, extra relic shimmer at tier>=5 after 120ms. On key 1-8/Q: hitstop 35+tier*4, kick 1+tier*0.2, shake 1+tier*0.3.

### 9. Hazard ignition / steam / pressure
- **Spelunky**: hazards telegraph with distinct icon, screen flash, shake.
- **Before**: audio only.
- **Now**: ignite adds orange flash graphics 0.18 alpha 220ms + shake 3. `spawnHazardWarn` now has stroke, life 1.4+severity*0.6, telegraph image tinted scale 1.2→2.2 600ms. Overheat: red flash 0.22 300ms + kick 0,-1,2.5 + shake 5. PressureRelease already ring. Steam spawn.

### 10. Landing / weight
- **Celeste**: landing squish, dust ring scaled by impact, heavy landing extra shake.
- **Now**: covered in heavyLanding enhancement. Impact >12 triggers same. Tier influences.

### 11. Threats / telegraph
- **Spelunky**: threat telegraph visible, camera reacts when close.
- **Before**: telegraph sprite alpha pulse.
- **Now**: update loop scans threats.telegraph <0.15 (just started) within 14 cells → shake elite 3 else 1.5, camera kick opposite for elite. ThreatDeath: hitstop 18, kick random 1.2, dig_metal pitch variance.

### 12. Resonance / choir
- **Glass choir**: should feel musical, combo.
- **Now**: resonance wave pitch 0.9+min(0.6,combo*0.12), gain 0.8+min(0.3,combo*0.06), shake 7+combo*1.2, toast xCombo if >=2, hitstop 30+combo*10, kick 1.5+combo*0.4.

### 13. Sell / progression payoff
- **Motherload**: sell has rising pitch with money, screen punch.
- **Now**: sell rate 0.92+min(0.4,log10(money)*0.12), kick 0,-1,1.5, ring tier acquire if >=1000, shake 2.

### 14. WOW banners
- **Before**: banner + shake 8.
- **Now**: hitstop 80, zoom 1.06 120ms →1 300ms, shake 9.

### 15. Map / sell aftermath
- Map markers already; vulnerable announce spawns breakthrough FX for first 8 sites.

## Invariants preserved
- Deterministic sim untouched; all changes in render/audio/scene (view layer).
- Bounded perf: particle cap 120, steam 24, texts 18, hazard 12, aftermath 200. Tweens killed before re-tween. No new allocations per frame beyond existing pools.
- ReducedMotion guard on all hitstop/cameraKick/zoom/flash.
- Audio headless-safe (existing ensure check).

## Remaining gaps (next pass candidates)
- Liquid flow visual juice (drain/flood could have directional splash).
- Winch / lift channel could have camera lag + vignette.
- Scanner ping could have sonar ripple with distance-based pitch.
- Death cache could have distinct soul burst + slow-mo.
- These are lower ROI vs core dig loop already addressed.

## Validation
- typecheck: ok
- assets --check: ok (399 files)
- unit 46/46
- build 1.627 MB (gzip 444 KB)
- e2e 6/6
