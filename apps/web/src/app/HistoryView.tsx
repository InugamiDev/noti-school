// intent: /history and /history/:id route body on the Clay kit: conversation rows, designed empty and signed-out states,
//         answers of one conversation and the delete action. App owns the resources, cursors and the delete request.
// status: done
// next: the list comes from the conversations endpoint scoped to the signed-in member; nothing is cached across accounts.
//       While identity or the list is unresolved, skeleton rows stand in the real list; signed-out and empty come only after.
// confidence: high
import type { AnswerOutput } from '@noti/contracts';
import { History, LogIn, MessageSquare, MessagesSquare, Trash2, TriangleAlert } from 'lucide-solid';
import { For, Show } from 'solid-js';
import Pagination from '../Pagination';
import { Badge, Button, cx, EmptyState, LoadingRegion, SkeletonRow } from '../ui';
import type { SessionState } from './session';
import { answerPresentation, formatDate } from './workspace';
import page from './Page.module.scss';

interface ConversationRow {
  id: string;
  institution_id: string;
  created_at: string;
}

export interface HistoryViewProps {
  session: SessionState;
  /** Identity, the school list or the access scope is still resolving. */
  pending: boolean;
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

const dateText = formatDate;

function Alert(props: { text: string }) {
  return (
    <div class={cx(page.notice, page.error)} role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      <p>{props.text}</p>
    </div>
  );
}

export function HistoryView(props: HistoryViewProps) {
  const signedIn = () => props.session === 'signed-in';
  const unavailable = () => props.session === 'unavailable';
  // A member whose list has not arrived yet (no rows, no error) is still loading, not empty.
  const listLoading = () =>
    props.pending || props.rowsLoading || (props.member && !props.rows && !props.rowsError);
  return (
    <section>
      <h1 class={page.title} tabIndex={-1}>
        Your conversations
      </h1>
      <p class={page.lede}>Saved conversations for your school account. Only you can open them.</p>
      <div class={page.after} />
      <Show
        when={props.member || props.pending}
        fallback={
          <EmptyState
            icon={LogIn}
            title={
              signedIn()
                ? 'No conversations for this school'
                : unavailable()
                  ? 'Your account could not be checked'
                  : 'Sign in to see your conversations'
            }
            body={
              signedIn()
                ? 'This account is not a member of the selected school.'
                : unavailable()
                  ? 'Saved conversations need your account. Try again in a moment.'
                  : 'Conversations are saved to your school account, not to this browser.'
            }
            action={
              <Show when={!unavailable()}>
                <Button size="sm" variant="primary" href="#/auth">
                  {signedIn() ? 'Open account' : 'Sign in'}
                </Button>
              </Show>
            }
          />
        }
      >
        <LoadingRegion
          loading={listLoading()}
          label="Loading saved conversations…"
          skeleton={
            <ul class={page.list}>
              <li><SkeletonRow /></li>
              <li><SkeletonRow /></li>
              <li><SkeletonRow /></li>
            </ul>
          }
        >
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
                      <MessageSquare class={cx(page.rowGlyph)} size={18} aria-hidden="true" />
                      <span class={page.rowText}>
                        Open conversation
                        <span class={page.meta}>
                          Started {dateText(row.created_at)} · {row.id.slice(0, 8)}
                        </span>
                      </span>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </LoadingRegion>
        <Pagination cursor={props.listCursor} next={props.listNext} change={props.onListCursor} label="History pages" />
        <Show when={props.detail}>
          <h2 class={page.h2}>Answers in this conversation</h2>
          <LoadingRegion
            loading={props.answersLoading}
            label="Loading conversation…"
            skeleton={
              <ul class={page.list}>
                <li><SkeletonRow icon={false} meta={false} pill /></li>
                <li><SkeletonRow icon={false} meta={false} pill /></li>
              </ul>
            }
          >
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
          </LoadingRegion>
        </Show>
      </Show>
    </section>
  );
}
