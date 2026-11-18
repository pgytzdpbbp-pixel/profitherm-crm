import { useState, type FormEvent, type ReactNode } from 'react'
import { z } from 'zod'
import { Button, ErrorMessage, Field, FormActions, Loading, Modal } from '../components/ui'
import { api, type Building, type Company, type Contact } from '../services/api'
import { useAction, useResource } from '../services/hooks'

const required = (message: string) => z.string().trim().min(1, message)
const nullableText = z.string().trim().transform(value => value || null)
const email = z.string().trim().refine(value => !value || z.email().safeParse(value).success,
  'Zadejte platnou e-mailovou adresu.').transform(value => value || null)
const meter = z.string().trim().refine(value => !value || (/^\d+$/.test(value) && Number(value) <= 2147483647),
  'Počet měřidel musí být celé nezáporné číslo do 2 147 483 647.').transform(Number)

const companySchema = z.object({
  name: required('Vyplňte název firmy.'), ico: nullableText, street: nullableText, city: nullableText,
  postalCode: nullableText, email, phone: nullableText, notes: nullableText,
})
const contactSchema = z.object({
  firstName: required('Vyplňte jméno kontaktu.'), lastName: required('Vyplňte příjmení kontaktu.'),
  email, phone: nullableText, notes: nullableText,
})
const objectSchema = z.object({
  name: required('Vyplňte název objektu.'), street: required('Vyplňte ulici.'),
  city: required('Vyplňte obec.'), buildingNumber: nullableText, postalCode: nullableText,
  managementCompanyId: nullableText, coldWaterMeters: meter, hotWaterMeters: meter,
  heatMeters: meter, rtnMeters: meter, technicalNotes: nullableText,
})

export const meters = [
  ['coldWaterMeters', 'Vodoměry SV'], ['hotWaterMeters', 'Vodoměry TV'],
  ['heatMeters', 'Měřiče tepla'], ['rtnMeters', 'RTN'],
] as const

interface FormProps<T> {
  initial?: T
  close: () => void
  saved: (id: string) => void | Promise<void>
}

interface InputField {
  name: string
  label: string
  initial?: string | number | null
  type?: 'email' | 'tel' | 'number' | 'textarea'
  wide?: boolean
  required?: boolean
}

function Input({ name, label, initial, type, wide, required }: InputField) {
  return <Field label={label} wide={wide}>
    {type === 'textarea'
      ? <textarea name={name} defaultValue={initial ?? ''} rows={4} required={required} />
      : <input name={name} defaultValue={initial ?? ''} type={type ?? 'text'} required={required}
        min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined} />}
  </Field>
}

function RecordForm<T>({ title, close, submit, schema, children }: {
  title: string
  close: () => void
  submit: (input: T) => Promise<void>
  schema: z.ZodType<T>
  children: ReactNode
}) {
  const [validation, setValidation] = useState('')
  const action = useAction()
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidation('')
    const result = schema.safeParse(Object.fromEntries(new FormData(event.currentTarget)))
    if (!result.success) {
      setValidation(result.error.issues[0].message)
      return
    }
    void action.run(() => submit(result.data))
  }
  return <Modal title={title} busy={action.pending} onClose={close}>
    <form onSubmit={save} noValidate>
      <fieldset disabled={action.pending} className="fields">{children}</fieldset>
      <ErrorMessage error={validation || action.error} />
      <FormActions busy={action.pending} close={close} />
    </form>
  </Modal>
}

export function ObjectForm({ initial, close, saved }: FormProps<Building>) {
  const { data, loading, error, refresh } = useResource(api.listCompanies)
  const title = initial ? 'Upravit objekt' : 'Nový objekt'
  if (!data) return <Modal title={title} onClose={close}>
    {loading ? <Loading /> : <ErrorMessage error={error} retry={refresh} />}
    <div className="form-actions"><Button onClick={close}>Zrušit</Button></div>
  </Modal>
  return <RecordForm title={title} schema={objectSchema} close={close}
    submit={async input => { await saved(await api.saveObject(input, initial?.id)) }}>
    <Input name="name" label="Název objektu" initial={initial?.name} wide required />
    <Input name="street" label="Ulice" initial={initial?.street} required />
    <Input name="buildingNumber" label="Číslo domu" initial={initial?.buildingNumber} />
    <Input name="city" label="Obec" initial={initial?.city} required />
    <Input name="postalCode" label="PSČ" initial={initial?.postalCode} />
    <Field label="Správcovská firma" wide>
      <select name="managementCompanyId" defaultValue={initial?.managementCompanyId ?? ''}>
        <option value="">Bez správce</option>
        {initial?.managementCompanyArchivedAt && <option value={initial.managementCompanyId!}>
          {initial.managementCompanyName} (archivováno)
        </option>}
        {data.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
    </Field>
    {meters.map(([name, label]) => <Input key={name} name={name} label={label} type="number" initial={initial?.[name] ?? 0} />)}
    <Input name="technicalNotes" label="Technické poznámky" type="textarea" initial={initial?.technicalNotes} wide />
  </RecordForm>
}

export function CompanyForm({ initial, close, saved }: FormProps<Company>) {
  return <RecordForm title={initial ? 'Upravit správcovskou firmu' : 'Nová správcovská firma'} schema={companySchema}
    close={close} submit={async input => { await saved(await api.saveCompany(input, initial?.id)) }}>
    <Input name="name" label="Název firmy" initial={initial?.name} wide required />
    <Input name="ico" label="IČO" initial={initial?.ico} />
    <Input name="street" label="Ulice a číslo domu" initial={initial?.street} />
    <Input name="city" label="Obec" initial={initial?.city} />
    <Input name="postalCode" label="PSČ" initial={initial?.postalCode} />
    <Input name="email" label="E-mail" type="email" initial={initial?.email} />
    <Input name="phone" label="Telefon" type="tel" initial={initial?.phone} />
    <Input name="notes" label="Poznámky" type="textarea" initial={initial?.notes} wide />
  </RecordForm>
}

export function ContactForm({ initial, close, saved, linked }: FormProps<Contact> & {
  linked?: { entity: 'object' | 'company'; id: string }
}) {
  const schema = contactSchema.extend({ role: nullableText.optional() })
  return <RecordForm title={initial ? 'Upravit kontakt' : 'Nový kontakt'} schema={schema}
    close={close} submit={async ({ role, ...input }) => {
      const id = linked ? await api.createLinkedContact(linked.entity, linked.id, input, role ?? null)
        : await api.saveContact(input, initial?.id)
      await saved(id)
    }}>
    <Input name="firstName" label="Jméno" initial={initial?.firstName} required />
    <Input name="lastName" label="Příjmení" initial={initial?.lastName} required />
    <Input name="email" label="E-mail" initial={initial?.email} type="email" />
    <Input name="phone" label="Telefon" initial={initial?.phone} type="tel" />
    {linked && <Input name="role" label="Role kontaktu" wide />}
    <Input name="notes" label="Poznámky" initial={initial?.notes} type="textarea" wide />
  </RecordForm>
}
