import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createShapeId,
  defaultTools,
  Editor,
  TldrawEditor,
  TLEditorComponents,
} from 'tldraw'
import bundledData from '../data/things.json'
import { captureFromText } from '../parser.js'
import { GLIMMER_SHAPE_TYPE, GlimmerShape, GlimmerShapeUtil } from './GlimmerShape'
import type { GlimmerItem, GlimmerType } from './types'

const LOCAL_ITEMS_KEY = 'glimmer.items.v1'
const HIDDEN_ITEMS_KEY = 'glimmer.hidden.v1'
const CANVAS_POSITIONS_KEY = 'glimmer.canvas-positions.v1'
const ACCENTS = ['cream', 'sage', 'yellow', 'pink', 'blue']
const FILTERS: Array<{ value: 'all' | GlimmerType; label: string }> = [
  { value: 'all', label: 'everything' },
  { value: 'site', label: 'sites' },
  { value: 'sound', label: 'sounds' },
  { value: 'image', label: 'images' },
  { value: 'note', label: 'notes' },
]

const canvasComponents: TLEditorComponents = {
  LoadingScreen: null,
}
const canvasShapeUtils = [GlimmerShapeUtil]
const canvasOptions = { createTextOnCanvasDoubleClick: false }
const getCanvasShapeVisibility = (shape: { meta: Record<string, unknown> }) => shape.meta.hidden ? 'hidden' as const : 'inherit' as const

const bundledItems = bundledData as GlimmerItem[]

