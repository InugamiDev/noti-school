import { createSignal, Show } from 'solid-js';
import { Download } from 'lucide-solid';
import { Loader } from './Loader';

/** A safe file name from a document title and edition, e.g. Student-Handbook-2026-27.pdf. */
export function fileName(title: string, edition: string, kind: string | undefined) {
  const slug = (value: string) =>
    value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const base = slug(title) || 'document';
  const label = slug(edition);
  const name = label && !base.toLowerCase().includes(label.toLowerCase()) ? `${base}-${label}` : base;
  const extension = kind === 'pdf' ? 'pdf' : kind === 'url' ? 'html' : 'txt';
  return `${name.slice(0, 120)}.${extension}`;
}

/**
 * Downloads the original file with the session cookie and saves it under a readable name.
 * The API URL is only ever fetched, never navigated to, so it cannot land in the address bar.
 */
export function DownloadButton(props: { href: string; filename: string; label: string; class?: string }) {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const download = async () => {
    if (busy()) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(props.href, { credentials: 'same-origin', redirect: 'error' });
      if (!response.ok) {
        setError(
          response.status === 404
            ? 'This file is no longer available.'
            : response.status === 401 || response.status === 403
              ? 'Your account cannot download this file. Sign in with a member account.'
              : 'The file could not be downloaded right now. Please try again.',
        );
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = props.filename;
      anchor.rel = 'noopener';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError('Connection unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <span class={`download ${props.class ?? ''}`}>
      <button type="button" class="download-button" disabled={busy()} onClick={() => void download()}>
        <Show when={busy()} fallback={<Download size={16} aria-hidden="true" />}>
          <Loader size="sm" />
        </Show>
        {props.label}
      </button>
      <Show when={error()}>
        <span role="alert" class="download-error">{error()}</span>
      </Show>
    </span>
  );
}
