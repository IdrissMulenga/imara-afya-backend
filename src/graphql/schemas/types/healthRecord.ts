export const healthRecordType = /* GraphQL */ `
    type HealthRecord {
        id: ID!
        type: String!
        name: String!
        note: String
        attachments: [Attachment!]!
    }
`;

export const attachmentType = /* GraphQL */ `
    type Attachment {
        id: ID!
        url: String!
        name: String
    }
`;

export const addAttachmentInput = /* GraphQL */ `
    input AddAttachmentInput {
        url: String!
        name: String
    }
`;

export const addHealthRecordInput = /* GraphQL */ `
    input AddHealthRecordInput {
        type: String!
        name: String!
        note: String
    }
`;

export const updateHealthRecordInput = /* GraphQL */ `
    input UpdateHealthRecordInput {
        name: String
        note: String
    }
`;
