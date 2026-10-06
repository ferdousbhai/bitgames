// Synthesised notes and spoken prompts. Both stay silent when muted or unsupported.
export class AudioGuide {
  constructor() {
    this.muted = false
    this.context = null
    this.voices = new Set()
  }

  // Browsers only allow audio after a user gesture, so every tap calls this.
  unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext) this.context = new AudioContext()
    }
    this.context?.resume().catch(() => {})
  }

  note(frequency = 440, duration = 0.22, delay = 0, timbre = 'sine') {
    if (this.muted || !this.context) return
    const context = this.context
    const start = context.currentTime + delay
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = timbre
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.09, start + 0.018)
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    this.voices.add(oscillator)
    oscillator.onended = () => {
      this.voices.delete(oscillator)
      oscillator.disconnect()
      gain.disconnect()
    }
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }

  happy() {
    const notes = [392, 494, 587, 784]
    notes.forEach((frequency, i) => this.note(frequency, 0.22, i * 0.09))
  }

  // A list is spoken as separate utterances in turn, so single letters keep their names.
  // `onStart(i)`, if given, is called as the voice begins the i-th part. Returns whether it speaks.
  speak(text, onStart) {
    if (this.muted || !('speechSynthesis' in window)) return false
    speechSynthesis.cancel()
    for (const [i, part] of [text].flat().entries()) {
      // Drop emoji and symbols so voices don't read them out.
      const utterance = new SpeechSynthesisUtterance(String(part).replace(/[^\p{L}\p{N}\s.,?!:’'-]/gu, ''))
      utterance.lang = 'en-US'
      utterance.rate = 0.83
      utterance.pitch = 1.12
      // A part the voice can't say counts as said, so nothing waits on it.
      if (onStart) utterance.onstart = utterance.onerror = () => onStart(i)
      speechSynthesis.speak(utterance)
    }
    return true
  }

  stop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel()
    for (const voice of this.voices) {
      try {
        voice.stop()
      } catch {}
    }
    this.voices.clear()
  }

  mute(value) {
    this.muted = value
    if (value) this.stop()
  }
}
