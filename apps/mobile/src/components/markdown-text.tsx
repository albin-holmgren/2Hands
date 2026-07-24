import React, { useState } from 'react'
import { Text, View, StyleSheet, TextStyle, TouchableOpacity, ScrollView } from 'react-native'
import * as Clipboard from 'expo-clipboard'

interface MarkdownTextProps {
  children: string
  style?: TextStyle
  color?: string
}

export function MarkdownText({ children, style, color = '#34322D' }: MarkdownTextProps) {
  const renderMarkdown = (text: string) => {
    const elements: React.ReactNode[] = []
    let key = 0

    // Split by lines
    const lines = text.split('\n')
    let i = 0
    
    while (i < lines.length) {
      const line = lines[i]
      const trimmedLine = line.trim()
      
      // Skip empty lines
      if (trimmedLine === '') {
        elements.push(<View key={key++} style={styles.emptyLine} />)
        i++
        continue
      }
      
      // Check for fenced code block (```lang ... ```)
      if (trimmedLine.startsWith('```')) {
        const lang = trimmedLine.slice(3).trim()
        const codeLines: string[] = []
        i++
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i])
          i++
        }
        if (i < lines.length) i++ // skip closing ```
        elements.push(
          <CodeBlock key={key++} code={codeLines.join('\n')} language={lang} color={color} />
        )
        continue
      }
      
      // Check for header (### Header) - MUST check before table (which also uses #)
      const headerMatch = trimmedLine.match(/^(#{1,3})\s+(.+)$/)
      if (headerMatch) {
        const level = headerMatch[1].length
        const fontSize = level === 1 ? 24 : level === 2 ? 20 : 18
        elements.push(
          <Text key={key++} style={[styles.header, { fontSize, color, fontWeight: '700', marginTop: 16, marginBottom: 8 }]}>
            {parseInlineMarkdown(headerMatch[2], color, style)}
          </Text>
        )
        i++
        continue
      }
      
      // Check for horizontal rule (--- or *** or ___)
      if (trimmedLine.match(/^(---|___|\*\*\*)$/)) {
        i++
        continue
      }
      
      // Check for table separator line (contains |---|)
      if (trimmedLine.includes('|') && trimmedLine.includes('---')) {
        i++
        continue
      }
      
      // Check for table row - must start AND end with |
      if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
        const cells = trimmedLine.split('|').filter(cell => cell.trim() !== '')
        if (cells.length > 0) {
          elements.push(
            <View key={key++} style={styles.tableRow}>
              {cells.map((cell, cellIndex) => (
                <View key={cellIndex} style={styles.tableCell}>
                  <Text style={[styles.tableCellText, style, { color, fontWeight: '600' }]}>
                    {parseInlineMarkdown(cell.trim(), color, style)}
                  </Text>
                </View>
              ))}
            </View>
          )
        }
        i++
        continue
      }
      
      // Check for numbered list (e.g., "1. Item")
      const numberedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/)
      if (numberedMatch) {
        elements.push(
          <View key={key++} style={styles.listItem}>
            <Text style={[styles.listNumber, { color }]}>{numberedMatch[1]}.</Text>
            <Text style={[styles.listText, style, { color, flex: 1 }]}>
              {parseInlineMarkdown(numberedMatch[2], color, style)}
            </Text>
          </View>
        )
        i++
        continue
      }
      
      // Check for bullet list (e.g., "- Item")
      const bulletMatch = trimmedLine.match(/^[-*]\s+(.+)$/)
      if (bulletMatch) {
        elements.push(
          <View key={key++} style={styles.listItem}>
            <Text style={[styles.bullet, { color }]}>•</Text>
            <Text style={[styles.listText, style, { color, flex: 1 }]}>
              {parseInlineMarkdown(bulletMatch[1], color, style)}
            </Text>
          </View>
        )
        i++
        continue
      }
      
      // Regular text with inline markdown
      elements.push(
        <Text key={key++} style={[style, { color }]}>
          {parseInlineMarkdown(trimmedLine, color, style)}
        </Text>
      )
      i++
    }

    return elements
  }

  const parseInlineMarkdown = (text: string, textColor: string, textStyle?: TextStyle): React.ReactNode[] => {
    const elements: React.ReactNode[] = []
    let remaining = text
    let key = 0

    while (remaining.length > 0) {
      // Bold with ** or __
      const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)$/) || remaining.match(/^(.*?)__(.+?)__(.*)$/)
      // Italic with * or _
      const italicMatch = remaining.match(/^(.*?)\*([^*]+?)\*(.*)$/) || remaining.match(/^(.*?)_([^_]+?)_(.*)$/)
      // Code with `
      const codeMatch = remaining.match(/^(.*?)`([^`]+?)`(.*)$/)

      if (boldMatch && (!italicMatch || boldMatch.index! <= italicMatch.index!) && (!codeMatch || boldMatch.index! <= codeMatch.index!)) {
        if (boldMatch[1]) {
          elements.push(<Text key={key++}>{boldMatch[1]}</Text>)
        }
        elements.push(
          <Text key={key++} style={[textStyle, { fontWeight: '700', color: textColor }]}>
            {boldMatch[2]}
          </Text>
        )
        remaining = boldMatch[3]
      } else if (codeMatch && (!italicMatch || codeMatch.index! <= italicMatch.index!)) {
        if (codeMatch[1]) {
          elements.push(<Text key={key++}>{codeMatch[1]}</Text>)
        }
        elements.push(
          <Text key={key++} style={[textStyle, styles.code, { color: textColor }]}>
            {codeMatch[2]}
          </Text>
        )
        remaining = codeMatch[3]
      } else if (italicMatch) {
        if (italicMatch[1]) {
          elements.push(<Text key={key++}>{italicMatch[1]}</Text>)
        }
        elements.push(
          <Text key={key++} style={[textStyle, { fontStyle: 'italic', color: textColor }]}>
            {italicMatch[2]}
          </Text>
        )
        remaining = italicMatch[3]
      } else {
        elements.push(<Text key={key++}>{remaining}</Text>)
        break
      }
    }

    return elements
  }

  return <View style={styles.container}>{renderMarkdown(children)}</View>
}

// Fenced code block component with copy button
function CodeBlock({ code, language, color }: { code: string; language: string; color: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <View style={styles.codeBlockContainer}>
      <View style={styles.codeBlockHeader}>
        <Text style={styles.codeBlockLang}>{language || 'code'}</Text>
        <TouchableOpacity onPress={handleCopy} activeOpacity={0.7}>
          <Text style={styles.codeBlockCopy}>{copied ? 'Copied!' : 'Copy'}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.codeBlockScroll}>
        <Text style={[styles.codeBlockText, { color }]}>{code}</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    flexShrink: 1,
    flexGrow: 0,
  },
  header: {
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    paddingVertical: 8,
  },
  tableCell: {
    flex: 1,
    paddingHorizontal: 4,
  },
  tableCellText: {
    fontSize: 14,
    lineHeight: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
    width: '100%',
  },
  listNumber: {
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '600',
    marginRight: 8,
    minWidth: 20,
  },
  bullet: {
    fontSize: 16,
    lineHeight: 26,
    marginRight: 8,
  },
  listText: {
    fontSize: 16,
    lineHeight: 26,
  },
  emptyLine: {
    height: 12,
  },
  horizontalRule: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginVertical: 16,
  },
  code: {
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  codeBlockContainer: {
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
    marginVertical: 8,
    overflow: 'hidden',
  },
  codeBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  codeBlockLang: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeBlockCopy: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.4)',
  },
  codeBlockScroll: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  codeBlockText: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
})
