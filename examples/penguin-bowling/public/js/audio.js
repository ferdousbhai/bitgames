/** Every sound is synthesized with Web Audio: nothing to download. */
const PENTA = [0, 2, 4, 7, 9] // major pentatonic: any run of notes sounds happy
const note = (step, base = 523.25) => base * 2 ** ((PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12)

/**
 * One music-box tune per lane, played A A B A with little rests (null) so it breathes. A layer of
 * off-beat plinks joins from the second frame and a soft shaker from the fourth; a strike adds a
 * twinkly echo for a while.
 */
const _ = null
const TUNES = {
  village: {
    a: [0, 2, 4, 2, 5, 4, 2, 0, 1, 3, 5, 3, 7, 5, 4, _],
    b: [7, _, 6, 5, 4, _, 5, 7, 9, 7, 5, 4, 2, 4, 1, _],
    bassA: [0, 0, -2, -2, -3, -3, -1, -1],
    bassB: [2, 2, 0, 0, -1, -1, -3, -1],
    beat: 0.19,
  },
  aurora: {
    a: [4, 2, 0, 2, 4, 5, 7, 5, 4, 2, 1, 2, 0, -1, 0, _],
    b: [5, 7, 9, _, 7, 5, 4, _, 2, 4, 5, 4, 2, 1, 2, _],
    bassA: [0, 0, -3, -3, -2, -2, -1, -1],
    bassB: [-2, -2, 0, 0, -3, -3, -1, -1],
    beat: 0.24,
  },
  bay: {
    a: [0, 4, 2, 5, 4, 7, 5, 4, 2, 4, 1, 3, 2, 1, 0, _],
    b: [5, _, 7, 5, 9, _, 7, 5, 4, 5, 2, 4, 3, 2, 1, _],
    bassA: [0, -2, -3, -1, 0, -2, -3, -1],
    bassB: [-3, -1, 0, -2, -3, -1, 0, -1],
    beat: 0.18,
  },
}
const FORM = ['a', 'a', 'b', 'a']

export class Audio {
  constructor() {
    this.ctx = null
    this.muted = false
    this.musicOn = true
    this.nextBeat = 0
    this.beat = 0
    this.tune = TUNES.village
    this.layer = 0 // 0, 1 or 2: more of the band joins as the game goes on
    this.twinkle = 0 // beats of strike echo left
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
    this.musicBus.gain.value = 0.2
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

  setTune(name) {
    this.tune = TUNES[name] ?? TUNES.village
  }

  burst({ freq, q = 1, gain = 0.4, decay = 0.2, type = 'bandpass', delay = 0, attack = 0 }) {
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
    if (attack) {
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(gain, t + attack)
    } else g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + attack + decay)
    src.connect(filter).connect(g).connect(this.master)
    src.start(t, Math.random() * 0.5)
    src.stop(t + attack + decay + 0.05)
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

  click() {
    this.tone({ freq: 660, type: 'triangle', gain: 0.18, decay: 0.12, slide: 300 })
  }

  /**
   * A pin tips over: a cartoon "bwoop" that drops in pitch. Each pin that falls in one slide starts a
   * note higher, so a big knock plays a happy run up the scale and a strike a whole tumbling tune.
   */
  topple(n = 1) {
    const f = note(n + 1, 392)
    this.tone({ freq: f * 1.5, type: 'sine', gain: 0.14, decay: 0.24, slide: -f * 0.7, attack: 0.01 })
    this.tone({ freq: f * 3, type: 'triangle', gain: 0.04, decay: 0.12, slide: -f })
  }

  /** The golden pin falls: a bright, rising chime with a shimmer. */
  gold() {
    ;[0, 2, 4, 7, 9].forEach((st, i) => this.tone({ freq: note(st + 5, 523.25), type: 'triangle', gain: 0.1, decay: 0.5, delay: i * 0.07 }))
    this.burst({ freq: 6000, q: 1, gain: 0.05, decay: 0.6, type: 'highpass', delay: 0.1 })
  }

  /** The giant snowman lands: a deep, soft "whumpf". */
  thump() {
    this.tone({ freq: 110, type: 'sine', gain: 0.4, decay: 0.45, slide: -50 })
    this.burst({ freq: 400, q: 0.7, gain: 0.25, decay: 0.3 })
  }

  /** A shower of snow (or the whale's spray) over the deck. */
  splash() {
    this.burst({ freq: 2500, q: 0.4, gain: 0.18, decay: 0.9, attack: 0.05 })
    for (let i = 0; i < 6; i++) this.tone({ freq: note(8 + (i % 4)), type: 'sine', gain: 0.04, decay: 0.15, delay: 0.1 + i * 0.09 })
  }

  /** A baby penguin dives in: a tiny, high "wheee!" */
  whee() {
    this.tone({ freq: 900, type: 'sine', gain: 0.12, decay: 0.6, slide: 900, attack: 0.03 })
    this.tone({ freq: 1800, type: 'triangle', gain: 0.03, decay: 0.5, slide: 1200, delay: 0.05 })
  }

  /** A new hat: a magic little sparkle run downwards then up. */
  hat() {
    ;[9, 7, 4, 7, 9, 12].forEach((st, i) => this.tone({ freq: note(st, 523.25), type: 'sine', gain: 0.08, decay: 0.3, delay: 0.3 + i * 0.08 }))
  }

  /** Penguin off a bumper: a springy "boing". */
  boing() {
    this.tone({ freq: 170, type: 'sine', gain: 0.22, decay: 0.32, slide: 260 })
    this.tone({ freq: 340, type: 'triangle', gain: 0.06, decay: 0.25, slide: 420, delay: 0.02 })
  }

  /** The penguin pops up behind the pins: a bubbly "pop!" */
  pop() {
    this.tone({ freq: 420, type: 'sine', gain: 0.2, decay: 0.14, slide: 900 })
    this.burst({ freq: 2200, q: 2, gain: 0.08, decay: 0.05 })
  }

  /** A miss: a little descending "whoops", never a buzzer. */
  whoops() {
    this.tone({ freq: 720, type: 'sine', gain: 0.13, decay: 0.35, slide: -360 })
    this.tone({ freq: 540, type: 'sine', gain: 0.1, decay: 0.4, slide: -260, delay: 0.22 })
  }

  /** A little penguin squeak (tapping the penguin, or diving onto its belly). */
  squeak(pitch = 1) {
    this.tone({ freq: 900 * pitch, type: 'sine', gain: 0.16, decay: 0.12, slide: 500 * pitch })
    this.tone({ freq: 1300 * pitch, type: 'triangle', gain: 0.08, decay: 0.1, delay: 0.09, slide: -400 })
  }

  /** The dive: a rising whoosh and a happy "wheee". */
  whoosh() {
    this.burst({ freq: 900, q: 0.8, gain: 0.3, decay: 0.45, attack: 0.08 })
    this.tone({ freq: 500, type: 'sine', gain: 0.13, decay: 0.5, slide: 700, delay: 0.05 })
  }

  /** Belly on ice: a looping filtered hiss whose loudness follows the speed. */
  slide(speed) {
    if (!this.ready) return
    if (!this.slideGain) {
      const src = this.ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      const f = this.ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 2400
      f.Q.value = 0.6
      this.slideFilter = f
      this.slideGain = this.ctx.createGain()
      this.slideGain.gain.value = 0
      src.connect(f).connect(this.slideGain).connect(this.master)
      src.start()
    }
    const v = Math.min(1, speed / 12)
    this.slideGain.gain.setTargetAtTime(v * 0.09, this.ctx.currentTime, 0.05)
    this.slideFilter.frequency.setTargetAtTime(1400 + v * 2200, this.ctx.currentTime, 0.05)
  }

  /** Penguin into pin: a soft "bonk". */
  bonk(strength = 1) {
    const s = Math.min(1, strength)
    this.tone({ freq: 240, type: 'sine', gain: 0.35 * s + 0.1, decay: 0.18, slide: -120 })
    this.burst({ freq: 1400, q: 1.5, gain: 0.25 * s, decay: 0.08 })
  }

  /** Pin into pin, or pin onto ice: a woody, snowy clack. */
  clack(strength = 1) {
    const s = Math.min(1, strength)
    this.burst({ freq: 1800 + Math.random() * 1200, q: 4, gain: 0.25 * s + 0.04, decay: 0.07 })
    this.tone({ freq: 500 + Math.random() * 300, type: 'triangle', gain: 0.1 * s, decay: 0.08 })
  }

  /** The crowd of little penguins: a wash of noise and a few happy chirps. */
  cheer(big = false) {
    this.burst({ freq: 1200, q: 0.5, gain: big ? 0.08 : 0.05, decay: big ? 1.0 : 0.7, attack: 0.2 })
    const n = big ? 5 : 3
    for (let i = 0; i < n; i++) {
      const f = 900 + Math.random() * 900
      this.tone({ freq: f, type: 'sine', gain: 0.04, decay: 0.16, delay: 0.05 + Math.random() * (big ? 1.1 : 0.7), slide: 400 })
    }
  }

  /** Every roll gets a jingle; more pins, longer jingle. */
  jingle(pins) {
    const n = Math.max(2, Math.min(7, 2 + Math.round(pins / 2)))
    for (let i = 0; i < n; i++) this.tone({ freq: note(i * 2), type: 'triangle', gain: 0.12, decay: 0.25, delay: i * 0.08 })
  }

  fanfare() {
    // A soft rising chord, played once: sine and triangle only
    const tune = [0, 4, 7]
    tune.forEach((s, i) => this.tone({ freq: note(s, 392), type: 'sine', gain: 0.08, decay: 0.9, delay: i * 0.14 }))
    tune.forEach((s, i) => this.tone({ freq: note(s, 392) * 2, type: 'triangle', gain: 0.04, decay: 0.8, delay: i * 0.14 }))
  }

  /** Fallen pins vanish in a puff of snow. */
  poof() {
    this.burst({ freq: 3000, q: 0.7, gain: 0.12, decay: 0.3, type: 'highpass' })
    for (let i = 0; i < 4; i++) this.tone({ freq: note(6 + i), type: 'sine', gain: 0.06, decay: 0.2, delay: i * 0.04 })
  }

  /** New pins drop in from above. */
  drop() {
    for (let i = 0; i < 4; i++) this.tone({ freq: note(7 - i), type: 'triangle', gain: 0.08, decay: 0.18, delay: i * 0.06 })
  }

  /** A gentle music-box loop, scheduled a little ahead each frame. */
  updateMusic(playing) {
    if (!this.ready || !this.musicOn || !playing) return
    const ctx = this.ctx
    const tune = this.tune
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05
    while (this.nextBeat < ctx.currentTime + 0.3) {
      const b = this.beat++
      const t = this.nextBeat - ctx.currentTime
      const part = FORM[Math.floor(b / 32) % FORM.length]
      const m = tune[part][(b >> 1) % 16]
      if (b % 2 === 0 && m !== null) {
        this.tone({ freq: note(m, 523.25), type: 'sine', gain: 0.18, decay: 0.5, delay: t, out: this.musicBus })
        if (this.twinkle > 0) this.tone({ freq: note(m + 5, 523.25), type: 'triangle', gain: 0.05, decay: 0.3, delay: t + tune.beat, out: this.musicBus })
      }
      if (b % 4 === 0) this.tone({ freq: note(tune[part === 'b' ? 'bassB' : 'bassA'][(b >> 2) % 8], 130.8), type: 'triangle', gain: 0.25, decay: 0.8, delay: t, out: this.musicBus })
      if (this.layer >= 1 && b % 4 === 2) this.tone({ freq: note(tune[part === 'b' ? 'bassB' : 'bassA'][(b >> 2) % 8] + 7, 261.6), type: 'sine', gain: 0.06, decay: 0.18, delay: t, out: this.musicBus })
      if (this.layer >= 2 && b % 2 === 1) this.burst({ freq: 7000, q: 0.8, gain: 0.025, decay: 0.05, type: 'highpass', delay: t })
      if (this.twinkle > 0) this.twinkle--
      this.nextBeat += tune.beat
    }
  }
}
