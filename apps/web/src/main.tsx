import { render } from 'solid-js/web';
import App from './App';
import './style.css';
import './ui/ui.css';
render(() => <App />, document.getElementById('root')!);
// The inline splash in index.html lifts once the app has mounted and its minimum animation ran.
(window as Window & { __notiSplash?: () => void }).__notiSplash?.();
