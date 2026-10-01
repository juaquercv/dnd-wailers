import ReactDOM from 'react-dom/client';
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './index.css';
// Applies persisted preferences (reduced motion) before the first paint.
import './stores/settings';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento #root');

// No React.StrictMode: its double-invoked effects would join/leave live sessions twice in development.
ReactDOM.createRoot(root).render(<App />);
