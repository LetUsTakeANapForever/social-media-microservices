const amqp = require("amqplib");
const logger = require("./logger");

let connection = null;
let channel = null;

const EXCHANGE_NAME = "social_media_events";

async function connectToRabbitMQ() {
    try {
        connection = await amqp.connect(process.env.RABBITMQ_URL);
        channel = await connection.createChannel();

        // Syntax: #assertExchange(exchange, type, [options, [function(err, ok) {...}]])
        await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: false }); // durable (boolean): if true, the exchange will survive broker restarts. Defaults to true.
        logger.info("Connected to rabbit mq");
        return channel;
    } catch (e) {
        logger.error("Error connecting to rabbit mq", e);
    }
}

async function publishEvent(routingKey, message) {
    if (!channel) {
        await connectToRabbitMQ();
    }

    // Syntax: #publish(exchange, routingKey, content, [options])
    // the exchange and routing key, which determine where the message goes
    channel.publish(
        EXCHANGE_NAME,
        routingKey,
        Buffer.from(JSON.stringify(message)) // content: a buffer containing the message content.
    );
    logger.info(`Event published: ${routingKey}`);
}

module.exports = { connectToRabbitMQ, publishEvent };