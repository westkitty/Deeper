/**
 * DEEPER — audio. WebAudio engine for the generated WAV bank plus a procedural
 * evolving underground soundscape. Volume controls, mute, no telemetry.
 */

import type { SoundFamily } from "./sim/materials";

const BANK: Record<string, string> = {
  dirt: "dig_soft", sand: "dig_sand", rock: "dig_rock", brittle: "dig_brittle",
  metal: "dig_metal", concrete: "dig_concrete", crystal: "dig_crystal",
  wood: "dig_wood", heavy: "dig_heavy", none: "dig_soft",
};

const SFX_NAMES = [
  "dig_soft", "dig_rock", "dig_metal", "dig_concrete", "dig_crystal", "dig_wood",
  "dig_heavy", "dig_sand", "dig_brittle", "hard_fail", "upgrade", "pickup", "big_loot",
  "cargo_full", "sell", "explosion", "ignite", "water", "steam", "magma", "resonance",
  "machine", "base_amb", "hurt", "extract", "discovery", "stratum",
  // iteration-1 additions
  "scan", "lift", "valve", "relic", "blueprint", "threat_warn",
  "tool_auger", "tool_twin", "tool_hammer", "tool_thermal", "tool_seismic",
  "tool_rotary", "tool_resonator", "tool_maw",
];

