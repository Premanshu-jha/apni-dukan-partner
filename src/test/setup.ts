import '@testing-library/jest-dom/vitest'
import { addKiranaTexts } from '../i18n/kirana'

// The kiranas' words, as in a build with the kirana switch on (the app adds them only then: main.tsx), so a test
// of a kirana screen reads its words whatever the switch; src/i18n/kiranaTexts.test.ts checks the switch itself.
await addKiranaTexts()
