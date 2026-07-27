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
        kind: String!
        title: String!
        body: String!
        source: String
        language: String
        published: Boolean
    }
`;