/** Per-stratum ambient tint (filter freq + rumble gain). */
const STRATUM_AMB: Record<string, { freq: number; rumble: number }> = {
  surface: { freq: 320, rumble: 0.05 },
  rootbed: { freq: 280, rumble: 0.07 },
  oldworks: { freq: 240, rumble: 0.09 },
  buriedmile: { freq: 200, rumble: 0.11 },
  drownedfault: { freq: 260, rumble: 0.08 },
  redfault: { freq: 150, rumble: 0.16 },
  glasschoir: { freq: 420, rumble: 0.06 },
  enginedeep: { freq: 120, rumble: 0.2 },
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxBus: GainNode | null = null;
  ambBus: GainNode | null = null;
  buffers = new Map<string, AudioBuffer>();
  private ambNodes: AudioNode[] = [];
  private rumbleTimer: number | null = null;
  enabled = true;
  vol = { master: 0.8, sfx: 0.9, ambient: 0.6 };
  shake = 1;
  reducedMotion = false;
  muted = false;
  private loading = new Set<string>();
  private stratum: string = "surface";

  /** Must be called from a user gesture. */
  ensure(): boolean {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return true;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.vol.master;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.vol.sfx;
      this.sfxBus.connect(this.master);
      this.ambBus = this.ctx.createGain();
      this.ambBus.gain.value = this.vol.ambient;
      this.ambBus.connect(this.master);
      void this.loadAll();
      this.startAmbient();
      return true;
    } catch {
      this.enabled = false;
      return false;
    }
  }

  /** Eager-load the critical bank; the rest streams lazily on first play. */
  async loadAll() {
    if (!this.ctx) return;
    const critical = ["dig_soft", "dig_rock", "hard_fail", "pickup", "sell", "hurt", "base_amb", "tool_auger"];
    await Promise.all(critical.map((n) => this.loadOne(n)));
    // background-fill the remainder without blocking boot
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
      return null; // missing sound is non-fatal
    } finally {
      this.loading.delete(name);
    }
  }

  play(name: string, gain = 1, rate = 1) {
    if (!this.ctx || !this.sfxBus || !this.enabled || this.muted) return;
    const buf = this.buffers.get(name);
    if (!buf) {
      // lazy load then replay once ready
      void this.loadOne(name).then((b) => {
        if (b) this.play(name, gain, rate);
      });
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    // normalize hot loops slightly so late-game density doesn't clip
    g.gain.value = name.startsWith("tool_") ? gain * 0.7 : gain;
    src.connect(g).connect(this.sfxBus);
    src.start();
  }

  digSound(family: SoundFamily, effective: boolean) {
    if (!effective) {
      this.play("hard_fail", 0.5, 0.9 + Math.random() * 0.2);
      return;
    }
    this.play(BANK[family] ?? "dig_rock", 0.7, 0.9 + Math.random() * 0.25);
  }

  toolLoopStart(name: string): { stop: () => void } | null {
    if (!this.ctx || !this.sfxBus) return null;
    const buf = this.buffers.get(name);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0.8;
    src.connect(g).connect(this.sfxBus);
    src.start();
    return {
      stop: () => {
        try {
          g.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.05);
          src.stop(this.ctx!.currentTime + 0.2);
        } catch { /* already stopped */ }
      },
    };
  }

  /** Evolving underground bed: looped base amb + slow LFO + sparse rumbles. */
  startAmbient() {
    if (!this.ctx || !this.ambBus) return;
    const buf = this.buffers.get("base_amb");
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.25;
      const g = this.ctx.createGain();
      g.gain.value = 0.75;
      lfo.connect(lfoGain).connect(g.gain);
      src.connect(g).connect(this.ambBus);
      src.start();
      lfo.start();
      this.ambNodes.push(src, lfo, g);
    }
    // depth drone: filtered noise whose pitch falls as you go deeper
    const noiseLen = this.ctx.sampleRate * 2;
    const noiseBuf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) d[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 220;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.06;
    noise.connect(filt).connect(ng).connect(this.ambBus);
    noise.start();
    this.ambNodes.push(noise, filt, ng);
    this.depthFilter = filt;
    // sparse distant rumbles
    const schedule = () => {
      this.rumbleTimer = window.setTimeout(() => {
        if (this.ctx && this.ambBus) {
          const src2 = this.ctx.createBufferSource();
          const rb = this.buffers.get("magma") ?? buf;
          if (rb) {
            src2.buffer = rb;
            const rg = this.ctx.createGain();
            rg.gain.value = 0.12;
            const rf = this.ctx.createBiquadFilter();
            rf.type = "lowpass";
            rf.frequency.value = 140;
            src2.connect(rf).connect(rg).connect(this.ambBus);
            src2.start();
            src2.stop(this.ctx.currentTime + 1.2);
          }
        }
        schedule();
      }, 9000 + Math.random() * 16000);
    };
    schedule();
  }

  depthFilter: BiquadFilterNode | null = null;

  /** Depth 0..1 tints the ambience darker. */
  setDepthTint(t: number) {
    if (this.depthFilter && this.ctx) {
      this.depthFilter.frequency.setTargetAtTime(260 - t * 190, this.ctx.currentTime, 0.5);
    }
  }

  /** Per-stratum ambient layer: retunes the depth drone + rumble bed. */
  setStratum(stratum: string) {
    if (stratum === this.stratum) return;
    this.stratum = stratum;
    const cfg = STRATUM_AMB[stratum] ?? STRATUM_AMB.surface;
    if (this.depthFilter && this.ctx) {
      this.depthFilter.frequency.setTargetAtTime(cfg.freq, this.ctx.currentTime, 1.2);
    }
    this.rumbleGain = cfg.rumble;
  }
  private rumbleGain = 0.12;

  setVolumes(v: { master?: number; sfx?: number; ambient?: number }) {
    Object.assign(this.vol, v);
    if (this.master) this.master.gain.value = this.vol.master;
    if (this.sfxBus) this.sfxBus.gain.value = this.vol.sfx;
    if (this.ambBus) this.ambBus.gain.value = this.vol.ambient;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem("deeper.muted", m ? "1" : "0"); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : this.vol.master;
  }

  loadMuted() {
    try {
      if (localStorage.getItem("deeper.muted") === "1") this.setMuted(true);
    } catch { /* ignore */ }
  }

  destroyAmbient() {
    if (this.rumbleTimer !== null) window.clearTimeout(this.rumbleTimer);
    for (const n of this.ambNodes) {
      try {
        (n as OscillatorNode).stop?.();
      } catch { /* not stoppable */ }
      try {
        n.disconnect();
      } catch { /* already gone */ }
    }
    this.ambNodes = [];
  }
}
