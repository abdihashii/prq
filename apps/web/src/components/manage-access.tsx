import type { Installation } from '@prq/shared'
import type { ManageAccessTarget } from '@/lib/manage-access/manage-access'
import { manageAccessTargets } from '@/lib/manage-access/manage-access'

interface ManageAccessProps {
  installations: Installation[]
  repoCount: number
}

export function ManageAccess({ installations, repoCount }: ManageAccessProps) {
  const targets = manageAccessTargets(installations)
  return (
    <div className="text-muted-foreground space-y-1 text-xs">
      <p>
        prq can access {repoCount}
        {repoCount === 1 ? ' repo' : ' repos'}.
      </p>
      {targets.length === 1 ? (
        <ManageAccessLink target={targets[0]} />
      ) : (
        <ul className="space-y-0.5">
          {targets.map(target => (
            <li key={target.url}>
              <ManageAccessLink target={target} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ManageAccessLink({ target }: { target: ManageAccessTarget }) {
  return (
    <a
      href={target.url}
      target="_blank"
      rel="noreferrer"
      className="text-foreground underline underline-offset-2 hover:no-underline"
    >
      {target.label}
    </a>
  )
}
