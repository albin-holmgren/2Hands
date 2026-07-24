'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ArrowUp, Square, Loader2, AlertCircle, X, Plus, ChevronDown } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { TwoHandsLoader } from '@/components/ui/loader'

export interface ImageAttachment {
  base64: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  name: string
}

const SLASH_COMMANDS = [
  { cmd: '/new',      icon: '✦', desc: 'Start a fresh conversation' },
  { cmd: '/compact',  icon: '⬡', desc: 'Compress conversation history' },
  { cmd: '/status',   icon: '◉', desc: 'Show workspace status' },
  { cmd: '/agents',   icon: '🤖', desc: 'List all agents and their status' },
  { cmd: '/missions', icon: '🎯', desc: 'Show active mission progress' },
  { cmd: '/memory',   icon: '🧠', desc: 'Show what I remember about you' },
  { cmd: '/doctor',   icon: '🩺', desc: 'Run workspace health check' },
  { cmd: '/think',    icon: '💭', desc: 'Toggle deep thinking mode' },
]

const MODEL_OPTIONS = [
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', short: 'Flash' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', short: 'Pro' },
]

interface ChatInputProps {
  onSend: (message: string, images?: ImageAttachment[]) => Promise<void> | void
  isLoading?: boolean
  isStreaming?: boolean
  onStop?: () => void
  placeholder?: string
  error?: string | null
  onClearError?: () => void
  onSlashCommand?: (command: string) => Promise<void> | void
  model?: string
  onModelChange?: (model: string) => void
  messageCount?: number
  /** sessionStorage key for persisting draft text across page navigation */
  draftKey?: string
  /** Images dropped from a parent-level drag zone; merged into local state on change */
  externalImages?: ImageAttachment[]
}

// Lightning bolt icon matching the reference design
function LightningIcon({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="20" 
      height="20" 
      fill="none" 
      viewBox="0 0 20 20" 
      className={className}
    >
      <path 
        fill="currentColor" 
        d="M8.534 17.196a.6.6 0 0 1-.343.248.457.457 0 0 1-.552-.292q-.058-.178.038-.425l1.891-4.933H5.982a.46.46 0 0 1-.33-.12.42.42 0 0 1-.127-.311q0-.197.165-.407l5.77-7.414a.6.6 0 0 1 .336-.247.45.45 0 0 1 .343.032.4.4 0 0 1 .21.26q.063.177-.032.419l-1.892 4.938h3.587a.46.46 0 0 1 .33.12q.127.121.127.306 0 .196-.165.406zm.374-1.707-.178-.095 4.146-5.504H8.959l2.12-4.64.178.095-4.145 5.504h3.923z"
      />
    </svg>
  )
}

// Arrow up icon matching the reference design
function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="16" 
      height="16" 
      fill="none" 
      viewBox="0 0 16 16" 
      className={className}
    >
      <path 
        fill="currentColor" 
        d="M8.712 2.211c-.244-.243-.43-.336-.696-.336-.267 0-.476.116-.696.336L3.27 6.25a.86.86 0 0 0-.254.626c0 .499.382.87.881.87a.9.9 0 0 0 .638-.267L6.01 5.993l1.206-1.45-.093 2.54v6.207c0 .534.372.905.894.905.533 0 .905-.383.905-.905V7.084l-.105-2.53 1.207 1.44 1.473 1.484a1 1 0 0 0 .65.267c.498 0 .87-.371.87-.87a.85.85 0 0 0-.244-.626z"
      />
    </svg>
  )
}

