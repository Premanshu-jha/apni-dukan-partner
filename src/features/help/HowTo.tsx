import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { Shop } from '../../api/types'
import { inEnglish, language, t, useT } from '../../i18n'
import { GROUPS, howToFor, matches, targetOf, type HowTo } from './howto'

/**
 * "How do I…?": the answers for this person's role, grouped, with a search box that narrows them as they type. Opened
 * from a screen (`from`), that screen's answers come first. Nothing is fetched: the texts are in the language files.
 */
export function HowToAnswers({ shop, from, onAsk }: { shop: Shop; from: string | null; onAsk: (query: string) => void }) {
  const t = useT()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const list = useMemo(() => howToFor(shop), [shop])
  const role = shop.myRole
  const fromPath = from?.split('?')[0] ?? null
  const text = (h: HowTo) => `${t(`howto.${h.id}Q`)} ${answerOf(h, shop.name)}`
  // In another language, the English words find it too (many type "offer", "QR" or "barber" in English letters)
  const english = (h: HowTo) => `${inEnglish(`howto.${h.id}Q`)} ${answerOf(h, shop.name, true)}`
  const found = query.trim()
    ? list.filter((h) => matches(query, text(h)) || (language() !== 'en' && matches(query, english(h))))
    : null
  const here = fromPath ? list.filter((h) => targetOf(h, role) === fromPath) : []
  // Today's first-time tips, again (Today opens them on ?tips=1): right under the search box, or first in "About this
  // screen" when Help was opened from Today
  const tipsInHere = fromPath === '/salon/day' && here.length > 0 && !found
  const tipsLink = (
    <Link
      to="/salon/day?tips=1"
      className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-raised px-5 text-base text-ink hover:bg-line"
    >
      {t('help.tipsAgain')}
    </Link>
  )

  if (list.length === 0) return null
  return (
    <section aria-labelledby={`${searchId}-title`} className="flex flex-col gap-3">
      <h2 id={`${searchId}-title`} className="font-display text-lg font-semibold">
        {t('help.howToTitle')}
      </h2>
      <div className="flex flex-col gap-2">
        <label htmlFor={searchId} className="text-sm font-medium text-muted">
          {t('help.searchLabel')}
        </label>
        <input
          id={searchId}
          type="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('help.searchPlaceholder')}
          className="min-h-12 rounded-xl border border-line bg-surface px-4 text-base text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
        />
      </div>
      {!tipsInHere && tipsLink}
      {found ? (
        <>
          <p role="status" className="text-sm text-muted">
            {found.length ? t('help.matchCount', { count: found.length }) : t('help.noMatch', { query: query.trim() })}
          </p>
          {found.length === 0 ? (
            <button type="button" className="min-h-11 self-start text-link underline" onClick={() => onAsk(query.trim())}>
              {t('help.askThisInstead')}
            </button>
          ) : (
            <Answers items={found} shop={shop} open />
          )}
        </>
      ) : (
        <>
          {here.length > 0 && (
            <Group title={t('help.aboutThisScreen')}>
              {tipsInHere && tipsLink}
              <Answers items={here} shop={shop} />
            </Group>
          )}
          {GROUPS.map((g) => {
            const items = list.filter((h) => h.group === g && !here.includes(h))
            if (items.length === 0) return null
            return (
              <Group key={g} title={t(`howto.group_${g}`)}>
                <Answers items={items} shop={shop} />
              </Group>
            )
          })}
        </>
      )}
    </section>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-muted">{title}</h3>
      {children}
    </div>
  )
}

/** The answer, with each button's name as that screen shows it in this language (or in English, for the search). */
function answerOf(h: HowTo, salonName: string, english = false): string {
  const say = english ? inEnglish : t
  const words = Object.fromEntries(Object.entries(h.words ?? {}).map(([blank, key]) => [blank, say(key, { name: salonName })]))
  return say(`howto.${h.id}A`, words)
}

function Answers({ items, shop, open = false }: { items: readonly HowTo[]; shop: Shop; open?: boolean }) {
  const t = useT()
  const role = shop.myRole
  return (
    <ul className="flex flex-col gap-2">
      {items.map((h) => (
        <li key={h.id}>
          {/* A search shows its answers open; otherwise a question opens with one tap (a long list stays short) */}
          <details open={open || undefined} className="group rounded-2xl border border-line bg-surface">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 break-words">{t(`howto.${h.id}Q`)}</span>
              <span aria-hidden="true" className="shrink-0 text-muted transition group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="flex flex-col gap-3 px-4 pb-4">
              <p className="text-muted">{answerOf(h, shop.name)}</p>
              {h.ownerChanges && role !== 'OWNER' && <p className="text-sm text-muted">{t('howto.ownerOnly')}</p>}
              <Link
                to={targetOf(h, role)}
                aria-label={t('help.takeMeThereAria', { question: t(`howto.${h.id}Q`) })}
                className="inline-flex min-h-11 items-center justify-center self-start rounded-xl bg-brand/15 px-4 text-sm font-semibold text-link"
              >
                {t('help.takeMeThere')}
              </Link>
            </div>
          </details>
        </li>
      ))}
    </ul>
  )
}
