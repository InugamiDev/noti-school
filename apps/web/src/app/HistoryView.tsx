// intent: /history and /history/:id route body on the Clay kit: conversation rows, designed empty and signed-out states,
//         answers of one conversation and the delete action. App owns the resources, cursors and the delete request.
// status: done
// next: the list comes from the conversations endpoint scoped to the signed-in member; nothing is cached across accounts.
// confidence: high
import type { AnswerOutput } from '@noti/contracts';
import { History, LogIn, MessageSquare, MessagesSquare, Trash2, TriangleAlert } from 'lucide-solid';
import { For, Show } from 'solid-js';
import Pagination from '../Pagination';
import { Badge, Button, cx, EmptyState, Skeleton } from '../ui';
import { answerPresentation } from './workspace';
import page from './Page.module.scss';

interface ConversationRow {
  id: string;
  institution_id: string;
  created_at: string;
}

export interface HistoryViewProps {
  signedIn: boolean;
  member: boolean;
  /** Conversations of the current account and school, or undefined while loading or on error. */
  rows: readonly ConversationRow[] | undefined;
  rowsLoading: boolean;
  rowsError: string;
  listCursor: string;
  listNext: string | null | undefined;
  onListCursor: (cursor: string) => void;
  onOpen: (row: ConversationRow) => void;
  /** Present on /history/:id. */
  detail: boolean;
  answers: readonly AnswerOutput[] | undefined;
  answersLoading: boolean;
  answersError: string;
  answerCursor: string;
  answerNext: string | null | undefined;
  onAnswerCursor: (cursor: string) => void;
  onView: (answer: AnswerOutput) => void;
  onDelete: () => Promise<void>;
  deleting: boolean;
  error: string;
  onAsk: () => void;
}

const dateText = (iso: string) => new Date(iso).toLocaleDateString();

function Alert(props: { text: string }) {
  return (
    <div class={cx(page.notice, page.error)} role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      <p>{props.text}</p>
    </div>
  );
}

export function HistoryView(props: HistoryViewProps) {
  return (
    <section>
      <h1 class={page.title} tabIndex={-1}>
        Your conversations
      </h1>
      <p class={page.lede}>Saved conversations for your school account. Only you can open them.</p>
      <Show
        when={props.member}
        fallback={
          <EmptyState
            icon={LogIn}
            title={props.signedIn ? 'No conversations for this school' : 'Sign in to see your conversations'}
            body={
              props.signedIn
                ? 'This account is not a member of the selected school.'
                : 'Conversations are saved to your school account, not to this browser.'
            }
            action={
              <Button size="sm" variant="primary" href="#/auth">
                {props.signedIn ? 'Open account' : 'Sign in'}
              </Button>
            }
          />
        }
      >
        <Show when={props.rowsLoading}>
          <div class={page.loading} role="status" aria-label="Loading saved conversations">
            <span class="sr-only">Loading saved conversations…</span>
            <Skeleton height="56px" radius="sm" />
            <Skeleton height="56px" radius="sm" />
          </div>
        </Show>
        <Show when={props.rowsError}>
          <Alert text={props.rowsError} />
        </Show>
        <Show
          when={props.rows?.length}
          fallback={
            <Show when={props.rows && !props.rowsLoading && !props.rowsError}>
              <EmptyState
                icon={MessagesSquare}
                title="No conversations yet"
                body="Questions you ask while signed in are saved here."
                action={
                  <Button size="sm" variant="primary" onClick={() => props.onAsk()}>
                    Ask your first question
                  </Button>
                }
              />
            </Show>
          }
        >
          <ul class={page.list}>
            <For each={props.rows}>
              {(row) => (
                <li>
                  <a class={page.row} href={`#/history/${row.id}`} onClick={() => props.onOpen(row)}>
                    <span class={page.rowIcon} aria-hidden="true">
                      <MessageSquare size={20} />
                    </span>
                    <span class={page.rowText}>
                      Open conversation
                      <span class={page.meta}>Started {dateText(row.created_at)}</span>
                    </span>
                  </a>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Pagination cursor={props.listCursor} next={props.listNext} change={props.onListCursor} label="History pages" />
        <Show when={props.detail}>
          <h2 class={page.h2}>Answers in this conversation</h2>
          <Show when={props.answersLoading}>
            <p role="status" class={page.small}>
              Loading conversation…
            </p>
          </Show>
          <Show when={props.answersError}>
            <Alert text={props.answersError} />
          </Show>
          <Show when={props.answers}>
            {(answers) => (
              <>
                <Show when={!answers().length}>
                  <EmptyState icon={History} title="No answers here" body="This conversation has no answers you can open." />
                </Show>
                <ul class={page.list}>
                  <For each={answers()}>
                    {(a) => {
                      const view = answerPresentation(a.status);
                      return (
                        <li>
                          <button type="button" class={page.row} onClick={() => props.onView(a)}>
                            <span class={page.rowText}>View answer · {dateText(a.created_at)}</span>
                            <span class={page.rowEnd}>
                              <Badge tone={view.tone} dot>
                                {view.label}
                              </Badge>
                            </span>
                          </button>
                        </li>
                      );
                    }}
                  </For>
                </ul>
                <Pagination
                  cursor={props.answerCursor}
                  next={props.answerNext}
                  change={props.onAnswerCursor}
                  label="Conversation pages"
                />
                <div class={page.actions}>
                  <Button variant="ghost" loading={props.deleting} loadingLabel="Deleting" onClick={() => void props.onDelete()}>
                    <Trash2 aria-hidden="true" />
                    Delete conversation
                  </Button>
                </div>
                <Show when={props.error}>
                  <Alert text={props.error} />
                </Show>
              </>
            )}
          </Show>
        </Show>
      </Show>
    </section>
  );
}
