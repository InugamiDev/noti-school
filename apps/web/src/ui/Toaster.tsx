// intent: one toast surface for the app (solid-sonner), Clay-styled, bottom centre, 2.6s, announced through a polite live region.
// status: done
// next: mount <Toaster /> once near the app root; call toast() from anywhere.
// confidence: high
import { CircleCheck, Info, TriangleAlert } from 'lucide-solid';
import { Toaster as SonnerToaster, toast as sonnerToast } from 'solid-sonner';
import styles from './Toaster.module.scss';

export type ToastTone = 'success' | 'info' | 'error';

const TOAST_MS = 2600;

/** Toast host; render once. Sonner's container is an aria-live="polite" region. */
export function Toaster() {
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
