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

export const mapRegionType = /* GraphQL */ `
    type MapRegion {
        latitude: Float!
        longitude: Float!
        latitudeDelta: Float!
        longitudeDelta: Float!
    }
`;

export const careMapType = /* GraphQL */ `
    type CareMap {
        facilities: [Hospital!]!
        region: MapRegion!
        totalCount: Int!
        count: Int!
        radiusKm: Float
        sortedByDistance: Boolean!
    }
`;

export const careMapInput = /* GraphQL */ `
    input CareMapInput {
        latitude: Float
        longitude: Float
        radiusKm: Float
        type: String
        search: String
        city: String
        province: String
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
