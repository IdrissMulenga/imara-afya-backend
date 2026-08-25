import userResolver from "./userResolver.js"
import healthRecordResolver from "./healthRecordResolver.js"
import medicationResolver from "./medicationResolver.js"
import periodCycleResolver from "./periodCycleResolver.js"
import pregnancyResolver from "./pregnancyResolver.js"
import habitResolver from "./habitResolver.js"
import guidanceResolver from "./guidanceResolver.js"
import wellbeingResolver from "./wellbeingResolver.js"

export const resolvers = {
    Query: {
        ...userResolver.Query,
        ...healthRecordResolver.Query,
        ...medicationResolver.Query,
        ...periodCycleResolver.Query,
        ...pregnancyResolver.Query,
        ...habitResolver.Query,
        ...guidanceResolver.Query,
        ...wellbeingResolver.Query
    },
    Mutation: {
        ...userResolver.Mutation,
        ...healthRecordResolver.Mutation,
        ...medicationResolver.Mutation,
        ...periodCycleResolver.Mutation,
        ...pregnancyResolver.Mutation,
        ...habitResolver.Mutation,
        ...guidanceResolver.Mutation,
        ...wellbeingResolver.Mutation
    }
}
