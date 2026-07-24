'use client'

import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MarkdownTableProps {
  children: React.ReactNode
}

export function MarkdownTable({ children }: MarkdownTableProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    const table = document.activeElement?.closest('[data-table-wrapper]')?.querySelector('table')
    if (!table) return

    // Extract table data with proper TSV escaping for Excel/Sheets
    const rows: string[][] = []
    table.querySelectorAll('tr').forEach((tr) => {
      const cells: string[] = []
      tr.querySelectorAll('th, td').forEach((cell) => {
        let text = cell.textContent?.trim() || ''
        // Escape tabs and newlines for proper TSV format
        text = text.replace(/\t/g, ' ').replace(/\n/g, ' ')
        cells.push(text)
      })
      if (cells.length) rows.push(cells)
    })

    // Convert to TSV (tab-separated values - best for Excel/Sheets)
    const tsv = rows.map((row) => row.join('\t')).join('\n')

    try {
      await navigator.clipboard.writeText(tsv)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = tsv
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [])

  return (
    <div
      data-table-wrapper
      className="relative group/table"
    >
      {/* Table container with rounded corners and header that touches top */}
      <div className="overflow-x-auto rounded-[8px] border border-border shadow-[0px_1px_3px_0px_rgba(0,0,0,0.05)] [&_thead]:bg-muted/80 [&_thead_tr]:border-0 [&_th]:bg-transparent [&_table]:m-0">
        {children}
      </div>

      {/* Copy button - only shows on table hover */}
      <button
        onClick={handleCopy}
        className={cn(
          'absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 text-xs font-medium',
          'bg-card border border-border rounded-[6px] shadow-sm',
          'hover:bg-muted transition-all duration-200',
          'opacity-0 group-hover/table:opacity-100',
          copied && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
        )}
        aria-label={copied ? 'Copied' : 'Copy table'}
      >
        {copied ? (
          <>
            <Check size={14} />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy size={14} />
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  )
}
