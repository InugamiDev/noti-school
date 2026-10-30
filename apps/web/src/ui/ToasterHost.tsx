// intent: one toast surface for the app (solid-sonner), Clay-styled, bottom centre, 2.6s, announced through a polite live region.
// status: done
// next: loaded on demand by Toaster.tsx (first toast or browser idle); import Toaster and toast from ui/index.ts instead.
// confidence: high
import CircleCheck from 'lucide-solid/icons/circle-check';
import Info from 'lucide-solid/icons/info';
import TriangleAlert from 'lucide-solid/icons/triangle-alert';
import { Toaster as SonnerToaster, toast as sonnerToast } from 'solid-sonner';
import styles from './Toaster.module.scss';

import type { ToastTone } from './Toaster';

const TOAST_MS = 2600;

/** Toast host; render once. Sonner's container is an aria-live="polite" region. */
export function ToasterHost() {
  return (
    <SonnerToaster
      position="bottom-center"
      duration={TOAST_MS}
      visibleToasts={3}
      offset={20}
      containerAriaLabel="Notifications"
      toastOptions={{ unstyled: true, class: styles.toast ?? '' }}
    />
  );
}

/** Shows a short confirmation; tone picks the icon (success check, info, error triangle). Returns the toast id. */
export function toast(message: string, tone: ToastTone = 'success'): string | number {
  const icon =
    tone === 'error' ? <TriangleAlert size={18} /> : tone === 'info' ? <Info size={18} /> : <CircleCheck size={18} />;
  return sonnerToast(message, tone === 'error' ? { icon, class: styles.error ?? '' } : { icon });
}
