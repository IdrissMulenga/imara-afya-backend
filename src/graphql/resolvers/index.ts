import userResolver from "./userResolver.js"
import healthRecordResolver from "./healthRecordResolver.js"

export const resolvers = {
    Query: {
        ...userResolver.Query,
        ...healthRecordResolver.Query
    },
    Mutation: {
        ...userResolver.Mutation,
        ...healthRecordResolver.Mutation
    }
}
