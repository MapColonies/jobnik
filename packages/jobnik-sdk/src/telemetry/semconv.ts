// OpenTelemetry Messaging Semantic Conventions
// Source: https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/
// Only the attributes this SDK actually sets on spans are kept here.

// Messaging system identifier (e.g., 'kafka', 'rabbitmq', 'aws_sqs')
export const ATTR_MESSAGING_SYSTEM = 'messaging.system';
// Unique identifier for the client that consumes or produces a message
export const ATTR_MESSAGING_CLIENT_ID = 'messaging.client.id';
// Name of the message destination (queue, topic, etc.)
export const ATTR_MESSAGING_DESTINATION_NAME = 'messaging.destination.name';
// Number of messages in a batch operation
export const ATTR_MESSAGING_BATCH_MESSAGE_COUNT = 'messaging.batch.message_count';
// Message ID (string, unique per message)
export const ATTR_MESSAGING_MESSAGE_ID = 'messaging.message.id';
// Conversation ID (correlation ID)
export const ATTR_MESSAGING_MESSAGE_CONVERSATION_ID = 'messaging.message.conversation_id';
