import { createFeedback, SOUND_PATTERNS, VIBRATION_PATTERNS } from './feedback'

interface FakeOsc {
  type: string
  frequency: { value: number }
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

function fakeContext(state: 'running' | 'suspended' = 'running') {
  const oscillators: FakeOsc[] = []
  const ctx = {
    state,
    currentTime: 10,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = 'running'
    }),
    createOscillator: vi.fn(() => {
      const osc: FakeOsc = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      oscillators.push(osc)
      return osc
    }),
    createGain: vi.fn(() => ({
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })),
  }
  return { ctx, oscillators }
}

function setup(state: 'running' | 'suspended' = 'running') {
  const { ctx, oscillators } = fakeContext(state)
  const createContext = vi.fn(() => ctx)
  const vibrate = vi.fn(() => true)
  const feedback = createFeedback({ createContext, vibrate })
  return { feedback, ctx, oscillators, createContext, vibrate }
}

describe('createFeedback', () => {
  describe('unlock', () => {
    it('creates the audio context once and resumes it', async () => {
      const { feedback, ctx, createContext } = setup('suspended')
      await feedback.unlock()
      await feedback.unlock()
      expect(createContext).toHaveBeenCalledTimes(1)
      expect(ctx.resume).toHaveBeenCalled()
    })

    it('does not throw when Web Audio is unavailable', async () => {
      const feedback = createFeedback({
        createContext: () => {
          throw new Error('no audio')
        },
        vibrate: () => true,
      })
      await expect(feedback.unlock()).resolves.toBeUndefined()
    })
  })

  describe('play', () => {
    it('plays two rising notes for a match', () => {
      const { feedback, oscillators } = setup()
      feedback.play('match')
      expect(oscillators).toHaveLength(2)
      expect(oscillators[1].frequency.value).toBeGreaterThan(
        oscillators[0].frequency.value,
      )
    })

    it('plays one low buzz for no match', () => {
      const { feedback, oscillators } = setup()
      feedback.play('none')
      expect(oscillators).toHaveLength(1)
      expect(oscillators[0].frequency.value).toBeLessThan(250)
      expect(oscillators[0].type).toBe('sawtooth')
    })

    it('plays two identical mid notes for already scanned', () => {
      const { feedback, oscillators } = setup()
      feedback.play('already')
      expect(oscillators).toHaveLength(2)
      expect(oscillators[0].frequency.value).toBe(oscillators[1].frequency.value)
    })

    it('uses a different sound for each outcome', () => {
      const signature = (kind: 'match' | 'none' | 'already') =>
        JSON.stringify(SOUND_PATTERNS[kind])
      const all = new Set([signature('match'), signature('none'), signature('already')])
      expect(all.size).toBe(3)
    })

    it('schedules notes from the audio clock, in order', () => {
      const { feedback, oscillators } = setup()
      feedback.play('match')
      const [first, second] = oscillators
      expect(first.start).toHaveBeenCalledWith(10)
      expect(second.start.mock.calls[0][0]).toBeGreaterThan(10)
      expect(first.stop.mock.calls[0][0]).toBeGreaterThan(10)
    })

    it('creates the context on first play if unlock was never called', () => {
      const { feedback, createContext, oscillators } = setup()
      feedback.play('match')
      expect(createContext).toHaveBeenCalledTimes(1)
      expect(oscillators.length).toBeGreaterThan(0)
    })

    it('resumes a suspended context before playing', () => {
      const { feedback, ctx } = setup('suspended')
      feedback.play('match')
      expect(ctx.resume).toHaveBeenCalled()
    })
  })

  describe('vibration', () => {
    it.each(['match', 'none', 'already'] as const)(
      'vibrates with the %s pattern',
      (kind) => {
        const { feedback, vibrate } = setup()
        feedback.play(kind)
        expect(vibrate).toHaveBeenCalledWith(VIBRATION_PATTERNS[kind])
      },
    )

    it('still vibrates when audio fails', () => {
      const vibrate = vi.fn(() => true)
      const feedback = createFeedback({
        createContext: () => {
          throw new Error('no audio')
        },
        vibrate,
      })
      expect(() => feedback.play('none')).not.toThrow()
      expect(vibrate).toHaveBeenCalledWith(VIBRATION_PATTERNS.none)
    })

    it('works when vibration is unsupported', () => {
      const { ctx } = fakeContext()
      const feedback = createFeedback({
        createContext: () => ctx,
        vibrate: undefined,
      })
      expect(() => feedback.play('match')).not.toThrow()
    })
  })
})
