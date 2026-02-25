const Search = require("../models/Search");
const logger = require("../utils/logger");

// Stay here instead of /controllers
// bc cache invalidation is happening due to data change events, not due to HTTP requests
// so we Invalidate cache at: The place where data changes, not where data is read
async function invalidateSearchCache(redisClient) {
    try {
        const keys = await redisClient.keys("search:*");

        if (keys.length > 0) {
            await redisClient.del(keys);
            logger.info("Search cache invalidated");
        }
    } catch (error) {
        logger.error("Error invalidating search cache", error);
    }
}

async function handlePostCreated(event, redisClient) {
    try {
        const newSearchPost = new Search({
            postId: event.postId,
            userId: event.userId,
            content: event.content,
            createdAt: event.createdAt,
        });

        await newSearchPost.save();

        await invalidateSearchCache(redisClient);

        logger.info(`Search post created: ${event.postId}`);
    } catch (error) {
        logger.error("Error handling post creation event", error);
    }
}

async function handlePostDeleted(event, redisClient) {
    try {
        await Search.findOneAndDelete({ postId: event.postId });

        await invalidateSearchCache(redisClient);

        logger.info(`Search post deleted: ${event.postId}`);
    } catch (error) {
        logger.error("Error handling post deletion event", error);
    }
}

module.exports = { handlePostCreated, handlePostDeleted };