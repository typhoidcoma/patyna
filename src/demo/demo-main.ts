import '../styles/global.css';
import './demo-overrides.css';
import { DemoApp } from './demo-app.ts';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

// Remove inline loading spinner
document.getElementById('app-loading')?.remove();

new DemoApp(container);
