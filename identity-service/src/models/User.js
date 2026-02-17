const mongoose = require("mongoose");
const argon2 = require("argon2");

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        password: {
            type: String,
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Hashes user password only if modified to avoid double-encryption on user updates
userSchema.pre("save", async function (next) {
    // The Hook Type (.pre): This tells Mongoose to run the code before an action
    // The Target Action ("save"): This tells Mongoose which action to listen for
    // The Middleware Function: The whole logic inside
    if (this.isModified("password")) {
        try {
            this.password = await argon2.hash(this.password);
        } catch (error) {
            return next(error);
        }
    }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await argon2.verify(this.password, candidatePassword);
    } catch (error) {
        throw error;
    }
};

userSchema.index({ username: "text" });

const User = mongoose.model("User", userSchema);
module.exports = User;