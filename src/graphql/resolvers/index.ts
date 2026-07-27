import userResolver from "./userResolver.js"
import healthRecordResolver from "./healthRecordResolver.js"
import medicationResolver from "./medicationResolver.js"
import periodCycleResolver from "./periodCycleResolver.js"
import pregnancyResolver from "./pregnancyResolver.js"
import hospitalResolver from "./hospitalResolver.js"
import habitResolver from "./habitResolver.js"
import ramadanResolver from "./ramadanResolver.js"
import guidanceResolver from "./guidanceResolver.js"

export const resolvers = {
    Query: {
        ...userResolver.Query,
        ...healthRecordResolver.Query,
        ...medicationResolver.Query,
        ...periodCycleResolver.Query,
        ...pregnancyResolver.Query,
        ...hospitalResolver.Query,
        ...habitResolver.Query,
        ...ramadanResolver.Query,
        ...guidanceResolver.Query
    },
    Mutation: {
        ...userResolver.Mutation,
        ...healthRecordResolver.Mutation,
        ...medicationResolver.Mutation,
        ...periodCycleResolver.Mutation,
        ...pregnancyResolver.Mutation,
        ...hospitalResolver.Mutation,
        ...habitResolver.Mutation,
        ...ramadanResolver.Mutation,
        ...guidanceResolver.Mutation
    }
}
