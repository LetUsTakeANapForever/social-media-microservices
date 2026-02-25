require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Redis = require("ioredis");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");
const { connectToRabbitMQ, consumeEvent } = require("./utils/rabbitmq");
const searchRoutes = require("./routes/search-routes");
const {
    handlePostCreated,
    handlePostDeleted,
} = require("./eventHandlers/search-event-handlers");

const app = express();
const PORT = process.env.PORT || 3004;

mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => logger.info("Connected to mongodb"))
    .catch((e) => logger.error("Mongo connection error", e));

const redisClient = new Redis(process.env.REDIS_URL);

redisClient.on("connect", () => logger.info("Connected to Redis"));
redisClient.on("error", (err) => logger.error("Redis error", err));

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    logger.info(`Received ${req.method} request to ${req.url}`);
    logger.info(`Request body: ${JSON.stringify(req.body)}`);
    next();
});

// implement Ip based rate limiting for sensitive endpoints
const sensitiveEndpointsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 min
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`Sensitive endpoint rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({ success: false, message: "Too many requests" });
    },
    store: new RedisStore({
        sendCommand: (...args) => redisClient.call(...args),
    }),
});

app.use("/api/search/posts", sensitiveEndpointsLimiter);

app.use(
    "/api/search",
    (req, res, next) => {
        req.redisClient = redisClient;
        next();
    },
    searchRoutes
);

app.use(errorHandler);

async function startServer() {
    try {
        await connectToRabbitMQ();

        //consume the events / // Subscribe to post events to keep Search collection in sync
        await consumeEvent("post.created", (event) =>
            handlePostCreated(event, redisClient)
        ); // when a new post is created, the post will also be saved in Search collection

        await consumeEvent("post.deleted", (event) =>
            handlePostDeleted(event, redisClient)
        ); // when a new post is created, the post will also be deleted in Search collection

        app.listen(PORT, () => {
            logger.info(`Search service is running on port: ${PORT}`);
        });
    } catch (e) {
        logger.error(e, "Failed to start search service");
        process.exit(1);
    }
}

startServer();

process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at", promise, "reason:", reason);
});