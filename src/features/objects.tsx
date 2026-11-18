import { Building2, ChevronRight, Clock3, Plus, Search, UserRoundSearch } from 'lucide-react'
import { useCallback, useState } from 'react'
import { ArchiveLabel, Button, Empty, ErrorMessage, Loading, PageHeader, Pagination } from '../components/ui'
import { api, type Building } from '../services/api'
import { useDebounce, useResource } from '../services/hooks'
import { activityDate, address } from '../services/presentation'
import { ObjectForm } from './forms'

export interface ObjectFilters {
  query: string
  contactQuery: string
  companyId: string
  page: number
}

export const emptyFilters: ObjectFilters = { query: '', contactQuery: '', companyId: '', page: 0 }

export function ObjectTable({ objects, open }: { objects: Building[]; open: (id: string) => void }) {
  return <div className="table-wrap"><table>
    <thead><tr><th scope="col">Objekt</th><th scope="col">Správcovská firma</th>
      <th scope="col">Poslední komunikace</th><th scope="col"><span className="sr-only">Detail</span></th></tr></thead>
    <tbody>{objects.map(object => <tr key={object.id}>
      <td><button className="table-link" onClick={() => open(object.id)}>
        <span className="row-icon"><Building2 size={18} /></span>
        <span><strong>{object.name}</strong><small>{address(object)}</small></span>
      </button></td>
      <td>{object.managementCompanyName || <span className="muted">Bez správce</span>}
        {object.managementCompanyArchivedAt && <ArchiveLabel />}</td>
      <td>{object.lastActivityAt
        ? <span className="inline-icon"><Clock3 size={15} />{activityDate(object.lastActivityAt)}</span>
        : <span className="muted">Bez záznamu</span>}</td>
      <td><Button variant="quiet" className="icon-button" aria-label={`Otevřít objekt ${object.name}`}
        onClick={() => open(object.id)}><ChevronRight size={19} /></Button></td>
    </tr>)}</tbody>
  </table></div>
}

export function Objects({ filters, change, open }: {
  filters: ObjectFilters; change: (filters: ObjectFilters) => void; open: (id: string) => void
}) {
  const [creating, setCreating] = useState(false)
  const current = useDebounce(filters)
  const companies = useResource(api.listCompanies)
  const objects = useResource(useCallback(() => api.searchObjects({
    query: current.query, contactQuery: current.contactQuery, companyId: current.companyId || undefined,
    page: current.page,
  }), [current]))
  const filtered = Boolean(filters.query.trim() || filters.contactQuery.trim() || filters.companyId)
  const busy = objects.loading || filters !== current
  function update(values: Partial<ObjectFilters>) {
    change({ ...filters, page: 0, ...values })
  }

  return <>
    <PageHeader title="Objekty" subtitle="Přehled objektů, správců a poslední komunikace."
      actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={19} />Nový objekt</Button>} />
    <section className="filters" aria-label="Vyhledávání objektů">
      <label className="search-field"><span>Název nebo adresa</span><div>
        <Search size={18} /><input type="search" value={filters.query}
          placeholder="Hledat objekt podle názvu nebo adresy..." onChange={event => update({ query: event.target.value })} />
      </div></label>
      <label className="search-field"><span>Kontaktní osoba</span><div>
        <UserRoundSearch size={18} /><input type="search" value={filters.contactQuery}
          placeholder="Hledat kontakt, telefon nebo e-mail..." onChange={event => update({ contactQuery: event.target.value })} />
      </div></label>
      <label className="field"><span>Správcovská firma</span><select value={filters.companyId}
        disabled={companies.loading || !!companies.error} onChange={event => update({ companyId: event.target.value })}>
        <option value="">Všechny firmy</option>
        {filters.companyId && !companies.data?.some(company => company.id === filters.companyId) &&
          <option value={filters.companyId}>Dříve vybraný správce</option>}
        {companies.data?.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select></label>
    </section>
    <ErrorMessage error={companies.error === objects.error ? undefined : companies.error} retry={companies.refresh} />
    <section className="card result-card" aria-label="Seznam objektů" aria-busy={busy}>
      <div className="card-heading"><div className="inline-icon"><h2>Přehled objektů</h2>
        {objects.data && <span className="tag">{objects.data.total}</span>}</div>
        {filtered && <Button variant="quiet" onClick={() => change(emptyFilters)}>Vymazat filtry</Button>}
      </div>
      <ErrorMessage error={objects.error} retry={objects.refresh} />
      {objects.data && !objects.error ? <>
        {objects.data.items.length
          ? <ObjectTable objects={objects.data.items} open={open} />
          : <Empty icon={<Building2 size={25} />} title={filtered ? 'Žádné odpovídající objekty' : 'Zatím tu nejsou žádné objekty'}>
            <p>{filtered ? 'Zkuste upravit vyhledávání nebo vymazat filtry.' : 'Přidejte první objekt, ke kterému chcete evidovat kontakty a komunikaci.'}</p>
          </Empty>}
        <Pagination page={objects.data.page} size={objects.data.pageSize} total={objects.data.total}
          busy={busy} onChange={page => update({ page })} />
      </> : !objects.error && <Loading />}
    </section>
    {creating && <ObjectForm close={() => setCreating(false)} saved={open} />}
  </>
}
