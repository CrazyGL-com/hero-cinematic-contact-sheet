<sub>*Hero made by [@ybouane](https://x.com/ybouane).*</sub>
<p align="center">
  <img src="https://crazygl.com/heroes/hero-cinematic-contact-sheet/banner-full.png" alt="Cinematic Contact Sheet" width="640">
</p>

# @crazygl/hero-cinematic-contact-sheet

Multiple frames behave like a cinematic contact sheet, bending through depth and holding a warm editorial mood.

## Demo
[Cinematic Contact Sheet](https://crazygl.com/hero/cinematic-contact-sheet)

## Install

```bash
npm install @crazygl/hero-cinematic-contact-sheet
```

## Usage

```tsx
import CinematicContactSheet from '@crazygl/hero-cinematic-contact-sheet';

export default function Page() {
  return (
    <CinematicContactSheet
      heading={"Every frame\nstill counts."}
      screenshot1="/shots/one.avif"
      screenshot2="/shots/two.avif"
      flipCycle
      cycleInterval={2.9}
    />
  );
}
```

## Customise

- **Content** — `contentType` (heading / two-columns / custom), `heading`, `subheading`.
- **Screenshots** — `screenshot1`…`screenshot5`, the images on each card (1 is front).
- **Stack** — `cardCount`, `stackOffsetX/Y/Z`, `cardSize`, `groupOffsetX/Y`, `cardCornerRadius`.
- **Flip cycle** — `flipCycle`, `cycleInterval` (seconds between flips).
- **Motion** — `cursorTilt` pointer parallax, `ambientFloat` continuous bob.
- **Style / Lighting** — `edgeGlowColor`/`edgeGlowStrength`, `shadowStrength`, `keyColor`, `fillColor`, `screenBrightness`.
- **Background** — `bgTop`, `bgBottom` gradient.

## Best for

- Photographer and studio portfolios built from layered stills.
- Product launch pages showing multiple app screens or modules.
- Design-agency and editorial/template-marketplace landing pages.



This hero is part of [CrazyGL](https://crazygl.com), a collection of production-ready WebGL, canvas, 3D, and typography effects. Every CrazyGL hero ships with an agent-ready `SKILL.md` file that helps developers and coding agents adapt the effect into custom landing pages and interactive experiences.
