// intent: pure, WebGL-free layout and state math for the Clay hero so it can be unit tested in Node.
// status: done
// next: scene.ts is the only consumer; keep three.js imports out of this file.
// confidence: high (numbers mirror design/clay/reference/hero3d.js)

export type Citation = 'a' | 'b';
export type HeroScope = 'active' | 'request';
export type SlotId = 'locked' | 'active' | 'next';
export type Vec3 = { x: number; y: number; z: number };

export const MAX_PIXEL_RATIO = 2;
export const CAMERA_FOV = 26;
/** Fraction of the fit distance the camera sits at; the reference frames tighter than a full fit. */
export const CAMERA_DISTANCE_SCALE = 0.66;
/** Camera direction from the scene centre (normalised in scene.ts). */
export const VIEW_DIRECTION: Vec3 = { x: 0.3, y: 0.7, z: 1 };
export const NARROW_STAGE_PX = 520;
export const SLOT_LIFT = 0.22;
export const STACK_Z = -0.35;
export const SLOT_X: Record<SlotId, number> = { locked: -2.9, active: 0, next: 2.9 };
export const GROOVE_X = [-1.45, 1.45] as const;

export const PALETTE = {
  active: [0xb4532c, 0x7f9a8b, 0xd8c4a6],
  grey: [0xc9cec6, 0xbfc5bd, 0xd6d9d3],
  ghost: [0xe2e5df, 0xe2e5df, 0xe2e5df],
  next: [0x7f9a8b, 0xa9bdb1, 0xd8c4a6],
} as const satisfies Record<string, readonly [number, number, number]>;
export type Palette = (typeof PALETTE)[keyof typeof PALETTE];

// Open page: evidence line widths, the cited line per citation and the line spacing.
export const LINE_WIDTHS = [1.2, 1.32, 0.98, 1.28, 1.18, 1.32, 0.74, 1.2] as const;
export const LINE_LEFT = -0.64;
export const EVIDENCE_LINE: Record<Citation, number> = { a: 3, b: 5 };
export const lineZ = (index: number): number => -0.82 + index * 0.23;

function lineWidth(index: number): number {
  const width = LINE_WIDTHS[index];
  if (width === undefined) throw new RangeError(`No evidence line at index ${index}`);
  return width;
}

/** Centre of evidence line `index` in page space. */
export function lineCenter(index: number): Vec3 {
  const width = lineWidth(index);
  return { x: LINE_LEFT + width / 2, y: 0.042, z: lineZ(index) };
}

/** Where the citation pin rests on the open page for a citation (page space). */
export function pinTarget(citation: Citation): Vec3 {
  const index = EVIDENCE_LINE[citation];
  return { x: LINE_LEFT + lineWidth(index) * 0.62, y: 0.04, z: lineZ(index) };
}

/** Distance at which a bounding sphere fits the narrower of the vertical and horizontal fields of view. */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  if (!(radius > 0) || !(fovDeg > 0) || !(aspect > 0)) throw new RangeError('fitDistance expects positive radius, fov and aspect');
  const half = (fovDeg * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(half) * aspect);
  return radius / Math.sin(Math.min(half, horizontal));
}

/** Vertical setViewOffset shift: moves the scene up so the answer card can overlap the stage's lower edge. */
export function viewOffsetY(width: number, height: number): number {
  return height * (width < NARROW_STAGE_PX ? 0.1 : 0.13);
}

export function capPixelRatio(devicePixelRatio: number): number {
  return Math.min(Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1, MAX_PIXEL_RATIO);
}

export type SlotState = { lift: number; palette?: Palette; opacity?: number };
export type ScopeLayout = { slots: Record<SlotId, SlotState>; pageVisible: boolean };

/** Target state for each school slot: the selected slot lifts and gains colour. */
export function scopeLayout(scope: HeroScope): ScopeLayout {
  const active = scope === 'active';
  return {
    slots: {
      locked: { lift: 0 },
      active: { lift: active ? SLOT_LIFT : 0, palette: active ? PALETTE.active : PALETTE.grey },
      next: { lift: active ? 0 : SLOT_LIFT, palette: active ? PALETTE.ghost : PALETTE.next, opacity: active ? 0.5 : 0.95 },
    },
    pageVisible: active,
  };
}

/** Exponential approach used for every tween; ease 1 snaps. */
export const approach = (current: number, target: number, ease: number): number => current + (target - current) * ease;

/** Normalised pointer position (-1..1 on both axes) inside a rect. */
export function normalisedPointer(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return { x: ((clientX - rect.left) / rect.width) * 2 - 1, y: ((clientY - rect.top) / rect.height) * 2 - 1 };
}

/** World rotation target: pointer parallax plus a slow idle sway. */
export function worldRotationTarget(pointer: { x: number; y: number }, seconds: number) {
  return { x: pointer.y * 0.05, y: pointer.x * 0.16 + Math.sin(seconds * 0.25) * 0.04 };
}
