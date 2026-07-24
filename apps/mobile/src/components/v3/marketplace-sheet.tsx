import React, { useMemo, useState } from 'react'
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Search } from 'lucide-react-native'
import { colors as brand } from '@2hands/tailwind-config'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/v3/bottom-sheet'

/**
 * Marketplace sheet (UX.md §5, BRAND_GUIDELINES §13 integration row).
 * Same content contract as the web marketplace sheet: sections
 * Connected apps / Specialist agents / Computers / MCP / Subscriptions,
 * ProviderRow[] per section, status pills, explicit Demo labeling,
 * coming-soon rows disabled. Rows: icon, name, one-line capability,
 * owner, status, exactly one action.
 */

export type ProviderRowStatus = 'connected' | 'needs_reauth' | 'error' | 'not_connected' | 'coming_soon'

export type ProviderRowActionKind = 'connect' | 'repair' | 'manage' | 'disconnect'

export type ProviderRowOwner = 'user' | 'workspace' | '2hands'

export interface ProviderRow {
  id: string
  name: string
  /** One-line capability description. */
  capability: string
  iconUrl?: string
  owner?: ProviderRowOwner
  status: ProviderRowStatus
  /** Deterministic demo provider — always labeled, never falsely connected. */
  demo?: boolean
  /** Override the status-derived action. Ignored for coming_soon rows. */
  action?: ProviderRowActionKind
}

export type MarketplaceSectionId =
  | 'connected_apps'
  | 'specialist_agents'
  | 'computers'
  | 'mcp'
  | 'subscriptions'

export const MARKETPLACE_SECTION_LABELS: Record<MarketplaceSectionId, string> = {
  connected_apps: 'Connected apps',
  specialist_agents: 'Specialist agents',
  computers: 'Computers',
  mcp: 'MCP',
  subscriptions: 'Subscriptions',
}

const SECTION_ORDER: readonly MarketplaceSectionId[] = [
  'connected_apps',
  'specialist_agents',
  'computers',
  'mcp',
  'subscriptions',
]

const OWNER_LABELS: Record<ProviderRowOwner, string> = {
  user: 'Your account',
  workspace: 'Workspace',
  '2hands': '2Hands-managed',
}

const STATUS_LABELS: Record<ProviderRowStatus, string> = {
  connected: 'Connected',
  needs_reauth: 'Needs reauth',
  error: 'Error',
  not_connected: 'Not connected',
  coming_soon: 'Coming soon',
}

function defaultAction(status: ProviderRowStatus): ProviderRowActionKind | null {
  switch (status) {
    case 'connected':
      return 'manage'
    case 'needs_reauth':
    case 'error':
      return 'repair'
    case 'not_connected':
      return 'connect'
    case 'coming_soon':
      return null
  }
}

const ACTION_LABELS: Record<ProviderRowActionKind, string> = {
  connect: 'Connect',
  repair: 'Repair',
  manage: 'Manage',
  disconnect: 'Disconnect',
}

export interface MarketplaceSheetProps {
  visible: boolean
  onClose: () => void
  sections: Partial<Record<MarketplaceSectionId, ProviderRow[]>>
  onRowAction: (sectionId: MarketplaceSectionId, row: ProviderRow, action: ProviderRowActionKind) => void
}

function StatusPill({ status, isDark }: { status: ProviderRowStatus; isDark: boolean }) {
  const palette: Record<ProviderRowStatus, { bg: string; fg: string }> = {
    connected: { bg: brand.functional.success + '1F', fg: brand.functional.success },
    needs_reauth: { bg: brand.functional.warning + '1F', fg: brand.functional.warning },
    error: { bg: brand.functional.error + '1F', fg: brand.functional.error },
    not_connected: {
      bg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(52,50,45,0.06)',
      fg: isDark ? '#C8C6C3' : '#75736F',
    },
    coming_soon: {
      bg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(52,50,45,0.06)',
      fg: isDark ? '#9E9C99' : '#9E9C99',
    },
  }
  const { bg, fg } = palette[status]
  return (
    <View
      style={{
        borderRadius: 9999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: bg,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '500', color: fg }}>{STATUS_LABELS[status]}</Text>
    </View>
  )
}

function DemoPill() {
  return (
    <View
      style={{
        borderRadius: 9999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: brand.brand.terracotta + '1F',
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '600', color: brand.brand.terracotta }}>Demo</Text>
    </View>
  )
}

