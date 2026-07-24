import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native'
import { Redirect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import * as Speech from 'expo-speech'
import { CircleUser, Store, Volume2, VolumeX } from 'lucide-react-native'
import type { Approval, OrbState, SecureInputRequest } from '@2hands/types/v3'
import { colors as brand } from '@2hands/tailwind-config'
import { useAuth } from '@/lib/auth-context'
import { useTheme } from '@/lib/theme-context'
import { Orb, ORB_STATE_LABELS } from '@/components/v3/orb'
import { Composer } from '@/components/v3/composer'
import { EmptyState } from '@/components/v3/empty-state'
import { BottomSheet } from '@/components/v3/bottom-sheet'
import {
  MarketplaceSheet,
  type MarketplaceSectionId,
  type ProviderRow,
  type ProviderRowActionKind,
} from '@/components/v3/marketplace-sheet'
import { ApprovalCard } from '@/components/v3/approval-card'
import { SecureInputCard } from '@/components/v3/secure-input-card'
import { usePushToTalk } from '@/components/v3/use-push-to-talk'

/**
 * v3 conversation shell (IMPLEMENTATION_MAP Slice 1, UX.md §2–§5).
 * One screen: marketplace top-left, account/usage top-right, hero orb
 * empty state, local message list, composer at the bottom. The orb runs
 * a local demo state machine (idle → listening → thinking → idle) until
 * the real task event stream lands in Slice 2.
 *
 * Additive route — the existing (tabs) surface is untouched.
 */

interface LocalMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

const EXAMPLES = [
  'Reply to the three unread emails from this week',
  'Fix the failing test in my repo and open a PR',
  'Book a table for two on Friday evening',
]

/** Deterministic demo rows — same content contract as the web sheet, always labeled Demo. */
const DEMO_MARKETPLACE_SECTIONS: Partial<Record<MarketplaceSectionId, ProviderRow[]>> = {
  connected_apps: [
    {
      id: 'demo-gmail',
      name: 'Demo Gmail',
      capability: 'Read, draft and send email',
      owner: 'user',
      status: 'connected',
      demo: true,
    },
    {
      id: 'github',
      name: 'GitHub',
      capability: 'Repos, pull requests and reviews',
      owner: 'user',
      status: 'not_connected',
    },
    {
      id: 'google-calendar',
      name: 'Google Calendar',
      capability: 'Schedule and reschedule events',
      owner: 'user',
      status: 'coming_soon',
    },
  ],
  specialist_agents: [
    {
      id: 'demo-codex',
      name: 'Demo Codex',
      capability: 'Coding agent for repo work',
      owner: '2hands',
      status: 'connected',
      demo: true,
    },
    {
      id: 'demo-claude',
      name: 'Demo Claude',
      capability: 'Research, writing and review',
      owner: '2hands',
      status: 'connected',
      demo: true,
    },
  ],
  computers: [
    {
      id: 'demo-computer',
      name: 'Managed Computer',
      capability: 'Isolated workspace with browser and shell',
      owner: '2hands',
      status: 'connected',
      demo: true,
    },
  ],
  mcp: [
    {
      id: 'demo-mcp-filesystem',
      name: 'Filesystem MCP',
      capability: 'Read and write workspace files',
      owner: 'workspace',
      status: 'not_connected',
    },
  ],
  subscriptions: [
    {
      id: 'plan-free',
      name: '2Hands Free',
      capability: '50 work credits per week',
      owner: 'user',
      status: 'connected',
      action: 'manage',
      demo: true,
    },
  ],
}

const THINK_MS = 1600

function buildDemoApproval(): Approval {
  const now = Date.now()
  return {
    id: 'demo-approval-1',
    workspaceId: 'demo-workspace',
    taskId: 'demo-task-1',
    riskClass: 'r2_external_write',
    category: 'external_communication',
    title: 'Send reply to sara@customer.example',
    summary:
      'Sends the drafted reply "Re: Invoice #4821" from your Demo Gmail account. One recipient, no attachments.',
    canonicalAction: {
      provider: 'demo-gmail',
      action: 'send_email',
      to: ['sara@customer.example'],
      subject: 'Re: Invoice #4821',
    },
    canonicalActionHash: 'demo-hash-000000000000',
    reversibility: 'irreversible',
    estimatedMaxCostCredits: 2,
    status: 'pending',
    challenge: 'demo-challenge',
    expiresAt: new Date(now + 10 * 60_000).toISOString(),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  }
}

function buildDemoSecureInputRequest(): SecureInputRequest {
  return {
    id: 'demo-secure-1',
    authRunId: 'demo-auth-run-1',
    providerId: 'github',
    title: 'Sign in to GitHub',
    description: '2Hands needs your GitHub credentials to connect your account.',
    fields: [
      { id: 'email', kind: 'email', label: 'Email' },
      { id: 'password', kind: 'password', label: 'Password', retainOption: true },
    ],
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  }
}

function HeaderButton({
  onPress,
  onLongPress,
  label,
  children,
}: {
  onPress: () => void
  onLongPress?: () => void
  label: string
  children: React.ReactNode
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.borderDefault,
        backgroundColor: pressed ? colors.surfaceHover : 'transparent',
      })}
    >
      {children}
    </Pressable>
  )
}

