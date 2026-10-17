'use client';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import type { User, AuthResponse } from '@/types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get<User>('/auth/profile')
        .then((res) => setUser(res.data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<AuthResponse>('/auth/login', { email, password });
    localStorage.setItem('token', res.data.accessToken);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = (redirectTo: string = '/login') => {
    localStorage.removeItem('token');
    setUser(null);
    window.location.href = redirectTo;
  };

  return { user, loading, login, logout };
}