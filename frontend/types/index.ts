export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'PROFESSIONAL' | 'CUSTOMER';
  professional?: Professional;
}

export interface Professional {
  id: string;
  slug: string;
  name: string;
  bio: string;
  avatarUrl: string | null;
  instagram: string;
  themeColors: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
  professionalId: string;
}

export interface AppointmentStatus {
  value: string;
  label: string;
  color: string;
}

export interface Appointment {
  id: string;
  date: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  notes: string | null;
  professionalId: string;
  serviceId: string;
  customerId: string;
  professional?: Professional;
  service?: Service;
  customer?: Customer;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface Availability {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  professionalId: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

// ============================================
// BACKOFFICE ADMIN (GET /admin/professionals)
// ============================================

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'PROFESSIONAL' | 'CUSTOMER';
}

export interface AdminProfessionalItem {
  id: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  user: AdminUser | null;
  _count: {
    services: number;
    appointments: number;
  };
}

export interface AdminProfessionalsResponse {
  items: AdminProfessionalItem[];
  total: number;
  limit: number;
  offset: number;
}

// Payload de criação — exatamente os 6 campos do DTO do backend.
// role/ids/timestamps NÃO vão no body (o backend força role=PROFESSIONAL).
export interface AdminCreateProfessionalPayload {
  name: string;
  slug: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

export interface AdminCreateProfessionalResponse {
  professional: {
    id: string;
    slug: string;
    name: string;
    createdAt: string;
  };
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'PROFESSIONAL';
    professionalId: string;
    createdAt: string;
  };
}
