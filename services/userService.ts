
import { User } from '../types';

const STORAGE_KEY = 'audit_users';

const DEFAULT_ADMIN: User = {
  username: 'admin',
  password: '123',
  name: 'Administrador Principal',
  role: 'Admin'
};

export const UserService = {
  initialize: () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([DEFAULT_ADMIN]));
    }
  },

  getUsers: (): User[] => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [DEFAULT_ADMIN];
  },

  addUser: (user: User): boolean => {
    const users = UserService.getUsers();
    if (users.some(u => u.username.toLowerCase() === user.username.toLowerCase())) {
      return false; // User exists
    }
    const newUsers = [...users, user];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUsers));
    return true;
  },

  deleteUser: (username: string): void => {
    // Prevent deleting the last admin or the default admin if strictly enforced, 
    // but for now just filter out.
    const users = UserService.getUsers();
    if (username === 'admin') return; // Protect default admin
    const newUsers = users.filter(u => u.username !== username);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUsers));
  },

  authenticate: (username: string, password: string): User | null => {
    const users = UserService.getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    if (user) {
      // Return user without password
      const { password, ...safeUser } = user;
      return safeUser as User;
    }
    return null;
  }
};
