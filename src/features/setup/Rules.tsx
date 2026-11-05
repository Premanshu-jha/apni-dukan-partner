import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { isApiError, messageOf } from '../../api/errors'
import { salonKeys, setupApi, useSettings } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { Settings } from '../../api/types'
import { Banner, Button, Card, ErrorState, Field, Loading, Page } from '../../components/ui'
import { can } from '../../lib/roles'

/** How much notice a booking needs, and how far ahead customers can book. */
export function Rules() {
  const settings = useSettings()
  return (
    <Page back="/setup" title="Booking rules">
      {settings.isPending ? (
        <Loading />
      ) : settings.isError ? (
        <ErrorState message={messageOf(settings.error)} onRetry={() => settings.refetch()} />
      ) : (
        <RulesForm settings={settings.data} />
      )}
    </Page>
  )
}

function RulesForm({ settings }: { settings: Settings }) {
  const qc = useQueryClient()
  const edit = can(useShop().myRole).editSetup
  const [lead, setLead] = useState(String(settings.minLeadMinutes))
  const [ahead, setAhead] = useState(String(settings.maxDaysAhead))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const leadN = Number(lead)
  const aheadN = Number(ahead)
  const leadBad = !Number.isInteger(leadN) || leadN < 0 || leadN > 1440
  const aheadBad = !Number.isInteger(aheadN) || aheadN < 1 || aheadN > 30

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
        label="Notice needed (minutes)"
        inputMode="numeric"
        value={lead}
        disabled={!edit}
        onChange={(e) => setLead(e.target.value.replace(/\D/g, ''))}
        error={leadBad ? 'From 0 to 1440 minutes (a day)' : undefined}
        hint="Customers can't book a time closer than this. 0 lets them book for right now."
      />
      <Field
        id="max-ahead"
        label="Book up to (days ahead)"
        inputMode="numeric"
        value={ahead}
        disabled={!edit}
        onChange={(e) => setAhead(e.target.value.replace(/\D/g, ''))}
        error={aheadBad ? 'From 1 to 30 days' : undefined}
      />
      {error && <Banner tone="bad">{error}</Banner>}
      {saved && <Banner tone="good">Saved.</Banner>}
      {edit && (
        <Button busy={busy} disabled={leadBad || aheadBad} onClick={save}>
          Save
        </Button>
      )}
    </Card>
  )
}
