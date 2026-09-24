---
name: noti.school luminous archive
colors:
  primary: "#d5ee78"
  on-primary: "#19200d"
  background: "#101314"
  surface: "#191f21"
  text: "#e7ebea"
  muted: "#a5b0b2"
  cyan: "#9bdde7"
  vermilion: "#ee826d"
typography:
  body:
    fontFamily: "Aptos, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0px"
  heading:
    fontFamily: "Aptos, Segoe UI, sans-serif"
    fontSize: "40px"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "0px"
rounded:
  none: "0px"
  sm: "5px"
  md: "8px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
---

## Overview
An open archive corridor frames a stable question composer. The explicitly requested dark theme is the only theme. System fonts avoid another external fetch and cover Vietnamese.

## Colors
Neutral platinum on charcoal. Chartreuse is reserved for the primary action, cyan for evidence links, vermilion for unavailable states. Status always includes words.

## Typography
Fixed sizes at breakpoints: hero 58/100/112px, body 16px, question 16/18px. No viewport-scaled text or tracking. Long source titles wrap.

## Layout
Stable header; centered 680px composer; next collection section visible below. Answer/source split collapses to a vertical reader on phones. Admin uses compact forms and rows.

## Elevation & Depth
Only the direct Three.js archive supplies spatial depth. Forms use solid surfaces and simple borders.

## Shapes
Maximum radius 8px. Documents and shelves are rectangular.

## Components
Native labels, inputs, selects and buttons. Lucide icons supplement visible labels. Motion control has a title and accessible name. Loading regions include visible status.

## Do's and Don'ts
Do preserve drafts and give accurate failure recovery. Do not fabricate sources, metrics, affiliation, authentication, or policy answers.
