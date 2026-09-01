import {
  BaseBoxShapeUtil,
  HTMLContainer,
  RecordProps,
  T,
  TLBaseShape,
} from 'tldraw'

export const GLIMMER_SHAPE_TYPE = 'glimmer' as const

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [GLIMMER_SHAPE_TYPE]: {
      w: number
      h: number
      itemId: string
      glimmerType: string
      title: string
      note: string
      url: string
      image: string
      imageAlt: string
      timecode: string
      capturedAt: string
      accent: string
    }
  }
}

export type GlimmerShape = TLBaseShape<typeof GLIMMER_SHAPE_TYPE, {
  w: number
  h: number
  itemId: string
  glimmerType: string
  title: string
  note: string
  url: string
  image: string
  imageAlt: string
  timecode: string
  capturedAt: string
  accent: string
}>

const LABELS: Record<string, string> = {
  site: 'a place',
  sound: 'a moment in sound',
  image: 'an image',
  note: 'a thought',
}

function openGlimmer(itemId: string) {
  window.dispatchEvent(new CustomEvent('glimmer:open', { detail: itemId }))
}

export class GlimmerShapeUtil extends BaseBoxShapeUtil<GlimmerShape> {
  static override type = GLIMMER_SHAPE_TYPE
  static override props: RecordProps<GlimmerShape> = {
    w: T.number,
    h: T.number,
    itemId: T.string,
    glimmerType: T.string,
    title: T.string,
    note: T.string,
    url: T.string,
    image: T.string,
    imageAlt: T.string,
    timecode: T.string,
    capturedAt: T.string,
    accent: T.string,
  }

  getDefaultProps(): GlimmerShape['props'] {
    return {
      w: 320,
      h: 270,
      itemId: '',
      glimmerType: 'note',
      title: 'untitled glimmer',
      note: '',
      url: '',
      image: '',
      imageAlt: '',
      timecode: '',
      capturedAt: '',
      accent: 'cream',
    }
  }

  override canEdit() {
    return false
  }

  override canResize() {
    return false
  }

  override onClick(shape: GlimmerShape) {
    openGlimmer(shape.props.itemId)
  }

  override onDoubleClick(shape: GlimmerShape) {
    openGlimmer(shape.props.itemId)
  }

  override component(shape: GlimmerShape) {
    const { props } = shape
    return (
      <HTMLContainer id={shape.id} className="canvas-card-shell">
        <article
          className="canvas-card"
          data-kind={props.glimmerType}
          data-accent={props.accent}
        >
          {props.image ? (
            <img className="canvas-card-image" src={props.image} alt={props.imageAlt || props.title} draggable={false} />
          ) : null}

          <div className="canvas-card-body">
            <div className="canvas-card-meta">
              <span>{LABELS[props.glimmerType] ?? props.glimmerType}</span>
              <time>{formatDate(props.capturedAt)}</time>
            </div>

            <div className="canvas-card-copy">
              <h2>{props.title}</h2>
              {props.note ? <p>{props.note}</p> : null}
              {props.timecode ? <span className="canvas-timecode">{props.timecode}</span> : null}
            </div>

            <div className="canvas-card-footer">
              <span>{props.url ? hostnameFor(props.url) : 'kept for later'}</span>
              <span
                className="canvas-open-button"
                aria-hidden="true"
              >
                ↗
              </span>
            </div>
          </div>
        </article>
      </HTMLContainer>
    )
  }

  override indicator(shape: GlimmerShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={3} ry={3} />
  }
}

function hostnameFor(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.valueOf())) return 'sometime'
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}
