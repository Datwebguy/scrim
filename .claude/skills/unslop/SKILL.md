---
name: unslop
description: Polishes Scrim screens so they stop looking AI-generated and keep their own character. Audits a screen for the usual tells (glows, hue gradients, shouty uppercase labels, heavy weights, looping pulses, emoji, hype copy), then fixes spacing, color, icons, copy, type, layout, details and motion in that order, inside Scrim's own design system. Use when asked to unslop, polish or clean up a Scrim screen.
license: CC-BY-4.0
metadata:
  upstream: https://github.com/heydamir/unslop
  upstream-author: Damir Sokolovsky (@heydamir)
---

# Unslop, Scrim edition

Adapted from **unslop** by Damir Sokolovsky ([@heydamir](https://x.com/heydamir), <https://github.com/heydamir/unslop>), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The credit stays in every copy of this file.

**Changes from the original:** the direction is fixed to Scrim's own design system instead of being derived each run; the image generation and story video steps are left out (they use paid services and are not needed here); the passes, the audit idea and the checklist are the original's, shortened.

Slop spreads color and effects over the chrome. Craft keeps the chrome quiet and puts the richness into one or two moments people remember. Keep the product: features, content and the order of sections do not change. What changes is that every size, color, word and motion becomes deliberate.

## Scrim's direction (fixed, do not re-derive)

- **Product.** A money app on NEAR for people, teams and software that pays for them, private when you choose.
- **Character.** Exact, quiet, a little warm.
- **World.** Paper and ink, with one clean cut through it.
- **Palette.** The tokens in `app/globals.css`: paper `#f5f4ef`, card `#fdfcf9`, ink `#151512`, hairlines `#e3e1d8`, one accent `--orange` `#ff5b2d`. Semantic colors (green, red, amber, blue) carry meaning only.
- **Type.** Manrope for the interface, DM Mono for figures and meta. Weights 400 and 500, with 600 at most for rare emphasis.
- **Moments.** The balance card, and the Scrim mark as a status: the cut travels while money is on its way and draws once, with the orange tip lighting, when it is done (`src/components/StatusMark.tsx`).
- **The current look is approved.** The owner has signed off on the landing and the app as they are: the warm orange light, the glows, the motion, the labels and the type. A pass must not change that look. Do not add backgrounds, grids, boxes or new shapes, and do not remove light or motion. Change only what the owner asks for, and show a visual to the owner before it goes into the app.
- **Signature.** The cut. It is the wordmark's i, the mark, the loader and the Done state, and nowhere else.

## Run it

1. **Look at the screen.** Find the files that render it. Take a screenshot when the app can run.
2. **Audit.** List every sign from the list below, one line each with where it lives.
3. **Decide how much to change.** Scrim's look is approved, so the default is to change nothing visual. Report what the audit found and wait for the owner to pick what to fix.
4. **Fix in nine passes, in order**, finishing each across the whole screen before the next: spacing, color, icons, copy, type, layout, details, visuals, motion.
5. **Check** against the checklist, render again, and report what changed per pass.

## Signs

- Gradient text, neon borders, and color gradients that carry no meaning (purple to blue, rainbow). Scrim's own warm orange light is not on this list.
- Uppercase tracked labels (`NAVIGATION`), italic emphasis, weights 700 and up, negative tracking on small text.
- Emoji used as icons, `New ✨` badges, sparkles.
- Greeting headlines, exclamation marks, hype words (seamless, unlock, magic, supercharge), unverifiable claims, `AI-powered` on everything.
- Loops with no reason (pulse, ping, shimmer on headings, breathing glows, floating elements), `transition: all`, bouncy springs, cards that scale on hover.
- One-off spacing values off the 4px grid, equal things with unequal sizes, icons and labels that do not align.
- Filler visuals that have nothing to do with money or the cut: holographic brains, robots, floating cubes. Never add a box or grid background.

## The nine passes

1. **Spacing.** Everything on a 4px grid. Same thing, same size. Space inside a group is smaller than space between groups. Navigation rows 32 to 36 tall.
2. **Color.** One tinted neutral ramp, three text roles, one accent used rarely. Surfaces stay neutral. Accent with text on it reaches 4.5 to 1. Remove gradient text and neon borders, and keep Scrim's warm light. Borders are quiet hairlines.
3. **Icons.** No emoji. One line icon set, one size and stroke, in the color of their text role.
4. **Copy.** Plain words that say what it does for whom. Sentence case. No exclamation marks, greeting headlines or hype words. Short labels. Short strings end without a period; paragraphs keep theirs. Numbers in one format.
5. **Type.** Manrope and DM Mono only. A few sizes from a scale. Hierarchy from size and color, not weight. `tabular-nums` on figures.
6. **Layout.** Keep sections and their order. Real app proportions. One primary action and at most one secondary. Long headlines align left.
7. **Details.** Nested radii add up (inner = outer minus padding, never under 4). Counts and meta are quiet mono text. Hover and focus states stay in the palette, with a visible focus ring. Charts: one accent, muted grid.
8. **Visuals.** Remove decoration. Product moments come from the product itself: figures set well, the balance card, the mark as status.
9. **Motion.** Keep motion that explains: a hover is a quick color change, a press a tiny scale down, a changed number tweens, Done plays once. Transition named properties (color, background, border, opacity, transform), never `all`. One easing curve. Loops are fine when they are Scrim's own flow (the drifting light, the light travelling along the cut, "on its way"); nothing else loops. Everything respects `prefers-reduced-motion`.

## Do not

- Do not rename the product or change the mark.
- Do not change what the product does or the order of its sections.
- Do not swap one trend for another (glass, grain, neon, bento) and do not add box or grid backgrounds.
- Do not remove what makes Scrim feel alive. The owner wants light, motion and orange touches; plain is a failure.
- Do not invent features, claims or data.

## Checklist

- [ ] Every spacing value is on the 4px scale; equal things have equal sizes
- [ ] One neutral ramp, three text roles, one accent with enough contrast
- [ ] No gradient text or meaningless color gradients; Scrim's warm light and flow are still there
- [ ] No emoji, no sparkle badges
- [ ] Weights 400 to 600, no uppercase tracked labels, no italic emphasis
- [ ] No exclamation marks, greeting headlines, hype words or unverified claims
- [ ] Nested radii add up
- [ ] Motion only where it explains; reduced motion respected
