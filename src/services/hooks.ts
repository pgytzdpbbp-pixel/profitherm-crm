import { useEffect, useRef, useState } from 'react'
import { publicError } from './presentation'

export function useResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    Promise.resolve().then(load).then(value => {
      if (current) setData(value)
    }, reason => {
      if (current) setError(publicError(reason))
    }).finally(() => {
      if (current) setLoading(false)
    })
    return () => { current = false }
  }, [load, revision])
  return { data, error, loading, refresh: () => setRevision(value => value + 1) }
}

export function useAction() {
  const locked = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function run(task: () => Promise<void>) {
    if (locked.current) return
    locked.current = true
    setPending(true)
    setError('')
    try {
      await task()
    } catch (reason) {
      setError(publicError(reason))
    } finally {
      locked.current = false
      setPending(false)
    }
  }
  return { pending, error, run }
}

export function useDebounce<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}
