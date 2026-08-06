export const hospitalQuery = /* GraphQL */ `
    nearbyHospitals (latitude: Float!, longitude: Float!, radiusKm: Float) : [Hospital!]!
    hospitals (city: String, province: String, type: String) : [Hospital!]!
    careMap (input: CareMapInput) : CareMap!
`;
