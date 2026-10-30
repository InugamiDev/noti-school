// intent: "Bring noti.school to your university": three steps plus a request form that validates inline but sends nothing,
//         because no request endpoint exists. The button says "Check details", not "send", and a valid submit says
//         nothing was sent and points to the contact page. Light panel: no dark CTA band for a form that sends nothing.
// status: done
// next: when a real endpoint exists, post the draft and replace the not-sent status with the server's response.
// confidence: high
import { createSignal, For, Show } from 'solid-js';
import { Band } from '../site/Band';
import { Button, Select, TextField, toast } from '../ui';
import { requestRoles, validateRequest, type RequestErrors, type RequestRole } from './logic';
import styles from './Landing.module.scss';

const joinSteps = [
  ['Request access', 'Tell us your university and your role. A student request is welcome too.'],
  ['Approve your sources', 'Your source team uploads and publishes the documents that count as evidence.'],
  ['Invite your students', 'Accounts are tied to your school from the first sign-in.'],
] as const;

export function JoinSection(props: { motion: boolean }) {
  const [university, setUniversity] = createSignal('');
  const [role, setRole] = createSignal<RequestRole>(requestRoles[0]);
  const [email, setEmail] = createSignal('');
  const [errors, setErrors] = createSignal<RequestErrors>({});
  const [notSent, setNotSent] = createSignal(false);
  let universityInput: HTMLInputElement | undefined;
  let emailInput: HTMLInputElement | undefined;

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const found = validateRequest({ university: university(), role: role(), email: email() });
    setErrors(found);
    if (found.university) return universityInput?.focus();
    if (found.email) return emailInput?.focus();
    setNotSent(true);
    toast('Not sent. There is no request service yet.', 'info');
  };

  return (
    <Band motion={props.motion} id="join" labelledby="join-title">
      <div class="site-wrap">
        <div class={styles.join}>
          <div>
            <h2 id="join-title" class={styles.secTitle} tabIndex={-1}>
              Bring noti.school to your university
            </h2>
            <p class={styles.secLede}>
              Any university can join. Your school keeps control of its documents from the first upload.
            </p>
            <ol class={styles.joinSteps}>
              <For each={joinSteps}>
                {([title, body]) => (
                  <li>
                    <div>
                      <strong>{title}</strong>
                      <span>{body}</span>
                    </div>
                  </li>
                )}
              </For>
            </ol>
          </div>
          <form class={styles.joinForm} novalidate onSubmit={submit} aria-labelledby="join-form-title">
            <h3 id="join-form-title">Request your university</h3>
            <TextField
              label="University"
              value={university()}
              onChange={value => {
                setUniversity(value);
                setNotSent(false);
              }}
              error={errors().university}
              placeholder="University name"
              autocomplete="organization"
              inputRef={element => (universityInput = element)}
            />
            <Select
              label="I am a"
              options={requestRoles.map(value => ({ value, label: value }))}
              value={role()}
              onChange={value => setRole(value as RequestRole)}
            />
            <TextField
              label="Email"
              type="email"
              value={email()}
              onChange={value => {
                setEmail(value);
                setNotSent(false);
              }}
              error={errors().email}
              placeholder="you@example.edu"
              autocomplete="email"
              inputRef={element => (emailInput = element)}
            />
            <Button variant="secondary" type="submit">
              Check details
            </Button>
            <p class={styles.formHint}>Nothing is sent from this form yet. It checks your details and shows where to reach us.</p>
            <div role="status" class={styles.formStatus}>
              <Show when={notSent()}>
                <p>
                  This request was not sent: noti.school has no request service yet. Reach the project owner
                  through the <a href="#/contact">contact page</a> and mention your university.
                </p>
              </Show>
            </div>
          </form>
        </div>
      </div>
    </Band>
  );
}
