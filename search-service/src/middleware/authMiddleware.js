const logger = require("../utils/logger");

const authenticateRequest = (req, res, next) => {
    const userId = req.headers['x-user-id'];

    if (!userId) {
        logger.warn('Access attemped without userId');
        return res.status(401).json({
            success: false,
            message: 'Authentication required. Plz log in first.'
        });
    }

    req.user = { userId };
    next();
}

module.exports = { authenticateRequest }