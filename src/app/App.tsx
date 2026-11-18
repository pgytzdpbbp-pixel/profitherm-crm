import { Building, Building2, Settings as SettingsIcon, UsersRound } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { emptyFilters, Objects } from '../features/objects'
import { CompanyProfile, ContactProfile, Directory, ObjectProfile, sectionNames } from '../features/records'
import { Settings } from '../features/settings'
import type { Entity } from '../services/api'

type Section = Entity | 'settings'
type View = { section: Section } | { section: Entity; id: string }
const menu = [
  ['object', Building2], ['company', Building], ['contact', UsersRound], ['settings', SettingsIcon],
] as const
const profiles = { object: ObjectProfile, company: CompanyProfile, contact: ContactProfile }

export default function App() {
  const [views, setViews] = useState<View[]>([{ section: 'object' }])
  const [filters, setFilters] = useState(emptyFilters)
  const content = useRef<HTMLElement>(null)
  const view = views[views.length - 1]
  const viewId = 'id' in view ? view.id : undefined
  useLayoutEffect(() => {
    content.current?.scrollTo(0, 0)
  }, [view.section, viewId])
  function open(entity: Entity, id: string) {
    setViews(previous => [...previous, { section: entity, id }])
  }
  function back() {
    setViews(previous => previous.length > 1 ? previous.slice(0, -1) : previous)
  }
  function screen() {
    if ('id' in view) {
      const Profile = profiles[view.section]
      return <Profile key={view.id} id={view.id} open={open} back={back} />
    }
    if (view.section === 'object') return <Objects filters={filters} change={setFilters} open={id => open('object', id)} />
    if (view.section === 'settings') return <Settings open={open} />
    return <Directory key={view.section} entity={view.section} open={open} />
  }
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">P<span /></span>
        <div><strong>PROFITHERM</strong><span>CRM</span></div>
      </div>
      <nav aria-label="Hlavní navigace">
        {menu.map(([key, Icon]) => <button key={key} aria-current={view.section === key ? 'page' : undefined}
          className={key === 'settings' ? 'settings-link' : undefined} onClick={() => setViews([{ section: key }])}>
          <Icon size={20} strokeWidth={1.75} /><span>{sectionNames[key]}</span>
        </button>)}
      </nav>
    </aside>
    <main ref={content} className="main"><div className="content">{screen()}</div></main>
  </div>
}
