import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Sem vitest globals, o auto-cleanup do Testing Library não é
// registrado sozinho — sem isto o DOM acumula entre testes.
afterEach(() => {
  cleanup();
});
