import { render } from 'solid-js/web';
import App, { preloadRoute } from './App';
import { parseHash } from './site/routes';
import './styles/global.scss';
import './style.css';
const route = parseHash(location.hash).route;
const mount = () => render(() => <App />, document.getElementById('root')!);
// A direct visit to a lazily loaded route waits for its chunk, so the first paint is the page and not an empty main.
// Account links may carry tokens in the URL: App scrubs them first, so no request (a chunk included) sends them in Referer.
if (route.startsWith('/auth')) mount();
else void preloadRoute(route).catch(() => undefined).finally(mount); // the route's ErrorBoundary reports a failed chunk
