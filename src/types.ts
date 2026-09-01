export type GlimmerType = 'site' | 'sound' | 'image' | 'note'

export type Timecode = {
  start: string
  end: string
  label: string
}

export type GlimmerItem = {
  id: string
  type: GlimmerType
  title: string
  note: string
  caption?: string
  url?: string
  image?: string
  imageKey?: string
  imageAlt?: string
  timecode?: Timecode
  capturedAt: string
  accent?: string
  x?: number
  y?: number
  rotation?: number
}
