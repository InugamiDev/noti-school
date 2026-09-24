import { Show } from 'solid-js';
export const pageSuffix = (cursor: string) => cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
export default function Pagination(props: { cursor: string; next: string | null | undefined; change: (cursor: string) => void; label: string }) {
  return <div class="actions" aria-label={props.label}><Show when={props.cursor}><button onClick={()=>props.change('')}>First page</button></Show><Show when={props.next}><button onClick={()=>props.change(props.next!)}>Next page</button></Show></div>;
}
