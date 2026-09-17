/**
 * Valida e retorna JWT_SECRET.
 * Lança Error se ausente, vazio ou somente espaços.
 * Não usa process.exit() — a exceção não tratada finaliza o bootstrap.
 */
export function requireJwtSecret(): string {
  const value = process.env.JWT_SECRET;

  if (!value || value.trim() === '') {
    throw new Error(
      'JWT_SECRET não está definido ou está vazio.\n' +
      'Crie um arquivo .env na pasta backend/ com a linha:\n' +
      '  JWT_SECRET=seu_segredo_aleatorio_aqui'
    );
  }

  return value;
}