export function App() {
  const [localItems, setLocalItems] = useState<GlimmerItem[]>(() => readJson(LOCAL_ITEMS_KEY, []))
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => readJson(HIDDEN_ITEMS_KEY, []))
  const [hydratedImages, setHydratedImages] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<'all' | GlimmerType>('all')
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const addDialogRef = useRef<HTMLDialogElement>(null)
  const detailDialogRef = useRef<HTMLDialogElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const items = useMemo(() => {
    const byId = new Map<string, GlimmerItem>()
    ;[...bundledItems, ...localItems].forEach((item) => byId.set(item.id, item))
    return [...byId.values()]
      .filter((item) => !hiddenIds.includes(item.id))
      .map((item) => hydratedImages[item.id] ? { ...item, image: hydratedImages[item.id] } : item)
  }, [hiddenIds, hydratedImages, localItems])

  const visibleItems = useMemo(() => items.filter((item) => {
    if (filter !== 'all' && item.type !== filter) return false
    if (!query.trim()) return true
    const haystack = [item.title, item.note, item.caption, item.url, item.type].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  }), [filter, items, query])

  const activeItem = items.find((item) => item.id === activeId) ?? null

  useEffect(() => {
    let cancelled = false
    Promise.all(localItems.filter((item) => item.imageKey).map(async (item) => {
      const blob = await imageStore.get(item.imageKey!)
      return blob ? [item.id, URL.createObjectURL(blob)] as const : null
    })).then((entries) => {
      if (cancelled) return
      setHydratedImages(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>))
    })
    return () => { cancelled = true }
  }, [localItems])

  useEffect(() => {
    if (!editor) return
    syncShapes(editor, items)
  }, [editor, items])

  useEffect(() => {
    if (!editor) return
    return editor.store.listen(() => {
      const positions = Object.fromEntries(getGlimmerShapes(editor).map((shape) => [
        shape.props.itemId,
        { x: shape.x, y: shape.y, rotation: shape.rotation },
      ]))
      localStorage.setItem(CANVAS_POSITIONS_KEY, JSON.stringify(positions))
    }, { scope: 'document', source: 'user' })
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const visibleIds = new Set(visibleItems.map((item) => item.id))
    const updates = getGlimmerShapes(editor).map((shape) => ({
      id: shape.id,
      type: shape.type,
      meta: { ...shape.meta, hidden: !visibleIds.has(shape.props.itemId) },
    }))
    if (updates.length) editor.updateShapes(updates)
  }, [editor, visibleItems])

  useEffect(() => {
    const handleOpen = (event: Event) => setActiveId((event as CustomEvent<string>).detail)
    window.addEventListener('glimmer:open', handleOpen)
    return () => window.removeEventListener('glimmer:open', handleOpen)
  }, [])

  useEffect(() => {
    if (!activeItem || !detailDialogRef.current) return
    if (!detailDialogRef.current.open) detailDialogRef.current.showModal()
  }, [activeItem])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 1800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (event.key === '/' && !editing) {
        event.preventDefault()
        searchRef.current?.focus()
      }
      if (event.key.toLowerCase() === 'n' && !editing && !document.querySelector('dialog[open]')) {
        event.preventDefault()
        openAddDialog()
      }
      if (event.key === 'Enter' && !editing && editor && !document.querySelector('dialog[open]')) {
        const selected = editor.getSelectedShapes()
        if (selected.length === 1 && selected[0].type === GLIMMER_SHAPE_TYPE) {
          event.preventDefault()
          setActiveId((selected[0] as GlimmerShape).props.itemId)
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [editor])

  const handleMount = useCallback((nextEditor: Editor) => {
    setEditor(nextEditor)
    nextEditor.setCurrentTool('select')
    window.setTimeout(() => {
      if (getGlimmerShapes(nextEditor).length) nextEditor.zoomToFit({ animation: { duration: 180 } })
    }, 80)
  }, [])

  function openAddDialog() {
    const dialog = addDialogRef.current
    if (!dialog) return
    const form = dialog.querySelector('form') as HTMLFormElement | null
    form?.reset()
    dialog.showModal()
    window.requestAnimationFrame(() => dialog.querySelector<HTMLTextAreaElement>('textarea')?.focus())
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const text = String(form.get('capture') ?? '').trim()
    const title = String(form.get('title') ?? '').trim()
    const file = form.get('image') as File | null
    if (!text && (!file || !file.size)) return

    let imageKey = ''
    if (file?.size) {
      imageKey = crypto.randomUUID()
      await imageStore.put(imageKey, file)
    }

    const captured = captureFromText(text || file?.name || '', { title, imageKey }) as Partial<GlimmerItem>
    const item: GlimmerItem = {
      id: crypto.randomUUID(),
      type: captured.type ?? 'note',
      title: captured.title ?? title ?? 'untitled glimmer',
      note: captured.note ?? text,
      url: captured.url,
      timecode: captured.timecode,
      ...(imageKey ? { imageKey, imageAlt: title || file?.name } : {}),
      capturedAt: new Date().toISOString(),
      accent: ACCENTS[Math.floor(Math.random() * ACCENTS.length)],
    }

    const next = [...localItems, item]
    setLocalItems(next)
    localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(next))
    addDialogRef.current?.close()
    setFilter('all')
    setQuery('')
    setToast('kept ✦')
  }

  async function removeActiveItem() {
    if (!activeItem) return
    const local = localItems.find((item) => item.id === activeItem.id)
    if (local) {
      const next = localItems.filter((item) => item.id !== activeItem.id)
      setLocalItems(next)
      localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(next))
      if (local.imageKey) await imageStore.delete(local.imageKey)
    } else {
      const next = [...hiddenIds, activeItem.id]
      setHiddenIds(next)
      localStorage.setItem(HIDDEN_ITEMS_KEY, JSON.stringify(next))
    }
    detailDialogRef.current?.close()
    setActiveId(null)
    setToast('let go')
  }

  return (
    <div className="app-shell">
      <div className="canvas-wrap">
        <TldrawEditor
          shapeUtils={canvasShapeUtils}
          tools={defaultTools}
          initialState="select"
          options={canvasOptions}
          components={canvasComponents}
          getShapeVisibility={getCanvasShapeVisibility}
          onMount={handleMount}
          autoFocus
        />
      </div>

      <header className="app-bar">
        <div className="brand" aria-label="Glimmer">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <span>glimmer</span>
        </div>

        <nav className="filters" aria-label="Filter your glimmers">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              className={filter === option.value ? 'filter-chip is-active' : 'filter-chip'}
              type="button"
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </nav>

        <div className="bar-actions">
          <label className="search-box">
            <span className="sr-only">Search your glimmers</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="find something…"
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>/</kbd>
          </label>
          <button className="fit-button" type="button" onClick={() => editor?.zoomToFit({ animation: { duration: 180 } })}>
            fit
          </button>
          <button className="primary-button" type="button" onClick={openAddDialog}>
            <span aria-hidden="true">＋</span> keep something
          </button>
        </div>
      </header>

      <div className="canvas-label" aria-hidden="true">things I noticed</div>
      <div className="item-count" aria-live="polite">{visibleItems.length} {visibleItems.length === 1 ? 'glimmer' : 'glimmers'}</div>

      {!visibleItems.length ? (
        <div className="empty-state">
          <span aria-hidden="true">✦</span>
          <h1>nothing here, for now</h1>
          <p>Keep the next thing that makes you stop for half a second.</p>
        </div>
      ) : null}

      <dialog ref={addDialogRef} className="modal add-modal" onClick={closeOnBackdrop}>
        <form onSubmit={addItem}>
          <div className="modal-heading">
            <div>
              <p className="eyebrow">a new glimmer</p>
              <h2>what caught you?</h2>
            </div>
            <button className="close-button" type="button" aria-label="Close" onClick={() => addDialogRef.current?.close()}>×</button>
          </div>

          <label className="field">
            <span>Drop it here</span>
            <textarea name="capture" rows={4} required placeholder={'I love this site https://…\n\n1:15–1:25 in this song is so nice'} />
          </label>

          <div className="field-row">
            <label className="field">
              <span>A title, if it has one</span>
              <input name="title" type="text" placeholder="leave blank and I’ll guess" />
            </label>
            <label className="field">
              <span>A picture, if there is one</span>
              <input name="image" type="file" accept="image/*" />
            </label>
          </div>

          <div className="modal-actions">
            <p>Saved in this browser. Tell Codex “keep this in Glimmer” to publish it everywhere.</p>
            <button className="primary-button" type="submit">keep it</button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={detailDialogRef}
        className="modal detail-modal"
        onClick={closeOnBackdrop}
        onClose={() => setActiveId(null)}
      >
        {activeItem ? (
          <article>
            {activeItem.image ? <img className="detail-image" src={activeItem.image} alt={activeItem.imageAlt || activeItem.title} /> : null}
            <div className="detail-meta">
              <span>{typeLabel(activeItem.type)}</span>
              <time>{formatLongDate(activeItem.capturedAt)}</time>
            </div>
            <h2>{activeItem.title}</h2>
            {activeItem.note ? <p className="detail-note">{activeItem.note}</p> : null}
            {activeItem.caption ? <p className="detail-caption">{activeItem.caption}</p> : null}
            {activeItem.timecode?.label ? <span className="detail-timecode">{activeItem.timecode.label}</span> : null}

            <footer className="detail-footer">
              <button className="remove-button" type="button" onClick={removeActiveItem}>let this one go</button>
              <div className="detail-primary-actions">
                {activeItem.url ? (
                  <a className="visit-link" href={activeItem.url} target="_blank" rel="noreferrer">visit <span aria-hidden="true">↗</span></a>
                ) : null}
                <button className="secondary-button" type="button" onClick={() => detailDialogRef.current?.close()}>close</button>
              </div>
            </footer>
          </article>
        ) : null}
      </dialog>

      <div className={toast ? 'toast is-visible' : 'toast'} role="status" aria-live="polite">{toast}</div>
    </div>
  )
}

