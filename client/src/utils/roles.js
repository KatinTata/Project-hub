// Jedino mesto istine za provere rola na klijentu.
// Baza poznaje role: 'super_admin' | 'admin' | 'user' (klijent).
// Stara rola 'client' je migrirana u 'user' — ne porediti sa 'client' nigde.
export const isClientRole = (role) => role === 'user'
export const isInternalRole = (role) => role === 'admin' || role === 'super_admin'
