/**
 * DEEPER — audio. WebAudio engine for the generated WAV bank plus procedural
 * evolving underground soundscape. Volume controls, mute, no telemetry.
 * v1.2: machine-tier sonic differentiation, material impact variations,
 * hazard warning cues, environmental loops/transitions, deep-stratum ambience,
 * high-tier machine power feedback, WOW payoff stingers, reduced-motion aware.
 */

import type { SoundFamily } from "./sim/materials";

const BANK: Record<string, string> = {
  dirt: "dig_soft", sand: "dig_sand", rock: "dig_rock", brittle: "dig_brittle",
  metal: "dig_metal", concrete: "dig_concrete", crystal: "dig_crystal",
  wood: "dig_wood", heavy: "dig_heavy", none: "dig_soft",
};

/** Tier -> tool loop + impact variant */
const TOOL_LOOP: Record<number, string> = {
  0: "tool_auger", 1: "tool_twin", 2: "tool_hammer", 3: "tool_thermal",
  4: "tool_seismic", 5: "tool_rotary", 6: "tool_resonator", 7: "tool_maw",
};
const TOOL_IMPACT: Record<number, string> = {
  2: "hammer_crack", 3: "thermal_cut", 4: "pressure_pop", 5: "rotary_grind",
  6: "resonator_pulse", 7: "maw_bite",
};

const SFX_NAMES = [
  "dig_soft", "dig_rock", "dig_metal", "dig_concrete", "dig_crystal", "dig_wood",
  "dig_heavy", "dig_sand", "dig_brittle", "hard_fail", "upgrade", "pickup", "big_loot",
  "cargo_full", "sell", "explosion", "ignite", "water", "steam", "magma", "resonance",
  "machine", "base_amb", "hurt", "extract", "discovery", "stratum",
  "scan", "lift", "valve", "relic", "blueprint", "threat_warn",
  "tool_auger", "tool_twin", "tool_hammer", "tool_thermal", "tool_seismic",
  "tool_rotary", "tool_resonator", "tool_maw",
  // v1.2
  "gas_hiss", "pressure_pop", "steam_burst", "overheat",
  "hammer_crack", "thermal_cut", "rotary_grind", "maw_bite", "maw_shockwave", "resonator_pulse",
  "breakthrough", "tier_acquire", "recoil", "landing_heavy", "debris", "magnet_streak",
  "wow_chain", "wow_choir", "wow_bell", "wow_vault", "wow_excavator", "wow_maw", "wow_finale",
  "amb_deep", "amb_magma", "amb_crystal", "amb_water", "amb_engine", "amb_buried",
];

const STRATUM_AMB: Record<string, { freq: number; rumble: number; bed: string }> = {
  surface: { freq: 320, rumble: 0.05, bed: "base_amb" },
  rootbed: { freq: 280, rumble: 0.07, bed: "amb_buried" },
  oldworks: { freq: 240, rumble: 0.09, bed: "amb_buried" },
  buriedmile: { freq: 200, rumble: 0.11, bed: "amb_deep" },
  drownedfault: { freq: 260, rumble: 0.08, bed: "amb_water" },
  redfault: { freq: 150, rumble: 0.16, bed: "amb_magma" },
  glasschoir: { freq: 420, rumble: 0.06, bed: "amb_crystal" },
  enginedeep: { freq: 120, rumble: 0.2, bed: "amb_engine" },
};

