import { describe, expect, it } from 'vitest'
import { createDrainGate } from '../../src/main/services/drain-gate'

describe('createDrainGate', () => {
  it('shares an in-flight pass and runs one follow-up for callers arriving mid-pass', async () => {
    let calls = 0
    const gate = createDrainGate(async () => {
      calls += 1
      return calls
    })

    const [first, second] = await Promise.all([gate(), gate()])

    expect(first).toBe(1)
    expect(second).toBe(2)
    expect(calls).toBe(2)
  })

  it('recovers after a rejected pass instead of poisoning follow-ups', async () => {
    let calls = 0
    let releaseSecond: () => void = () => undefined
    const gate = createDrainGate(async () => {
      calls += 1
      if (calls === 1) throw new Error('boom')
      if (calls === 2) {
        await new Promise<void>((resolve) => {
          releaseSecond = resolve
        })
      }
      return calls
    })

    const first = gate()
    const second = gate()
    await expect(first).rejects.toThrow('boom')
    await expect(second).rejects.toThrow('boom')

    // A later caller starts a fresh pass; one arriving while it runs must get a
    // real follow-up, not the stale rejected promise from the first failure.
    const third = gate()
    // Let the deferred pass actually start (it installs the release callback).
    await Promise.resolve()
    const fourth = gate()
    releaseSecond()
    await expect(third).resolves.toBe(2)
    await expect(fourth).resolves.toBe(3)
  })
})
