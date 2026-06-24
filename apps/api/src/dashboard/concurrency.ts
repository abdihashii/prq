/**
 * Maps over `values` running at most `concurrency` tasks at once, preserving
 * input order in the returned results. Used to bound fan-out of outbound work
 * (GitHub REST calls, reconciliation) so a single user cannot trigger an
 * unbounded burst of concurrent requests.
 *
 * @param values Items to process.
 * @param concurrency Maximum number of tasks running simultaneously.
 * @param task Async work for one item; receives the item and its index.
 * @returns Results in the same order as `values`.
 */
export async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  task: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      const value = values[index]
      if (value !== undefined) results[index] = await task(value, index)
    }
  })
  await Promise.all(workers)
  return results
}
