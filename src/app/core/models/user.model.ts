export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest'
}

export interface UserProfile extends User {
  phoneNumber?: string;
  address?: string;
  avatarUrl?: string;
}


