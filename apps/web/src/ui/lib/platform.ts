/** True for Apple platforms where the command modifier is Cmd rather than Ctrl. */
export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Label of the primary shortcut modifier for the given platform string. */
export function modifierLabel(platform: string): 'Cmd' | 'Ctrl' {
  return isMacPlatform(platform) ? 'Cmd' : 'Ctrl';
}

/** Best-effort platform string for the current browser; empty outside a browser. */
export function currentPlatform(): string {
  if (typeof navigator === 'undefined') return '';
  const hinted = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  return hinted || navigator.platform || '';
}

/** True when the keyboard event is the Cmd/Ctrl+K command-menu shortcut. */
export function isCommandShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';
}
