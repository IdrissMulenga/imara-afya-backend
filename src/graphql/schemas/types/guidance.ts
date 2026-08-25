export const guidanceType = /* GraphQL */ `
    type Guidance {
        id: ID!
        category: String!
        kind: String!
        title: String!
        body: String!
        source: String
        language: String!
        published: Boolean!
    }
`;

export const addGuidanceInput = /* GraphQL */ `
    input AddGuidanceInput {
        category: String!
        #optional now that "medical" is the only kind — the model defaults it.
        #Still accepted so anything already sending it keeps working.
        kind: String
        title: String!
        body: String!
        #required in the resolver: everyone reads this library as advice, so a
        #claim with nothing behind it does not go in
        source: String!
        language: String
        published: Boolean
    }
`;
