import { useEffect, useState } from 'react'

/*
  Điều hướng đơn giản bằng hash (#/san-pham/12, #/don-hang?trang=2) để không cần
  thêm thư viện router và không phải cấu hình server cho các đường dẫn con.
  Hash không bắt đầu bằng "#/" (ví dụ #hero) được coi là trang chủ.
*/

function parseHash() {
  if (typeof window === 'undefined') {
    return { path: '/', segments: [], query: new URLSearchParams() }
  }

  const raw = window.location.hash.startsWith('#/') ? window.location.hash.slice(1) : '/'
  const [pathPart, queryPart = ''] = raw.split('?')
  const segments = pathPart
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })

  return {
    path: `/${segments.join('/')}`,
    segments,
    query: new URLSearchParams(queryPart),
  }
}

export function navigate(path) {
  const target = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`
  if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    return
  }
  window.location.hash = target
}

export function hrefFor(path) {
  return `#${path.startsWith('/') ? path : `/${path}`}`
}

export default function useHashRoute() {
  const [route, setRoute] = useState(parseHash)

  useEffect(() => {
    function handleChange() {
      setRoute(parseHash())
      window.scrollTo({ top: 0 })
    }

    window.addEventListener('hashchange', handleChange)
    return () => window.removeEventListener('hashchange', handleChange)
  }, [])

  return route
}
