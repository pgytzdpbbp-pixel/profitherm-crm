// @vitest-environment jsdom
import { invoke } from '@tauri-apps/api/core'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../app/App'
import type { Activity, ActivityInput, ObjectPage } from '../services/api'
import { activityDate } from '../services/presentation'
import { Activities } from './activities'
import { ObjectForm } from './forms'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
const ipc = vi.mocked(invoke)
const empty: ObjectPage = { items: [], total: 0, page: 0, pageSize: 25 }

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: () => undefined })
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.open = false } },
  })
})

afterEach(() => {
  cleanup()
  ipc.mockReset()
})

describe('Komunikace', () => {
  it('uloží čas otevření, zahozený koncept znovu nepoužije a odmítne prázdný text', async () => {
    const user = userEvent.setup()
    let clock = new Date('2026-11-18T13:20:00.000Z')
    const items: Activity[] = []
    ipc.mockImplementation(async (command, args) => {
      if (command === 'list_object_activities') return [...items] as never
      if (command === 'create_activity') {
        const input = (args as { input: ActivityInput }).input
        items.push({ ...input, id: 'a', contactName: null, savedAt: clock.toISOString(), updatedAt: clock.toISOString() })
        return 'a' as never
      }
      throw new Error(command)
    })
    render(<Activities id="obj" editable contacts={[]} now={() => clock} />)
    await user.click(screen.getByRole('button', { name: 'Nový záznam' }))
    expect(within(screen.getByRole('dialog')).getByText('18. 11. 2026 • 14:20')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Zrušit' }))

    clock = new Date('2026-11-18T13:32:00.000Z')
    await user.click(screen.getByRole('button', { name: 'Nový záznam' }))
    await user.click(screen.getByRole('button', { name: 'Uložit záznam' }))
    expect(screen.getByRole('alert').textContent).toContain('Vyplňte text záznamu.')
    expect(items).toHaveLength(0)

    clock = new Date('2026-11-18T13:37:00.000Z')
    await user.selectOptions(screen.getByLabelText('Typ komunikace'), 'phone')
    await user.type(screen.getByLabelText('Text záznamu'), 'Termín potvrzen.')
    await user.click(screen.getByRole('button', { name: 'Uložit záznam' }))
    expect(await screen.findByText('Termín potvrzen.')).toBeTruthy()
    expect(screen.getByText('18. 11. 2026 • 14:32')).toBeTruthy()
    expect(items[0]).toMatchObject({ startedAt: '2026-11-18T13:32:00.000Z', savedAt: '2026-11-18T13:37:00.000Z' })
  })

  it('zobrazuje český letní i zimní čas', () => {
    expect(activityDate('2026-07-18T12:32:00Z')).toBe('18. 7. 2026 • 14:32')
    expect(activityDate('2026-11-18T13:32:00Z')).toBe('18. 11. 2026 • 14:32')
  })
})

describe('Objekty', () => {
  it('zobrazí prázdný stav a předá obě hledání a filtr společně po prodlevě', async () => {
    const user = userEvent.setup()
    ipc.mockImplementation(async command => {
      if (command === 'list_companies') return [{ id: 'firma', name: 'Správa' }] as never
      if (command === 'search_objects') return empty as never
      throw new Error(command)
    })
    render(<App />)
    expect(await screen.findByText('Zatím tu nejsou žádné objekty')).toBeTruthy()
    await user.selectOptions(await screen.findByLabelText('Správcovská firma'), 'firma')
    await user.type(screen.getByPlaceholderText('Hledat objekt podle názvu nebo adresy...'), 'Plzen')
    await user.type(screen.getByPlaceholderText('Hledat kontakt, telefon nebo e-mail...'), '777 123')
    expect(ipc).not.toHaveBeenCalledWith('search_objects', {
      input: { query: 'Plzen', contactQuery: '777 123', companyId: 'firma', page: 0 },
    })
    await waitFor(() => expect(ipc).toHaveBeenCalledWith('search_objects', {
      input: { query: 'Plzen', contactQuery: '777 123', companyId: 'firma', page: 0 },
    }))
    expect(screen.getByText('Žádné odpovídající objekty')).toBeTruthy()
  })

  it('odmítne záporný počet ještě před odesláním příkazu', async () => {
    const user = userEvent.setup()
    ipc.mockResolvedValue([])
    render(<ObjectForm close={() => undefined} saved={() => undefined} />)
    await user.type(await screen.findByLabelText('Název objektu'), 'Dům A')
    await user.type(screen.getByLabelText('Ulice'), 'Česká')
    await user.type(screen.getByLabelText('Obec'), 'Plzeň')
    const meter = screen.getByLabelText('Vodoměry SV')
    await user.clear(meter)
    await user.type(meter, '-2')
    await user.click(screen.getByRole('button', { name: 'Uložit' }))
    expect(screen.getByRole('alert').textContent).toContain('celé nezáporné číslo')
    expect(ipc.mock.calls.some(([command]) => command === 'create_object')).toBe(false)
  })
})
