import { createSignal, For, Show, onCleanup } from 'solid-js';
import { Fingerprint, KeyRound, Plus, RotateCw } from 'lucide-solid';
import { RequestError } from './api';
import { addPasskey, listPasskeys, removePasskey, passkeySupported, PasskeyError, type PasskeyItem } from './passkey';
import { formatDate, type Lang } from './ui/format';
import { fill, t, type StringKey } from './ui/i18n';
import { Loader } from './ui/Loader';

// intent: the signed-in account's passkeys: list them, add one, remove one. Outcomes are reported
// to the account page's single status line, so a screen reader hears one live region. A dismissed
// browser prompt is reported calmly, never as an error.
// status: done | next: rename a passkey (the plugin has update-passkey) if the owner asks for it
// confidence: medium (verified against the synthetic demo server with a virtual authenticator only)
export type Notice = { key: StringKey; tone: 'done' | 'calm' | 'problem' };

/** Failures that say nothing about what the visitor typed: too many attempts, or the service is down. */
export function serviceProblem(error: unknown): StringKey | undefined {
  if (!(error instanceof RequestError)) return undefined;
  if (error.code === 'rate_limited' || error.status === 429) return 'authErrRateLimited';
  if (error.status === 0) return 'authErrConnection';
  if (error.status >= 500) return 'authErrUnavailable';
  return undefined;
}

function addProblem(error: unknown): Notice {
  if (error instanceof PasskeyError) {
    if (error.reason === 'cancelled') return { key: 'authPasskeyAddCancelled', tone: 'calm' };
    return { key: error.reason === 'duplicate' ? 'authPasskeyDuplicate' : 'authPasskeyAddRefused', tone: 'problem' };
  }
  const service = serviceProblem(error);
  if (service) return { key: service, tone: 'problem' };
  if (error instanceof RequestError && error.status === 401) return { key: 'authErrSession', tone: 'problem' };
  // The server only accepts a new passkey from a recent sign-in.
  if (error instanceof RequestError && error.status === 403) return { key: 'authPasskeyFresh', tone: 'problem' };
  return { key: 'authPasskeyAddFailed', tone: 'problem' };
}

