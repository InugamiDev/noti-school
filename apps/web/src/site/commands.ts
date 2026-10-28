// intent: the global command menu entries (Cmd/Ctrl+K): ask, change school, switch language, sections, pages.
// status: done
// next: App supplies the actions; add entries here rather than in the shell.
// confidence: high
import {
  BookOpen,
  CircleHelp,
  CornerDownRight,
  FileText,
  History,
  Languages,
  Library,
  ListChecks,
  Lock,
  MessageSquare,
  School,
  Send,
  UserRound,
  Users,
} from 'lucide-solid';
import type { AnswerLanguage, CommandItem } from '../ui';
import { sampleQuestions } from '../landing/logic';

export interface SiteCommandActions {
  language: AnswerLanguage;
  signedIn: boolean;
  focusAsk: () => void;
  fillQuestion: (text: string) => void;
  navigate: (href: string) => void;
  toggleLanguage: () => void;
  openSchoolPicker: () => void;
}

export function siteCommands(actions: SiteCommandActions): CommandItem[] {
  const go = (href: string) => () => actions.navigate(href);
  return [
    { id: 'ask', group: 'Actions', label: 'Ask a question', icon: MessageSquare, shortcut: '/', run: actions.focusAsk },
    {
      id: 'language',
      group: 'Actions',
      label: actions.language === 'en' ? 'Switch answer language to Tiếng Việt' : 'Switch answer language to English',
      keywords: ['language', 'english', 'vietnamese', 'tiếng việt'],
      icon: Languages,
      run: actions.toggleLanguage,
    },
    { id: 'school', group: 'Actions', label: 'Change university', keywords: ['school', 'scope'], icon: School, run: actions.openSchoolPicker },
    { id: 'request', group: 'Actions', label: 'Request your university', keywords: ['join', 'access'], icon: Send, run: go('#join') },
    ...sampleQuestions.map((question, index) => ({
      id: `sample-${index}`,
      group: 'Sample questions',
      label: question,
      icon: CornerDownRight,
      run: () => actions.fillQuestion(question),
    })),
    { id: 'how', group: 'Sections', label: 'How it works', icon: ListChecks, run: go('#how') },
    { id: 'scope', group: 'Sections', label: 'Every school gets its own sources', icon: Lock, run: go('#scope') },
    { id: 'roles', group: 'Sections', label: 'Who it’s for', icon: Users, run: go('#roles') },
    { id: 'reads', group: 'Sections', label: 'What it reads', icon: Library, run: go('#reads') },
    { id: 'faq', group: 'Sections', label: 'Questions', keywords: ['faq'], icon: CircleHelp, run: go('#faq') },
    { id: 'product', group: 'Pages', label: 'Product', icon: FileText, run: go('#/product') },
    { id: 'students', group: 'Pages', label: 'For students', icon: FileText, run: go('#/students') },
    { id: 'universities', group: 'Pages', label: 'For universities', icon: FileText, run: go('#/universities') },
    { id: 'help', group: 'Pages', label: 'Help', icon: CircleHelp, run: go('#/help') },
    { id: 'contact', group: 'Pages', label: 'Contact', icon: FileText, run: go('#/contact') },
    { id: 'sources', group: 'Pages', label: 'Sources', icon: BookOpen, run: go('#/sources') },
    { id: 'history', group: 'Pages', label: 'History', icon: History, run: go('#/history') },
    { id: 'account', group: 'Pages', label: actions.signedIn ? 'Account' : 'Sign in', icon: UserRound, run: go('#/auth') },
  ];
}
