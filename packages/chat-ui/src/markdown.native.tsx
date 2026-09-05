import { themeTokens, type UiTheme } from "@rakazo/ui-tokens";
import Markdown, {
  MarkdownStream,
  type RenderRules,
} from "@ronradtke/react-native-markdown-display";
import { memo, useMemo } from "react";
import { Linking, StyleSheet, Text, useColorScheme, View } from "react-native";
import type { ChatMarkdownProps } from "./markdown";
import { sanitizeMarkdownUrl } from "./markdown";

const makeStyles = (colors: ReturnType<typeof themeTokens>) =>
  StyleSheet.create({
    body: {
      color: colors.body,
      fontSize: 15,
      lineHeight: 22,
      width: "100%",
      minWidth: 0,
      flexShrink: 1,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 9,
      width: "100%",
      flexShrink: 1,
    },
    heading1: {
      color: colors.ink,
      fontSize: 21,
      lineHeight: 27,
      marginTop: 10,
      marginBottom: 5,
    },
    heading2: {
      color: colors.ink,
      fontSize: 19,
      lineHeight: 25,
      marginTop: 10,
      marginBottom: 5,
    },
    heading3: {
      color: colors.ink,
      fontSize: 17,
      lineHeight: 23,
      marginTop: 8,
      marginBottom: 4,
    },
    strong: {
      color: colors.ink,
      fontWeight: "700",
    },
    link: {
      color: colors.accent,
      textDecorationLine: "underline",
      marginBottom: 0,
    },
    code_inline: {
      color: colors.ink,
      backgroundColor: colors.surface2,
      borderColor: colors.hairline,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 0,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    code_block: {
      color: colors.ink,
      backgroundColor: colors.surface,
      borderColor: colors.hairline,
    },
    fence: {
      backgroundColor: colors.surface,
      borderColor: colors.hairline,
    },
    fence_code: {
      backgroundColor: colors.surface,
    },
    blockquote: {
      backgroundColor: "transparent",
      borderLeftColor: colors.hairlineStrong,
    },
    table: {
      borderColor: colors.hairlineStrong,
    },
    tr: {
      borderColor: colors.hairlineStrong,
    },
    hr: {
      backgroundColor: colors.hairlineStrong,
    },
    bullet_list_content: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    ordered_list_content: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
  });

async function openSafeLink(url: string) {
  const safeUrl = sanitizeMarkdownUrl(url);
  if (!safeUrl) return;
  if (await Linking.canOpenURL(safeUrl)) await Linking.openURL(safeUrl);
}

// Keep links as Text so they stay inside textgroup; Pressable (a View) is laid out
// outside the text flow and collapses the bubble height, overlapping later messages.
const renderRules: RenderRules = {
  link: (node, children, _parent, styleMap) => (
    <Text
      accessibilityRole="link"
      key={node.key}
      style={styleMap.link}
      onPress={() => {
        void openSafeLink(node.attributes.href ?? "");
      }}
    >
      {children}
    </Text>
  ),
};

export const ChatMarkdown = memo(function ChatMarkdown({
  children,
  streaming = false,
  theme,
}: ChatMarkdownProps & { theme?: UiTheme }) {
  const system = useColorScheme();
  const colorScheme = theme ?? (system === "dark" ? "dark" : "light");
  const colors = themeTokens(colorScheme);
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const sharedProps = {
    colorScheme,
    style: styles,
    rules: renderRules,
    allowedImageHandlers: ["https://", "http://"],
    onLinkPress: (url: string) => {
      void openSafeLink(url);
      return false;
    },
  };

  return (
    <View style={layout.wrap}>
      {streaming ? (
        <MarkdownStream {...sharedProps} cursorColor={colors.muted} streaming>
          {children}
        </MarkdownStream>
      ) : (
        <Markdown {...sharedProps}>{children}</Markdown>
      )}
    </View>
  );
});

const layout = StyleSheet.create({
  wrap: {
    width: "100%",
    minWidth: 0,
    flexShrink: 1,
  },
});

export type { ChatMarkdownProps } from "./markdown";