export default function Passkeys(props: {
  lang: Lang;
  /** Another account action is running. */
  busy: boolean;
  /** Right after sign-up: invite the new member to add a passkey, once. */
  offer: boolean;
  dismissOffer: () => void;
  report: (notice: Notice | undefined) => void;
}) {
  let disposed = false;
  const reads = new AbortController();
  onCleanup(() => {
    disposed = true;
    reads.abort();
  });
  const supported = passkeySupported();
  const [items, setItems] = createSignal<PasskeyItem[]>();
  const [loadFailed, setLoadFailed] = createSignal(false);
  const [working, setWorking] = createSignal(false);
  const [confirming, setConfirming] = createSignal('');
  const [name, setName] = createSignal('');
  const label = (key: StringKey) => t(props.lang, key);
  const locked = () => working() || props.busy;

  async function load() {
    setLoadFailed(false);
    try {
      const rows = await listPasskeys(reads.signal);
      if (disposed) return;
      setItems([...rows].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')));
    } catch {
      if (!disposed) setLoadFailed(true);
    }
  }
  void load();

  async function add(event?: SubmitEvent) {
    event?.preventDefault();
    if (locked() || !supported) return;
    setWorking(true);
    props.report(undefined);
    try {
      await addPasskey(name());
      if (disposed) return;
      setName('');
      props.dismissOffer();
      await load();
      if (!disposed) props.report({ key: 'authPasskeyAddedDone', tone: 'done' });
    } catch (error) {
      if (!disposed) props.report(addProblem(error));
    } finally {
      if (!disposed) setWorking(false);
    }
  }
  async function remove(id: string) {
    if (locked()) return;
    setWorking(true);
    props.report(undefined);
    try {
      await removePasskey(id);
      if (disposed) return;
      setConfirming('');
      await load();
      if (!disposed) props.report({ key: 'authPasskeyRemovedDone', tone: 'done' });
    } catch (error) {
      if (!disposed) props.report({ key: serviceProblem(error) ?? 'authPasskeyRemoveFailed', tone: 'problem' });
    } finally {
      if (!disposed) setWorking(false);
    }
  }

  return (
    <section class="account-passkeys" aria-labelledby="account-passkeys-title">
      <div class="auth-heading">
        <span class="auth-icon" aria-hidden="true"><Fingerprint size={18} /></span>
        <div>
          <h2 id="account-passkeys-title">{label('authPasskeys')}</h2>
          <p class="muted">{label('authPasskeysAbout')}</p>
        </div>
      </div>
      <Show when={props.offer && supported}>
        <div class="passkey-offer" role="group" aria-labelledby="passkey-offer-title">
          <h3 id="passkey-offer-title">{label('authPasskeyOfferTitle')}</h3>
          <p>{label('authPasskeyOfferBody')}</p>
          <div class="passkey-actions">
            <button type="button" class="primary" disabled={locked()} onClick={() => void add()}>
              <Show when={working()} fallback={<Plus size={16} aria-hidden="true" />}><Loader size="sm" /></Show>
              {label('authPasskeyAdd')}
            </button>
            <button type="button" disabled={locked()} onClick={() => props.dismissOffer()}>
              {label('authNotNow')}
            </button>
          </div>
        </div>
      </Show>
      <Show
        when={items()}
        fallback={
          <Show
            when={loadFailed()}
            fallback={
              <p class="muted passkey-note" aria-busy="true">
                <Loader size="sm" /> {label('authPasskeysLoading')}
              </p>
            }
          >
            <p class="muted passkey-note">
              {label('authPasskeysLoadFailed')}{' '}
              <button type="button" class="link-button" onClick={() => void load()}>
                <RotateCw size={14} aria-hidden="true" /> {label('tryAgain')}
              </button>
            </p>
          </Show>
        }
      >
        {(list) => (
          <Show when={list().length > 0} fallback={<p class="muted passkey-note">{label('authPasskeysEmpty')}</p>}>
            <ul class="passkey-list" aria-label={label('authPasskeysList')}>
              <For each={list()}>
                {(passkey) => {
                  let keep: HTMLButtonElement | undefined;
                  const shown = () => passkey.name || label('authPasskeyUnnamed');
                  const added = () => (passkey.createdAt ? formatDate(passkey.createdAt, props.lang) : '');
                  return (
                    <li>
                      <div class="passkey-row">
                        <KeyRound size={16} aria-hidden="true" />
                        <div class="passkey-text">
                          <span class="passkey-name">{shown()}</span>
                          <Show when={added()}>
                            <span class="passkey-date">{fill(label('authPasskeyAddedOn'), { date: added() })}</span>
                          </Show>
                        </div>
                        <button
                          type="button"
                          class="danger-quiet passkey-remove"
                          aria-label={fill(label('authPasskeyRemoveNamed'), { name: shown() })}
                          aria-expanded={confirming() === passkey.id}
                          disabled={locked()}
                          onClick={() => {
                            setConfirming((current) => (current === passkey.id ? '' : passkey.id));
                            queueMicrotask(() => keep?.focus());
                          }}
                        >
                          {label('authPasskeyRemove')}
                        </button>
                      </div>
                      {/* Removing a sign-in method asks first; the safe choice has focus. */}
                      <Show when={confirming() === passkey.id}>
                        <div class="passkey-confirm" role="group" aria-label={label('authPasskeyRemoveYes')}>
                          <p>{label('authPasskeyRemoveConfirm')}</p>
                          <div class="passkey-actions">
                            <button type="button" class="danger-quiet" disabled={locked()} onClick={() => void remove(passkey.id)}>
                              {label('authPasskeyRemoveYes')}
                            </button>
                            <button type="button" ref={keep} disabled={locked()} onClick={() => setConfirming('')}>
                              {label('keep')}
                            </button>
                          </div>
                        </div>
                      </Show>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        )}
      </Show>
      <Show
        when={supported}
        fallback={<p class="muted passkey-note">{label('authPasskeyUnsupported')}</p>}
      >
        <Show when={!props.offer}>
          <form class="passkey-add" onSubmit={(event) => void add(event)}>
            <label>
              {label('authPasskeyName')}
              <input
                name="passkey-name"
                autocomplete="off"
                maxLength={64}
                placeholder={label('authPasskeyNameExample')}
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
              />
            </label>
            <button type="submit" disabled={locked()}>
              <Show when={working()} fallback={<Plus size={16} aria-hidden="true" />}><Loader size="sm" /></Show>
              {label('authPasskeyAdd')}
            </button>
          </form>
        </Show>
      </Show>
    </section>
  );
}
