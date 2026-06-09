import { describe, expect, it } from 'vitest'
import { countDisplayItemPrs } from '../dashboard-display'
import { WAITING_PENDING } from '@/lib/pr-fixtures/pr-fixtures'

describe('countDisplayItemPrs', () => {
  it('counts every nested PR in a stack for dashboard badges', () => {
    expect(countDisplayItemPrs({
      kind: 'stack',
      root: {
        pr: WAITING_PENDING,
        children: [{
          pr: { ...WAITING_PENDING, id: 'PR_child' },
          children: [{
            pr: { ...WAITING_PENDING, id: 'PR_grandchild' },
          }],
        }],
      },
    })).toBe(3)
  })
})