function syncShapes(editor: Editor, items: GlimmerItem[]) {
  const current = getGlimmerShapes(editor)
  const byItemId = new Map(current.map((shape) => [shape.props.itemId, shape]))
  const wantedIds = new Set(items.map((item) => item.id))
  const savedPositions = readJson<Record<string, { x: number; y: number; rotation: number }>>(CANVAS_POSITIONS_KEY, {})

  const obsolete = current.filter((shape) => !wantedIds.has(shape.props.itemId)).map((shape) => shape.id)
  if (obsolete.length) editor.deleteShapes(obsolete)

  for (const [index, item] of items.entries()) {
    const existing = byItemId.get(item.id)
    const size = cardSize(item)
    const props = {
      ...size,
      itemId: item.id,
      glimmerType: item.type,
      title: item.title,
      note: item.note,
      url: item.url ?? '',
      image: item.image ?? '',
      imageAlt: item.imageAlt ?? '',
      timecode: item.timecode?.label ?? '',
      capturedAt: item.capturedAt,
      accent: item.accent ?? ACCENTS[index % ACCENTS.length],
    }

    if (existing) {
      editor.updateShape({ id: existing.id, type: existing.type, props })
    } else {
      const fallback = layoutPosition(index)
      const saved = savedPositions[item.id]
      editor.createShape({
        id: createShapeId(`glimmer-${item.id}`),
        type: GLIMMER_SHAPE_TYPE,
        x: saved?.x ?? item.x ?? fallback.x,
        y: saved?.y ?? item.y ?? fallback.y,
        rotation: saved?.rotation ?? degreesToRadians(item.rotation ?? fallback.rotation),
        props,
      })
    }
  }
}

function getGlimmerShapes(editor: Editor) {
  return editor.getCurrentPageShapes().filter((shape): shape is GlimmerShape => shape.type === GLIMMER_SHAPE_TYPE)
}

function cardSize(item: GlimmerItem) {
  if (item.type === 'image' && item.image) return { w: 350, h: 430 }
  if (item.type === 'sound') return { w: 340, h: 300 }
  return { w: 330, h: 270 }
}

function layoutPosition(index: number) {
  const columns = 4
  return {
    x: 100 + (index % columns) * 390 + (index % 2) * 18,
    y: 110 + Math.floor(index / columns) * 350 + (index % 3) * 22,
    rotation: [-1.8, 1.2, -0.8, 1.6][index % 4],
  }
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180
}

function typeLabel(type: GlimmerType) {
  return ({ site: 'a place', sound: 'a moment in sound', image: 'an image', note: 'a thought' })[type]
}

function formatLongDate(value: string) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.valueOf())) return 'kept sometime'
  return `kept ${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
}

function closeOnBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
  if (event.target === event.currentTarget) event.currentTarget.close()
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T
  } catch {
    return fallback
  }
}

const imageStore = {
  db() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('glimmer-images', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('images')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  },
  async get(key: string) {
    return this.run<Blob | undefined>('readonly', (store) => store.get(key))
  },
  async put(key: string, blob: Blob) {
    return this.run<IDBValidKey>('readwrite', (store) => store.put(blob, key))
  },
  async delete(key: string) {
    return this.run<undefined>('readwrite', (store) => store.delete(key))
  },
  async run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
    const db = await this.db()
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('images', mode)
      const request = operation(transaction.objectStore('images'))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => db.close()
    })
  },
}
