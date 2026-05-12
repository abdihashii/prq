import { useEffect } from 'react'

export function useNotificationBadge(count: number) {
  useEffect(() => {
    document.title = count > 0 ? `(${count}) prq` : 'prq'
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) link.href = count > 0 ? '/favicon-alert.svg' : '/favicon.svg'
  }, [count])
}
