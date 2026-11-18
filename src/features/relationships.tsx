import { Building2, Plus, Unlink2, UserRound, UserRoundPlus } from 'lucide-react'
import { ask } from '@tauri-apps/plugin-dialog'
import { useCallback, useState, type FormEvent } from 'react'
import { ArchiveLabel, Button, Card, Empty, ErrorMessage, Field, FormActions, Loading, Modal, Pagination } from '../components/ui'
import { api, type Building, type LinkedContact } from '../services/api'
import { useAction, useDebounce, useResource } from '../services/hooks'
import { address, fullName } from '../services/presentation'
import { ContactForm } from './forms'

export function ContactsCard({ id, entity, links, editable, open, refresh }: {
  id: string; entity: 'object' | 'company'; links: LinkedContact[]; editable: boolean
  open: (id: string) => void; refresh: () => void
}) {
  const [editor, setEditor] = useState<'existing' | 'new'>()
  const action = useAction()
  function saved() {
    setEditor(undefined)
    refresh()
  }
  return <Card title="Kontakty" action={editable && <div className="actions">
    <Button onClick={() => setEditor('existing')}><UserRoundPlus size={17} />Přiřadit kontakt</Button>
    <Button onClick={() => setEditor('new')}><Plus size={17} />Nový kontakt</Button>
  </div>}>
    <ErrorMessage error={action.error} />
    {links.length ? <ul className="record-list">{links.map(contact => <li key={contact.id}>
      <span className="row-icon"><UserRound size={18} /></span>
      <div className="record-info">
        <button className="text-link" onClick={() => open(contact.id)}>{fullName(contact)}</button>
        {contact.archivedAt && <ArchiveLabel />}
        <small>{[contact.roleLabel, contact.phone, contact.email].filter(Boolean).join(' · ') || 'Bez dalších údajů'}</small>
      </div>
      {editable && <Button variant="quiet" className="icon-button" aria-label={`Odebrat kontakt ${fullName(contact)}`}
        disabled={action.pending} onClick={() => void action.run(async () => {
          if (!await ask('Odebrat přiřazení tohoto kontaktu?', { title: 'Odebrat kontakt', kind: 'warning',
            okLabel: 'Odebrat', cancelLabel: 'Zrušit' })) return
          await api.removeContact(entity, id, contact.id)
          refresh()
        })}><Unlink2 size={17} /></Button>}
    </li>)}</ul> : <Empty title="Žádné přiřazené kontakty" />}
    {editor === 'existing' && <AssignContact entity={entity} id={id} links={links}
      close={() => setEditor(undefined)} saved={saved} />}
    {editor === 'new' && <ContactForm linked={{ entity, id }} close={() => setEditor(undefined)} saved={saved} />}
  </Card>
}

function AssignContact({ entity, id, links, close, saved }: {
  entity: 'object' | 'company'; id: string; links: LinkedContact[]; close: () => void; saved: () => void
}) {
  const contacts = useResource(api.listContacts)
  const action = useAction()
  const [contactId, setContactId] = useState('')
  const available = contacts.data?.filter(contact => !links.some(link => link.id === contact.id)) ?? []
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!contactId) return
    const role = String(new FormData(event.currentTarget).get('role') || '').trim()
    void action.run(async () => {
      await api.assignContact(entity, id, contactId, role || null)
      saved()
    })
  }
  return <Modal title="Přiřadit existující kontakt" busy={action.pending} onClose={close}>
    <form onSubmit={submit} noValidate>
      {contacts.loading && <Loading />}
      <ErrorMessage error={contacts.error} retry={contacts.refresh} />
      {contacts.data && !available.length && <Empty title="Žádný volný kontakt k přiřazení" />}
      {available.length > 0 && <>
        <fieldset className="fields" disabled={action.pending}>
          <Field label="Kontakt" wide><select value={contactId} required onChange={event => setContactId(event.target.value)}>
            <option value="">Vyberte kontakt</option>
            {available.map(contact => <option key={contact.id} value={contact.id}>
              {[fullName(contact), contact.phone, contact.email].filter(Boolean).join(' · ')}
            </option>)}
          </select></Field>
          <Field label="Role kontaktu" wide><input name="role" placeholder="Např. předseda SVJ" /></Field>
        </fieldset>
        <ErrorMessage error={action.error} />
        <FormActions busy={action.pending} close={close} label="Přiřadit" disabled={!contactId} />
      </>}
      {!available.length && <div className="form-actions"><Button onClick={close}>Zavřít</Button></div>}
    </form>
  </Modal>
}

export function AssignObject({ companyId, close, saved }: { companyId: string; close: () => void; saved: () => void }) {
  const action = useAction()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Building>()
  const current = useDebounce(query)
  const objects = useResource(useCallback(() => api.searchObjects({ query: current, page }), [current, page]))
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    void action.run(async () => {
      if (selected.managementCompanyId && !await ask(
        `Převést objekt od správce ${selected.managementCompanyName} k této firmě?`,
        { title: 'Změnit správce', kind: 'warning', okLabel: 'Převést', cancelLabel: 'Zrušit' },
      )) return
      await api.setObjectCompany(selected.id, companyId, selected.managementCompanyId)
      saved()
    })
  }
  return <Modal title="Přiřadit existující objekt" busy={action.pending} onClose={close}>
    <form onSubmit={submit} noValidate>
      <fieldset disabled={action.pending}>
        <Field label="Hledat podle názvu nebo adresy"><input type="search" value={query} onChange={event => {
          setQuery(event.target.value)
          setSelected(undefined)
          setPage(0)
        }} /></Field>
        <ErrorMessage error={objects.error} retry={objects.refresh} />
        {objects.loading && !objects.data && <Loading />}
        {objects.data && !objects.error && <>
          {objects.data.items.length ? <div className="object-choices">
            {objects.data.items.map(object => <label className="object-choice" key={object.id}>
              <input type="radio" name="object" value={object.id} checked={selected?.id === object.id}
                disabled={object.managementCompanyId === companyId || objects.loading || current !== query}
                onChange={() => setSelected(object)} />
              <Building2 size={17} /><span><strong>{object.name}</strong><small>
                {address(object)} · {object.managementCompanyName ?? 'Bez správce'}
              </small></span>
            </label>)}
          </div> : <Empty title="Žádné odpovídající objekty" />}
          <Pagination page={objects.data.page} size={objects.data.pageSize} total={objects.data.total}
            busy={objects.loading || current !== query} onChange={value => { setPage(value); setSelected(undefined) }} />
        </>}
      </fieldset>
      <ErrorMessage error={action.error} />
      <div className="form-actions"><Button onClick={close} disabled={action.pending}>Zrušit</Button>
        <Button type="submit" variant="primary" disabled={!selected || action.pending}>Přiřadit objekt</Button>
      </div>
    </form>
  </Modal>
}
