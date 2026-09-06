# 2hands visual system

2hands uses a quiet workspace with clear type, subtle surfaces, and small moments of color. The marketing page, web app, Electron shell, and native apps share the same identity. Existing interaction, authorization, and execution behavior stays in its established layer.

## Design references

Lovable’s public [brand palette](https://lovablebrand.lovable.app/brand/colors), linked from its [press page](https://lovable.dev/brand), and its editor were inspected on September 6, 2026. The editor uses 14px navigation, 16px conversation text, almost-white user bubbles, open assistant responses, 24px composer corners, and fine borders with very small shadows. The reference font is Camera Plain; 2hands uses its existing locally bundled Geist on web/Electron and platform typography on native.

The bot construction draws on the simple shapes and consistent eyes described in [Grok Bot’s design retrospective](https://x.ai/news/designing-grok-bot). These are original 2hands assets. The design is an interpretation of those principles, not work produced or endorsed by either company.

Lovable’s [mobile documentation](https://docs.lovable.dev/integrations/lovable-mobile-app) informs the restrained native controls and continuity across devices. The interaction follows [Grok Bot’s mobile conversation flow](https://docs.x.ai/grok-bot/mobile): conversation stays primary, and the computer opens from a contextual button when needed. The message input occupies a full row above the attachment, computer, model, and send toolbar. Computer views retain native back navigation and the conversation’s draft. These choices adapt the documented principles; no authenticated mobile benchmark was performed.

## Shared decisions

| Element | Treatment |
| --- | --- |
| Light canvas | Nearly white `#FAFAFC`; quiet gray sidebar `#F6F6F8` |
| User messages | White, subtle outline, 12px vertical / 16px horizontal padding |
| Assistant messages | Open text; no enclosing bubble or shadow |
| Selection | Pale lilac; color also identifies assistants and keyboard focus |
| Primary controls | Ink on light surfaces; light on dark surfaces |
| Typography | 14px controls, 16px conversation text with 24px line height |
| Corners | 10px controls, 16px cards, 24px composers/messages/sheets |
| Spacing | 4px scale; grouped controls and generous conversation rhythm |
| Motion | 120–220ms; respect reduced motion; activity reflects actual state |
| Native targets | At least 44px, with keyboard and safe-area accommodation |

Dark mode uses neutral charcoal surfaces with readable text and a restrained lilac selection. The default follows system appearance; a saved user preference still takes precedence.

## Source of truth

- Palette, type, spacing, and motion: `packages/ui-tokens/src/index.ts`, with matching web variables in `tokens.css`.
- Logo and assistant geometry: `packages/ui-tokens/src/brand.ts`.
- Web rendering: `packages/ui-web/src/brand.tsx` and `bot-avatar.tsx`.
- Native rendering: `apps/mobile/components/brand-mark.tsx` and `bot-avatar.tsx`.
- The existing Beautiful UI ports remain the source for cards, loading, activity, and approval patterns.

The logo is a compact numeral 2 formed by two complementary open hands. Broad palms, curved thumbs, and two finger gaps per hand make the gesture readable without detailed anatomy. Rounded meeting corners echo the outer curves, while a four-unit central gap on the 64-unit grid keeps both hands distinct in monochrome. Azure and violet meet a shared lilac tone at the center, then flow into rose and warm peach. Gradient stops and directions live with the geometry so every platform renders the same color treatment. Use the same geometry at every size, with clear space of at least one finger width. Do not add outlines, shadows, or extra symbols. Color, single-ink, and reversed SVGs are generated together.

The character family keeps distinct shapes, steady eyes, and soft blue/lilac/coral shading. Characters are the default on web and native; the saved classic robot preference and custom bot colors remain supported.

## Generated app assets

Run from the repository root:

```sh
pnpm exec tsx infra/brand/generate.ts
```

The script uses the repository’s installed Sharp package and canonical geometry. It generates web/marketing favicons and manifests, character SVGs, desktop icons, mobile icons, and the Android notification vector. Run on macOS to regenerate `.icns` before packaging a Mac release. iOS app icons are opaque RGB; adaptive, splash, monochrome, and notification artwork retains transparency. Electron’s setup build copies the generated shared SVG.

The mobile build plugin registers shared package sources, workspace dependencies, and the configured API origin as Android bundle inputs. Incremental builds therefore invalidate an older JavaScript bundle when those inputs change. Verification must still inspect the installed app; a successful build alone does not confirm the native interaction quality.

The conversation and navigation checks use deterministic offline fixtures. Native verification uses isolated test devices and synthetic accounts; research screenshots and private account content are never copied into the repository.
