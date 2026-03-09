import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { UserProfile } from "../models/user.model";

@Injectable({ providedIn: 'root' })

export default class UserProfileService {
  private user = new BehaviorSubject<UserProfile | null>(null);

  // Observable for components
  user$ = this.user.asObservable();
  private givenName: string | undefined = undefined;
  private familyName: string | undefined = undefined;
  private roleName: string | undefined = undefined;
  private lastLogin: string | undefined = undefined;

  // Getter (sync access)
  getuser(): UserProfile | null {
    return this.user.value;
  }

  // Setter
  setUser(profile: UserProfile | null): void {
    this.user.next(profile);
  }

  clearUser(): void {
    this.user.next(null);
  }
  setGivenName(givenName: string | undefined): void {
    if (givenName) {
      this.givenName = givenName;
    } else {
      this.givenName = undefined;
    }
  }
  getGivenName(): string | undefined {
    return this.givenName;
  }

  setRoleName(roleName: string | undefined): void {
    this.roleName = roleName ?? undefined;
  }

  getRoleName(): string | undefined {
    return this.roleName;
  }

  setLastLogin(lastLogin: string | undefined): void {
    this.lastLogin = lastLogin ?? undefined;
  }

  getLastLogin(): string | undefined {
    return this.lastLogin;
  }
}