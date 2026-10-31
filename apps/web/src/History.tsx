import { createSignal, For, Show } from 'solid-js';
import { LoadingStatus, SkeletonList } from './ui/Loader';
import { ChevronDown, ChevronRight, MessageCircle, Trash2 } from 'lucide-solid';
import type { z } from 'zod';
import type { Schemas } from '@noti/contracts';
import { get, request, errorText, requestScope } from './api';
import { createRemoteResource } from './resource';
import Pagination from './Pagination';
import { scoped } from './App';
import { conversationTitle } from './questions';
import { relativeDate, formatDate } from './ui/format';
import './ui/history.css';

type ConversationPage = z.infer<typeof Schemas.ConversationPage>;
type Conversation = ConversationPage['items'][number];

export const fallbackTitle = (created: string) => `Conversation from ${formatDate(created)}`;

// intent: owner-scoped saved conversations. Each row opens the same answer workspace as a live
// conversation (#/answer/<id>), so reading, citing and continuing happen in one place.
export default function History(props: {
  institution: string;
  institutionName: (id: string) => string | undefined;
  setInstitution: (id: string) => void;
  historyLoading: boolean;
  historyError: unknown;
  history: ConversationPage | undefined;
  listCursor: string;
  setListCursor: (cursor: string) => void;
  /** Called when a row is opened so the workspace shows "All conversations" as its back link. */
  opening: () => void;
}) {
  return (
    <div class="page history">
      <h1 tabIndex={-1}>Your conversations</h1>
      <p class="muted">Questions you have asked, newest first.</p>
      <Show when={props.historyLoading}>
        <LoadingStatus>Loading saved conversations…</LoadingStatus>
        <SkeletonList rows={3} />
      </Show>
      <Show when={props.historyError}>
        <p role="alert">{errorText(props.historyError)}</p>
      </Show>
      <ol class="conversation-list">
        <For
          each={props.history?.items}
          fallback={
            <Show when={!props.historyLoading && !props.historyError}>
              <li class="history-empty">
                <MessageCircle size={28} aria-hidden="true" />
                <p>No conversations yet.</p>
                <a class="primary" href="#/">Ask a question</a>
              </li>
            </Show>
          }
        >
          {(row, i) => (
            <ConversationRow
              row={row}
              index={i()}
              institutionName={props.institutionName}
              open={() => {
                props.setInstitution(row.institution_id);
                props.opening();
              }}
            />
          )}
        </For>
      </ol>
      <Pagination
        cursor={props.listCursor}
        next={props.history?.next_cursor}
        change={props.setListCursor}
        label="History pages"
      />
    </div>
  );
}

function ConversationRow(props: {
  row: Conversation;
  index: number;
  institutionName: (id: string) => string | undefined;
  open: () => void;
}) {
  // Titles come from questions asked in this tab; otherwise the first answer previews the topic.
  const known = conversationTitle(props.row.id);
  const [preview] = createRemoteResource(
    () => ({ institution: props.row.institution_id, id: props.row.id }),
    (key) => get(scoped(key.institution, '/conversations/{conversation_id}/answers', { conversation_id: key.id }), 'AnswerPage'),
  );
  const snippet = () => (known ? undefined : preview()?.items[0]?.claims[0]?.text);
  const turns = () => preview()?.items.length;
  return (
    <li class="stagger-in" style={{ '--i': props.index }}>
      <a class="conversation-row" href={`#/answer/${props.row.id}`} onClick={props.open}>
        <span class="conversation-text">
          <strong>{known ?? fallbackTitle(props.row.created_at)}</strong>
          <Show when={snippet()}>
            <span class="conversation-snippet">{snippet()}</span>
          </Show>
          <small>
            {relativeDate(props.row.created_at)}
            {props.institutionName(props.row.institution_id) ? ` · ${props.institutionName(props.row.institution_id)}` : ''}
            {turns() ? ` · ${turns()}${preview()?.next_cursor ? '+' : ''} ${turns() === 1 ? 'answer' : 'answers'}` : ''}
          </small>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
        <span class="sr-only">Open conversation</span>
      </a>
    </li>
  );
}

/** "Remove from history" with an inline confirmation; used by the answer workspace. */
export function DeleteConversation(props: {
  institution: string;
  id: string;
  deleted: (conversationId: string) => void;
  refreshHistory: () => unknown;
}) {
  const [confirming, setConfirming] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [error, setError] = createSignal('');
  let keep: HTMLButtonElement | undefined;
  const remove = async () => {
    if (deleting()) return;
    setDeleting(true);
    setError('');
    const owner = requestScope(),
      deleted = props.id;
    try {
      await request(
        scoped(props.institution, '/conversations/{conversation_id}', { conversation_id: deleted }),
        null,
        { method: 'DELETE' },
      );
      if (owner.aborted) return;
      props.deleted(deleted);
      await props.refreshHistory();
      if (owner.aborted) return;
      location.hash = '/history';
    } catch (e) {
      if (!owner.aborted) setError(errorText(e));
    } finally {
      setDeleting(false);
    }
  };
  return (
    <details class="danger-zone">
      <summary>
        <Trash2 size={16} aria-hidden="true" />
        <span>Remove from history</span>
        <ChevronDown size={16} class="danger-chevron" aria-hidden="true" />
      </summary>
      <p>Deleting removes this conversation and its answers from your history. This cannot be undone.</p>
      <Show
        when={!confirming()}
        fallback={
          <div class="confirm-row" role="group" aria-label="Confirm deletion">
            <p>Delete this conversation and all of its answers? This cannot be undone.</p>
            <div class="actions">
              <button class="danger" disabled={deleting()} onClick={() => void remove()}>
                <Trash2 size={16} /> {deleting() ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button type="button" ref={keep} disabled={deleting()} onClick={() => setConfirming(false)}>
                Keep
              </button>
            </div>
          </div>
        }
      >
        <button
          class="danger"
          onClick={() => {
            setConfirming(true);
            queueMicrotask(() => keep?.focus());
          }}
        >
          <Trash2 size={16} /> Delete conversation
        </button>
      </Show>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
    </details>
  );
}
