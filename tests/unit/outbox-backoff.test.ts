import { describe, expect, it } from 'vitest'
import {
  BACKOFF_MAX_MS,
  computeBackoffDelay
} from '../../src/main/services/outbox-backoff'

const noJitter = () => 0.5

describe('computeBackoffDelay', () => {
  it('starts at the base delay and doubles per attempt', () => {
    expect(computeBackoffDelay(1, noJitter)).toBe(2_000)
    expect(computeBackoffDelay(2, noJitter)).toBe(4_000)
    expect(computeBackoffDelay(3, noJitter)).toBe(8_000)
  })

  it('treats a zero attempt count as the first try', () => {
    expect(computeBackoffDelay(0, noJitter)).toBe(2_000)
  })

  it('caps the delay at the maximum', () => {
    expect(computeBackoffDelay(20, noJitter)).toBe(BACKOFF_MAX_MS)
  })

  it('applies symmetric jitter within bounds', () => {
    expect(computeBackoffDelay(1, () => 1)).toBe(2_400)
    expect(computeBackoffDelay(1, () => 0)).toBe(1_600)
  })
})