const WOW_SFX: Record<string, string> = {
  "WOW-01": "wow_bell",
  "WOW-02": "wow_vault",
  "WOW-03": "wow_choir",
  "WOW-04": "wow_excavator",
  "WOW-05": "wow_chain",
  "WOW-06": "wow_bell",
  "WOW-07": "wow_choir",
  "WOW-08": "wow_vault",
  "WOW-09": "wow_maw",
  "WOW-10": "wow_choir",
  "WOW-11": "wow_chain",
  "WOW-12": "wow_finale",
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxBus: GainNode | null = null;
  ambBus: GainNode | null = null;
  buffers = new Map<string, AudioBuffer>();
  private ambNodes: AudioNode[] = [];
  private stratumNodes: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
  private rumbleTimer: number | null = null;
  enabled = true;
  vol = { master: 0.8, sfx: 0.9, ambient: 0.6 };
  shake = 1;
  reducedMotion = false;
  muted = false;
  private loading = new Set<string>();
  private stratum: string = "surface";
  depthFilter: BiquadFilterNode | null = null;
  private rumbleGain = 0.12;
  private lastDig = 0;

  ensure(): boolean {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return true;
    }
    // Headless / automated test environments (SwiftShader) crash on AudioContext creation in some builds.
    // Detect headless via userAgent or webdriver flag and disable audio gracefully.
    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      const isHeadless = /HeadlessChrome|playwright|Puppeteer/i.test(ua) || (typeof navigator !== "undefined" && (navigator as any).webdriver);
      if (isHeadless) {
        this.enabled = false;
        return false;
      }
    } catch {}
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) { this.enabled = false; return false; }
      const ctx = new AC() as AudioContext;
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = this.vol.master;
      master.connect(ctx.destination);
      this.master = master;
      const sfxBus = ctx.createGain();
      sfxBus.gain.value = this.vol.sfx;
      sfxBus.connect(master);
      this.sfxBus = sfxBus;
      const ambBus = ctx.createGain();
      ambBus.gain.value = this.vol.ambient;
      ambBus.connect(master);
      this.ambBus = ambBus;
      // Defer heavy loading to avoid blocking main thread during new-game click
      window.setTimeout(() => {
        void this.loadAll();
        // Defer ambient start as well; it creates oscillators/noise buffers that can be heavy in SwiftShader
        window.setTimeout(() => {
          try { this.startAmbient(); } catch {}
        }, 200);
      }, 100);
      return true;
    } catch {
      this.enabled = false;
      return false;
    }
  }

  async loadAll() {
    if (!this.ctx) return;
    const critical = ["dig_soft", "dig_rock", "hard_fail", "pickup", "sell", "hurt", "base_amb", "tool_auger", "breakthrough", "tier_acquire"];
    await Promise.all(critical.map((n) => this.loadOne(n)));
    for (const n of SFX_NAMES) {
      if (!this.buffers.has(n)) void this.loadOne(n);
    }
  }

  async loadOne(name: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(name) || this.loading.has(name) || !this.ctx) return this.buffers.get(name) ?? null;
    this.loading.add(name);
    try {
      const res = await fetch(`assets/audio/${name}.wav`);
      const arr = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(arr);
      this.buffers.set(name, buf);
      return buf;
    } catch {
      return null;
    } finally {
      this.loading.delete(name);
    }
  }

  play(name: string, gain = 1, rate = 1) {
    if (!this.ctx || !this.sfxBus || !this.enabled || this.muted) return;
    const buf = this.buffers.get(name);
    if (!buf) {
      void this.loadOne(name).then((b) => { if (b) this.play(name, gain, rate); });
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    const isLoop = name.startsWith("tool_") || name.startsWith("amb_");
    g.gain.value = isLoop ? gain * 0.7 : gain;
    src.connect(g).connect(this.sfxBus);
    src.start();
    // bound lifetime: cleanup handled by GC but track for diagnostics
    if (this.reducedMotion && (name === "maw_shockwave" || name === "wow_finale")) {
      g.gain.value *= 0.6;
    }
  }

  digSound(family: SoundFamily, effective: boolean, tier?: number) {
    const now = performance.now();
    if (now - this.lastDig < 55) return; // throttle spam
    this.lastDig = now;
    if (!effective) {
      this.play("hard_fail", 0.5, 0.9 + Math.random() * 0.2);
      return;
    }
    // tier impact overlay for high tiers
    if (tier !== undefined && tier >= 2) {
      const impact = TOOL_IMPACT[tier];
      if (impact && Math.random() < 0.35) {
        this.play(impact, 0.55, 0.95 + Math.random() * 0.15);
      }
    }
    const base = BANK[family] ?? "dig_rock";
    this.play(base, 0.7, 0.9 + Math.random() * 0.25);
  }

  playToolImpact(tier: number) {
    const imp = TOOL_IMPACT[tier];
    if (imp) this.play(imp, 0.65, 0.9 + Math.random() * 0.2);
  }

  toolLoopStart(tier: number): { stop: () => void } | null {
    if (!this.ctx || !this.sfxBus) return null;
    const name = TOOL_LOOP[tier] ?? "tool_auger";
    const buf = this.buffers.get(name);
    if (!buf) { void this.loadOne(name); return null; }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.9 + tier * 0.06;
    const g = this.ctx.createGain();
    g.gain.value = 0.6 + tier * 0.05;
    src.connect(g).connect(this.sfxBus);
    src.start();
    return {
      stop: () => {
        try {
          g.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.08);
          src.stop(this.ctx!.currentTime + 0.25);
        } catch { /* already stopped */ }
      },
    };
  }

  // Gamefeel cues
  playRecoil(tier: number) { if (!this.reducedMotion) this.play("recoil", 0.35 + tier * 0.06, 0.9 + tier * 0.05); }
  playLanding(impact: number) { this.play(impact > 30 ? "landing_heavy" : "recoil", Math.min(1, 0.3 + impact * 0.02), 0.9 + Math.random() * 0.1); }
  playBreakthrough() { this.play("breakthrough", 0.8, 1); }
  playTierAcquire(tier: number) { this.play("tier_acquire", 0.85, 0.9 + tier * 0.03); }
  playDebris() { if (Math.random() < 0.5) this.play("debris", 0.3, 0.9 + Math.random() * 0.3); }
  playMagnetStreak() { this.play("magnet_streak", 0.6, 1.0 + Math.random() * 0.2); }

  // Hazard cues
  playHazard(kind: string, severity?: number) {
    const map: Record<string, string> = {
      steam: "steam_burst", gas: "gas_hiss", gas_ignite: "ignite",
      bloom_gas: "gas_hiss", pressure: "pressure_pop", water: "water",
      magma: "magma", overheat: "overheat", ignite: "ignite",
    };
    const sfx = map[kind] ?? "threat_warn";
    const gain = severity ? Math.min(1, 0.4 + severity * 0.5) : 0.6;
    this.play(sfx, gain, 0.9 + Math.random() * 0.2);
  }

  // WOW payoff
  playWow(id: string) {
    const sfx = WOW_SFX[id] ?? "discovery";
    this.play(sfx, 0.9, 1);
    if (id === "WOW-09" || id === "WOW-12") {
      // extra rumble
      setTimeout(() => this.play("maw_shockwave", 0.6, 0.95), 200);
    }
  }

  /** Evolving underground bed: base amb + per-stratum crossfade + rumbles */
  startAmbient() {
    if (!this.ctx || !this.ambBus) return;
    const baseBuf = this.buffers.get("base_amb");
    if (baseBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = baseBuf;
      src.loop = true;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = this.reducedMotion ? 0.12 : 0.25;
      const g = this.ctx.createGain();
      g.gain.value = 0.65;
      lfo.connect(lfoGain).connect(g.gain);
      src.connect(g).connect(this.ambBus);
      src.start(); lfo.start();
      this.ambNodes.push(src, lfo, g);
    }
    // depth drone
    const noiseLen = this.ctx.sampleRate * 2;
    const noiseBuf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) d[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuf; noise.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass"; filt.frequency.value = 220;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.06;
    noise.connect(filt).connect(ng).connect(this.ambBus);
    noise.start();
    this.ambNodes.push(noise, filt, ng);
    this.depthFilter = filt;

    // initial stratum bed
    this.crossfadeBed("surface");

    const schedule = () => {
      this.rumbleTimer = window.setTimeout(() => {
        if (this.ctx && this.ambBus) {
          const src2 = this.ctx.createBufferSource();
          const rb = this.buffers.get("magma") ?? baseBuf;
          if (rb) {
            src2.buffer = rb;
            const rg = this.ctx.createGain();
            rg.gain.value = this.reducedMotion ? this.rumbleGain * 0.4 : this.rumbleGain;
            const rf = this.ctx.createBiquadFilter();
            rf.type = "lowpass"; rf.frequency.value = 140;
            src2.connect(rf).connect(rg).connect(this.ambBus);
            src2.start(); src2.stop(this.ctx.currentTime + 1.2);
          }
        }
        schedule();
      }, 9000 + Math.random() * 16000);
    };
    schedule();
  }

  private crossfadeBed(stratum: string) {
    if (!this.ctx || !this.ambBus) return;
    const cfg = STRATUM_AMB[stratum] ?? STRATUM_AMB.surface;
    const buf = this.buffers.get(cfg.bed);
    if (!buf) { void this.loadOne(cfg.bed).then(() => this.crossfadeBed(stratum)); return; }
    // fade out old
    for (const { gain, src } of this.stratumNodes) {
      try {
        gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
        src.stop(this.ctx.currentTime + 1.2);
      } catch { /* */ }
    }
    this.stratumNodes = [];
    // fade in new
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(g).connect(this.ambBus);
    src.start();
    g.gain.setTargetAtTime(this.reducedMotion ? 0.25 : 0.45, this.ctx.currentTime, 0.8);
    this.stratumNodes.push({ src, gain: g });
  }

  setDepthTint(t: number) {
    if (this.depthFilter && this.ctx) {
      this.depthFilter.frequency.setTargetAtTime(260 - t * 190, this.ctx.currentTime, 0.5);
    }
  }

  setStratum(stratum: string) {
    if (stratum === this.stratum) return;
    this.stratum = stratum;
    const cfg = STRATUM_AMB[stratum] ?? STRATUM_AMB.surface;
    if (this.depthFilter && this.ctx) {
      this.depthFilter.frequency.setTargetAtTime(cfg.freq, this.ctx.currentTime, 1.2);
    }
    this.rumbleGain = this.reducedMotion ? cfg.rumble * 0.5 : cfg.rumble;
    this.crossfadeBed(stratum);
  }

  setVolumes(v: { master?: number; sfx?: number; ambient?: number }) {
    Object.assign(this.vol, v);
    if (this.master) this.master.gain.value = this.muted ? 0 : this.vol.master;
    if (this.sfxBus) this.sfxBus.gain.value = this.vol.sfx;
    if (this.ambBus) this.ambBus.gain.value = this.vol.ambient;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem("deeper.muted", m ? "1" : "0"); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : this.vol.master;
  }

  loadMuted() {
    try { if (localStorage.getItem("deeper.muted") === "1") this.setMuted(true); } catch { /* ignore */ }
  }

  setReducedMotion(v: boolean) {
    this.reducedMotion = v;
    if (this.depthFilter && this.ctx) {
      // less extreme filtering when reduced motion
      this.rumbleGain *= v ? 0.5 : 1;
    }
  }

  destroyAmbient() {
    if (this.rumbleTimer !== null) window.clearTimeout(this.rumbleTimer);
    for (const n of this.ambNodes) {
      try { (n as OscillatorNode).stop?.(); } catch { /* */ }
      try { n.disconnect(); } catch { /* */ }
    }
    this.ambNodes = [];
    for (const { src, gain } of this.stratumNodes) {
      try { src.stop(); } catch { /* */ }
      try { gain.disconnect(); } catch { /* */ }
    }
    this.stratumNodes = [];
  }
}
