const Search = require("../models/Search");
const logger = require("../utils/logger");

const searchPostController = async (req, res) => {
    logger.info("Hitting Search endpoint...");
    try {
        const { query } = req.query;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: "Query parameter is required",
            });
        }

        const cacheKey = `search:${query.toLowerCase()}`;

        const cachedResults = await req.redisClient.get(cacheKey);

        if (cachedResults) {
            logger.info("Returning search results from cache");
            return res.json(JSON.parse(cachedResults));
        }

        const results = await Search.find(
            {
                $text: { $search: query }, // Search inside text-indexed fields for this query keyword
            },
            {
                score: { $meta: "textScore" }, // Include the computed relevance score in the results
            }
        )
            .sort({ score: { $meta: "textScore" } })
            .limit(10); // sortsresults by relevance score (highest first) which is the best match


        await req.redisClient.setex(
            cacheKey,
            180, // 3 mins
            JSON.stringify(results)
        );

        res.json(results);
    } catch (error) {
        logger.error("Error while searching post", error);
        res.status(500).json({
            success: false,
            message: "Error while searching post",
        });
    }
};

module.exports = { searchPostController };