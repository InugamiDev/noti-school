import { Show } from 'solid-js';
import { Button } from './ui';
import page from './app/Page.module.scss';
export const pageSuffix = (cursor: string) => cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
// Opaque cursor paging: the API only offers "next", so going back means returning to the first page.
export default function Pagination(props: { cursor: string; next: string | null | undefined; change: (cursor: string) => void; label: string }) {
  return (
    <Show when={props.cursor || props.next}>
      <div class={`${page.actions} ${page.pager}`} role="group" aria-label={props.label}>
        <Show when={props.cursor}>
          <Button size="sm" variant="ghost" onClick={() => props.change('')}>First page</Button>
        </Show>
        <Show when={props.next}>
          <Button size="sm" onClick={() => props.change(props.next!)}>Next page</Button>
        </Show>
      </div>
    </Show>
  );
}
