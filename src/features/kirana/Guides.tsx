import type { ReactNode } from 'react'
import { useT } from '../../i18n'

/**
 * "Like this ✓ / Not like this ✗": two small drawings shown BEFORE a photo or paper that must be right (a page of the
 * product list, a pack, the owner's face, the shop front, the video, the FSSAI certificate, the shop licence), so the
 * shopkeeper gets it right the first time instead of learning from a refusal. Plain drawings in the app's colours:
 * no photo of a real brand, shop or person. Kirana-only (its words are in kiranaSetup.json).
 */
export type GuideKind = 'list' | 'pack' | 'loose' | 'face' | 'shopFront' | 'video' | 'fssai' | 'shopLicence'

export function PhotoGuide({ kind, compact = false }: { kind: GuideKind; compact?: boolean }) {
  const t = useT()
  const good = t(`kiranaSetup.guide_${kind}_good`)
  const bad = t(`kiranaSetup.guide_${kind}_bad`)
  return (
    <section aria-label={t('kiranaSetup.guideTitle')} className="flex flex-col gap-2 rounded-xl border border-line bg-raised/40 p-3" data-guide={kind}>
      {!compact && <p className="font-semibold">{t('kiranaSetup.guideTitle')}</p>}
      <div className="grid grid-cols-2 gap-3">
        <figure className="flex flex-col gap-1">
          <Frame label={good} tone="good">{DRAWINGS[kind].good}</Frame>
          <figcaption className="text-sm">
            <span className="block font-semibold text-good">✓ {t('kiranaSetup.likeThis')}</span>
            <span className="block text-ink">{good}</span>
          </figcaption>
        </figure>
        <figure className="flex flex-col gap-1">
          <Frame label={bad} tone="bad">{DRAWINGS[kind].bad}</Frame>
          <figcaption className="text-sm">
            <span className="block font-semibold text-bad">✗ {t('kiranaSetup.notLikeThis')}</span>
            <span className="block text-ink">{bad}</span>
          </figcaption>
        </figure>
      </div>
      <p className="text-sm text-muted">{t(`kiranaSetup.guide_${kind}_tip`)}</p>
    </section>
  )
}

/** One drawing in its frame, with a ✓ or ✗ badge in the corner. */
function Frame({ label, tone, children }: { label: string; tone: 'good' | 'bad'; children: ReactNode }) {
  return (
    <svg viewBox="0 0 160 110" role="img" aria-label={label} className={`w-full rounded-lg border-2 bg-surface ${tone === 'good' ? 'border-good/70' : 'border-bad/70'}`}>
      <rect x="0" y="0" width="160" height="110" className="fill-surface" />
      {children}
      <circle cx="144" cy="16" r="11" className={tone === 'good' ? 'fill-good' : 'fill-bad'} />
      {tone === 'good' ? (
        <path d="M138 16 l4 4 l8 -9" className="stroke-bg" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M139 11 l10 10 M149 11 l-10 10" className="stroke-bg" strokeWidth="3" fill="none" strokeLinecap="round" />
      )}
    </svg>
  )
}

/** Lines of writing on a paper. */
function textLines(x: number, y: number, rows: number, width: number, step = 9) {
  return Array.from({ length: rows }, (_, i) => (
    <rect key={i} x={x} y={y + i * step} width={i % 3 === 2 ? width * 0.6 : width} height="3" rx="1.5" className="fill-line" />
  ))
}

/** Dark, as a photo taken without light. */
const dark = <rect x="0" y="0" width="160" height="110" className="fill-scrim" opacity="0.6" />

/** Shake lines: a photo taken while moving. */
const shake = (
  <g className="stroke-bad" strokeWidth="2" fill="none" strokeLinecap="round">
    <path d="M14 30 l6 -4 l6 4 l6 -4" />
    <path d="M14 80 l6 -4 l6 4 l6 -4" />
    <path d="M118 92 l6 -4 l6 4 l6 -4" />
  </g>
)

const shelves = (
  <g>
    <rect x="22" y="20" width="116" height="78" rx="3" className="fill-raised stroke-line" strokeWidth="2" />
    {[44, 68, 92].map((y) => (
      <g key={y}>
        <rect x="22" y={y} width="116" height="4" className="fill-line" />
        {[30, 46, 62, 78, 94, 110, 124].map((x, i) => (
          <rect key={x} x={x} y={y - 16 + (i % 2) * 3} width="10" height={16 - (i % 2) * 3} rx="1.5" className={i % 3 === 0 ? 'fill-accent' : i % 3 === 1 ? 'fill-brand' : 'fill-good'} />
        ))}
      </g>
    ))}
  </g>
)

const shopFront = (y: number) => (
  <g transform={`translate(0 ${y})`}>
    <rect x="18" y="34" width="124" height="70" className="fill-raised stroke-line" strokeWidth="2" />
    <rect x="26" y="12" width="108" height="24" rx="3" className="fill-brand" />
    {textLines(36, 19, 2, 88, 8)}
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect key={i} x={18 + i * 20.6} y="36" width="10.3" height="8" className="fill-accent" />
    ))}
    <rect x="66" y="58" width="28" height="46" className="fill-surface stroke-line" strokeWidth="2" />
    <rect x="28" y="56" width="28" height="22" className="fill-line" />
    <rect x="104" y="56" width="28" height="22" className="fill-line" />
  </g>
)

