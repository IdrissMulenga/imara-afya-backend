export const hospitalType = /* GraphQL */ `
    type Hospital {
        id: ID!
        name: String!
        address: String
        phone: String
        latitude: Float!
        longitude: Float!
        city: String
        province: String
        type: String
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
        city: String
        province: String
        type: String
    }
`;
