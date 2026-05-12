import { describe, expect, it } from 'vitest'
import { formatNumber } from '../format-number'

describe('formatNumber', () => {
  it('renders 0 through 999 without separators', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(5)).toBe('5')
    expect(formatNumber(42)).toBe('42')
    expect(formatNumber(999)).toBe('999')
  })

  it('inserts a comma at the thousands boundary', () => {
    expect(formatNumber(1000)).toBe('1,000')
    expect(formatNumber(12345)).toBe('12,345')
    expect(formatNumber(999999)).toBe('999,999')
  })

  it('inserts multiple commas for millions and beyond', () => {
    expect(formatNumber(1000000)).toBe('1,000,000')
    expect(formatNumber(12345678)).toBe('12,345,678')
    expect(formatNumber(1234567890)).toBe('1,234,567,890')
  })

  it('renders negative numbers with a leading minus', () => {
    expect(formatNumber(-1)).toBe('-1')
    expect(formatNumber(-1234)).toBe('-1,234')
  })
})
