import { Clock3, Mail, MessageSquareText, Phone, Plus, StickyNote, UsersRound } from 'lucide-react'
import { useCallback, useState, type FormEvent } from 'react'
import { Button, Card, Empty, ErrorMessage, Field, FormActions, Loading, Modal } from '../components/ui'
import { api, type ActivityType, type LinkedContact } from '../services/api'
import { useAction, useResource } from '../services/hooks'
import { activityDate, activityLabels, fullName } from '../services/presentation'

const types: ActivityType[] = ['note', 'phone', 'email', 'meeting']
const icons = { note: StickyNote, phone: Phone, email: Mail, meeting: UsersRound }

export function Activities({ id, editable, contacts, now = () => new Date() }: {
  id: string; editable: boolean; contacts: LinkedContact[]; now?: () => Date
}) {
  const [startedAt, setStartedAt] = useState<string>()
  const list = useResource(useCallback(() => api.listActivities(id), [id]))
  const eligible = [...new Map(contacts.filter(contact => !contact.archivedAt).map(contact => [contact.id, contact])).values()]
  function close() { setStartedAt(undefined) }
  return <Card title="Komunikace" action={editable && <Button variant="primary" onClick={() => setStartedAt(now().toISOString())}>
    <Plus size={18} />Nový záznam
  </Button>}>
    <ErrorMessage error={list.error} retry={list.refresh} />
    {list.loading && !list.data && <Loading />}
    {list.data && !list.error && (list.data.length ? <ol className="timeline">
      {list.data.map(activity => {
        const Icon = icons[activity.activityType]
        return <li key={activity.id}><span className="row-icon"><Icon size={18} /></span>
          <div className="timeline-content">
            <div className="timeline-title"><strong>{activityLabels[activity.activityType]}</strong>
              <time dateTime={activity.startedAt}>{activityDate(activity.startedAt)}</time></div>
            {activity.contactName && <small>{activity.contactName}</small>}
            <p>{activity.content}</p>
          </div>
        </li>
      })}
    </ol> : <Empty icon={<MessageSquareText size={24} />} title="Zatím bez komunikace">
      {editable && <p>Přidejte telefonát, e-mail, jednání nebo poznámku.</p>}
    </Empty>)}
    {startedAt && <ActivityForm id={id} startedAt={startedAt} contacts={eligible} close={close}
      saved={() => { close(); list.refresh() }} />}
  </Card>
}

function ActivityForm({ id, startedAt, contacts, close, saved }: {
  id: string; startedAt: string; contacts: LinkedContact[]; close: () => void; saved: () => void
}) {
  const action = useAction()
  const [invalid, setInvalid] = useState(false)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const content = String(fields.get('content')).trim()
    setInvalid(!content)
    if (!content) return
    const activityType = fields.get('activityType') as ActivityType
    const contactId = String(fields.get('contactId')) || null
    void action.run(async () => {
      await api.createActivity({ objectId: id, contactId, content, activityType, startedAt })
      saved()
    })
  }
  return <Modal title="Nový záznam" busy={action.pending} onClose={close}>
    <form onSubmit={submit} noValidate>
      <p className="start-time"><Clock3 size={17} />Zahájeno <time dateTime={startedAt}>{activityDate(startedAt)}</time></p>
      <fieldset className="fields" disabled={action.pending}>
        <Field label="Typ komunikace"><select name="activityType">
          {types.map(type => <option key={type} value={type}>{activityLabels[type]}</option>)}
        </select></Field>
        <Field label="Kontakt"><select name="contactId">
          <option value="">Bez kontaktu</option>
          {contacts.map(contact => <option key={contact.id} value={contact.id}>{fullName(contact)}</option>)}
        </select></Field>
        <Field label="Text záznamu" wide><textarea name="content" rows={7} required /></Field>
      </fieldset>
      <ErrorMessage error={invalid ? 'Vyplňte text záznamu.' : action.error} />
      <FormActions busy={action.pending} close={close} label="Uložit záznam" />
    </form>
  </Modal>
}
