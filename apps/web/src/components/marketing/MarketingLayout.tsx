'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'

// ── Shared design tokens (marketing site) ─────────────────────
const M = {
  ink:    '#0c0a06',
  ink3:   '#6a6450',
  cream:  '#faf7f2',
  cream2: '#f0ebe0',
  rule:   '#e0d8c8',
  gold:   '#b8860b',
  white:  '#ffffff',
}

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => setMobileOpen(false), [pathname])

  return (
    <>
      {/* ── NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? 'rgba(250,247,242,.94)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? `1px solid ${M.rule}` : 'none',
        transition: 'all .2s',
        padding: '0 24px',
      }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto', height: '68px', display: 'flex', alignItems: 'center', gap: '40px' }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: M.gold }}>
              <path d="M10 2L3 6v8l7 4 7-4V6L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M10 2v12M3 6l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontFamily: 'Instrument Serif, Georgia, serif', fontSize: '20px', color: M.ink }}>
              StitchBook
            </span>
          </Link>

          {/* Desktop nav */}
          <div style={{ display: 'flex', gap: '32px', flex: 1 }} className="hide-mobile">
            {[
              { href: '/features', label: 'Features'     },
              { href: '/landing#how', label: 'How it works' },
              { href: '/pricing',  label: 'Pricing'      },
              { href: '/about',    label: 'About'        },
              { href: '/changelog',label: 'Changelog'    },
            ].map(({ href, label }) => (
              <Link key={href} href={href as Route} style={{
                fontSize: '14px',
                color: pathname.startsWith(href.split('#')[0]!) && href !== '/landing#how' ? M.ink : M.ink3,
                textDecoration: 'none',
                transition: 'color .15s',
                fontFamily: 'Geist, sans-serif',
              }}>
                {label}
              </Link>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
            <Link href="/login" className="hide-mobile" style={{ fontSize: '14px', color: M.ink3, padding: '10px 16px', textDecoration: 'none', fontFamily: 'Geist, sans-serif' }}>
              Sign in
            </Link>
            <Link href="/register" style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              fontSize: '14px', fontWeight: 500, padding: '10px 20px',
              background: M.ink, color: M.cream, borderRadius: '6px',
              textDecoration: 'none', fontFamily: 'Geist, sans-serif',
              transition: 'opacity .15s',
            }}>
              Start free
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </Link>

            {/* Mobile hamburger */}
            <button type="button"
              onClick={() => setMobileOpen(v => !v)}
              className="show-mobile"
              style={{ padding: '8px', background: 'transparent', border: `1px solid ${M.rule}`, borderRadius: '6px', cursor: 'pointer' }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                {mobileOpen ? (
                  <path d="M4 4l10 10M14 4L4 14" stroke={M.ink} strokeWidth="1.5" strokeLinecap="round"/>
                ) : (
                  <>
                    <path d="M3 5h12M3 9h12M3 13h12" stroke={M.ink} strokeWidth="1.5" strokeLinecap="round"/>
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div style={{
            background: M.white, borderTop: `1px solid ${M.rule}`,
            padding: '16px 24px',
          }}>
            {[
              { href: '/features', label: 'Features' },
              { href: '/landing#how', label: 'How it works' },
              { href: '/pricing',  label: 'Pricing' },
              { href: '/about',    label: 'About' },
              { href: '/login',    label: 'Sign in' },
            ].map(({ href, label }) => (
              <Link key={href} href={href as Route} style={{ display: 'block', padding: '12px 0', fontSize: '15px', color: M.ink3, textDecoration: 'none', borderBottom: `1px solid ${M.rule}` }}>
                {label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* ── PAGE CONTENT ── */}
      <main style={{ paddingTop: '68px' }}>
        {children}
      </main>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#080806', paddingTop: '64px', paddingBottom: '40px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '48px', marginBottom: '48px' }}>
            {/* Brand */}
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ color: M.gold }}>
                  <path d="M10 2L3 6v8l7 4 7-4V6L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M10 2v12M3 6l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontFamily: 'Instrument Serif, Georgia, serif', fontSize: '18px', color: 'rgba(240,235,224,.6)' }}>StitchBook</span>
              </div>
              <p style={{ fontSize: '13px', color: 'rgba(240,235,224,.3)', lineHeight: '1.7', maxWidth: '280px', fontFamily: 'Geist, sans-serif' }}>
                The complete tailoring intelligence platform. Offline-first, multi-language, built for every tailor — from solo to atelier.
              </p>
            </div>

            {[
              { title: 'Product', links: [{ href: '/features', label: 'Features' }, { href: '/pricing', label: 'Pricing' }, { href: '/changelog', label: 'Changelog' }, { href: '/roadmap', label: 'Roadmap' }] },
              { title: 'Resources', links: [{ href: '/docs', label: 'Documentation' }, { href: '/api', label: 'API reference' }, { href: '/guides', label: 'Tailor guides' }] },
              { title: 'Company', links: [{ href: '/about', label: 'About' }, { href: '/privacy', label: 'Privacy' }, { href: '/terms', label: 'Terms' }, { href: '/security', label: 'Security' }] },
            ].map(col => (
              <div key={col.title}>
                <p style={{ fontFamily: 'Geist Mono, monospace', fontSize: '10px', letterSpacing: '.25em', textTransform: 'uppercase', color: 'rgba(240,235,224,.3)', marginBottom: '16px' }}>
                  {col.title}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {col.links.map(l => (
                    <Link key={l.href} href={l.href as Route} style={{ fontSize: '13px', color: 'rgba(240,235,224,.45)', textDecoration: 'none', fontFamily: 'Geist, sans-serif' }}>
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingTop: '28px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <p style={{ fontSize: '12px', color: 'rgba(240,235,224,.25)', fontFamily: 'Geist Mono, monospace' }}>
              © 2026 StitchBook · Built for tailors everywhere
            </p>
            <div style={{ display: 'flex', gap: '20px' }}>
              {['Twitter', 'Instagram', 'LinkedIn'].map(s => (
                <Link key={s} href="#" style={{ fontSize: '12px', color: 'rgba(240,235,224,.3)', textDecoration: 'none', fontFamily: 'Geist Mono, monospace' }}>
                  {s}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        @media (max-width: 700px) { .hide-mobile { display: none !important; } }
        @media (min-width: 701px) { .show-mobile { display: none !important; } }
      `}</style>
    </>
  )
}