export default function V3Screen() {
  const { session, isLoading } = useAuth()
  const { isDark, colors } = useTheme()

  const [orbState, setOrbState] = useState<OrbState>('idle')
  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [marketplaceOpen, setMarketplaceOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  // Dev-only: long-press the account button to preview trust cards.
  const [showDevCards, setShowDevCards] = useState(false)
  // Voice (Slice 9): spoken replies are opt-in; banner surfaces mic/501 states.
  const [voiceReplies, setVoiceReplies] = useState(false)
  const [voiceBanner, setVoiceBanner] = useState<string | null>(null)

  const thinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<FlatList<LocalMessage>>(null)
  const nextId = useRef(0)
  const voiceRepliesRef = useRef(voiceReplies)
  voiceRepliesRef.current = voiceReplies
  const handleSendRef = useRef<(text: string) => void>(() => undefined)

  // Push-to-talk: mic toggles capture; the transcript is sent as a message.
  // Must be initialized before the auth-guard early returns (hook rules).
  const pushToTalk = usePushToTalk({
    onTranscript: (transcript) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      handleSendRef.current(transcript)
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      setVoiceBanner(
        error.code === 'voice_not_configured' ? 'Voice transcription not configured' : error.message
      )
    },
  })

  useEffect(
    () => () => {
      if (thinkTimer.current) clearTimeout(thinkTimer.current)
    },
    []
  )

  const demoApproval = useMemo(() => (showDevCards ? buildDemoApproval() : null), [showDevCards])
  const demoSecureRequest = useMemo(
    () => (showDevCards ? buildDemoSecureInputRequest() : null),
    [showDevCards]
  )

  // Auth guard — same session/redirect pattern the app already uses.
  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bgPrimary,
        }}
      >
        <ActivityIndicator size="large" color={brand.brand.terracotta} />
      </View>
    )
  }
  if (!session) {
    return <Redirect href="/(auth)/login" />
  }

  const appendMessage = (role: LocalMessage['role'], text: string) => {
    nextId.current += 1
    setMessages((prev) => [...prev, { id: `m-${nextId.current}`, role, text }])
    // Spoken replies via expo-speech — strictly opt-in, off by default.
    if (role === 'assistant' && voiceRepliesRef.current) {
      Speech.stop()
      Speech.speak(text.slice(0, Speech.maxSpeechInputLength))
    }
  }

  // Mic press toggles real push-to-talk capture (composer adds the haptic).
  const handleMicPress = () => {
    setVoiceBanner(null)
    pushToTalk.toggle()
  }

  const toggleVoiceReplies = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setVoiceReplies((current) => {
      if (current) Speech.stop()
      return !current
    })
  }

  // Voice capture states take precedence over the local orb machine.
  const effectiveOrbState: OrbState =
    pushToTalk.state === 'recording'
      ? 'listening'
      : pushToTalk.state === 'transcribing' || pushToTalk.state === 'requesting_permission'
        ? 'thinking'
        : orbState

  const handleSend = (text: string) => {
    if (thinkTimer.current) clearTimeout(thinkTimer.current)
    appendMessage('user', text)
    setOrbState('thinking')
    thinkTimer.current = setTimeout(() => {
      appendMessage(
        'assistant',
        'Got it. Task orchestration lands in the next slice — for now this shell shows the conversation surface end to end.'
      )
      setOrbState('idle')
      thinkTimer.current = null
    }, THINK_MS)
  }
  handleSendRef.current = handleSend

  const handleAccountLongPress = () => {
    if (!__DEV__) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setShowDevCards((value) => !value)
  }

  const handleMarketplaceRowAction = (
    _sectionId: MarketplaceSectionId,
    row: ProviderRow,
    action: ProviderRowActionKind
  ) => {
    setMarketplaceOpen(false)
    appendMessage('assistant', `Demo marketplace: “${action}” for ${row.name} is wired in a later slice.`)
  }

  const hasContent = messages.length > 0 || showDevCards

  const renderMessage = ({ item }: { item: LocalMessage }) => {
    if (item.role === 'user') {
      return (
        <View style={{ alignItems: 'flex-end' }}>
          <View
            style={{
              maxWidth: '85%',
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: colors.bgSecondary,
            }}
          >
            <Text style={{ fontSize: 16, lineHeight: 22, color: colors.textPrimary }}>
              {item.text}
            </Text>
          </View>
        </View>
      )
    }
    return (
      <View style={{ alignItems: 'flex-start' }}>
        <Text
          style={{ maxWidth: '92%', fontSize: 16, lineHeight: 23, color: colors.textPrimary }}
        >
          {item.text}
        </Text>
      </View>
    )
  }

  const devCards =
    showDevCards && demoApproval && demoSecureRequest ? (
      <View style={{ gap: 16, paddingTop: messages.length > 0 ? 16 : 0 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
          DEV PREVIEW — trust cards
        </Text>
        <ApprovalCard
          approval={demoApproval}
          onRespond={(decision) =>
            appendMessage('assistant', `Demo approval ${decision === 'approve' ? 'approved' : 'denied'}.`)
          }
        />
        <SecureInputCard
          request={demoSecureRequest}
          providerName="GitHub"
          origin="https://github.com"
          onSubmitSecure={() =>
            appendMessage('assistant', 'Demo credentials supplied securely (values discarded).')
          }
          onCancel={() => setShowDevCards(false)}
        />
      </View>
    ) : null

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header — marketplace left, compact orb center, account right */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 6,
          }}
        >
          <HeaderButton onPress={() => setMarketplaceOpen(true)} label="Open marketplace">
            <Store size={20} color={colors.textPrimary} strokeWidth={1.8} />
          </HeaderButton>

          {hasContent ? (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Orb state={effectiveOrbState} size="compact" onPress={handleMicPress} />
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                {ORB_STATE_LABELS[effectiveOrbState]}
              </Text>
            </View>
          ) : (
            <View />
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <HeaderButton
              onPress={toggleVoiceReplies}
              label={voiceReplies ? 'Turn voice replies off' : 'Turn voice replies on'}
            >
              {voiceReplies ? (
                <Volume2 size={20} color={brand.brand.terracotta} strokeWidth={1.8} />
              ) : (
                <VolumeX size={20} color={colors.textSecondary} strokeWidth={1.8} />
              )}
            </HeaderButton>
            <HeaderButton
              onPress={() => setAccountOpen(true)}
              onLongPress={handleAccountLongPress}
              label="Account and usage"
            >
              <CircleUser size={20} color={colors.textPrimary} strokeWidth={1.8} />
            </HeaderButton>
          </View>
        </View>

        {/* Conversation surface */}
        {hasContent ? (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 12 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={devCards}
            style={{ flex: 1 }}
          />
        ) : (
          <EmptyState
            orbState={effectiveOrbState}
            onOrbPress={handleMicPress}
            examples={EXAMPLES}
            onExamplePress={handleSend}
          />
        )}

        {voiceBanner && (
          <View
            accessibilityRole="alert"
            style={{
              marginHorizontal: 16,
              marginBottom: 8,
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.borderDefault,
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.bgSecondary,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: colors.textSecondary }}>
              {voiceBanner}
            </Text>
            <Pressable onPress={() => setVoiceBanner(null)} accessibilityLabel="Dismiss voice notice">
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>
                Dismiss
              </Text>
            </Pressable>
          </View>
        )}
        <Composer
          onSend={handleSend}
          onMicPress={handleMicPress}
          orbState={effectiveOrbState}
        />
      </KeyboardAvoidingView>

      {/* Marketplace */}
      <MarketplaceSheet
        visible={marketplaceOpen}
        onClose={() => setMarketplaceOpen(false)}
        sections={DEMO_MARKETPLACE_SECTIONS}
        onRowAction={handleMarketplaceRowAction}
      />

      {/* Account / usage */}
      <BottomSheet visible={accountOpen} onClose={() => setAccountOpen(false)} title="Account">
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 16 }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 13, color: colors.textSecondary }}>Signed in as</Text>
            <Text style={{ fontSize: 16, fontWeight: '500', color: colors.textPrimary }}>
              {session.user?.email ?? 'Unknown account'}
            </Text>
          </View>

          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.borderDefault,
              padding: 16,
              gap: 10,
              backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.bgSecondary,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: colors.textSecondary }}>Plan</Text>
              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>
                Free (demo)
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: colors.textSecondary }}>Work credits</Text>
              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>
                50 / week (demo)
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 12, lineHeight: 17, color: colors.textSecondary }}>
            Usage and billing are demo values until the credits ledger ships.
            {__DEV__ ? ' Long-press this button to preview the trust cards.' : ''}
          </Text>
        </View>
      </BottomSheet>
    </SafeAreaView>
  )
}
