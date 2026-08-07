'use client'

import { Search, Bell } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function TopBar() {
  const t = useTranslations()
  const router = useRouter()
  const [search, setSearch] = useState('')

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (search.trim()) {
      router.push(`/clients?search=${encodeURIComponent(search.trim())}`)
    }
  }

  return (
    <header
      className="h-14 flex items-center gap-4 px-6 flex-shrink-0"
      style={{
        background: 'var(--color-white)',
        borderBottom: '1px solid var(--color-rule)',
      }}
    >
      {/* Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-sm">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]"
          />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full pl-9 pr-4 py-2 text-sm bg-[var(--color-bg)] border border-var(--color-rule) rounded
                       placeholder:text-[var(--color-ink-3)] focus:outline-none focus:border-[var(--color-gold)]
                       transition-colors"
          />
        </div>
      </form>

      <div className="flex-1" />

      {/* Notifications bell */}
      <button type="button"
        className="relative p-2 text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} strokeWidth={1.5} />
        {/* Unread dot */}
        <span
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
          style={{ background: 'var(--color-terracotta)' }}
        />
      </button>
    </header>
  )
}
