export const healthRecordMutation = /* GraphQL */ `
    addHealthRecord (input: AddHealthRecordInput!) : HealthRecord!
    updateHealthRecord (id: ID!, input: UpdateHealthRecordInput!) : HealthRecord!
    removeHealthRecord (id: ID!) : Boolean!
    addAttachment (recordId: ID!, input: AddAttachmentInput!) : HealthRecord!
    removeAttachment (recordId: ID!, attachmentId: ID!) : HealthRecord!
`;
