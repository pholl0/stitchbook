'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Users, ShoppingBag, Ruler, BarChart2,
  Package, Settings, Scissors, LogOut,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '@/stores/auth'

const navItems = [
  { href: '/dashboard', icon: BarChart2,   labelKey: 'nav.dashboard' },
  { href: '/clients',    icon: Users,       labelKey: 'nav.clients'   },
  { href: '/orders',     icon: ShoppingBag, labelKey: 'nav.orders'    },
  { href: '/inventory',  icon: Package,     labelKey: 'nav.inventory' },
  { href: '/settings',   icon: Settings,    labelKey: 'nav.settings'  },
]

export function Sidebar() {
  const pathname = usePathname()
  const t = useTranslations()
  const { shop, worker } = useAuthStore()

  return (
    <aside
      className="w-[220px] flex-shrink-0 h-full flex flex-col"
      style={{
        background: 'var(--color-ink)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo / shop name */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-2 mb-1">
          <Scissors size={16} className="text-[var(--color-gold)]" />
          <span
            className="text-[var(--color-cream)] font-semibold text-sm tracking-wide"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            StitchBook
          </span>
        </div>
        {shop && (
          <p className="text-xs text-white/40 truncate"
             style={{ fontFamily: 'var(--font-mono)' }}>
            {shop.name}
          </p>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map(({ href, icon: Icon, labelKey }) => {
          const isActive = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href as Route}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors',
                isActive
                  ? 'bg-[var(--color-gold-bg)] text-[var(--color-gold)] font-medium'
                  : 'text-white/60 hover:text-white/90 hover:bg-white/5'
              )}
            >
              <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
              <span style={{ fontFamily: isActive ? 'inherit' : 'var(--font-sans)' }}>
                {t(labelKey)}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Worker info + logout */}
      {worker && (
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ background: 'var(--color-gold-bg)', color: 'var(--color-gold)' }}
            >
              {worker.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/80 truncate">{worker.name}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider"
                 style={{ fontFamily: 'var(--font-mono)' }}>
                {worker.role}
              </p>
            </div>
          </div>
          <button type="button"
            onClick={() => useAuthStore.getState().logout()}
            className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors w-full"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      )}
    </aside>
  )
}