export function ChatInput({
  onSend,
  isLoading,
  isStreaming,
  onStop,
  placeholder = 'Assign a task or ask anything...',
  error,
  onClearError,
  onSlashCommand,
  model = 'google/gemini-2.5-flash',
  onModelChange,
  messageCount = 0,
  draftKey,
  externalImages,
}: ChatInputProps) {
  const [input, setInput] = useState(() => {
    if (!draftKey) return ''
    try { return sessionStorage.getItem(draftKey) ?? '' } catch { return '' }
  })
  const [isFocused, setIsFocused] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [showModelMenu, setShowModelMenu] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)

  const currentModel = MODEL_OPTIONS.find(m => m.id === model) || MODEL_OPTIONS[0]

  // Merge page-level dropped images into local state whenever the reference changes
  useEffect(() => {
    if (externalImages && externalImages.length > 0) {
      setImages(prev => [...prev, ...externalImages])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalImages])

  const filteredCommands = useMemo(() => {
    if (!slashFilter) return SLASH_COMMANDS
    return SLASH_COMMANDS.filter(c => c.cmd.startsWith('/' + slashFilter.toLowerCase()))
  }, [slashFilter])

  // Close model menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false)
      }
    }
    if (showModelMenu) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showModelMenu])

  // Clear local error after 3 seconds
  useEffect(() => {
    if (localError) {
      const timer = setTimeout(() => setLocalError(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [localError])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return

    const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 640
    const maxHeight = isMobileViewport ? 120 : 200
    const baseHeight = 24

    el.style.height = 'auto'

    if (input.trim().length === 0) {
      el.style.height = `${baseHeight}px`
      el.style.overflowY = 'hidden'
      return
    }

    const nextHeight = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [input])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        setLocalError('Only image files are supported')
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        setLocalError('Image must be less than 5MB')
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        const mediaType = file.type as ImageAttachment['mediaType']
        setImages(prev => [...prev, { base64, mediaType, name: file.name }])
      }
      reader.readAsDataURL(file)
    })

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const removeImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }, [])

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set isDragging to false if we're leaving the drop zone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        setLocalError('Only image files are supported')
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        setLocalError('Image must be less than 5MB')
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        const mediaType = file.type as ImageAttachment['mediaType']
        setImages(prev => [...prev, { base64, mediaType, name: file.name }])
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'))
    if (imageItems.length === 0) return
    e.preventDefault()
    imageItems.forEach(item => {
      const file = item.getAsFile()
      if (!file) return
      if (file.size > 5 * 1024 * 1024) {
        setLocalError('Image must be less than 5MB')
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        const mediaType = (file.type || 'image/png') as ImageAttachment['mediaType']
        const name = file.name || `screenshot-${Date.now()}.png`
        setImages(prev => [...prev, { base64, mediaType, name }])
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const handleSlashSelect = useCallback(async (cmd: string) => {
    setInput('')
    setShowSlashMenu(false)
    if (onSlashCommand) {
      await onSlashCommand(cmd)
    }
  }, [onSlashCommand])

  const handleSubmit = useCallback(async () => {
    // Prevent only local duplicate sends — streaming is handled by the parent (queue path)
    if (isSending) {
      console.log('[ChatInput] Already sending, returning')
      return
    }
    
    // Handle slash commands
    const trimmed = input.trim()
    if (trimmed.startsWith('/') && onSlashCommand) {
      const cmd = trimmed.split(' ')[0].toLowerCase()
      const isKnown = SLASH_COMMANDS.some(c => c.cmd === cmd)
      if (isKnown) {
        setInput('')
        setShowSlashMenu(false)
        await onSlashCommand(cmd)
        return
      }
    }
    
    console.log('[ChatInput] handleSubmit called', { input: input.slice(0, 50), imagesCount: images.length, isLoading, isSending })
    // Clear any previous errors
    setLocalError(null)
    onClearError?.()

    if (!trimmed && images.length === 0) {
      console.log('[ChatInput] No input or images, returning')
      setLocalError('Please enter a message or attach an image')
      return
    }

    const messageToSend = trimmed
    const imagesToSend = [...images]
    console.log('[ChatInput] Sending message:', messageToSend.slice(0, 50))
    
    // Clear input immediately to prevent double-submit
    setInput('')
    setImages([])
    if (draftKey) { try { sessionStorage.removeItem(draftKey) } catch {} }
    setShowSlashMenu(false)
    setIsSending(true)

    try {
      await onSend(messageToSend, imagesToSend.length > 0 ? imagesToSend : undefined)
      console.log('[ChatInput] onSend completed successfully')
    } catch (err) {
      console.error('[ChatInput] onSend error:', err)
      // Restore input on error
      setInput(messageToSend)
      setImages(imagesToSend)
      setLocalError(err instanceof Error ? err.message : 'Failed to send message. Please try again.')
    } finally {
      setIsSending(false)
    }
  }, [input, images, isSending, onSend, onClearError, onSlashCommand])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape') {
        e.preventDefault()
        if (e.key === 'Escape') setShowSlashMenu(false)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && filteredCommands.length === 1)) {
        e.preventDefault()
        handleSlashSelect(filteredCommands[0].cmd)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const displayError = error || localError
  const isDisabled = isSending

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="bg-transparent px-4 pb-4 pt-2"
    >
      {/* Error message display */}
      <AnimatePresence>
        {displayError && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 text-sm text-red-500 mb-2 max-w-[850px] mx-auto" 
            style={{ maxWidth: '850px' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{displayError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        ref={dropZoneRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="relative flex flex-col w-full max-w-[850px] mx-auto"
        style={{ maxWidth: '850px' }}
      >
        {/* Slash command menu */}
        {showSlashMenu && filteredCommands.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 z-50 bg-background border border-border rounded-2xl shadow-lg overflow-hidden min-w-[240px]">
            {filteredCommands.map((c) => (
              <button
                key={c.cmd}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSlashSelect(c.cmd) }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-accent transition-colors"
              >
                <span className="text-[13px] font-mono text-muted-foreground w-4">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-foreground">{c.cmd}</span>
                  <span className="text-[12px] text-muted-foreground ml-2">{c.desc}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/5 rounded-[32px] z-[1] pointer-events-none">
            <div className="text-primary font-medium text-sm">Drop image here</div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Image Previews */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3 pb-1">
            {images.map((img, index) => (
              <div key={index} className="relative group">
                <Image
                  src={`data:${img.mediaType};base64,${img.base64}`}
                  alt={img.name}
                  width={40}
                  height={40}
                  className="rounded-lg object-cover w-[40px] h-[40px] border border-white/10"
                />
                <button
                  onClick={() => removeImage(index)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white text-black rounded-full flex items-center justify-center opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row: icon + textarea + send */}
        <div className="flex flex-col w-full rounded-[32px] bg-input border border-border min-h-14 px-3 py-3">
          <div className="flex items-center gap-1">
          {/* Left icon button - Lightning */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled}
            type="button"
            className={cn(
              "shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full",
              "bg-transparent font-normal transition-colors duration-50",
              "hover:bg-foreground/5 focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
              "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Attach image"
            title="Attach image"
          >
            <Plus className="h-5 w-5" />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              const val = e.target.value
              setInput(val)
              if (draftKey) {
                try {
                  if (val) sessionStorage.setItem(draftKey, val)
                  else sessionStorage.removeItem(draftKey)
                } catch {}
              }
              if (localError) setLocalError(null)
              // Slash command detection
              if (val === '/') {
                setShowSlashMenu(true)
                setSlashFilter('')
              } else if (val.startsWith('/') && !val.includes(' ')) {
                setShowSlashMenu(true)
                setSlashFilter(val.slice(1))
              } else {
                setShowSlashMenu(false)
              }
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={isDisabled}
            data-testid="chat-input"
            spellCheck={false}
            className="flex-1 border-none outline-none bg-transparent text-foreground text-base placeholder:text-foreground/60 py-[6px] pl-3 resize-none max-h-[200px] overflow-y-auto min-h-[36px] leading-normal disabled:cursor-not-allowed disabled:opacity-50"
            rows={1}
          />

            {/* Right send button — stop only when streaming with no text; otherwise always show send */}
            {(isStreaming && !input.trim() && images.length === 0) ? (
            <button
              onClick={onStop}
              type="button"
              className={cn(
                "shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full",
                "bg-muted hover:bg-accent text-foreground",
                "transition-colors cursor-pointer"
              )}
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={(!input.trim() && images.length === 0) || isDisabled}
              data-testid="send-button"
              type="button"
              aria-label={
                (!input.trim() && images.length === 0)
                  ? 'Enter a message to send'
                  : 'Send message'
              }
              className={cn(
                "shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full",
                "transition-all duration-200 cursor-pointer",
                (input.trim() || images.length > 0) && !isDisabled
                  ? "bg-foreground text-background hover:opacity-90"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {isSending ? (
                <TwoHandsLoader size="sm" />
              ) : (
                <ArrowUpIcon className="h-4 w-4" />
              )}
            </button>
          )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
