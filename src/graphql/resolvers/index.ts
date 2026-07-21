import userResolver from "./userResolver.js"
import healthRecordResolver from "./healthRecordResolver.js"
import medicationResolver from "./medicationResolver.js"
import periodCycleResolver from "./periodCycleResolver.js"
import hospitalResolver from "./hospitalResolver.js"

export const resolvers = {
    Query: {
        ...userResolver.Query,
        ...healthRecordResolver.Query,
        ...medicationResolver.Query,
        ...periodCycleResolver.Query,
        ...hospitalResolver.Query
    },
    Mutation: {
        ...userResolver.Mutation,
        ...healthRecordResolver.Mutation,
        ...medicationResolver.Mutation,
        ...periodCycleResolver.Mutation,
        ...hospitalResolver.Mutation
    }
}
