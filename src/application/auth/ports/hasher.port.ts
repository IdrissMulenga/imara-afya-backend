//HASHING, AS THE APPLICATION NEEDS IT.
//
//A port: the inner layers declare what they need, infrastructure supplies it.
//bcrypt, argon2 or a test double all satisfy this, and no use case changes if
//the algorithm does.
//
//`compareWithDummy` exists because of a real attack. Comparing only when a
//user was found makes an unknown email return in a millisecond while a known
//one takes the ~100ms bcrypt costs — and that difference tells an attacker
//which addresses have accounts. The compare must run either way, which is a
//requirement of the flow, so it belongs in the contract rather than in a note
//somebody might not read.

export interface Hasher {
  hash(plaintext: string, rounds?: number): Promise<string>;
  compare(plaintext: string, hash: string): Promise<boolean>;
  //Compares against a throwaway hash so the timing matches a real comparison.
  compareWithDummy(plaintext: string): Promise<void>;
}
