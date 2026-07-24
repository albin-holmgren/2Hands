import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Bot, Plus, Clock, CheckCircle2, XCircle, Loader2, Sparkles } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { api } from '@/lib/api'
import type { Agent } from '@2hands/types'
import { FadeInDownView, Card, Button, ScalePressable } from '@/components/ui'

import { useTheme } from '@/lib/theme-context'

const statusConfig = {
  idle: { color: '#75736F', label: 'Idle', Icon: Clock },
  initializing: { color: '#D97757', label: 'Starting', Icon: Loader2 },
  working: { color: '#D97757', label: 'Working', Icon: Loader2 },
  completed: { color: '#22C55E', label: 'Completed', Icon: CheckCircle2 },
  failed: { color: '#EF4444', label: 'Failed', Icon: XCircle },
  terminated: { color: '#75736F', label: 'Stopped', Icon: XCircle },
}

export default function AgentsScreen() {
  const { isDark, colors: theme } = useTheme()
  const [agents, setAgents] = useState<Agent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchAgents = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true)
    else setIsLoading(true)

    const response = await api.getAgents()
    
    if (response.data) {
      setAgents(response.data)
    }

    setIsLoading(false)
    setIsRefreshing(false)
  }

  useEffect(() => {
    fetchAgents()
  }, [])

  const handleAgentPress = (agent: Agent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.push(`/(app)/agent/${agent.id}`)
  }

  const renderAgent = ({ item, index }: { item: Agent, index: number }) => {
    const status = statusConfig[item.status] || statusConfig.idle
    const StatusIcon = status.Icon

    return (
      <FadeInDownView delay={index * 50}>
        <ScalePressable
          onPress={() => handleAgentPress(item)}
          className="mx-4 mb-3"
        >
          <View style={{ 
            backgroundColor: isDark ? '#1A1918' : '#FFFFFF',
            borderColor: isDark ? '#3A3833' : '#F0EDE6',
            borderWidth: 1,
            borderRadius: 24,
            padding: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 3,
          }}>
            <View className="flex-row items-start gap-4">
              <View style={{
                width: 56,
                height: 56,
                backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: isDark ? '#3A3833' : '#F0EDE6',
              }}>
                <Bot size={28} color={isDark ? '#FFFFFF' : '#34322D'} />
              </View>
              <View className="flex-1">
                <Text style={{ color: isDark ? '#FFFFFF' : '#34322D', fontWeight: '700', fontSize: 18, marginBottom: 4 }}>{item.name}</Text>
                <Text style={{ color: isDark ? '#9E9C99' : '#75736F', fontSize: 14, lineHeight: 20 }} numberOfLines={2}>
                  {item.type || 'Custom AI Agent'}
                </Text>
              </View>
              <View style={{
                backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                borderWidth: 1,
                borderColor: isDark ? '#3A3833' : '#F0EDE6',
              }}>
                <StatusIcon size={12} color={status.color} />
                <Text style={{ color: status.color }} className="text-[10px] font-black uppercase tracking-wider">
                  {status.label}
                </Text>
              </View>
            </View>

            {item.schedule_type === 'scheduled' && item.schedule_cron && (
              <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: isDark ? '#3A3833' : '#F0EDE6', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Clock size={14} color="#75736F" />
                <Text style={{ color: '#75736F', fontSize: 12 }}>
                  Next execution: {item.schedule_cron}
                </Text>
              </View>
            )}
          </View>
        </ScalePressable>
      </FadeInDownView>
    )
  }

  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#1A1918' : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={isDark ? '#F7F4E9' : '#34322D'} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#1A1918' : '#FFFFFF' }} edges={['top']}>
      {/* Header */}
      <FadeInDownView delay={0}>
        <View className="px-6 py-4 flex-row items-center justify-between">
          <View>
            <Text style={{ color: isDark ? '#FFFFFF' : '#34322D', fontWeight: '700', fontSize: 30, letterSpacing: -0.5 }}>Agents</Text>
            <Text style={{ color: isDark ? '#F7F4E9' : '#75736F', fontSize: 12, fontWeight: '700', marginTop: 4, textTransform: 'uppercase', letterSpacing: 2 }}>
              {agents.length} Active {agents.length !== 1 ? 'Units' : 'Unit'}
            </Text>
          </View>
          <ScalePressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
              router.push('/(app)/(tabs)')
            }}
            style={{
              width: 48,
              height: 48,
              backgroundColor: isDark ? '#FFFFFF' : '#34322D',
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 4,
            }}
          >
            <Plus size={24} color={isDark ? '#000' : '#FFF'} strokeWidth={3} />
          </ScalePressable>
        </View>
      </FadeInDownView>

      {/* Agents list */}
      <FlatList
        data={agents}
        renderItem={renderAgent}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingVertical: 10, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchAgents(true)}
            tintColor="#fff"
            progressBackgroundColor={isDark ? '#1A1918' : '#FFFFFF'}
          />
        }
        ListEmptyComponent={
          <FadeInDownView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
            <View style={{ opacity: 0.1, marginBottom: 32 }}>
              <Image 
                source={require('../../../assets/icon.png')} 
                style={{ width: 128, height: 128 }}
                resizeMode="contain"
              />
            </View>
            <Text style={{ color: isDark ? '#FFFFFF' : '#34322D', fontWeight: '700', fontSize: 24, marginBottom: 12, textAlign: 'center', letterSpacing: -0.5 }}>No agents yet</Text>
            <Text style={{ color: isDark ? '#75736F' : '#75736F', textAlign: 'center', fontSize: 18, lineHeight: 28, marginBottom: 40, paddingHorizontal: 16 }}>
              Your autonomous AI team will appear here. Create your first agent to start.
            </Text>
            <Button
              onPress={() => router.push('/(app)/(tabs)')}
              size="lg"
              className={`w-full rounded-[20px] ${isDark ? 'bg-white' : 'bg-[#34322D]'}`}
            >
              <Text className={`font-bold text-lg ${isDark ? 'text-black' : 'text-white'}`}>Create first agent</Text>
            </Button>
          </FadeInDownView>
        }
      />
    </SafeAreaView>
  )
}

