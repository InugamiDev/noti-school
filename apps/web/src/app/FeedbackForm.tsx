// intent: "Report an issue" form for one answer; posts the same Feedback body as before and shows pending, success and
//         failure inline (one polite status line, no toast, so the outcome is announced once).
// status: done
// next: App owns the message so an access-scope change clears it.
// confidence: high
import CircleCheck from 'lucide-solid/icons/circle-check';
import TriangleAlert from 'lucide-solid/icons/triangle-alert';
import { createSignal, Show } from 'solid-js';
import { errorText, post, requestScope } from '../api';
import { feedbackCategoryLabels } from './workspace';
import { scoped } from '../App';
import { Button, cx, Select } from '../ui';
import page from './Page.module.scss';
import styles from './Workspace.module.scss';

const categories = Object.entries(feedbackCategoryLabels).map(([value, label]) => ({ value, label }));

export const FEEDBACK_SENT = 'Feedback received. Thank you.';
const SENDING = 'Sending…';

export function FeedbackForm(props: {
  answerId: string;
  institution: string;
  message: string;
  onMessage: (message: string) => void;
}) {
  const [category, setCategory] = createSignal('unsupported');
  const [comment, setComment] = createSignal('');
  const state = () =>
    props.message === SENDING ? 'sending' : props.message === FEEDBACK_SENT ? 'sent' : props.message ? 'failed' : 'idle';
  return (
    <form
      class={cx(page.card, styles.feedback)}
      aria-label="Report an issue"
      onSubmit={async (e) => {
        e.preventDefault();
        if (state() === 'sending') return;
        const owner = requestScope();
        props.onMessage(SENDING);
        try {
          await post(scoped(props.institution, '/feedback'), 'Feedback', {
            answer_id: props.answerId,
            category: category(),
            comment: comment(),
          });
          if (!owner.aborted) props.onMessage(FEEDBACK_SENT);
        } catch (err) {
          if (!owner.aborted) props.onMessage(errorText(err));
        }
      }}
    >
      <Select label="Issue" name="category" options={categories} value={category()} onChange={setCategory} />
      <div class={page.field}>
        <label for="feedback-comment">Comment</label>
        <textarea
          id="feedback-comment"
          class={page.textarea}
          name="comment"
          maxLength={2000}
          aria-describedby="feedback-comment-hint"
          value={comment()}
          onInput={(e) => setComment(e.currentTarget.value)}
        />
        <span id="feedback-comment-hint" class={page.hint}>
          Optional, up to 2,000 characters. Leave out passwords and private details.
        </span>
      </div>
      <Button type="submit" class={page.submit} loading={state() === 'sending'} loadingLabel="Sending">
        Send feedback
      </Button>
      <p
        role="status"
        class={cx(styles.feedbackStatus, state() === 'sent' && styles.sent, state() === 'failed' && styles.failed)}
      >
        <Show when={state() === 'sent'}>
          <CircleCheck size={16} aria-hidden="true" />
        </Show>
        <Show when={state() === 'failed'}>
          <TriangleAlert size={16} aria-hidden="true" />
        </Show>
        {state() === 'sending' ? '' : props.message}
      </p>
    </form>
  );
}
