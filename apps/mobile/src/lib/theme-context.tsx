import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useColorScheme, ColorSchemeName } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const THEME_KEY = '@2hands_theme'

type ThemePreference = 'system' | 'light' | 'dark'

type ThemeColors = {
  bgPrimary: string
  bgSecondary: string
  bgTertiary: string
  surfaceDefault: string
  surfaceHover: string
  textPrimary: string
  textSecondary: string
  textPlaceholder: string
  borderDefault: string
  inputBg: string
  ringFocus: string
  background: string
  foreground: string
  card: string
  cardForeground: string
  border: string
  muted: string
  mutedForeground: string
  placeholder: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  accent: string
  accentForeground: string
  destructive: string
  popover: string
  popoverForeground: string
  input: string
  ring: string
}

interface ThemeContextType {
  themePreference: ThemePreference
  setThemePreference: (pref: ThemePreference) => Promise<void>
  isDark: boolean
  colors: ThemeColors
}

import { colors } from '@2hands/tailwind-config'

const lightColors: ThemeColors = {
  bgPrimary: colors.semanticTokens.light['bg-primary'],
  bgSecondary: colors.semanticTokens.light['bg-secondary'],
  bgTertiary: colors.semanticTokens.light['bg-tertiary'],
  surfaceDefault: colors.semanticTokens.light['surface-default'],
  surfaceHover: colors.semanticTokens.light['surface-hover'],
  textPrimary: colors.semanticTokens.light['text-primary'],
  textSecondary: colors.semanticTokens.light['text-secondary'],
  textPlaceholder: colors.semanticTokens.light['text-placeholder'],
  placeholder: colors.semanticTokens.light['text-placeholder'],
  borderDefault: colors.semanticTokens.light['border-default'],
  inputBg: colors.semanticTokens.light['input-bg'],
  ringFocus: colors.semanticTokens.light['border-focus'],
  background: colors.semanticTokens.light['bg-primary'],
  foreground: colors.semanticTokens.light['text-primary'],
  card: colors.semanticTokens.light['surface-default'],
  cardForeground: colors.semanticTokens.light['text-primary'],
  border: colors.semanticTokens.light['border-default'],
  muted: colors.semanticTokens.light['bg-tertiary'],
  mutedForeground: colors.semanticTokens.light['text-secondary'],
  primary: colors.brand.terracotta,
  primaryForeground: colors.brand.white,
  secondary: colors.semanticTokens.light['bg-secondary'],
  secondaryForeground: colors.semanticTokens.light['text-primary'],
  accent: colors.semanticTokens.light['surface-hover'],
  accentForeground: colors.semanticTokens.light['text-primary'],
  destructive: colors.functional.error,
  popover: colors.semanticTokens.light['bg-elevated'],
  popoverForeground: colors.semanticTokens.light['text-primary'],
  input: colors.semanticTokens.light['input-bg'],
  ring: colors.semanticTokens.light['border-focus'],
}

const darkColors: ThemeColors = {
  bgPrimary: colors.semanticTokens.dark['bg-primary'],
  bgSecondary: colors.semanticTokens.dark['bg-secondary'],
  bgTertiary: colors.semanticTokens.dark['bg-tertiary'],
  surfaceDefault: colors.semanticTokens.dark['surface-default'],
  surfaceHover: colors.semanticTokens.dark['surface-hover'],
  textPrimary: colors.semanticTokens.dark['text-primary'],
  textSecondary: colors.semanticTokens.dark['text-secondary'],
  textPlaceholder: colors.semanticTokens.dark['text-placeholder'],
  placeholder: colors.semanticTokens.dark['text-placeholder'],
  borderDefault: colors.semanticTokens.dark['border-default'],
  inputBg: colors.semanticTokens.dark['input-bg'],
  ringFocus: colors.semanticTokens.dark['border-focus'],
  background: colors.semanticTokens.dark['bg-primary'],
  foreground: colors.semanticTokens.dark['text-primary'],
  card: colors.semanticTokens.dark['surface-default'],
  cardForeground: colors.semanticTokens.dark['text-primary'],
  border: colors.semanticTokens.dark['border-default'],
  muted: colors.semanticTokens.dark['bg-tertiary'],
  mutedForeground: colors.semanticTokens.dark['text-secondary'],
  primary: colors.brand.terracotta,
  primaryForeground: colors.brand.white,
  secondary: colors.semanticTokens.dark['bg-secondary'],
  secondaryForeground: colors.semanticTokens.dark['text-primary'],
  accent: colors.semanticTokens.dark['surface-hover'],
  accentForeground: colors.semanticTokens.dark['text-primary'],
  destructive: colors.functional.error,
  popover: colors.semanticTokens.dark['bg-elevated'],
  popoverForeground: colors.semanticTokens.dark['text-primary'],
  input: colors.semanticTokens.dark['input-bg'],
  ring: colors.semanticTokens.dark['border-focus'],
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme()
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system')
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved && ['system', 'light', 'dark'].includes(saved)) {
        setThemePreferenceState(saved as ThemePreference)
      }
      setIsLoaded(true)
    })
  }, [])

  const setThemePreference = async (pref: ThemePreference) => {
    setThemePreferenceState(pref)
    await AsyncStorage.setItem(THEME_KEY, pref)
  }

  const resolvedScheme: ColorSchemeName =
    themePreference === 'system' ? systemColorScheme : themePreference

  const isDark = resolvedScheme === 'dark'
  const colors = isDark ? darkColors : lightColors

  return (
    <ThemeContext.Provider value={{ themePreference, setThemePreference, isDark, colors }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export { lightColors, darkColors }
