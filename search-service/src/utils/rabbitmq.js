const amqp = require("amqplib");
const logger = require("./logger");

let connection = null;
let channel = null;

const EXCHANGE_NAME = "social_media_events";

async function connectToRabbitMQ() {
    const url = process.env.RABBITMQ_URL;

    while (!channel) {
        try {
            connection = await amqp.connect(url);
            channel = await connection.createChannel();
            await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: false });

            logger.info("Connected to RabbitMQ");
        } catch (err) {
            logger.warn("RabbitMQ not ready, retrying in 5s...");
            await new Promise(res => setTimeout(res, 5000));
        }
    }

    return channel;
}

async function consumeEvent(routingKey, callback) {
    if (!channel) {
        await connectToRabbitMQ();
    }

    const q = await channel.assertQueue("", { exclusive: true });

    await channel.bindQueue(q.queue, EXCHANGE_NAME, routingKey);

    channel.consume(q.queue, (msg) => {
        if (msg !== null) {
            const content = JSON.parse(msg.content.toString());
            callback(content);

            channel.ack(msg);
        };
    });

    logger.info(`Subscribed to event: ${routingKey}`);
}

module.exports = { connectToRabbitMQ, consumeEvent };