import type { User, UserProps } from '../entities/user.entity.js';

//WHAT THE DOMAIN NEEDS FROM STORAGE — NOT HOW IT IS STORED.
//
//This is the inversion that makes the architecture hexagonal. The domain
//declares the interface; infrastructure implements it against mongoose. Use
//cases depend on this file and have never heard of MongoDB.
//
//Two things that follow from that, and both matter in practice:
//  - a use case can be tested against a Map in twenty lines, with no database
//  - replacing the store means writing one new implementation, not editing
//    every use case
//
//Methods are named for the QUESTION being asked, not the query being run.
//`findByEmail` not `findOne({ email })` — leaking query shapes through the
//interface defeats the point.

export type NewUser = Omit<
  UserProps,
  | 'id'
  | 'createdAt'
  | 'emailVerified'
  | 'emailVerifiedAt'
  | 'tokenVersion'
  | 'failedPasswordAttempts'
> &
  Partial<Pick<UserProps, 'name' | 'language' | 'timezone'>>;

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  existsByEmail(email: string): Promise<boolean>;

  create(data: { email: string; passwordHash: string }): Promise<User>;

  //Persists whatever the entity's rules changed. Takes the entity rather than
  //a patch, so the caller cannot write a field the rules did not touch.
  save(user: User): Promise<void>;

  deleteById(id: string): Promise<void>;
}
