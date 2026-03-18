import '../styles/global.css';
import './demo2.css';
import { Demo2App } from './demo2-app.ts';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

// Remove inline loading spinner
document.getElementById('app-loading')?.remove();

new Demo2App(container);
