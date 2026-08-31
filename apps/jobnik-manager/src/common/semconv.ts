// OpenTelemetry Messaging Semantic Conventions
// Source: https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/
// Only the attributes this service actually sets on spans are kept here.

// Messaging system identifier (e.g., 'kafka', 'rabbitmq', 'aws_sqs')
export const ATTR_MESSAGING_SYSTEM = 'messaging.system';
// Name of the message destination (queue, topic, etc.)
export const ATTR_MESSAGING_DESTINATION_NAME = 'messaging.destination.name';
// Message ID (string, unique per message)
export const ATTR_MESSAGING_MESSAGE_ID = 'messaging.message.id';
// Conversation ID (correlation ID)
export const ATTR_MESSAGING_MESSAGE_CONVERSATION_ID = 'messaging.message.conversation_id';
// Runtime name of the process (e.g., 'nodejs', 'python', 'java')
export const ATTR_PROCESS_RUNTIME_NAME = 'process.runtime.name';
// Runtime version of the process (e.g., 'nodejs 14.17.0')
export const ATTR_PROCESS_RUNTIME_VERSION = 'process.runtime.version';
