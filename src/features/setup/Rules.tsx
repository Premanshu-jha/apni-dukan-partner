import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { isApiError, messageOf } from '../../api/errors'
import { salonKeys, setupApi, useSettings } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { Settings } from '../../api/types'
import { Banner, Button, Card, ErrorBanner, ErrorState, Field, Loading, Page } from '../../components/ui'
import { useT } from '../../i18n'
import { can } from '../../lib/roles'
import { useLocation } from 'react-router'
import { unsavedWarning, useReportUnsaved, useUnsavedParts } from '../../lib/unsaved'
import { cameFrom } from '../shop/Register'

/** How much notice a booking needs, and how far ahead customers can book. */
export function Rules() {
  const t = useT()
  const settings = useSettings()
  const location = useLocation()
  const [unsaved, report] = useUnsavedParts()
  return (
    // Back where it was opened from, else the Salon tab; a changed rule not saved asks first
    <Page back={cameFrom(location, '/setup')} title={t('setup.rulesTitle')} leaveWarning={unsavedWarning(unsaved)}>
      {settings.isPending ? (
        <Loading />
      ) : settings.isError ? (
        <ErrorState message={messageOf(settings.error)} onRetry={() => settings.refetch()} />
      ) : (
        <RulesForm settings={settings.data} onDirty={report} />
      )}
    </Page>
  )
}

function RulesForm({ settings, onDirty }: { settings: Settings; onDirty: (part: string, dirty: boolean) => void }) {
  const t = useT()
  const qc = useQueryClient()
  const edit = can(useShop().myRole).editSetup
  const [lead, setLead] = useState(String(settings.minLeadMinutes))
  const [ahead, setAhead] = useState(String(settings.maxDaysAhead))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const leadN = Number(lead)
  const aheadN = Number(ahead)
  const leadBad = lead === '' || !Number.isInteger(leadN) || leadN < 0 || leadN > 1440
  const aheadBad = ahead === '' || !Number.isInteger(aheadN) || aheadN < 1 || aheadN > 30
  useReportUnsaved(onDirty, 'rules', edit && (lead !== String(settings.minLeadMinutes) || ahead !== String(settings.maxDaysAhead)))

  async function save() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      qc.setQueryData(salonKeys.settings, await setupApi.updateSettings(settings.version, { minLeadMinutes: leadN, maxDaysAhead: aheadN }))
      setSaved(true)
    } catch (e) {
      setError(messageOf(e))
      if (isApiError(e, 'SETTINGS_CHANGED')) await qc.invalidateQueries({ queryKey: salonKeys.settings })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <Field
        id="min-lead"
        label={t('setup.noticeLabel')}
        inputMode="numeric"
        value={lead}
        disabled={!edit}
        onChange={(e) => setLead(e.target.value.replace(/\D/g, ''))}
        error={leadBad ? t('setup.noticeError') : undefined}
        hint={t('setup.noticeHint')}
      />
      <Field
        id="max-ahead"
        label={t('setup.aheadLabel')}
        inputMode="numeric"
        value={ahead}
        disabled={!edit}
        onChange={(e) => setAhead(e.target.value.replace(/\D/g, ''))}
        error={aheadBad ? t('setup.aheadError') : undefined}
      />
      {error && <ErrorBanner message={error} />}
      {saved && <Banner tone="good">{t('setup.saved')}</Banner>}
      {edit && (
        <Button busy={busy} disabled={leadBad || aheadBad} onClick={save}>
          {t('common.save')}
        </Button>
      )}
    </Card>
  )
}