const certificate = (
  <g>
    <rect x="30" y="6" width="100" height="98" rx="2" className="fill-ink" />
    <rect x="30" y="6" width="100" height="14" className="fill-brand" />
    <circle cx="80" cy="32" r="8" className="fill-none stroke-brand" strokeWidth="2" />
    {textLines(42, 46, 3, 76, 7)}
  </g>
)

const DRAWINGS: Record<GuideKind, { good: ReactNode; bad: ReactNode }> = {
  list: {
    good: (
      <g>
        <rect x="42" y="6" width="76" height="98" rx="2" className="fill-ink" />
        {textLines(50, 16, 9, 60)}
      </g>
    ),
    bad: (
      <g>
        <g transform="rotate(20 110 60)">
          <rect x="78" y="10" width="76" height="98" rx="2" className="fill-ink" />
          {textLines(86, 20, 9, 60)}
        </g>
        {dark}
      </g>
    ),
  },
  pack: {
    good: (
      <g>
        <rect x="56" y="14" width="48" height="84" rx="4" className="fill-accent" />
        <rect x="60" y="34" width="40" height="22" rx="2" className="fill-ink" />
        {textLines(64, 39, 2, 32, 7)}
        <circle cx="80" cy="78" r="11" className="fill-ink stroke-good" strokeWidth="3" />
        <rect x="73" y="76" width="14" height="4" rx="2" className="fill-line" />
      </g>
    ),
    bad: (
      <g>
        <rect x="30" y="22" width="40" height="72" rx="4" className="fill-accent" transform="rotate(-12 50 58)" />
        <rect x="62" y="18" width="40" height="76" rx="4" className="fill-brand" />
        <rect x="94" y="26" width="38" height="70" rx="4" className="fill-good" transform="rotate(10 113 61)" />
        {shake}
      </g>
    ),
  },
  loose: {
    good: (
      <g>
        <path d="M44 100 Q36 60 52 42 L108 42 Q124 60 116 100 Z" className="fill-warn" />
        <ellipse cx="80" cy="44" rx="30" ry="9" className="fill-accent" />
        {Array.from({ length: 14 }, (_, i) => (
          <circle key={i} cx={58 + (i % 7) * 7} cy={38 + Math.floor(i / 7) * 5} r="2.2" className="fill-ink" />
        ))}
      </g>
    ),
    bad: shelves,
  },
  face: {
    good: (
      <g>
        <path d="M30 110 Q30 76 80 74 Q130 76 130 110 Z" className="fill-brand" />
        <circle cx="80" cy="44" r="26" className="fill-muted" />
        <circle cx="71" cy="40" r="3" className="fill-bg" />
        <circle cx="89" cy="40" r="3" className="fill-bg" />
        <path d="M70 54 Q80 61 90 54" className="stroke-bg" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>
    ),
    bad: (
      <g>
        <rect x="0" y="80" width="160" height="30" className="fill-raised" />
        <path d="M70 92 Q70 82 80 81 Q90 82 90 92 Z" className="fill-brand" />
        <circle cx="80" cy="74" r="7" className="fill-muted" />
        <rect x="73" y="71" width="14" height="4" rx="2" className="fill-bg" />
      </g>
    ),
  },
  shopFront: {
    good: shopFront(0),
    bad: (
      <g>
        {shopFront(-26)}
        {dark}
      </g>
    ),
  },
  video: {
    good: (
      <g>
        {shelves}
        <path d="M30 106 H128" className="stroke-good" strokeWidth="3" strokeLinecap="round" />
        <path d="M122 101 l7 5 l-7 5" className="stroke-good" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
    bad: (
      <g>
        <g transform="rotate(-18 80 58)">{shelves}</g>
        {shake}
      </g>
    ),
  },
  fssai: {
    good: (
      <g>
        {certificate}
        {Array.from({ length: 14 }, (_, i) => (
          <rect key={i} x={39 + i * 6} y="78" width="4.5" height="7" className="fill-line" />
        ))}
        <ellipse cx="80" cy="81.5" rx="47" ry="10" className="fill-none stroke-good" strokeWidth="2.5" />
      </g>
    ),
    bad: (
      <g>
        <path d="M58 6 H102 V96 l-5.5 6 l-5.5 -6 l-5.5 6 l-5.5 -6 l-5.5 6 l-5.5 -6 l-5.5 6 l-5.5 -6 Z" className="fill-ink" />
        <text x="80" y="28" textAnchor="middle" fontSize="16" fontWeight="700" className="fill-line">₹</text>
        {textLines(64, 38, 6, 32, 8)}
      </g>
    ),
  },
  shopLicence: {
    good: (
      <g>
        {certificate}
        {textLines(42, 70, 3, 76, 7)}
      </g>
    ),
    bad: (
      <g>
        <g transform="rotate(14 80 60) translate(10 26)">{certificate}</g>
        <path d="M100 6 L130 6 L130 36 Z" className="fill-raised" />
        {dark}
      </g>
    ),
  },
}
