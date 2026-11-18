import { invoke } from '@tauri-apps/api/core'

export type Entity = 'company' | 'object' | 'contact'
export type ActivityType = 'phone' | 'email' | 'meeting' | 'note'

interface RecordInfo {
  id: string
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface CompanyInput {
  name: string
  ico: string | null
  street: string | null
  city: string | null
  postalCode: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

export interface Company extends RecordInfo, CompanyInput {}

export interface ObjectInput {
  name: string
  street: string
  buildingNumber: string | null
  city: string
  postalCode: string | null
  managementCompanyId: string | null
  coldWaterMeters: number
  hotWaterMeters: number
  heatMeters: number
  rtnMeters: number
  technicalNotes: string | null
}

export interface Building extends RecordInfo, ObjectInput {
  managementCompanyName: string | null
  managementCompanyArchivedAt: string | null
  lastActivityAt: string | null
}

export interface ContactInput {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
}

export interface Contact extends RecordInfo, ContactInput {
  phoneNormalized: string | null
}

export interface LinkedContact extends Pick<Contact, 'id' | 'firstName' | 'lastName' | 'email' | 'phone' | 'archivedAt'> {
  roleLabel: string | null
}

export interface LinkedRecord {
  id: string
  name: string
  roleLabel: string | null
  archivedAt: string | null
}

export interface CompanyDetail {
  company: Company
  objects: Building[]
  contacts: LinkedContact[]
}

export interface ObjectDetail {
  object: Building
  contacts: LinkedContact[]
  companyContacts: LinkedContact[]
}

export interface ContactDetail {
  contact: Contact
  objects: LinkedRecord[]
  companies: LinkedRecord[]
}

export interface ObjectSearch {
  query?: string
  contactQuery?: string
  companyId?: string
  page?: number
  archived?: boolean
}

export interface ObjectPage {
  items: Building[]
  page: number
  pageSize: number
  total: number
}

export interface ActivityInput {
  objectId: string
  contactId: string | null
  activityType: ActivityType
  content: string
  startedAt: string
}

export interface Activity extends ActivityInput {
  id: string
  contactName: string | null
  savedAt: string
  updatedAt: string
}

export const api = {
  searchObjects: (input: ObjectSearch) => invoke<ObjectPage>('search_objects', { input }),
  listCompanies: (archived = false) => invoke<Company[]>('list_companies', { archived }),
  listContacts: (archived = false) => invoke<Contact[]>('list_contacts', { archived }),
  getCompany: (id: string) => invoke<CompanyDetail>('get_company', { id }),
  getObject: (id: string) => invoke<ObjectDetail>('get_object', { id }),
  getContact: (id: string) => invoke<ContactDetail>('get_contact', { id }),
  saveCompany: (input: CompanyInput, id?: string) =>
    invoke<string>(id ? 'update_company' : 'create_company', { input, id }),
  saveObject: (input: ObjectInput, id?: string) =>
    invoke<string>(id ? 'update_object' : 'create_object', { input, id }),
  saveContact: (input: ContactInput, id?: string) =>
    invoke<string>(id ? 'update_contact' : 'create_contact', { input, id }),
  setObjectCompany: (id: string, companyId: string | null, currentCompanyId: string | null) =>
    invoke<void>('set_object_company', { id, companyId, currentCompanyId }),
  assignContact: (entity: 'object' | 'company', id: string, contactId: string, role: string | null) =>
    invoke<void>(`assign_contact_to_${entity}`, { id, contactId, role }),
  removeContact: (entity: 'object' | 'company', id: string, contactId: string) =>
    invoke<void>(`remove_contact_from_${entity}`, { id, contactId }),
  createLinkedContact: (entity: 'object' | 'company', id: string, input: ContactInput, role: string | null) =>
    invoke<string>('create_linked_contact', { entity, id, input, role }),
  createActivity: (input: ActivityInput) => invoke<string>('create_activity', { input }),
  listActivities: (id: string) => invoke<Activity[]>('list_object_activities', { id }),
  archive: (entity: Entity, id: string) => invoke<void>(`archive_${entity}`, { id }),
  restore: (entity: Entity, id: string) => invoke<void>('restore_entity', { entity, id }),
  backup: (path: string) => invoke<void>('create_database_backup', { path }),
}
