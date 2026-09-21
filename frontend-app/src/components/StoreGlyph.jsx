import { classNames } from '../utils/format'

function BaseIcon({ className, children, viewBox = '0 0 24 24', fill = 'none' }) {
  return (
    <svg
      aria-hidden="true"
      className={classNames('shrink-0', className)}
      viewBox={viewBox}
      fill={fill}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export default function StoreGlyph({ name, className = 'size-5' }) {
  switch (name) {
    case 'menu':
      return (
        <BaseIcon className={className}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </BaseIcon>
      )
    case 'search':
      return (
        <BaseIcon className={className}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </BaseIcon>
      )
    case 'phone':
      return (
        <BaseIcon className={className}>
          <path d="M6.8 4.5h2.4l1.1 4-1.5 1.1a16 16 0 0 0 5.2 5.2l1.1-1.5 4 1.1v2.4c0 .9-.7 1.7-1.7 1.7C10.1 18.5 5.5 13.9 5.5 8.2c0-1 .8-1.7 1.3-3.7Z" />
        </BaseIcon>
      )
    case 'map':
      return (
        <BaseIcon className={className}>
          <path d="M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11Z" />
          <circle cx="12" cy="10" r="2.2" />
        </BaseIcon>
      )
    case 'receipt':
      return (
        <BaseIcon className={className}>
          <path d="M7 3h10v18l-2.2-1.6L12 21l-2.8-1.6L7 21Z" />
          <path d="M9.5 7.5h5M9.5 11.5h5M9.5 15.5H13" />
        </BaseIcon>
      )
    case 'cart':
      return (
        <BaseIcon className={className}>
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="17" cy="20" r="1.4" />
          <path d="M4 5h2l2 10h9l2-7H8" />
        </BaseIcon>
      )
    case 'user':
      return (
        <BaseIcon className={className}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 19a7 7 0 0 1 14 0" />
        </BaseIcon>
      )
    case 'sparkles':
      return (
        <BaseIcon className={className}>
          <path d="m12 2 1.7 4.3L18 8l-4.3 1.7L12 14l-1.7-4.3L6 8l4.3-1.7Z" />
          <path d="m19 14 .8 2 .9.3-.9.4-.8 2-.8-2-.9-.4.9-.3Z" />
          <path d="m5 14 .7 1.8L7.5 16l-1.8.3L5 18l-.7-1.7L2.5 16l1.8-.2Z" />
        </BaseIcon>
      )
    case 'package':
      return (
        <BaseIcon className={className}>
          <path d="m12 3 7 4v10l-7 4-7-4V7Z" />
          <path d="m12 3 7 4-7 4-7-4M12 11v10" />
        </BaseIcon>
      )
    case 'laptop':
      return (
        <BaseIcon className={className}>
          <rect x="6" y="5" width="12" height="9" rx="1.8" />
          <path d="M4 17h16l-1.4 2H5.4Z" />
        </BaseIcon>
      )
    case 'desktop':
      return (
        <BaseIcon className={className}>
          <rect x="5" y="4" width="14" height="10" rx="2" />
          <path d="M12 14v4M8 20h8" />
          <rect x="16.5" y="7" width="3" height="11" rx="1.2" />
        </BaseIcon>
      )
    case 'cpu':
      return (
        <BaseIcon className={className}>
          <rect x="7" y="7" width="10" height="10" rx="2" />
          <rect x="10" y="10" width="4" height="4" rx=".8" />
          <path d="M9 2v3M15 2v3M9 19v3M15 19v3M19 9h3M19 15h3M2 9h3M2 15h3" />
        </BaseIcon>
      )
    case 'monitor':
      return (
        <BaseIcon className={className}>
          <rect x="4" y="5" width="16" height="10" rx="2" />
          <path d="M12 15v4M8.5 20h7" />
        </BaseIcon>
      )
    case 'keyboard':
      return (
        <BaseIcon className={className}>
          <rect x="3" y="8" width="18" height="8" rx="2" />
          <path d="M6 11h.01M9 11h.01M12 11h.01M15 11h.01M18 11h.01M7 14h10" />
        </BaseIcon>
      )
    case 'mouse':
      return (
        <BaseIcon className={className}>
          <rect x="8" y="3" width="8" height="18" rx="4" />
          <path d="M12 3v5" />
        </BaseIcon>
      )
    case 'headset':
      return (
        <BaseIcon className={className}>
          <path d="M5 12a7 7 0 1 1 14 0v4a2 2 0 0 1-2 2h-2v-5h4" />
          <path d="M9 13v5H7a2 2 0 0 1-2-2v-4h4" />
        </BaseIcon>
      )
    case 'chair':
      return (
        <BaseIcon className={className}>
          <path d="M8 6a4 4 0 1 1 8 0v4H8Z" />
          <path d="M7 10v3a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3M10 15v5M14 15v5M7 20h10" />
        </BaseIcon>
      )
    case 'wrench':
      return (
        <BaseIcon className={className}>
          <path d="m21 3-5.2 5.2a4.5 4.5 0 0 1-5.8 5.8L3 21l-1-1 7-7a4.5 4.5 0 0 1 5.8-5.8L20 2" />
        </BaseIcon>
      )
    case 'truck':
      return (
        <BaseIcon className={className}>
          <path d="M4 7h10v8H4zM14 10h3l2 2v3h-5" />
          <circle cx="7.5" cy="17.5" r="1.5" />
          <circle cx="16.5" cy="17.5" r="1.5" />
        </BaseIcon>
      )
    case 'shield':
      return (
        <BaseIcon className={className}>
          <path d="M12 3 5.5 5.6v4.5c0 4 2.5 7.7 6.5 9.4 4-1.7 6.5-5.4 6.5-9.4V5.6Z" />
          <path d="m9.4 11.8 1.7 1.8 3.5-3.7" />
        </BaseIcon>
      )
    case 'message':
      return (
        <BaseIcon className={className}>
          <path d="M6 18.5 7.2 15H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10Z" />
        </BaseIcon>
      )
    case 'bolt':
      return (
        <BaseIcon className={className}>
          <path d="M13 2 6 13h4l-1 9 7-11h-4Z" />
        </BaseIcon>
      )
    case 'star':
      return (
        <BaseIcon className={className} viewBox="0 0 24 24" fill="currentColor">
          <path stroke="none" d="m12 3.3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.8 6.4 20.5l1.1-6.2L3 9.9l6.2-.9Z" />
        </BaseIcon>
      )
    case 'heart':
      return (
        <BaseIcon className={className}>
          <path d="M12 20s-7-4.4-7-10a4.2 4.2 0 0 1 7-3.1A4.2 4.2 0 0 1 19 10c0 5.6-7 10-7 10Z" />
        </BaseIcon>
      )
    case 'x':
      return (
        <BaseIcon className={className}>
          <path d="m6 6 12 12M18 6 6 18" />
        </BaseIcon>
      )
    case 'minus':
      return (
        <BaseIcon className={className}>
          <path d="M5 12h14" />
        </BaseIcon>
      )
    case 'plus':
      return (
        <BaseIcon className={className}>
          <path d="M12 5v14M5 12h14" />
        </BaseIcon>
      )
    case 'clock':
      return (
        <BaseIcon className={className}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 2.5" />
        </BaseIcon>
      )
    case 'chart':
      return (
        <BaseIcon className={className}>
          <path d="M4 20h16" />
          <path d="M7 17v-4M12 17V7M17 17v-7" />
        </BaseIcon>
      )
    case 'alert':
      return (
        <BaseIcon className={className}>
          <path d="M12 4 3.8 19h16.4Z" />
          <path d="M12 9v4M12 16h.01" />
        </BaseIcon>
      )
    case 'check':
      return (
        <BaseIcon className={className}>
          <path d="m5 12 4 4 10-10" />
        </BaseIcon>
      )
    case 'chevron-right':
      return (
        <BaseIcon className={className}>
          <path d="m9 6 6 6-6 6" />
        </BaseIcon>
      )
    case 'chevron-left':
      return (
        <BaseIcon className={className}>
          <path d="m15 6-6 6 6 6" />
        </BaseIcon>
      )
    case 'settings':
      return (
        <BaseIcon className={className}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9-.1 7.6 7.6 0 0 1-1.6.7 1.7 1.7 0 0 0-1.2 1.6V23H9.1v-.4a1.7 1.7 0 0 0-1.2-1.6 7.6 7.6 0 0 1-1.6-.7 1.7 1.7 0 0 0-1.9.1l-.2.1-2-3.4.1-.1a1.7 1.7 0 0 0 .3-1.9 7.6 7.6 0 0 1-.3-1.7A1.7 1.7 0 0 0 1 11.8h-.3V8.2H1a1.7 1.7 0 0 0 1.6-1.3c.1-.6.2-1.1.5-1.7a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 1.9.1c.5-.3 1-.5 1.6-.7A1.7 1.7 0 0 0 9.6 0h4.8a1.7 1.7 0 0 0 1.2 1.6c.6.2 1.1.4 1.6.7a1.7 1.7 0 0 0 1.9-.1l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9c.2.5.4 1.1.5 1.7A1.7 1.7 0 0 0 23 8.2h.3v3.6H23a1.7 1.7 0 0 0-1.6 1.3c-.1.6-.2 1.2-.5 1.9Z" />
        </BaseIcon>
      )
    case 'edit':
      return (
        <BaseIcon className={className}>
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
          <path d="m14 7 3 3" />
        </BaseIcon>
      )
    case 'trash':
      return (
        <BaseIcon className={className}>
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" />
          <path d="M7 7l1 14h8l1-14" />
          <path d="M10 11v6M14 11v6" />
        </BaseIcon>
      )
    case 'image':
      return (
        <BaseIcon className={className}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m4 16 4-4 3 3 2-2 7 6" />
        </BaseIcon>
      )
    case 'cloud-upload':
      return (
        <BaseIcon className={className}>
          <path d="M7 18a4 4 0 0 1 .6-7.9A5.5 5.5 0 0 1 18 11.5 3.5 3.5 0 0 1 17.5 18H15" />
          <path d="M12 19V11" />
          <path d="m9 14 3-3 3 3" />
        </BaseIcon>
      )
    case 'close':
      return (
        <BaseIcon className={className}>
          <path d="m6 6 12 12M18 6 6 18" />
        </BaseIcon>
      )
    case 'logout':
      return (
        <BaseIcon className={className}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </BaseIcon>
      )
    default:
      return (
        <BaseIcon className={className}>
          <circle cx="12" cy="12" r="8" />
        </BaseIcon>
      )
  }
}
