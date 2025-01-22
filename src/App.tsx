import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/auth/login'
import RegisterPage from './pages/auth/register'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Redirect root to login for now */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        
        {/* Catch all route - redirect to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
