import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Adicionar token automaticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirecionar para login se token expirar
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (typeof window !== 'undefined') {
        if (window.location.pathname === '/admin/login') {
          // Já estamos na tela de login admin: o 401 veio do próprio
          // POST /auth/login (credenciais inválidas). Redirecionar para a
          // mesma URL recarregaria a página e perderia a mensagem de erro.
        } else {
          // Área admin tem login próprio; demais rotas seguem para /login.
          window.location.href = window.location.pathname.startsWith('/admin')
            ? '/admin/login'
            : '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;