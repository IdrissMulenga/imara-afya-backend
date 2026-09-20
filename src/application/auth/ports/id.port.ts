//IDENTIFIER GENERATION.
//
//Repositories usually let the database mint ids, so this exists for the cases
//where the application needs one before a write. Kept as a port so nothing in
//the inner layers imports a mongoose ObjectId.

export interface IdGenerator {
  next(): string;
}
