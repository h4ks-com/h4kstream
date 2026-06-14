import React, { useRef, useState } from 'react'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'

/** One chip's data: a region id plus the source range it covers, in export order. */
export interface RegionChipItem {
  id: string
  start: number
  end: number
}

interface RegionChipsProps {
  items: RegionChipItem[]
  activeId: string | null
  formatClock: (seconds: number) => string
  /** Select a region (also scrolls/highlights it on the waveform + opens its editor). */
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  /** Move the chip at `from` to index `to` in the export order. */
  onReorder: (from: number, to: number) => void
}

/**
 * The export sequence as drag-to-reorder chips. The chip order IS the export order (segment 1,
 * 2, 3 …); reordering rewrites the spec. Each chip carries a 1-based order badge, its source
 * range and a delete button, and clicking it selects the region. Dragging uses native HTML5
 * drag-and-drop so it stays dependency-free.
 */
export const RegionChips: React.FC<RegionChipsProps> = ({
  items,
  activeId,
  formatClock,
  onSelect,
  onDelete,
  onReorder,
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  // The source index also lives in a ref so a synchronous drop reads it without waiting for the
  // setDragIndex state commit (events can fire back-to-back in the same tick).
  const dragIndexRef = useRef<number | null>(null)

  if (items.length === 0) {
    return (
      <div className="text-gray-500 text-sm italic font-mono">
        No regions yet. Position the playhead and use + Add region to mark one;
        chips here set the export order.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="region-chips">
      {items.map((item, index) => {
        const isActive = item.id === activeId
        const isDragging = index === dragIndex
        const isOver = index === overIndex && dragIndex !== null
        return (
          <div
            key={item.id}
            data-testid={`region-chip-${index}`}
            draggable
            onDragStart={(e) => {
              dragIndexRef.current = index
              setDragIndex(index)
              // Firefox requires data to be set for a drag to initiate.
              if (e.dataTransfer) {
                e.dataTransfer.setData('text/plain', String(index))
                e.dataTransfer.effectAllowed = 'move'
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move'
              }
              if (overIndex !== index) {
                setOverIndex(index)
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              const from = dragIndexRef.current
              if (from !== null && from !== index) {
                onReorder(from, index)
              }
              dragIndexRef.current = null
              setDragIndex(null)
              setOverIndex(null)
            }}
            onDragEnd={() => {
              dragIndexRef.current = null
              setDragIndex(null)
              setOverIndex(null)
            }}
            onClick={() => onSelect(item.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(item.id)
              }
            }}
            aria-label={`Region ${index + 1}, ${formatClock(
              item.start
            )} to ${formatClock(item.end)}. Drag to reorder, click to edit.`}
            className="flex items-center gap-1 px-2 py-1 font-mono text-xs select-none cursor-grab"
            style={{
              border: `1px solid ${isOver ? '#1aff7f' : '#009926'}`,
              background: isActive ? '#1aff7f' : 'transparent',
              color: isActive ? '#04140a' : '#1aff7f',
              opacity: isDragging ? 0.4 : 1,
              borderRadius: 2,
            }}
          >
            <DragIndicatorIcon
              fontSize="small"
              sx={{ fontSize: 14, opacity: 0.6 }}
            />
            <span
              className="inline-flex items-center justify-center"
              style={{
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 700,
                background: isActive ? '#04140a' : '#009926',
                color: isActive ? '#1aff7f' : '#04140a',
              }}
            >
              {index + 1}
            </span>
            <span>
              {formatClock(item.start)}–{formatClock(item.end)}
            </span>
            <IconButton
              size="small"
              aria-label={`Delete region ${index + 1}`}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(item.id)
              }}
              sx={{
                p: 0,
                ml: 0.25,
                color: isActive ? '#04140a' : '#ff6b6b',
              }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </div>
        )
      })}
    </div>
  )
}
