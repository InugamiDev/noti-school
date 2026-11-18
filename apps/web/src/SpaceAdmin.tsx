import { Globe } from 'lucide-solid';
import { WebPages } from './WebPages';
import { createActions } from './ui/actions';
import { t } from './ui/i18n';
import type { Lang } from './ui/format';
import './ui/admin.css';

// intent: the reader's private space is theirs alone, so its management view is a small "My space"
// page: the web pages found for their questions, each of which they can save or block. It has no
// school domains, no budget, no student feedback and no document upload flow, and it never loads
// them: the application spending ceiling and other people's reports are not this reader's to see.
// status: done | next: none | confidence: medium (personal is derived from the institution kind
// until the backend documents a marker for saved pages)
export default function SpaceAdmin(props: { institution: string; lang: Lang }) {
  const { busy, message, act, line } = createActions();
  return (
    <div class="admin-page space-admin" lang={props.lang}>
      <div class="admin-head">
        <h1 tabIndex={-1}>{t(props.lang, 'mySpace')}</h1>
        <p class="muted">{t(props.lang, 'spaceAbout')}</p>
      </div>
      <section class="admin-card stagger-in" style={{ '--i': 0 }} aria-labelledby="space-pages">
        <div class="admin-card-head">
          <span class="admin-icon" aria-hidden="true"><Globe size={18} /></span>
          <div>
            <h2 id="space-pages">{t(props.lang, 'webPages')}</h2>
            <p class="muted">{t(props.lang, 'spacePagesAbout')}</p>
          </div>
        </div>
        <WebPages institution={props.institution} lang={props.lang} busy={busy()} act={act} personal />
      </section>
      <p role="status" class="admin-message" ref={line} tabIndex={-1}>{message()}</p>
    </div>
  );
}
