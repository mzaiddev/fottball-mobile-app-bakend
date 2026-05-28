const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const validator = require("validator");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: validator.isEmail,
        message: "Invalid email address"
      }
    },
    password: {
      type: String,
      required() {
        return !(this.authProviders || []).length;
      },
      minlength: 6,
      select: false
    },
    authProviders: [
      {
        provider: {
          type: String,
          enum: ["google", "apple"],
          required: true
        },
        providerUserId: {
          type: String,
          required: true
        },
        email: String
      }
    ],
    role: {
      type: String,
      enum: ["owner", "admin", "coach", "moderator", "support", "user"],
      default: "user"
    },
    position: String,
    countryCode: String,
    profilePhotoUrl: String,
    onboarding: {
      completed: { type: Boolean, default: false },
      currentStep: { type: Number, default: 1 },
      source: String,
      referralCodeEntered: String,
      answers: {
        teamTrainingDays: [String],
        matchDays: [String],
        currentClub: String,
        gender: String,
        activityLevel: String,
        heightCm: Number,
        age: Number,
        weightKg: Number,
        gymDays: Number,
        matchTime: String,
        matchesPerWeek: String,
        nutritionGoal: String,
        trainingGoal: {
          type: String,
          enum: ["pace_acceleration", "strength_physicality", "match_fitness", "technical_ability", "everything"]
        },
        trainingGoalResponse: String,
        trainingSetup: String,
        lifestyleAnswers: [String]
      }
    },
    constraints: {
      injuries: [String],
      dietaryPreferences: [String],
      allergies: [String],
      equipment: [String]
    },
    wearableConnections: {
      appleHealth: { type: Boolean, default: false },
      googleFit: { type: Boolean, default: false },
      samsungHealth: { type: Boolean, default: false },
      garmin: { type: Boolean, default: false },
      whoop: { type: Boolean, default: false }
    },
    wearableLastSyncedAt: Date,
    goals: {
      type: [String],
      default: []
    },
    xp: {
      type: Number,
      default: 0
    },
    playerTier: {
      type: String,
      enum: ["Bronze", "Silver", "Gold", "Elite"],
      default: "Bronze"
    },
    readiness: {
      score: { type: Number, default: 60 },
      components: {
        trainingLoad: { type: Number, default: 60 },
        recovery: { type: Number, default: 60 },
        matchTiming: { type: Number, default: 60 },
        nutritionHydration: { type: Number, default: 60 }
      },
      calculatedAt: Date
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true
    },
    acceptedTerms: {
      type: Boolean,
      default: false
    },
    lastActiveAt: Date
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.password || !this.isModified("password")) {
    return next();
  }
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("User", userSchema);
