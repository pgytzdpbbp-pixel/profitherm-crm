import { Archive, Building2, Building, ChevronRight, Mail, MapPin, Pencil, Phone, Plus, RotateCcw, Unlink2, UserRound } from 'lucide-react'
import { ask } from '@tauri-apps/plugin-dialog'
import { useCallback, useState, type ReactNode } from 'react'
import { ArchiveLabel, Button, Card, Empty, ErrorMessage, Loading, PageHeader } from '../components/ui'
import { api, type Entity, type LinkedRecord } from '../services/api'
import { useAction, useResource } from '../services/hooks'
import { address, fullName } from '../services/presentation'
import { Activities } from './activities'
import { CompanyForm, ContactForm, meters, ObjectForm } from './forms'
import { AssignObject, ContactsCard } from './relationships'

export const sectionNames = { object: 'Objekty', company: 'Správcovské firmy', contact: 'Kontakty', settings: 'Nastavení' }
export type OpenRecord = (entity: Entity, id: string) => void

export function Directory({ entity, open }: { entity: 'company' | 'contact'; open: OpenRecord }) {
  const [creating, setCreating] = useState(false)
  const companies = entity === 'company'
  const directory = useResource(useCallback(async () => {
    if (companies) return (await api.listCompanies()).map(company => ({
      id: company.id, name: company.name, info: [company.ico && `IČO ${company.ico}`, company.city, company.email, company.phone],
    }))
    return (await api.listContacts()).map(contact => ({
      id: contact.id, name: fullName(contact), info: [contact.phone, contact.email],
    }))
  }, [companies]))
  const Icon = companies ? Building : UserRound
  const Form = companies ? CompanyForm : ContactForm
  const createLabel = companies ? 'Nová firma' : 'Nový kontakt'
  return <>
    <PageHeader title={sectionNames[entity]} subtitle={companies
      ? 'Evidence správců a objektů, které mají ve správě.'
      : 'Evidence osob a jejich přiřazení k objektům a správcům.'}
      actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={18} />{createLabel}</Button>} />
    <Card title={companies ? 'Přehled firem' : 'Přehled kontaktů'}>
      <ErrorMessage error={directory.error} retry={directory.refresh} />
      {directory.loading && !directory.data && <Loading />}
      {directory.data && !directory.error && (directory.data.length
        ? <ul className="record-list">{directory.data.map(item => <li key={item.id}>
          <span className="row-icon"><Icon size={19} /></span>
          <div className="record-info">
            <button className="text-link" onClick={() => open(entity, item.id)}>{item.name}</button>
            <small>{item.info.filter(Boolean).join(' · ') || 'Bez dalších údajů'}</small>
          </div>
          <Button variant="quiet" className="icon-button" aria-label={`Otevřít ${item.name}`}
            onClick={() => open(entity, item.id)}><ChevronRight size={18} /></Button>
        </li>)}</ul>
        : <Empty icon={<Icon size={25} />} title={companies ? 'Zatím tu nejsou žádné firmy' : 'Zatím tu nejsou žádné kontakty'} />)}
    </Card>
    {creating && <Form close={() => setCreating(false)} saved={id => open(entity, id)} />}
  </>
}

function RecordActions({ id, entity, archived, edit, refresh }: {
  id: string; entity: Entity; archived: boolean; edit: () => void; refresh: () => void
}) {
  const action = useAction()
  function run() {
    void action.run(async () => {
      if (archived) await api.restore(entity, id)
      else {
        const confirmed = await ask('Záznam se skryje z aktivních přehledů. Později ho můžete obnovit v nastavení.', {
          title: 'Archivovat záznam', kind: 'warning', okLabel: 'Archivovat', cancelLabel: 'Zrušit',
        })
        if (!confirmed) return
        await api.archive(entity, id)
      }
      refresh()
    })
  }
  return <>
    {archived ? <ArchiveLabel /> : <Button onClick={edit}><Pencil size={16} />Upravit</Button>}
    <Button onClick={run} disabled={action.pending}>{archived ? <RotateCcw size={16} /> : <Archive size={16} />}
      {archived ? 'Obnovit' : 'Archivovat'}</Button>
    <ErrorMessage error={action.error} />
  </>
}

