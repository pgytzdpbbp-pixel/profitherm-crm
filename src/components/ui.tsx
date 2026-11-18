import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export function Button({ variant = 'secondary', className = '', type = 'button', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'quiet' }) {
  return <button type={type} className={`button button--${variant} ${className}`} {...props} />
}

export function PageHeader({ title, subtitle, actions, back }: {
  title: string; subtitle?: string; actions?: ReactNode; back?: { label: string; run: () => void }
}) {
  return <header className="page-header">
    {back && <Button className="back" variant="quiet" onClick={back.run}><ArrowLeft size={17} />{back.label}</Button>}
    <div className="page-heading">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  </header>
}

export function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="card">
    <div className="card-heading"><h2>{title}</h2>{action}</div>
    {children}
  </section>
}

export function ErrorMessage({ error, retry }: { error?: string; retry?: () => void }) {
  return error ? <div className="error" role="alert"><AlertCircle size={18} /><span>{error}</span>
    {retry && <Button variant="quiet" onClick={retry}>Zkusit znovu</Button>}</div> : null
}

export function Loading() {
  return <p className="placeholder" role="status">Načítání…</p>
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return <div className="empty">{icon && <span className="empty-icon">{icon}</span>}<strong>{title}</strong>{children}</div>
}

export function Field({ label, children, htmlFor, wide }: {
  label: string; children: ReactNode; htmlFor?: string; wide?: boolean
}) {
  return <label htmlFor={htmlFor} className={`field ${wide ? 'field--wide' : ''}`}><span>{label}</span>{children}</label>
}

export function Modal({ title, busy = false, onClose, children }: {
  title: string; busy?: boolean; onClose: () => void; children: ReactNode
}) {
  const element = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = element.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={element} aria-labelledby={titleId} onCancel={event => {
    event.preventDefault()
    if (!busy) onClose()
  }}>
    <div className="modal-heading">
      <h2 id={titleId}>{title}</h2>
      <Button variant="quiet" className="icon-button" aria-label="Zavřít" disabled={busy} onClick={onClose}><X size={20} /></Button>
    </div>
    {children}
  </dialog>
}

export function FormActions({ busy, close, label = 'Uložit', disabled = false }: { busy: boolean; close: () => void; label?: string; disabled?: boolean }) {
  return <div className="form-actions">
    <Button onClick={close} disabled={busy}>Zrušit</Button>
    <Button type="submit" variant="primary" disabled={busy || disabled}>{busy ? 'Ukládání…' : label}</Button>
  </div>
}

export function ArchiveLabel() {
  return <span className="tag tag--muted">Archivováno</span>
}

export function Pagination({ page, size, total, onChange, busy }: {
  page: number; size: number; total: number; onChange: (page: number) => void; busy: boolean
}) {
  const pages = Math.ceil(total / size)
  return <div className="pagination">
    <span>{total ? `${page * size + 1}–${Math.min((page + 1) * size, total)} z ${total}` : '0 objektů'}</span>
    {pages > 1 && <div className="actions">
      <Button className="icon-button" aria-label="Předchozí stránka" disabled={busy || page === 0}
        onClick={() => onChange(page - 1)}><ChevronLeft size={17} /></Button>
      <span>Strana {page + 1} z {pages}</span>
      <Button className="icon-button" aria-label="Další stránka" disabled={busy || page + 1 >= pages}
        onClick={() => onChange(page + 1)}><ChevronRight size={17} /></Button>
    </div>}
  </div>
}
