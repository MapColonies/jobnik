// OpenTelemetry Messaging Semantic Conventions
// Source: https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/

// Operation name of the messaging operation (e.g., 'send', 'ack', 'nack')
export const ATTR_MESSAGING_OPERATION_NAME = 'messaging.operation.name';
// Messaging system identifier (e.g., 'kafka', 'rabbitmq', 'aws_sqs')
export const ATTR_MESSAGING_SYSTEM = 'messaging.system';
// The type of the messaging operation (e.g., 'create', 'send', 'receive', 'process', 'settle')
export const ATTR_MESSAGING_OPERATION_TYPE = 'messaging.operation.type';
// Unique identifier for the client that consumes or produces a message
export const ATTR_MESSAGING_CLIENT_ID = 'messaging.client.id';
// Name of the consumer group
export const ATTR_MESSAGING_CONSUMER_GROUP_NAME = 'messaging.consumer.group.name';
// Name of the message destination (queue, topic, etc.)
export const ATTR_MESSAGING_DESTINATION_NAME = 'messaging.destination.name';
// Boolean: true if the destination is anonymous (unnamed or auto-generated)
export const ATTR_MESSAGING_DESTINATION_ANONYMOUS = 'messaging.destination.anonymous';
// Boolean: true if the destination is temporary
export const ATTR_MESSAGING_DESTINATION_TEMPORARY = 'messaging.destination.temporary';
// Low-cardinality template for the destination name
export const ATTR_MESSAGING_DESTINATION_TEMPLATE = 'messaging.destination.template';
// Name of the destination subscription (if applicable)
export const ATTR_MESSAGING_DESTINATION_SUBSCRIPTION_NAME = 'messaging.destination.subscription.name';
// Identifier of the partition (if applicable)
export const ATTR_MESSAGING_DESTINATION_PARTITION_ID = 'messaging.destination.partition.id';
// Number of messages in a batch operation
export const ATTR_MESSAGING_BATCH_MESSAGE_COUNT = 'messaging.batch.message_count';
// Message ID (string, unique per message)
export const ATTR_MESSAGING_MESSAGE_ID = 'messaging.message.id';
// Conversation ID (correlation ID)
export const ATTR_MESSAGING_MESSAGE_CONVERSATION_ID = 'messaging.message.conversation_id';
// Size of the message body in bytes
export const ATTR_MESSAGING_MESSAGE_BODY_SIZE = 'messaging.message.body.size';
// Size of the message envelope (body + metadata) in bytes
export const ATTR_MESSAGING_MESSAGE_ENVELOPE_SIZE = 'messaging.message.envelope.size';
// Peer address of the messaging intermediary node
export const ATTR_NETWORK_PEER_ADDRESS = 'network.peer.address';
// Peer port of the messaging intermediary node
export const ATTR_NETWORK_PEER_PORT = 'network.peer.port';
// Server address (domain, IP, or socket)
export const ATTR_SERVER_ADDRESS = 'server.address';
// Server port number
export const ATTR_SERVER_PORT = 'server.port';
// Error type if the messaging operation failed
export const ATTR_ERROR_TYPE = 'error.type';
// Runtime name of the process (e.g., 'nodejs', 'python', 'java')
export const ATTR_PROCESS_RUNTIME_NAME = 'process.runtime.name';
// Runtime version of the process (e.g., 'nodejs 14.17.0')
export const ATTR_PROCESS_RUNTIME_VERSION = 'process.runtime.version';
