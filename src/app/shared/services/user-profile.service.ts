/* eslint-disable */
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
  private userId: string | undefined = undefined;
  private lastLogin: string | undefined = undefined;

  // Getter (sync access)
  getuser(): UserProfile | null {
    return this.user.value;
  }

  // Setter
  setUser(profile: UserProfile | null): void {
    this.user.next(profile);
    // Keep a convenience userId field in sync for other consumers.
    this.userId = profile?.sub ?? undefined;
    // Keep a convenience display-name field in sync for other consumers.
    this.setGivenName(profile?.given_name);
    this.familyName = profile?.family_name ?? undefined;
  }

  clearUser(): void {
    this.user.next(null);
    this.userId = undefined;
    this.givenName = undefined;
    this.familyName = undefined;
    this.roleName = undefined;
    this.lastLogin = undefined;
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

  setUserId(userId: string | undefined): void {
    this.userId = userId ?? undefined;
  }

  getUserId(): string | undefined {
    // Prefer explicitly set value, but fall back to current user profile.
    return this.userId ?? this.user.value?.sub;
  }
}