require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Redis = require("ioredis");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const logger = require("./utils/logger");
const proxy = require("express-http-proxy");
const errorHandler = require("./middleware/errorHandler");
const { validateToken } = require("./middleware/authMiddleware");

const app = express();
const PORT = process.env.PORT || 3000;

const redisClient = new Redis(process.env.REDIS_URL);

app.use(helmet());
app.use(cors());
app.use(express.json());

const ratelimitOptions = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`Sensitive endpoint rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({ success: false, message: "Too many requests" });
    },
    store: new RedisStore({ // Moving from RAM to Redis to store 
        // because when server restarts local mem. is wiped and all rate limit resets to zero but with Redis, the data persists  
        sendCommand: (...args) => redisClient.call(...args),
    }),
});

app.use(ratelimitOptions);

app.use((req, res, next) => {
    logger.info(`Received ${req.method} request to ${req.url}`);
    logger.info(`Request body, ${req.body}`);
    next();
});

const proxyOptions = {
    proxyReqPathResolver: (req) => {
        return req.originalUrl.replace(/^\/v1/, "/api"); // replace the prefix "v1" with "/api"
    },
    proxyErrorHandler: (err, res, next) => {
        logger.error(`Proxy error: ${err.message}`);
        res.status(500).json({
            message: `Internal server error`,
            error: err.message,
        });
    },
};

//setting up proxy for identity service
app.use(
    "/v1/auth", // for Routes -> app.use("/api/auth", routes);
    proxy(process.env.IDENTITY_SERVICE_URL, {
        ...proxyOptions,
        proxyReqOptDecorator: (proxyReqOpts, srcReq) => { // use proxyReqOptDecorator to decorate the content type of the req.
            proxyReqOpts.headers["Content-Type"] = "application/json";
            return proxyReqOpts;
        },
        userResDecorator: (proxyRes, proxyResData, userReq, userRes) => { // This fucntion will be called whenever we recieve a res.
            // It means proxy service gives us a res. -> then we call identity-service. So we're gon' log this to see if errors occur
            logger.info(
                `Response received from Identity service: ${proxyRes.statusCode}`
            );
            return proxyResData;
        },
    })
);

//setting up proxy for post service
app.use('/v1/posts', validateToken, proxy(process.env.POST_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
        proxyReqOpts.headers["Content-Type"] = "application/json";
        proxyReqOpts.headers['x-user-id'] = srcReq.user.userId; // bc we need this for authMiddleware in Post Service
        return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
        logger.info(
            `Response received from Post service: ${proxyRes.statusCode}`
        );
        return proxyResData;
    },
}));

//setting up proxy for our media service
app.use(
    '/v1/media',
    validateToken,
    proxy(process.env.MEDIA_SERVICE_URL, {
        ...proxyOptions,
        proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
            proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
            if (!srcReq.headers["Content-Type"].startsWith("multipart/form-data")) {
                proxyReqOpts.headers["Content-Type"] = "application/json";
            }
            return proxyReqOpts;
        },
        userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
            logger.info(
                `Response received from media service: ${proxyRes.statusCode}`
            );
            return proxyResData;
        },
        parseReqBody: false, // Stops the proxy from parsing the body into an object, ensuring the binary file data remains an intact stream for the Media Service
    })
);

//setting up proxy for our search service
app.use(
    "/v1/search",
    validateToken,
    proxy(process.env.SEARCH_SERVICE_URL, {
        ...proxyOptions,
        proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
            proxyReqOpts.headers["Content-Type"] = "application/json";
            proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

            return proxyReqOpts;
        },
        userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
            logger.info(
                `Response received from Search service: ${proxyRes.statusCode}`
            );

            return proxyResData;
        },
    })
);

app.use(errorHandler);

app.listen(PORT, () => {
    logger.info(`API Gateway is running on port ${PORT}`);
    logger.info(
        `Identity service is running on port ${process.env.IDENTITY_SERVICE_URL}`
    );
    logger.info(
        `Post service is running on port ${process.env.POST_SERVICE_URL}`
    );
    logger.info(
        `Media service is running on port ${process.env.MEDIA_SERVICE_URL}`
    );
    logger.info(
        `Search service is running on port ${process.env.SEARCH_SERVICE_URL}`
    );
    logger.info(`Redis Url ${process.env.REDIS_URL}`);
});