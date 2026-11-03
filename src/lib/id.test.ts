import { newId } from './id'

describe('newId', () => {
  it('returns unique non-empty ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()))
    expect(ids.size).toBe(200)
    expect([...ids].every((id) => id.length >= 8)).toBe(true)
  })

  it('works when crypto.randomUUID is unavailable (plain http on a phone)', () => {
    const original = crypto.randomUUID
    // @ts-expect-error simulate an insecure context
    crypto.randomUUID = undefined
    try {
      expect(newId().length).toBeGreaterThanOrEqual(8)
    } finally {
      crypto.randomUUID = original
    }
  })
})
