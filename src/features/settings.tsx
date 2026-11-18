import { save } from '@tauri-apps/plugin-dialog'
import { ArrowDownToLine, Archive, ChevronRight } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button, Card, Empty, ErrorMessage, Field, Loading, PageHeader, Pagination } from '../components/ui'
import { api, type Entity, type ObjectPage } from '../services/api'
import { useAction, useResource } from '../services/hooks'
import { fullName } from '../services/presentation'
import { ObjectTable } from './objects'
import { sectionNames, type OpenRecord } from './records'

export function Settings({ open }: { open: OpenRecord }) {
  const action = useAction()
  const [message, setMessage] = useState('')
  const [entity, setEntity] = useState<Entity>('object')
  function backup() {
    void action.run(async () => {
      setMessage('')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const path = await save({
        title: 'Uložit zálohu databáze', defaultPath: `profitherm-${stamp}.db`,
        filters: [{ name: 'Databáze SQLite', extensions: ['db'] }],
      })
      if (!path) return
      await api.backup(path)
      setMessage('Záloha byla uložena.')
    })
  }
  return <>
    <PageHeader title="Nastavení" subtitle="Správa lokální databáze a archivovaných záznamů." />
    <Card title="Záloha databáze" action={<Button variant="primary" onClick={backup} disabled={action.pending}>
      <ArrowDownToLine size={18} />{action.pending ? 'Ukládání…' : 'Vytvořit zálohu'}
    </Button>}>
      <p className="card-copy">Uložte konzistentní kopii všech dat do vybraného souboru. Každou zálohu uložte pod novým názvem.</p>
      <ErrorMessage error={action.error} />
      {message && <p className="success" role="status">{message}</p>}
    </Card>
    <Card title="Archiv" action={<Field label="Typ záznamu"><select value={entity}
      onChange={event => setEntity(event.target.value as Entity)}>
      {(['object', 'company', 'contact'] as const).map(key => <option key={key} value={key}>{sectionNames[key]}</option>)}
    </select></Field>}>
      <p className="card-copy">Otevřete záznam v archivu a v jeho detailu zvolte Obnovit.</p>
      <ArchiveList key={entity} entity={entity} open={open} />
    </Card>
  </>
}

function ArchiveList({ entity, open }: { entity: Entity; open: OpenRecord }) {
  const [page, setPage] = useState(0)
  const archive = useResource(useCallback(async (): Promise<ObjectPage | { items: { id: string; name: string }[] }> => {
    if (entity === 'object') return api.searchObjects({ archived: true, page })
    if (entity === 'company') return { items: await api.listCompanies(true) }
    return { items: (await api.listContacts(true)).map(contact => ({ id: contact.id, name: fullName(contact) })) }
  }, [entity, page]))
  if (archive.error) return <ErrorMessage error={archive.error} retry={archive.refresh} />
  if (!archive.data) return <Loading />
  if (!archive.data.items.length) return <Empty icon={<Archive size={22} />} title="Žádné archivované záznamy" />
  if ('page' in archive.data) {
    return <>
      <ObjectTable objects={archive.data.items} open={id => open('object', id)} />
      <Pagination page={archive.data.page} size={archive.data.pageSize} total={archive.data.total}
        onChange={setPage} busy={archive.loading} />
    </>
  }
  return <ul className="record-list">{archive.data.items.map(item => <li key={item.id}>
    <button className="text-link" onClick={() => open(entity, item.id)}>{item.name}</button>
    <Button variant="quiet" className="icon-button ml-auto" aria-label={`Otevřít ${item.name}`}
      onClick={() => open(entity, item.id)}><ChevronRight size={18} /></Button>
  </li>)}</ul>
}
