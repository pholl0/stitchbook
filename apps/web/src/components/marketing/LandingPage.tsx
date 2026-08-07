'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { MarketingLayout } from './MarketingLayout'

// ── Design tokens ─────────────────────────────────────────────
const T = {
  ink:    '#0c0a06', ink2: '#2a2820', ink3: '#6a6450',
  cream:  '#faf7f2', cream2: '#f0ebe0', cream3: '#d8d0c0',
  white:  '#ffffff', rule: '#e0d8c8', rule2: '#ece8de',
  gold:   '#b8860b', gold2: '#c9a84c', gold3: '#8a6808', goldBg: '#fdf8ee',
  sage:   '#2d6a4f', sageBg: '#edf5f0',
  terra:  '#b5522a', terraBg: '#fdf1ec',
  navy:   '#1e3a5f', navyBg: '#edf1f7',
}

// ── Typography helpers ────────────────────────────────────────
const serif  = 'var(--font-marketing-serif), Georgia, serif'
const sans   = 'var(--font-sans), system-ui, sans-serif'
const mono   = 'var(--font-mono), monospace'

export function LandingPage() {
  const [activePersona, setActivePersona] = useState<'solo' | 'boutique' | 'atelier' | 'online'>('solo')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <MarketingLayout>
      <style>{`
        html { scroll-behavior: smooth; }
        * { box-sizing: border-box; }
        .btn-primary { background: ${T.ink}; color: ${T.cream}; border: none; padding: 13px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; font-family: ${sans}; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: opacity .15s; }
        .btn-primary:hover { opacity: .88; }
        .btn-gold { background: ${T.gold}; color: white; border: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 500; font-family: ${sans}; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: opacity .15s; }
        .btn-gold:hover { opacity: .9; }
        .btn-outline { background: transparent; color: ${T.ink3}; border: 1.5px solid ${T.rule}; padding: 12px 22px; border-radius: 6px; font-size: 14px; font-family: ${sans}; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all .15s; }
        .btn-outline:hover { border-color: ${T.ink}; color: ${T.ink}; }
        .btn-ghost { background: transparent; color: rgba(240,235,224,.6); border: 1.5px solid rgba(255,255,255,.15); padding: 14px 24px; border-radius: 8px; font-size: 15px; font-family: ${sans}; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: all .15s; }
        .btn-ghost:hover { border-color: rgba(255,255,255,.35); color: rgba(240,235,224,.85); }
        .eyebrow { font-family: ${mono}; font-size: 11px; letter-spacing: .28em; text-transform: uppercase; color: ${T.gold}; display: block; margin-bottom: 12px; }
        .img-ph { background: linear-gradient(135deg, ${T.cream2}, ${T.cream3}); display: flex; align-items: center; justify-content: center; font-family: ${mono}; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: ${T.ink3}; position: relative; overflow: hidden; }
        .img-ph::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(-45deg, transparent, transparent 20px, rgba(12,10,6,.02) 20px, rgba(12,10,6,.02) 21px); }
        .img-ph span { position: relative; z-index: 1; }
        @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr !important; } .feature-row { grid-template-columns: 1fr !important; direction: ltr !important; } }
        @media (max-width: 720px) { .grid-3 { grid-template-columns: 1fr !important; } .grid-4 { grid-template-columns: 1fr 1fr !important; } .pricing-grid { grid-template-columns: 1fr !important; } }
        @media (max-width: 480px) { .grid-4 { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* ══════════════════════════════════════
          HERO
      ══════════════════════════════════════ */}
      <section style={{ background: T.ink, padding: '120px 24px 100px', position: 'relative', overflow: 'hidden' }}>
        {/* Grid bg */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(0deg,rgba(200,168,76,.05) 0,rgba(200,168,76,.05) 1px,transparent 1px,transparent 56px),repeating-linear-gradient(90deg,rgba(200,168,76,.05) 0,rgba(200,168,76,.05) 1px,transparent 1px,transparent 56px)` }} />
        <div style={{ position: 'absolute', top: '-200px', left: '50%', transform: 'translateX(-50%)', width: '800px', height: '600px', background: 'radial-gradient(ellipse,rgba(200,168,76,.1) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: '1160px', margin: '0 auto', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'center' }} className="grid-2">
          {/* Left */}
          <div>
            <span className="eyebrow" style={{ color: T.gold2 }}>The tailoring intelligence platform</span>
            <h1 style={{ fontFamily: serif, fontSize: 'clamp(38px,6vw,72px)', lineHeight: '.96', color: T.cream, marginBottom: '24px' }}>
              Every measurement.<br />Every garment.<br />
              <em style={{ fontStyle: 'italic', color: T.gold2 }}>Perfectly recorded.</em>
            </h1>
            <p style={{ fontSize: '17px', color: 'rgba(240,235,224,.6)', lineHeight: '1.75', marginBottom: '36px', fontFamily: sans }}>
              StitchBook gives tailoring shops the tools they actually need — three-layer measurements, offline-first mobile, branded client portal, and production management built for the craft.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '40px' }}>
              <Link href="/register" className="btn-gold">
                Start free — 14-day trial
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </Link>
              <Link href="/landing#how" className="btn-ghost">See how it works</Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex' }}>
                {['#b8860b','#2d6a4f','#1e3a5f','#b5522a'].map((c, i) => (
                  <div key={i} style={{ width: '32px', height: '32px', borderRadius: '50%', background: c, border: `2px solid ${T.ink}`, marginLeft: i === 0 ? 0 : '-8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: serif, fontSize: '13px', color: 'white', fontWeight: 600 }}>
                    {['A','O','F','K'][i]}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '13px', color: 'rgba(240,235,224,.45)', fontFamily: sans }}>
                <strong style={{ color: 'rgba(240,235,224,.8)' }}>2,400+ tailors</strong> in 38 countries
              </p>
            </div>
          </div>

          {/* Right — dashboard mockup */}
          <div style={{ position: 'relative' }}>
            <div style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.4), 0 0 0 1px rgba(200,168,76,.15)', aspectRatio: '4/3', background: '#1a1a16' }}>
              <div style={{ background: 'rgba(255,255,255,.05)', height: '36px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                {['#ef4444','#f59e0b','#10b981'].map(c => <div key={c} style={{ width: '10px', height: '10px', borderRadius: '50%', background: c }} />)}
              </div>
              <div className="img-ph" style={{ height: 'calc(100% - 36px)', background: 'linear-gradient(135deg,#1a1a16,#252520)' }}>
                <span style={{ color: 'rgba(200,168,76,.3)' }}>Dashboard Screenshot</span>
              </div>
            </div>
            {/* Floating notification card */}
            <div style={{ position: 'absolute', bottom: '-16px', left: '-24px', background: 'white', borderRadius: '12px', padding: '14px 18px', boxShadow: '0 12px 48px rgba(0,0,0,.2)', border: `1px solid ${T.rule}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: T.sageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📐</div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: T.ink, marginBottom: '2px' }}>Session saved</div>
                <div style={{ fontFamily: mono, fontSize: '10px', color: T.ink3 }}>Chest: 96 cm · Waist: 82 cm</div>
              </div>
            </div>
            {/* Offline badge */}
            <div style={{ position: 'absolute', top: '-16px', right: '-16px', background: T.gold, borderRadius: '10px', padding: '10px 14px', boxShadow: '0 8px 32px rgba(184,134,11,.4)', color: 'white' }}>
              <div style={{ fontFamily: mono, fontSize: '9px', letterSpacing: '.15em', textTransform: 'uppercase', opacity: .8, marginBottom: '2px' }}>Offline sync</div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>✓ 12 queued</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          LOGOS STRIP
      ══════════════════════════════════════ */}
      <section style={{ background: T.white, padding: '32px 24px', borderBottom: `1px solid ${T.rule2}` }}>
        <p style={{ fontFamily: mono, fontSize: '10px', letterSpacing: '.25em', textTransform: 'uppercase', color: T.ink3, textAlign: 'center', marginBottom: '20px' }}>
          Trusted by shops making for
        </p>
        <div style={{ maxWidth: '1160px', margin: '0 auto', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '32px 56px' }}>
          {['Lagos Fashion Week','House of Couture','Bespoke Bombay','Kente & Crown','Al Haramain Tailors','Mayfair Made'].map(s => (
            <span key={s} style={{ fontFamily: serif, fontSize: '16px', color: T.cream3 }}>{s}</span>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          THREE LAYERS
      ══════════════════════════════════════ */}
      <section style={{ background: T.white, padding: '100px 24px' }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 64px' }}>
            <span className="eyebrow">The measurement engine</span>
            <h2 style={{ fontFamily: serif, fontSize: 'clamp(28px,4vw,46px)', lineHeight: 1.1, marginBottom: '16px' }}>
              Three layers.<br /><em style={{ color: T.gold }}>One perfect garment.</em>
            </h2>
            <p style={{ fontSize: '16px', color: T.ink3, lineHeight: 1.75, fontFamily: sans }}>
              Most apps store a single number. StitchBook records three distinct layers — so you always know what you cut, why you cut it, and how to reproduce it.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '2px', background: T.rule2, border: `1px solid ${T.rule2}`, borderRadius: '16px', overflow: 'hidden' }} className="grid-3">
            {[
              { num: 'L1', name: 'Body', title: 'Raw body measurement', desc: 'The actual measurement of the body as it is — no assumptions. Immutable once recorded. The permanent record of your client\'s body at this point in time.', example: 'Chest body: 96.0 cm', accent: T.ink, exBg: T.cream2, exColor: T.ink2 },
              { num: 'L2', name: 'Ease', title: 'Ease allowance', desc: 'The breathing room added to the body measurement. Auto-populated from template defaults with full manual override. Varies by garment type and client preference.', example: 'Chest ease: +6.0 cm (regular)', accent: T.sage, exBg: T.sageBg, exColor: T.sage },
              { num: 'L3', name: 'Cut', title: 'Cut measurement', desc: 'The final value on the fabric. Automatically calculated from L1 + L2, plus any posture corrections. The master tailor always has final say before it goes to the table.', example: 'Chest cut: 104.5 cm', accent: T.gold, exBg: T.goldBg, exColor: T.gold3 },
            ].map(layer => (
              <div key={layer.num} style={{ background: T.white, padding: '36px 32px', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: layer.accent }} />
                <div style={{ fontFamily: serif, fontSize: '48px', color: T.rule2, lineHeight: 1, marginBottom: '16px' }}>{layer.num}</div>
                <div style={{ fontFamily: mono, fontSize: '10px', letterSpacing: '.25em', textTransform: 'uppercase', color: layer.accent, marginBottom: '8px' }}>{layer.name}</div>
                <h3 style={{ fontFamily: serif, fontSize: '22px', marginBottom: '10px', color: T.ink }}>{layer.title}</h3>
                <p style={{ fontSize: '14px', color: T.ink3, lineHeight: '1.7', marginBottom: '16px', fontFamily: sans }}>{layer.desc}</p>
                <span style={{ display: 'inline-block', fontFamily: mono, fontSize: '11px', padding: '4px 10px', borderRadius: '4px', background: layer.exBg, color: layer.exColor }}>{layer.example}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FEATURES — 4 detailed rows
      ══════════════════════════════════════ */}
      <section id="features" style={{ background: T.cream2, padding: '100px 24px' }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div style={{ marginBottom: '64px' }}>
            <span className="eyebrow">What you get</span>
            <h2 style={{ fontFamily: serif, fontSize: 'clamp(28px,4vw,46px)', lineHeight: 1.1 }}>
              Everything a tailoring shop<br /><em style={{ color: T.gold }}>actually needs</em>
            </h2>
          </div>

          {[
            {
              icon: '📱', title: 'Offline-first mobile app', reverse: false,
              desc: 'Take measurements with no internet. Save to your phone, sync when you\'re back online. The app works in a basement, a village, a market — wherever your clients are.',
              bullets: ['Works completely offline — saves locally using SQLite','Syncs automatically when connectivity returns','Interactive body diagram — tap a point, type a number','WatermelonDB CRDT sync — conflicts resolved automatically'],
              imgLabel: 'Mobile measurement entry',
            },
            {
              icon: '🌐', title: 'Branded client portal', reverse: true,
              desc: 'Every client gets a private link to view their measurements, track orders, and browse their wardrobe. Your logo, your colours. No StitchBook branding unless you want it.',
              bullets: ['Unique portal link per client — no app or login required','Live order status with pipeline progress bar','Guided self-measurement flow in 12 languages','Delivered garment photo gallery'],
              imgLabel: 'Client portal — order tracking',
            },
            {
              icon: '🗂️', title: 'Production management', reverse: false,
              desc: 'A kanban board built for tailors — not project managers. See every order across every stage at a glance. Assign workers, track fitting sessions, record payments.',
              bullets: ['7-column production pipeline from booked to delivered','Overdue order highlighting and priority flags','Fitting session records with before/after photos','Role-based worker access — tailors only see their orders'],
              imgLabel: 'Production kanban board',
            },
            {
              icon: '📈', title: 'Measurement intelligence', reverse: true,
              desc: 'Every session is permanent. Compare any two sessions side by side. Automatically detect large changes. Track measurements over years. The history is forever.',
              bullets: ['Sessions are immutable once synced — never accidentally overwritten','Side-by-side diff with change callouts','Freshness alerts when measurements are too old','D3-powered multi-line measurement timeline'],
              imgLabel: 'Measurement history timeline',
            },
          ].map((f, i) => (
            <div key={i} className="feature-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'center', marginBottom: i < 3 ? '100px' : 0, direction: f.reverse ? 'rtl' : 'ltr' }}>
              <div style={{ direction: 'ltr' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: T.goldBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', fontSize: '20px' }}>{f.icon}</div>
                <h3 style={{ fontFamily: serif, fontSize: 'clamp(22px,3vw,32px)', marginBottom: '14px', color: T.ink }}>{f.title}</h3>
                <p style={{ fontSize: '15px', color: T.ink3, lineHeight: '1.75', marginBottom: '20px', fontFamily: sans }}>{f.desc}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {f.bullets.map((b, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: T.ink3, fontFamily: sans }}>
                      <span style={{ color: T.gold, flexShrink: 0, marginTop: '1px' }}>—</span>
                      {b}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ direction: 'ltr', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 12px 48px rgba(12,10,6,.12)', aspectRatio: '4/3' }}>
                <div className="img-ph" style={{ width: '100%', height: '100%' }}><span>{f.imgLabel}</span></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════ */}
      <section id="how" style={{ background: T.ink, padding: '100px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(90deg,rgba(200,168,76,.03) 0,rgba(200,168,76,.03) 1px,transparent 1px,transparent 80px)` }} />
        <div style={{ maxWidth: '1160px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <span className="eyebrow" style={{ color: T.gold2 }}>User flow</span>
            <h2 style={{ fontFamily: serif, fontSize: 'clamp(28px,4vw,46px)', color: T.cream, lineHeight: 1.1, marginBottom: '12px' }}>
              How a garment moves through<br /><em style={{ fontStyle: 'italic', color: T.gold2 }}>StitchBook</em>
            </h2>
            <p style={{ fontSize: '16px', color: 'rgba(240,235,224,.45)', maxWidth: '480px', margin: '0 auto', fontFamily: sans }}>
              From first appointment to final delivery — every step tracked, every measurement permanent.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '2px', background: 'rgba(255,255,255,.06)', borderRadius: '16px', overflow: 'hidden' }} className="grid-4">
            {[
              { num: '01', icon: '👤', step: 'Client arrives', colour: T.gold2, desc: 'Create a profile in seconds. Name and phone is all you need. Portal token generated automatically.' },
              { num: '02', icon: '📐', step: 'Take measurements', colour: T.sage, desc: 'Tap points on the body diagram. Large numeric inputs for L1 body values. Ease defaults fill from template.' },
              { num: '03', icon: '✂️', step: 'Create order & assign', colour: T.terra, desc: 'One tap to create an order. Assign to a cutter. Due date set. Fabric yardage calculated instantly.' },
              { num: '04', icon: '🧵', step: 'Track to delivery', colour: T.navy, desc: 'Order moves through the kanban. Fitting sessions recorded. Client notified when ready. Wardrobe updated.' },
            ].map(s => (
              <div key={s.num} style={{ background: 'rgba(255,255,255,.03)', padding: '32px 28px', borderTop: `2px solid ${s.colour}`, transition: 'background .2s' }}>
                <div style={{ fontFamily: serif, fontSize: '40px', color: 'rgba(200,168,76,.15)', lineHeight: 1, marginBottom: '16px' }}>{s.num}</div>
                <div style={{ fontSize: '24px', marginBottom: '12px' }}>{s.icon}</div>
                <h4 style={{ fontFamily: serif, fontSize: '18px', color: T.cream, marginBottom: '8px' }}>{s.step}</h4>
                <p style={{ fontSize: '13px', color: 'rgba(240,235,224,.45)', lineHeight: 1.65, fontFamily: sans }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          PERSONAS
      ══════════════════════════════════════ */}
      <section id="personas" style={{ background: T.white, padding: '100px 24px' }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '24px', marginBottom: '48px' }}>
            <div>
              <span className="eyebrow">Who it's for</span>
              <h2 style={{ fontFamily: serif, fontSize: 'clamp(26px,3.5vw,44px)', lineHeight: 1.1 }}>
                Built for <em style={{ color: T.gold }}>every kind</em><br />of tailor
              </h2>
            </div>
            <div style={{ display: 'flex', gap: '2px', background: T.rule2, borderRadius: '8px', padding: '3px' }}>
              {[
                { id: 'solo', label: 'Solo tailor' },
                { id: 'boutique', label: 'Boutique' },
                { id: 'atelier', label: 'Bespoke' },
                { id: 'online', label: 'Online' },
              ].map(p => (
                <button type="button"
                  key={p.id}
                  onClick={() => setActivePersona(p.id as any)}
                  style={{
                    padding: '8px 16px', borderRadius: '6px', fontFamily: sans, fontSize: '13px',
                    border: 'none', cursor: 'pointer',
                    background: activePersona === p.id ? T.white : 'transparent',
                    color: activePersona === p.id ? T.ink : T.ink3,
                    boxShadow: activePersona === p.id ? '0 1px 3px rgba(12,10,6,.08)' : 'none',
                    transition: 'all .15s',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Persona content */}
          {{
            solo: { badge: 'Solo tailor · 20–80 clients', badgeStyle: { background: T.goldBg, color: T.gold3 }, quote: 'I used to keep everything in a notebook. A client would come back after two years and I\'d be scrambling. Now it\'s all here, offline, searchable in two seconds.', name: 'Amara K.', role: 'Master Tailor · Lagos, Nigeria', bullets: ['Works without internet — critical in areas with unreliable connectivity', 'Home screen shows who\'s due today — no navigation needed', 'Save measurements in under 90 seconds for returning clients', 'Free tier — 50 clients, unlimited measurement sessions'], imgLabel: 'Solo tailor using mobile app' },
            boutique: { badge: 'Boutique owner · 3–8 workers', badgeStyle: { background: T.sageBg, color: T.sage }, quote: 'I needed to stop being the bottleneck. My cutters have their own accounts now, they see only the orders assigned to them. I see everything. Finally.', name: 'Fatima O.', role: 'Boutique Owner · Accra, Ghana', bullets: ['Role-based access — tailors only see their own assigned orders', 'Kanban production board visible to the whole shop', 'Low fabric stock alerts linked directly to supplier WhatsApp', 'Revenue analytics, rework rate, and repeat client tracking'], imgLabel: 'Boutique production board' },
            atelier: { badge: 'Bespoke atelier · High-value commissions', badgeStyle: { background: T.terraBg, color: T.terra }, quote: 'We had a client who ordered a suit in 2019, then commissioned another in 2023. His body had changed significantly. StitchBook showed us exactly how — and we had the history to prove why.', name: 'Frederick A.', role: 'Bespoke Tailor · London, UK', bullets: ['Immutable session history — permanent record of every fitting', 'Fitting session records with structured fit issues and before/after photos', 'Posture profile captures swayback, shoulder asymmetry, and more', 'Pinned sessions for canonical reference garments'], imgLabel: 'Bespoke fitting session records' },
            online: { badge: 'Online tailor · Remote clients globally', badgeStyle: { background: T.navyBg, color: T.navy }, quote: 'My clients are in Dubai, Toronto, and Lagos. I used to ask them to email measurements and half the time they were wrong. Now I send a link and they follow guided steps. It\'s transformed how I work.', name: 'Nkechi D.', role: 'Online Tailor · Remote', bullets: ['Send guided self-measurement links — no appointment needed', 'Clients submit measurements + photos for tailor review', 'Clarification request loop — flag specific measurements to re-check', '12 languages, RTL support, timezone-aware notifications'], imgLabel: 'Self-measurement guided flow' },
          }[activePersona] && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', alignItems: 'center' }} className="grid-2">
              <div>
                <span style={{ display: 'inline-block', fontFamily: mono, fontSize: '10px', letterSpacing: '.1em', padding: '3px 10px', borderRadius: '100px', marginBottom: '24px', ...(activePersona === 'solo' ? { background: T.goldBg, color: T.gold3 } : activePersona === 'boutique' ? { background: T.sageBg, color: T.sage } : activePersona === 'atelier' ? { background: T.terraBg, color: T.terra } : { background: T.navyBg, color: T.navy }) }}>
                  {activePersona === 'solo' ? 'Solo tailor · 20–80 clients' : activePersona === 'boutique' ? 'Boutique owner · 3–8 workers' : activePersona === 'atelier' ? 'Bespoke atelier · High-value commissions' : 'Online tailor · Remote clients globally'}
                </span>
                <p style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 'clamp(17px,2.5vw,24px)', color: T.ink, lineHeight: 1.55, marginBottom: '20px' }}>
                  "{activePersona === 'solo' ? 'I used to keep everything in a notebook. A client would come back after two years and I\'d be scrambling. Now it\'s all here, offline, searchable in two seconds.' : activePersona === 'boutique' ? 'I needed to stop being the bottleneck. My cutters have their own accounts now, they see only the orders assigned to them. I see everything. Finally.' : activePersona === 'atelier' ? 'We had a client who ordered a suit in 2019, then commissioned another in 2023. His body had changed significantly. StitchBook showed us exactly how.' : 'My clients are in Dubai, Toronto, and Lagos. I used to ask them to email measurements and half the time they were wrong. Now I send a link and they follow guided steps.'}"
                </p>
                <p style={{ fontFamily: mono, fontSize: '11px', letterSpacing: '.2em', textTransform: 'uppercase', color: T.ink3, marginBottom: '28px' }}>
                  {activePersona === 'solo' ? 'Amara K. · Master Tailor · Lagos' : activePersona === 'boutique' ? 'Fatima O. · Boutique Owner · Accra' : activePersona === 'atelier' ? 'Frederick A. · Bespoke Tailor · London' : 'Nkechi D. · Online Tailor · Remote'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(activePersona === 'solo' ? ['Works without internet — critical in areas with unreliable connectivity', 'Home screen shows who\'s due today — no navigation needed', 'Save measurements in under 90 seconds for returning clients', 'Free tier — 50 clients, unlimited measurement sessions'] :
                    activePersona === 'boutique' ? ['Role-based access — tailors only see their own assigned orders', 'Kanban production board visible to the whole shop', 'Low fabric stock alerts linked to supplier WhatsApp', 'Revenue analytics, rework rate, and repeat client tracking'] :
                    activePersona === 'atelier' ? ['Immutable session history — permanent record of every fitting', 'Fitting sessions with structured fit issues and before/after photos', 'Posture profile: swayback, shoulder asymmetry, and more', 'Pinned sessions for canonical reference garments'] :
                    ['Send guided self-measurement links — no appointment needed', 'Clients submit measurements + photos for tailor review', 'Clarification request loop — flag specific measurements', '12 languages, RTL support, timezone-aware notifications']
                  ).map((b, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: T.ink3, fontFamily: sans }}>
                      <span style={{ color: T.gold, flexShrink: 0 }}>—</span>{b}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 12px 48px rgba(12,10,6,.1)', aspectRatio: '4/3' }}>
                <div className="img-ph" style={{ width: '100%', height: '100%' }}>
                  <span>{activePersona === 'solo' ? 'Solo tailor using mobile app' : activePersona === 'boutique' ? 'Boutique production board' : activePersona === 'atelier' ? 'Bespoke fitting session records' : 'Self-measurement guided flow'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════
          SCREENSHOT GALLERY
      ══════════════════════════════════════ */}
      <section style={{ background: T.cream2, padding: '80px 24px' }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <span className="eyebrow">The product</span>
            <h2 style={{ fontFamily: serif, fontSize: 'clamp(26px,3.5vw,44px)', lineHeight: 1.1 }}>
              See StitchBook <em style={{ color: T.gold }}>in action</em>
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gridTemplateRows: '240px 200px', gap: '12px' }} className="gallery-grid">
            {[
              { cols: '1/6', rows: '1/2', label: 'Client profile — measurement history' },
              { cols: '6/9', rows: '1/2', label: 'Body diagram — tap to measure' },
              { cols: '9/13', rows: '1/3', label: 'Production kanban board' },
              { cols: '1/4', rows: '2/3', label: 'Session diff comparison' },
              { cols: '4/6', rows: '2/3', label: 'Client portal — wardrobe' },
              { cols: '6/9', rows: '2/3', label: 'Analytics dashboard' },
            ].map((item, i) => (
              <div key={i} style={{ gridColumn: item.cols, gridRow: item.rows, borderRadius: '12px', overflow: 'hidden' }}>
                <div className="img-ph" style={{ width: '100%', height: '100%' }}><span>{item.label}</span></div>
              </div>
            ))}
          </div>

          <style>{`
            @media (max-width: 700px) {
              .gallery-grid { grid-template-columns: 1fr 1fr !important; grid-template-rows: auto !important; }
              .gallery-grid > div { grid-column: auto !important; grid-row: auto !important; height: 160px; }
            }
          `}</style>
        </div>
      </section>

      {/* ══════════════════════════════════════
          TESTIMONIALS
      ══════════════════════════════════════ */}
      <section style={{ background: T.white, padding: '80px 24px 0' }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span className="eyebrow">Tailors love it</span>
            <h2 style={{ fontFamily: serif, fontSize: 'clamp(26px,3.5vw,44px)', lineHeight: 1.1 }}>
              From the tailors <em style={{ color: T.gold }}>themselves</em>
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '20px' }} className="grid-3">
            {[
              { stars: 5, text: 'The three-layer system changed how I think about measurements. I used to eyeball the ease. Now it\'s documented, repeatable, and explainable to any cutter.', name: 'Kofi A.', role: 'Master Tailor · Kumasi', colour: T.gold },
              { stars: 5, text: 'My clients abroad can finally send measurements without me worrying if they measured correctly. The guided flow is foolproof in a way nothing else I\'ve tried has been.', name: 'Sadia M.', role: 'Online Tailor · London / Dhaka', colour: T.sage },
              { stars: 5, text: 'I run a six-person boutique. Assigning orders to my cutters and knowing they can\'t see each other\'s client data was the feature I didn\'t know I needed most.', name: 'Biola O.', role: 'Boutique Owner · Lagos', colour: T.navy },
            ].map((t, i) => (
              <div key={i} style={{ background: T.white, border: `1px solid ${T.rule}`, borderRadius: '12px', padding: '28px' }}>
                <div style={{ color: T.gold, fontSize: '14px', letterSpacing: '2px', marginBottom: '14px' }}>{'★'.repeat(t.stars)}</div>
                <p style={{ fontFamily: serif, fontStyle: 'italic', fontSize: '16px', color: T.ink, lineHeight: 1.65, marginBottom: '20px' }}>"{t.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: t.colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: serif, fontSize: '14px', fontWeight: 600, color: 'white', flexShrink: 0 }}>
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: T.ink, fontFamily: sans }}>{t.name}</div>
                    <div style={{ fontFamily: mono, fontSize: '10px', letterSpacing: '.1em', color: T.ink3 }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          PRICING
      ══════════════════════════════════════ */}
      <section id="pricing" style={{ background: T.white, padding: '100px 24px' }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: '560px', margin: '0 auto 56px' }}>
            <span className="eyebrow">Pricing</span>
            <h2 style={{ fontFamily: serif, fontSize: 'clamp(26px,3.5vw,44px)', lineHeight: 1.1, marginBottom: '16px' }}>
              Honest pricing.<br /><em style={{ color: T.gold }}>No surprises.</em>
            </h2>
            <p style={{ fontSize: '15px', color: T.ink3, fontFamily: sans }}>No per-client fees. No feature gating on measurements. Start free, pay when you grow.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '2px', background: T.rule2, borderRadius: '16px', overflow: 'hidden' }} className="pricing-grid">
            {[
              { tier: 'Solo', price: 'Free', period: 'Always · no card', popular: false, desc: 'For independent tailors just getting started. Full measurement engine, offline mobile, 50 clients.', features: ['Up to 50 clients','Unlimited measurement sessions','Three-layer measurement engine','iOS + Android offline app','7 system garment templates','PDF measurement cards'], cta: 'Get started free', ctaHref: '/register', dark: false },
              { tier: 'Boutique', price: '$29', period: '/month · billed annually', popular: true, desc: 'For shops with workers and clients who expect more. The complete platform, unlocked.', features: ['Unlimited clients','Up to 5 workers','Client portal with branding','Self-measurement invites','WhatsApp + SMS notifications','Analytics & revenue tracking','Fabric inventory management','Fitting session records'], cta: 'Start 14-day trial', ctaHref: '/register?plan=boutique', dark: true },
              { tier: 'Atelier', price: '$89', period: '/month · billed annually', popular: false, desc: 'For premium shops — unlimited workers, custom domain, API access, white-label.', features: ['Everything in Boutique','Unlimited workers','Custom domain for portal','White-label branding','Public REST API access','Multi-branch support','Custom template builder','Priority onboarding call'], cta: 'Start 14-day trial', ctaHref: '/register?plan=atelier', dark: false },
            ].map(p => (
              <div key={p.tier} style={{ background: p.dark ? T.ink : T.white, padding: '36px 32px', position: 'relative' }}>
                {p.popular && (
                  <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', background: T.gold, color: 'white', fontFamily: mono, fontSize: '9px', letterSpacing: '.2em', textTransform: 'uppercase', padding: '4px 14px', borderRadius: '0 0 6px 6px' }}>
                    Most popular
                  </div>
                )}
                <div style={{ fontFamily: mono, fontSize: '10px', letterSpacing: '.25em', textTransform: 'uppercase', color: p.dark ? T.gold2 : T.ink3, marginBottom: '8px' }}>{p.tier}</div>
                <div style={{ fontFamily: serif, fontSize: '44px', lineHeight: 1, color: p.dark ? T.cream : T.ink, marginBottom: '4px' }}>{p.price}</div>
                <div style={{ fontSize: '13px', color: p.dark ? 'rgba(240,235,224,.45)' : T.ink3, marginBottom: '20px', fontFamily: sans }}>{p.period}</div>
                <p style={{ fontSize: '14px', color: p.dark ? 'rgba(240,235,224,.6)' : T.ink3, lineHeight: '1.65', marginBottom: '24px', fontFamily: sans }}>{p.desc}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
                  {p.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: p.dark ? 'rgba(240,235,224,.65)' : T.ink3, fontFamily: sans }}>
                      <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: p.dark ? 'rgba(200,168,76,.2)' : T.sageBg, color: p.dark ? T.gold2 : T.sage, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', flexShrink: 0, marginTop: '1px' }}>✓</span>
                      {f}
                    </div>
                  ))}
                </div>
                <Link href={p.ctaHref as Route} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '12px', borderRadius: '6px', textDecoration: 'none', fontFamily: sans, fontSize: '14px', fontWeight: 500, background: p.dark ? T.gold : 'transparent', color: p.dark ? 'white' : T.ink, border: `1.5px solid ${p.dark ? T.gold : T.rule}`, transition: 'all .15s' }}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', fontSize: '14px', color: T.ink3, marginTop: '32px', fontFamily: sans }}>
            West Africa? Pay with Paystack — bank transfer, USSD, or mobile money.{' '}
            <Link href="/pricing#paystack" style={{ color: T.gold }}>See local pricing →</Link>
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FAQ
      ══════════════════════════════════════ */}
      <section style={{ background: T.cream2, padding: '100px 24px' }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px', margin: '0 auto 56px' }}>
            <span className="eyebrow">Questions</span>
            <h2 style={{ fontFamily: serif, fontSize: 'clamp(26px,3.5vw,44px)', lineHeight: 1.1 }}>
              <em style={{ color: T.gold }}>Frequently</em> asked
            </h2>
          </div>
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            {[
              { q: 'Does StitchBook work without internet?', a: 'Yes — completely. The iOS and Android apps store all data locally using SQLite via WatermelonDB. You can take measurements, create clients, and record orders with no connectivity. When you\'re back online, everything syncs automatically using CRDT conflict resolution. We built offline-first because many of our users operate in markets with unreliable internet.' },
              { q: 'Can my clients self-measure?', a: 'Yes — on Boutique and Atelier plans. You send a one-time invite link to your client. They follow a guided step-by-step flow with instructions, illustrations, and common-mistake warnings per measurement. They can upload photos. You review the submission before it becomes an official session — accept it, request clarification on specific fields, or reject it.' },
              { q: 'How many garment templates are included?', a: 'Seven system templates are included in all plans: Suit Jacket, Trousers, Saree Blouse, Evening Gown, Agbada, Abaya, and Child Dress — each with a full field set and yardage calculator. The Atelier plan includes a custom template builder where you can create and save your own garment types.' },
              { q: 'Is my data safe? Can I export it?', a: 'All data is stored in PostgreSQL on Supabase with point-in-time recovery and daily backups. Each shop\'s data is fully isolated — no other shop can ever see your clients or measurements. You can export your complete data at any time from Settings as CSV or JSON.' },
              { q: 'What languages does StitchBook support?', a: 'The tailor-facing app is in English, French, Hindi, Yoruba, and Portuguese. The client portal is available in all five plus Arabic and Urdu with full RTL layout. Additional languages including Swahili, Igbo, Bengali, and Turkish are in development. Notifications are sent in the client\'s preferred language.' },
              { q: 'Can I use Paystack instead of a credit card?', a: 'Yes. We support Paystack for Nigeria, Ghana, Kenya, and South Africa — covering bank transfer, USSD, mobile money (MPesa, MTN), and cards. The Paystack option appears automatically if your shop\'s country is set to a supported region.' },
            ].map((faq, i) => (
              <div key={i} style={{ borderBottom: `1px solid ${T.rule}`, padding: '20px 0' }}>
                <button type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                >
                  <span style={{ fontSize: '16px', fontWeight: 500, color: T.ink, fontFamily: sans }}>{faq.q}</span>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, transform: openFaq === i ? 'rotate(45deg)' : 'none', transition: 'transform .2s' }}>
                    <path d="M9 4v10M4 9h10" stroke={T.ink3} strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
                {openFaq === i && (
                  <p style={{ fontSize: '15px', color: T.ink3, lineHeight: 1.75, marginTop: '12px', fontFamily: sans }}>{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          CTA BAND
      ══════════════════════════════════════ */}
      <section style={{ background: T.ink, padding: '100px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '400px', background: 'radial-gradient(ellipse,rgba(200,168,76,.1) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '640px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontFamily: serif, fontSize: 'clamp(32px,5vw,60px)', color: T.cream, marginBottom: '16px', lineHeight: 1.05 }}>
            Your measurements.<br /><em style={{ fontStyle: 'italic', color: T.gold2 }}>Forever.</em>
          </h2>
          <p style={{ fontSize: '17px', color: 'rgba(240,235,224,.45)', marginBottom: '36px', fontFamily: sans }}>
            Start with 50 clients for free. No credit card. No expiry. The measurement engine is yours from day one.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
            <Link href="/register" className="btn-gold">
              Create your free account
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </Link>
            <Link href="/register?plan=boutique" className="btn-ghost">Start Boutique trial</Link>
          </div>
          <p style={{ fontFamily: mono, fontSize: '11px', letterSpacing: '.1em', color: 'rgba(240,235,224,.25)' }}>
            No credit card · Cancel anytime · Data export always available
          </p>
        </div>
      </section>
    </MarketingLayout>
  )
}