function Details({ items }: { items: [string, ReactNode][] }) {
  return <dl className="details">{items.map(([label, value]) => <div key={label}>
    <dt>{label}</dt><dd>{value || <span className="muted">Neuvedeno</span>}</dd>
  </div>)}</dl>
}

function DetailStatus({ error, retry, back }: { error: string; retry: () => void; back: () => void }) {
  return <>
    <PageHeader title="Detail záznamu" back={{ label: 'Zpět', run: back }} />
    {error ? <ErrorMessage error={error} retry={retry} /> : <Loading />}
  </>
}

interface DetailProps { id: string; open: OpenRecord; back: () => void }

export function ObjectProfile({ id, open, back }: DetailProps) {
  const [editing, setEditing] = useState(false)
  const detail = useResource(useCallback(() => api.getObject(id), [id]))
  if (!detail.data) return <DetailStatus error={detail.error} retry={detail.refresh} back={back} />
  const { object, contacts, companyContacts } = detail.data
  const editable = !object.archivedAt
  return <>
    <PageHeader title={object.name} subtitle={address(object)} back={{ label: 'Zpět', run: back }}
      actions={<RecordActions id={id} entity="object" archived={!editable} edit={() => setEditing(true)} refresh={detail.refresh} />} />
    <ErrorMessage error={detail.error} retry={detail.refresh} />
    <div className="overview-grid">
      <Card title="Informace o objektu">
        <Details items={[
          ['Adresa', address(object)],
          ['Správcovská firma', object.managementCompanyId ? <span className="inline-icon">
            <button className="text-link" onClick={() => open('company', object.managementCompanyId!)}>{object.managementCompanyName}</button>
            {object.managementCompanyArchivedAt && <ArchiveLabel />}
          </span> : 'Bez správce'],
          ['Technické poznámky', object.technicalNotes],
        ]} />
      </Card>
      <Card title="Měřidla">
        <dl className="meter-grid">{meters.map(([key, label]) => <div key={key}>
          <dt>{label}</dt><dd>{object[key].toLocaleString('cs-CZ')}</dd>
        </div>)}</dl>
      </Card>
    </div>
    <Activities id={id} editable={editable} contacts={[...contacts, ...companyContacts]} />
    <ContactsCard id={id} entity="object" links={contacts} editable={editable}
      open={id => open('contact', id)} refresh={detail.refresh} />
    {companyContacts.length > 0 && <Card title="Kontakty správcovské firmy">
      <RecordLinks items={companyContacts.map(contact => ({
        id: contact.id, name: fullName(contact), archivedAt: contact.archivedAt,
        roleLabel: [contact.roleLabel, contact.phone, contact.email].filter(Boolean).join(' · '),
      }))} icon={<UserRound size={18} />} open={id => open('contact', id)} empty="Žádné kontakty správce" />
    </Card>}
    {editing && editable && <ObjectForm initial={object} close={() => setEditing(false)}
      saved={() => { setEditing(false); detail.refresh() }} />}
  </>
}

