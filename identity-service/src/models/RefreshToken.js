const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
    {
        token: {
            type: String,
            required: true,
            unique: true,
        },
        // creating a relationship (similar to a FK in SQL)
        user: {
            type: mongoose.Schema.Types.ObjectId, // a specialized data type used to uniquely identify documents
            ref: "User", // collection name to look in
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

// Automatically deletes the document when the current time reaches the 'expiresAt' timestamp.
refreshTokenSchema.index(
    { expiresAt: 1 }, // creates an index on the expiresAt field in ascending order
    { expireAfterSeconds: 0 } // Wait 0 seconds after the date in expiresAt has passed, then delete it
);

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
module.exports = RefreshToken;