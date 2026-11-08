import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';
import { getInitialTheme, applyTheme } from './theme';

// Apply theme before React renders to avoid flash
applyTheme(getInitialTheme());

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
