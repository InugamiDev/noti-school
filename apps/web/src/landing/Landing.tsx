// intent: the public landing page in reference order; owns only the hero scope preview ("my university isn't listed").
// status: done
// next: App owns the draft, language, institution and submit flow; keep this component free of API calls.
// confidence: high
import { createSignal } from 'solid-js';
import type { HeroScope } from '../hero3d/layout';
import { localStore, REQUEST_SCHOOL_ID, toast } from '../ui';
import { FaqSection } from './FaqSection';
import { Hero, type ComposerProps } from './Hero';
import { JoinSection } from './JoinSection';
import { HonestSection, HowSection, ReadsSection, RolesSection, ScopeSection } from './Sections';

const SCOPE_KEY = 'scope';

export interface LandingProps extends Omit<ComposerProps, 'school'> {
  /** The institution the composer asks about. */
  institution: string;
  schoolLabel: string;
  motion: boolean;
  /** Focuses the composer (and scrolls it into view). */
  onFocusAsk: () => void;
}

export function Landing(props: LandingProps) {
  const [scope, setScope] = createSignal<HeroScope>(localStore.get(SCOPE_KEY) === 'request' ? 'request' : 'active');
  const chooseSchool = (id: string) => {
    if (id === REQUEST_SCHOOL_ID) {
      setScope('request');
      localStore.set(SCOPE_KEY, 'request');
      toast('Your university is not set up yet. You can request it below.', 'info');
      return;
    }
    setScope('active');
    localStore.remove(SCOPE_KEY);
    props.onSchool(id);
  };
  return (
    <div class="site-landing" data-site-page="home">
      <Hero
        {...props}
        school={scope() === 'request' ? REQUEST_SCHOOL_ID : props.institution}
        onSchool={chooseSchool}
        onSubmit={() => {
          if (scope() !== 'request') return props.onSubmit();
          toast('Your university is not set up yet, so there is nothing to answer from. Request it below or pick a listed school.', 'info');
          document.getElementById('join-title')?.focus();
        }}
        scope={scope()}
      />
      <ScopeSection motion={props.motion} />
      <HowSection motion={props.motion} />
      <RolesSection motion={props.motion} />
      <HonestSection motion={props.motion} onAskAgain={props.onFocusAsk} />
      <ReadsSection motion={props.motion} />
      <JoinSection motion={props.motion} />
      <FaqSection
        motion={props.motion}
        onAsk={text => {
          if (text) props.onDraft(text);
          props.onFocusAsk();
        }}
      />
    </div>
  );
}
