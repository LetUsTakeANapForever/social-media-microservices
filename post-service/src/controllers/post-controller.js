const Post = require("../models/post");
const logger = require("../utils/logger");
const { publishEvent } = require("../utils/rabbitmq");
const { validateCreatePost } = require("../utils/validation");

// Delete (invalidate) the cahche to prevent stale data (= out of sync data) and ensure data consistency
async function invalidatePostCache(req, input) {
    const cachedKey = `post:${input}`;
    await req.redisClient.del(cachedKey); // Kill the specific post cache so the detail page is fresh
    // When ti use: a specific post is Updated or Deleted.
    // e.g. use it for GET /posts/:id (This uses the post:ID cache)

    const keys = await req.redisClient.keys("posts:*"); // deleting everything starting with posts:*
    if (keys.length > 0) {
        await req.redisClient.del(keys); // Kill all list caches so the home feed/search results are fresh
        // This is necessary because adding one new post shifts the entire order
        // When to use: When a post is Created, Deleted, or Reordered
        // e.g. use it for GET /get-posts (This uses the posts:* cache)
    }
}

const createPost = async (req, res) => {
    logger.info("Hit Create post endpoint...");
    try {
        const { error } = validateCreatePost(req.body);
        if (error) {
            logger.warn("Validation error", error.details[0].message);
            return res.status(400).json({
                success: false,
                message: error.details[0].message,
            });
        }

        const { content, mediaIds } = req.body;
        const newlyCreatedPost = new Post({
            user: req.user.userId,
            content,
            mediaIds: mediaIds || [],
        });

        await newlyCreatedPost.save();

        await publishEvent("post.created", {
            postId: newlyCreatedPost._id.toString(),
            userId: newlyCreatedPost.user.toString(),
            content: newlyCreatedPost.content,
            createdAt: newlyCreatedPost.createdAt,
        });

        // Delete from the cache
        await invalidatePostCache(req, newlyCreatedPost._id.toString());

        logger.info('Post created successfully');

        res.status(201).json({
            success: true,
            message: 'Post created successfully'
        })
    } catch (e) {
        logger.error("Error creating post", error);
        res.status(500).json({
            success: false,
            message: "Error creating post",
        });
    }
};

const getAllPosts = async (req, res) => {
    logger.info("Hit Get all post endpoint...");
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const startIndex = (page - 1) * limit;

        const cacheKey = `posts:${page}:${limit}`;
        const cachedPosts = await req.redisClient.get(cacheKey);

        if (!req.redisClient) {
            throw new Error("Redis client not initialized");
        }

        if (cachedPosts) {
            return res.json(JSON.parse(cachedPosts));
        }

        const posts = await Post.find({})
            .sort({ createdAt: -1 })
            .skip(startIndex)
            .limit(limit);

        const totalNumberOfPosts = await Post.countDocuments();

        const result = {
            posts,
            currentpage: page,
            totalPages: Math.ceil(totalNumberOfPosts / limit),
            totalPosts: totalNumberOfPosts,
        };

        // Save result into Redis
        // Syntax: SETEX key seconds value
        await req.redisClient.setex(cacheKey, 300, JSON.stringify(result)); // TTL = 300 = 5 mins

        res.json(result);

    } catch (error) {
        logger.error("Error fetching posts", error);
        res.status(500).json({
            success: false,
            message: "Error fetching posts",
        });
    }
};

const getPost = async (req, res) => {
    logger.info('Hit Get post endpoint...')
    try {
        const postId = req.params.id;
        const cachekey = `post:${postId}`;
        const cachedPost = await req.redisClient.get(cachekey);

        if (cachedPost) {
            return res.json(JSON.parse(cachedPost));
        }

        const singlePostDetailsbyId = await Post.findById(postId);

        if (!singlePostDetailsbyId) {
            return res.status(404).json({
                message: "Post not found",
                success: false,
            });
        }

        await req.redisClient.setex(
            cachedPost,
            3600,
            JSON.stringify(singlePostDetailsbyId)
        );

        res.json(singlePostDetailsbyId);
    } catch (e) {
        logger.error("Error fetching post", error);
        res.status(500).json({
            success: false,
            message: "Error fetching post by ID",
        });
    }
};

const deletePost = async (req, res) => {
    logger.info("Hit Delete post endpoint...");
    try {
        const post = await Post.findOneAndDelete({
            _id: req.params.id,
            user: req.user.userId,
        });

        if (!post) {
            return res.status(404).json({
                message: "Post not found",
                success: false,
            });
        }

        // publish post delete method
        await publishEvent(
            'post.deleted', {
            postId: post._id,
            userId: req.user.userId,
            mediaIds: post.mediaIds,
        });

        await invalidatePostCache(req, req.params.id);

        res.status(200).json({
            message: 'Post deleted successfully!',
        });

    } catch (e) {
        logger.error("Error deleting post", error);
        res.status(500).json({
            success: false,
            message: "Error deleting post",
        });
    }
};

module.exports = { createPost, getAllPosts, getPost, deletePost }