function ProviderRowItem({
  sectionId,
  row,
  onRowAction,
}: {
  sectionId: MarketplaceSectionId
  row: ProviderRow
  onRowAction: MarketplaceSheetProps['onRowAction']
}) {
  const { isDark, colors } = useTheme()
  const comingSoon = row.status === 'coming_soon'
  const action = comingSoon ? null : (row.action ?? defaultAction(row.status))

  const handleAction = () => {
    if (!action) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onRowAction(sectionId, row, action)
  }

  const secondary = row.owner ? `${row.capability} · ${OWNER_LABELS[row.owner]}` : row.capability

  return (
    <View
      accessibilityState={{ disabled: comingSoon }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 60,
        paddingHorizontal: 16,
        paddingVertical: 8,
        opacity: comingSoon ? 0.5 : 1,
      }}
    >
      {/* 32px icon */}
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 9999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.bgSecondary,
          overflow: 'hidden',
        }}
      >
        {row.iconUrl ? (
          <Image source={{ uri: row.iconUrl }} style={{ width: 32, height: 32 }} />
        ) : (
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>
            {row.name.slice(0, 1).toUpperCase()}
          </Text>
        )}
      </View>

      {/* Name + capability */}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{ fontSize: 15, fontWeight: '500', color: colors.textPrimary, flexShrink: 1 }}
          >
            {row.name}
          </Text>
          {row.demo ? <DemoPill /> : null}
        </View>
        <Text numberOfLines={1} style={{ fontSize: 13, color: colors.textSecondary }}>
          {secondary}
        </Text>
        <StatusPill status={row.status} isDark={isDark} />
      </View>

      {/* One action — 44pt touch target */}
      {action ? (
        <Pressable
          onPress={handleAction}
          accessibilityRole="button"
          accessibilityLabel={`${ACTION_LABELS[action]} ${row.name}`}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={({ pressed }) => ({
            minHeight: 44,
            minWidth: 44,
            paddingHorizontal: 14,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: action === 'disconnect' ? brand.functional.error + '66' : colors.borderDefault,
            backgroundColor: pressed ? colors.surfaceHover : 'transparent',
          })}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: '500',
              color: action === 'disconnect' ? brand.functional.error : colors.textPrimary,
            }}
          >
            {ACTION_LABELS[action]}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function MarketplaceSheet({ visible, onClose, sections, onRowAction }: MarketplaceSheetProps) {
  const { isDark, colors } = useTheme()
  const [query, setQuery] = useState('')

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase()
    return SECTION_ORDER.map((id) => {
      const rows = sections[id] ?? []
      const filtered = q
        ? rows.filter(
            (row) =>
              row.name.toLowerCase().includes(q) || row.capability.toLowerCase().includes(q)
          )
        : rows
      return { id, rows: filtered }
    }).filter((section) => section.rows.length > 0)
  }, [sections, query])

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Marketplace">
      {/* Search — input text >= 16 on mobile */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            minHeight: 44,
            borderRadius: 12,
            paddingHorizontal: 12,
            backgroundColor: colors.inputBg,
            borderWidth: 1,
            borderColor: colors.borderDefault,
          }}
        >
          <Search size={16} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search apps, agents, computers"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search marketplace"
            style={{ flex: 1, fontSize: 16, color: colors.textPrimary, paddingVertical: 10 }}
          />
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
        {filteredSections.length === 0 ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: colors.textSecondary }}>
              Nothing matches “{query.trim()}”
            </Text>
          </View>
        ) : (
          filteredSections.map((section) => (
            <View key={section.id} style={{ paddingTop: 8 }}>
              <Text
                accessibilityRole="header"
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: colors.textSecondary,
                  paddingHorizontal: 16,
                  paddingBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {MARKETPLACE_SECTION_LABELS[section.id]}
              </Text>
              {section.rows.map((row) => (
                <ProviderRowItem
                  key={row.id}
                  sectionId={section.id}
                  row={row}
                  onRowAction={onRowAction}
                />
              ))}
              <View
                style={{
                  height: 1,
                  marginTop: 8,
                  marginHorizontal: 16,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.bgSecondary,
                }}
              />
            </View>
          ))
        )}
      </ScrollView>
    </BottomSheet>
  )
}
