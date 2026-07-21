export const hospitalType = /* GraphQL */ `
    type Hospital {
        id: ID!
        name: String!
        address: String
        phone: String
        latitude: Float!
        longitude: Float!
        distanceKm: Float
    }
`;

export const addHospitalInput = /* GraphQL */ `
    input AddHospitalInput {
        name: String!
        address: String
        phone: String
        latitude: Float!
        longitude: Float!
    }
`;
