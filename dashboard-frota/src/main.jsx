import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PaginasFrota from './pages/PaginasFrota.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {window.location.pathname.startsWith('/modelo') ? <PaginasFrota /> : <App />}
  </StrictMode>,
)
