export type FeedbackKind = 'match' | 'none' | 'already'

interface Note {
  /** Pitch in Hz. */
  frequency: number
  /** Seconds after the sound starts. */
  offset: number
  /** Length in seconds. */
  duration: number
  type: 'sine' | 'square' | 'sawtooth' | 'triangle'
}

/** Match: bright rising pair. None: low buzz. Already: two flat mid beeps. */
export const SOUND_PATTERNS: Record<FeedbackKind, Note[]> = {
  match: [
    { frequency: 880, offset: 0, duration: 0.12, type: 'sine' },
    { frequency: 1320, offset: 0.14, duration: 0.18, type: 'sine' },
  ],
  none: [{ frequency: 150, offset: 0, duration: 0.45, type: 'sawtooth' }],
  already: [
    { frequency: 600, offset: 0, duration: 0.1, type: 'triangle' },
    { frequency: 600, offset: 0.16, duration: 0.1, type: 'triangle' },
  ],
}

/** Vibration patterns in milliseconds. */
export const VIBRATION_PATTERNS: Record<FeedbackKind, number[]> = {
  match: [90],
  none: [350],
  already: [70, 60, 70],
}

interface AudioParamLike {
  value: number
  setValueAtTime?: (value: number, time: number) => unknown
  linearRampToValueAtTime?: (value: number, time: number) => unknown
}

interface AudioNodeLike {
  connect: (destination: unknown) => unknown
}

export interface AudioContextLike {
  state: string
  currentTime: number
  destination: unknown
  resume: () => Promise<void>
  createOscillator: () => AudioNodeLike & {
    type: string
    frequency: AudioParamLike
    start: (when: number) => void
    stop: (when: number) => void
  }
  createGain: () => AudioNodeLike & { gain: AudioParamLike }
}

export interface FeedbackDeps {
  createContext?: () => AudioContextLike
  vibrate?: (pattern: number | number[]) => boolean
}

export interface Feedback {
  /** Call from a tap so mobile browsers allow sound. Safe to call repeatedly. */
  unlock: () => Promise<void>
  play: (kind: FeedbackKind) => void
}

const PEAK_GAIN = 0.25

function defaultCreateContext(): AudioContextLike {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) throw new Error('Web Audio is not supported')
  return new Ctor() as unknown as AudioContextLike
}

function defaultVibrate(): FeedbackDeps['vibrate'] {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    return navigator.vibrate.bind(navigator)
  }
  return undefined
}

export function createFeedback(deps: FeedbackDeps = {}): Feedback {
  const createContext = deps.createContext ?? defaultCreateContext
  const vibrate = 'vibrate' in deps ? deps.vibrate : defaultVibrate()
  let context: AudioContextLike | null = null
  let failed = false

  const getContext = (): AudioContextLike | null => {
    if (context || failed) return context
    try {
      context = createContext()
    } catch {
      failed = true
    }
    return context
  }

  const scheduleNote = (ctx: AudioContextLike, note: Note) => {
    const start = ctx.currentTime + note.offset
    const end = start + note.duration
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = note.type
    osc.frequency.value = note.frequency
    // Short fade in/out so notes do not click.
    gain.gain.setValueAtTime?.(0, start)
    gain.gain.linearRampToValueAtTime?.(PEAK_GAIN, start + 0.01)
    gain.gain.linearRampToValueAtTime?.(0, end)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(end + 0.02)
  }

  return {
    async unlock() {
      const ctx = getContext()
      if (ctx && ctx.state === 'suspended') {
        try {
          await ctx.resume()
        } catch {
          // Resuming can be refused; playing later will try again.
        }
      }
    },

    play(kind) {
      try {
        vibrate?.(VIBRATION_PATTERNS[kind])
      } catch {
        // Vibration is a bonus; ignore failures.
      }
      const ctx = getContext()
      if (!ctx) return
      try {
        if (ctx.state === 'suspended') void ctx.resume()
        SOUND_PATTERNS[kind].forEach((note) => scheduleNote(ctx, note))
      } catch {
        // Never let a sound problem interrupt scanning.
      }
    },
  }
}