export function CompanyProfile({ id, open, back }: DetailProps) {
  const [editing, setEditing] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const action = useAction()
  const detail = useResource(useCallback(() => api.getCompany(id), [id]))
  if (!detail.data) return <DetailStatus error={detail.error} retry={detail.refresh} back={back} />
  const { company, objects, contacts } = detail.data
  const editable = !company.archivedAt
  return <>
    <PageHeader title={company.name} subtitle="Správcovská firma" back={{ label: 'Zpět', run: back }}
      actions={<RecordActions id={id} entity="company" archived={!editable} edit={() => setEditing(true)} refresh={detail.refresh} />} />
    <ErrorMessage error={detail.error} retry={detail.refresh} />
    <Card title="Údaje o firmě">
      <Details items={[['IČO', company.ico], ['Adresa', address({ ...company, street: company.street || '',
        city: company.city || '', buildingNumber: null })], ['E-mail', company.email], ['Telefon', company.phone], ['Poznámky', company.notes]]} />
    </Card>
    <Card title="Objekty ve správě" action={editable && <Button onClick={() => setAssigning(true)}><Plus size={17} />Přiřadit objekt</Button>}>
      <ErrorMessage error={action.error} />
      {objects.length ? <ul className="record-list">{objects.map(object => <li key={object.id}>
        <span className="row-icon"><Building2 size={18} /></span>
        <div className="record-info">
          <button className="text-link" onClick={() => open('object', object.id)}>{object.name}</button>
          {object.archivedAt && <ArchiveLabel />}
          <small>{address(object)}</small>
        </div>
        {editable && !object.archivedAt && <Button variant="quiet" className="icon-button"
          aria-label={`Odebrat objekt ${object.name} ze správy`} disabled={action.pending}
          onClick={() => void action.run(async () => {
            if (!await ask('Odebrat přiřazení objektu k této firmě?', { title: 'Odebrat přiřazení',
              kind: 'warning', okLabel: 'Odebrat', cancelLabel: 'Zrušit' })) return
            await api.setObjectCompany(object.id, null, id)
            detail.refresh()
          })}><Unlink2 size={17} /></Button>}
      </li>)}</ul> : <Empty title="Firma zatím nemá žádné objekty" />}
    </Card>
    <ContactsCard id={id} entity="company" links={contacts} editable={editable}
      open={id => open('contact', id)} refresh={detail.refresh} />
    {editing && editable && <CompanyForm initial={company} close={() => setEditing(false)}
      saved={() => { setEditing(false); detail.refresh() }} />}
    {assigning && editable && <AssignObject companyId={id} close={() => setAssigning(false)}
      saved={() => { setAssigning(false); detail.refresh() }} />}
  </>
}

function RecordLinks({ items, icon, open, empty }: {
  items: LinkedRecord[]; icon: ReactNode; open: (id: string) => void; empty: string
}) {
  return items.length ? <ul className="record-list">{items.map(item => <li key={item.id}>
    <span className="row-icon">{icon}</span>
    <div className="record-info">
      <button className="text-link" onClick={() => open(item.id)}>{item.name}</button>
      {item.archivedAt && <ArchiveLabel />}
      {item.roleLabel && <small>{item.roleLabel}</small>}
    </div>
    <Button variant="quiet" className="icon-button" aria-label={`Otevřít ${item.name}`}
      onClick={() => open(item.id)}><ChevronRight size={17} /></Button>
  </li>)}</ul> : <Empty title={empty} />
}

export function ContactProfile({ id, open, back }: DetailProps) {
  const [editing, setEditing] = useState(false)
  const detail = useResource(useCallback(() => api.getContact(id), [id]))
  if (!detail.data) return <DetailStatus error={detail.error} retry={detail.refresh} back={back} />
  const { contact, objects, companies } = detail.data
  const editable = !contact.archivedAt
  return <>
    <PageHeader title={fullName(contact)} subtitle="Kontaktní osoba" back={{ label: 'Zpět', run: back }}
      actions={<RecordActions id={id} entity="contact" archived={!editable} edit={() => setEditing(true)} refresh={detail.refresh} />} />
    <ErrorMessage error={detail.error} retry={detail.refresh} />
    <Card title="Kontaktní údaje">
      <Details items={[
        ['Telefon', contact.phone && <span className="inline-icon"><Phone size={16} />{contact.phone}</span>],
        ['E-mail', contact.email && <span className="inline-icon"><Mail size={16} />{contact.email}</span>],
        ['Poznámky', contact.notes],
      ]} />
    </Card>
    <div className="overview-grid overview-grid--equal">
      <Card title="Přiřazené objekty"><RecordLinks items={objects} icon={<MapPin size={18} />}
        open={id => open('object', id)} empty="Kontakt nemá přiřazené objekty" /></Card>
      <Card title="Přiřazené správcovské firmy"><RecordLinks items={companies} icon={<Building size={18} />}
        open={id => open('company', id)} empty="Kontakt nemá přiřazené firmy" /></Card>
    </div>
    {editing && editable && <ContactForm initial={contact} close={() => setEditing(false)}
      saved={() => { setEditing(false); detail.refresh() }} />}
  </>
}
