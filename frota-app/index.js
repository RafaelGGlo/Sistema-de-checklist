import { registerRootComponent } from 'expo';
import App from './src/app/index';

// A tradução automática altera os nós de texto e pode quebrar a navegação React.
if (typeof document !== 'undefined') {
  document.documentElement.lang = 'pt-BR';
  document.documentElement.setAttribute('translate', 'no');
}

registerRootComponent(App);
