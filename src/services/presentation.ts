import type { ActivityType, Building, ContactInput } from './api'

const date = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Prague',
})
const time = new Intl.DateTimeFormat('cs-CZ', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Prague',
})

export function activityDate(timestamp: string) {
  const value = new Date(timestamp)
  return `${date.format(value).replace(/\s+/g, ' ')} • ${time.format(value)}`
}

export const activityLabels: Record<ActivityType, string> = {
  phone: 'Telefon', email: 'E-mail', meeting: 'Osobní jednání', note: 'Interní poznámka',
}

export function address(object: Pick<Building, 'street' | 'buildingNumber' | 'postalCode' | 'city'>) {
  return [[object.street, object.buildingNumber].filter(Boolean).join(' '),
    [object.postalCode, object.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

export function fullName(contact: Pick<ContactInput, 'firstName' | 'lastName'>) {
  return `${contact.firstName} ${contact.lastName}`
}

export function publicError(error: unknown) {
  if (error && typeof error === 'object' && !(error instanceof Error) &&
    'message' in error && typeof error.message === 'string') return error.message
  return 'Operaci se nepodařilo dokončit. Zkuste to znovu.'
}
