const express = require("express");
const {
    resgiterUser,
} = require("../controllers/identity-controller");

const router = express.Router();

router.post("/register", resgiterUser);

module.exports = router;