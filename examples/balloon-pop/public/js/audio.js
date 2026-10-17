/** Every sound is synthesized with Web Audio: nothing to download. */
const PENTA = [0, 2, 4, 7, 9] // major pentatonic: any run of notes sounds happy
const MELODY = [0, 2, 4, 2, 5, 4, 2, 0, 1, 3, 5, 3, 7, 5, 4, 2]
const BASS = [0, 0, -2, -2, -3, -3, -1, -1]
const note = (step, base = 523.25) => base * 2 ** ((PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12)

export class Audio {
  constructor() {
    this.ctx = null
    this.muted = false
    this.musicOn = false // the music box starts off; the 🎵 button turns it on
    this.nextBeat = 0
    this.beat = 0
  }

  /** Browsers only allow sound after a tap or key press, so this runs on the first one. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {})
      return
    }
    try {
      this.ctx = new AudioContext()
    } catch {
      return
    }
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    this.master.connect(this.ctx.destination)
    this.musicBus = this.ctx.createGain()
    this.musicBus.gain.value = 0.22
    this.musicBus.connect(this.master)
    const len = this.ctx.sampleRate
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running'
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05)
  }

  burst({ freq, q = 1, gain = 0.4, decay = 0.2, type = 'bandpass', delay = 0 }) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    src.connect(filter).connect(g).connect(this.master)
    src.start(t, Math.random() * 0.5)
    src.stop(t + decay + 0.05)
  }

  tone({ freq, type = 'sine', gain = 0.2, decay = 0.2, delay = 0, slide = 0, attack = 0.005, out }) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + decay)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    osc.connect(g).connect(out ?? this.master)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  }

  /** The pop: a bright snap, a rubbery thump and a note. `step` picks the note, so quick pops climb the scale. */
  pop(step = 0, size = 1) {
    this.burst({ freq: 1800, q: 0.7, gain: 0.22, decay: 0.05, type: 'bandpass' })
    this.burst({ freq: 800, q: 1.2, gain: 0.22 * size, decay: 0.12 })
    this.tone({ freq: 180 / size, type: 'sine', gain: 0.28, decay: 0.12, slide: -110 })
    this.tone({ freq: note(Math.min(step, 14)), type: 'triangle', gain: 0.14, decay: 0.3, delay: 0.02 })
  }

  /** A giant balloon swelling: a rubbery squeak that climbs with each poke. */
  squeak(n = 1) {
    this.tone({ freq: 260 + n * 90, type: 'triangle', gain: 0.16, decay: 0.22, slide: 240 + n * 60, attack: 0.01 })
    this.tone({ freq: 520 + n * 180, type: 'sine', gain: 0.05, decay: 0.18, slide: 300, delay: 0.02 })
    this.burst({ freq: 900 + n * 200, q: 4, gain: 0.05, decay: 0.15 })
  }

  /** A tap on empty sky: two tiny high notes. */
  twinkle() {
    const n = (Math.random() * 5) | 0
    this.tone({ freq: note(10 + n), type: 'sine', gain: 0.06, decay: 0.25 })
    this.tone({ freq: note(12 + n), type: 'sine', gain: 0.04, decay: 0.3, delay: 0.07 })
  }

  /** Blowing up a balloon: a breathy puff and a note that climbs as it grows (`p` from 0 to 1). */
  puff(p = 0) {
    this.burst({ freq: 500 + p * 400, q: 0.6, gain: 0.07, decay: 0.16, type: 'lowpass' })
    this.tone({ freq: 220 + p * 520, type: 'triangle', gain: 0.07, decay: 0.2, slide: 40, attack: 0.03 })
  }

  /** A balloon let go: a soft rising whistle as it floats off. */
  letGo() {
    this.tone({ freq: note(4, 392), type: 'sine', gain: 0.09, decay: 0.5, slide: 380, attack: 0.03 })
  }

  /** A surprise in the sky: a little rising toot. */
  surprise() {
    ;[0, 4, 7, 9].forEach((s, i) => this.tone({ freq: note(s, 523.25), type: 'triangle', gain: 0.09, decay: 0.3, delay: i * 0.08 }))
  }

  /** A friend landing on the grass: a soft, low thump and a rustle. */
  thud() {
    this.tone({ freq: 120, type: 'sine', gain: 0.24, decay: 0.18, slide: -55, attack: 0.005 })
    this.burst({ freq: 700, q: 0.5, gain: 0.07, decay: 0.12, type: 'lowpass' })
  }

  /** A piglet on the meadow: a little snorty oink. */
  oink() {
    this.burst({ freq: 420, q: 6, gain: 0.12, decay: 0.14 })
    this.tone({ freq: 240, type: 'sawtooth', gain: 0.04, decay: 0.14, slide: 60, attack: 0.01 })
  }

  /** A duck on the meadow: a soft, nasal quack. */
  quack() {
    this.tone({ freq: 520, type: 'square', gain: 0.05, decay: 0.16, slide: -180, attack: 0.01 })
    this.burst({ freq: 1100, q: 3, gain: 0.06, decay: 0.12 })
  }

  /** A bunny on the meadow: a springy boing. */
  boing() {
    this.tone({ freq: 300, type: 'sine', gain: 0.16, decay: 0.35, slide: 500, attack: 0.01 })
  }

  sparkle() {
    for (let i = 0; i < 5; i++) this.tone({ freq: note(5 + i * 2), type: 'sine', gain: 0.12, decay: 0.35, delay: i * 0.05 })
  }

  /** The star balloon: a soft whoomph and a slow shimmer (calm pass: no crackle). */
  boom() {
    this.tone({ freq: 140, type: 'sine', gain: 0.25, decay: 0.6, slide: -60 })
    this.burst({ freq: 400, q: 0.6, gain: 0.18, decay: 0.6, type: 'lowpass' })
    for (let i = 0; i < 4; i++) this.tone({ freq: note(7 + i), type: 'sine', gain: 0.06, decay: 0.5, delay: 0.1 + i * 0.12 })
  }

  rainbow() {
    for (let i = 0; i < 8; i++) this.tone({ freq: note(i), type: 'triangle', gain: 0.13, decay: 0.3, delay: i * 0.045 })
  }

  /** A new balloon friend: a gentle rising arpeggio. */
  levelUp() {
    const tune = [0, 2, 4, 7]
    tune.forEach((s, i) => this.tone({ freq: note(s, 392), type: 'triangle', gain: 0.1, decay: 0.6, delay: i * 0.18, attack: 0.02 }))
    tune.forEach((s, i) => this.tone({ freq: note(s, 392) * 2, type: 'sine', gain: 0.04, decay: 0.6, delay: i * 0.18, attack: 0.02 }))
  }

  click() {
    this.tone({ freq: 660, type: 'triangle', gain: 0.18, decay: 0.12, slide: 300 })
  }

  giggle() {
    for (let i = 0; i < 4; i++) this.tone({ freq: 700 + i * 90, type: 'sine', gain: 0.12, decay: 0.09, delay: i * 0.08, slide: 200 })
  }

  /** The hot-air balloon's burner: a soft roar of air, then a happy rising toot. */
  whoosh() {
    this.burst({ freq: 500, q: 0.8, gain: 0.35, decay: 0.55, type: 'lowpass' })
    this.burst({ freq: 1400, q: 1.5, gain: 0.12, decay: 0.4, delay: 0.05 })
    ;[0, 2, 4].forEach((s, i) => this.tone({ freq: note(s + 5), type: 'triangle', gain: 0.12, decay: 0.25, delay: 0.25 + i * 0.09 }))
  }

  /** The windmill whirling: a quick spiral of notes over a breezy swish. */
  whirr() {
    this.burst({ freq: 1800, q: 0.9, gain: 0.18, decay: 0.7 })
    for (let i = 0; i < 6; i++) this.tone({ freq: note(i * 2 - 2), type: 'sine', gain: 0.1, decay: 0.16, delay: i * 0.06, slide: 120 })
  }

  /** A tapped house: a friendly doorbell. */
  dingDong() {
    this.tone({ freq: note(7), type: 'sine', gain: 0.2, decay: 0.5 })
    this.tone({ freq: note(7) * 2, type: 'sine', gain: 0.05, decay: 0.3 })
    this.tone({ freq: note(4), type: 'sine', gain: 0.2, decay: 0.7, delay: 0.32 })
    this.tone({ freq: note(4) * 2, type: 'sine', gain: 0.05, decay: 0.4, delay: 0.32 })
  }

  /** A tapped tree: a leafy rustle and a little bird's tweet-tweet. */
  tweet() {
    this.burst({ freq: 3500, q: 0.8, gain: 0.14, decay: 0.35 })
    for (let i = 0; i < 3; i++) this.tone({ freq: 2300 + i * 150, type: 'sine', gain: 0.09, decay: 0.07, delay: 0.12 + i * 0.11, slide: 900 })
  }

  /** A soft, silly "baa" from a tapped sheep: a wobbly reedy note through a vowel-ish filter. */
  baa(pitch = 1) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(330 * pitch, t)
    osc.frequency.linearRampToValueAtTime(300 * pitch, t + 0.55)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 9
    const depth = ctx.createGain()
    depth.gain.value = 14 * pitch
    lfo.connect(depth).connect(osc.frequency)
    const vowel = ctx.createBiquadFilter()
    vowel.type = 'bandpass'
    vowel.frequency.setValueAtTime(700, t)
    vowel.frequency.linearRampToValueAtTime(1100, t + 0.12)
    vowel.Q.value = 1.6
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.05)
    g.gain.setValueAtTime(0.35, t + 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    osc.connect(vowel).connect(g).connect(this.master)
    osc.start(t)
    lfo.start(t)
    osc.stop(t + 0.65)
    lfo.stop(t + 0.65)
  }

  /** A gentle music-box loop, scheduled a little ahead each frame. */
  updateMusic(playing) {
    if (!this.ready || !this.musicOn || !playing) return
    const ctx = this.ctx
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05
    while (this.nextBeat < ctx.currentTime + 0.25) {
      const b = this.beat++
      const t = this.nextBeat - ctx.currentTime
      // Every other phrase is a rest, so the music box breathes and leaves room for the pops.
      if (Math.floor(b / 32) % 2 === 1) {
        this.nextBeat += 0.3
        continue
      }
      if (b % 2 === 0) this.tone({ freq: note(MELODY[(b / 2) % 16], 523.25), type: 'sine', gain: 0.14, decay: 0.7, delay: t, out: this.musicBus })
      if (b % 4 === 0) this.tone({ freq: note(BASS[(b / 4) % 8], 130.8), type: 'triangle', gain: 0.22, decay: 1.1, delay: t, out: this.musicBus })
      // Calm pass: a slow music box (was 0.19 s per step, about 158 bpm).
      this.nextBeat += 0.3
    }
  }
}
