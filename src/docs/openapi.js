const bearerSecurity = [{ bearerAuth: [] }];

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
};

const apiResponse = (description, dataSchema = { type: "object" }) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string" },
          data: dataSchema,
        },
      },
    },
  },
});

const errorResponses = {
  400: apiResponse("Bad request"),
  401: apiResponse("Unauthorized"),
  404: apiResponse("Not found"),
  500: apiResponse("Server error"),
};

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Project Baller Backend API",
    version: "1.0.0",
    description:
      "Interactive API documentation for the Project Baller mobile app, admin panel, AI coach, Cloudinary media, nutrition, matches, and training flows.",
  },
  servers: [
    {
      url: "https://fottball-mobile-app-bakend.vercel.app/api",
      description: "Local backend",
    },
  ],
  tags: [
    { name: "Auth" },
    { name: "Users" },
    { name: "Plans" },
    { name: "Nutrition" },
    { name: "Matches" },
    { name: "Community" },
    { name: "Integrations" },
    { name: "Admin" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Paste the accessToken returned from /auth/login or /auth/register.",
      },
    },
    schemas: {
      RegisterRequest: {
        type: "object",
        required: ["fullName", "email", "password", "acceptedTerms"],
        properties: {
          fullName: { type: "string", example: "Test Player" },
          email: {
            type: "string",
            format: "email",
            example: "player@example.com",
          },
          password: {
            type: "string",
            format: "password",
            example: "password123",
          },
          acceptedTerms: { type: "boolean", example: true },
          referralCodeEntered: { type: "string", example: "BALLER-ABC123" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            format: "email",
            example: "player@example.com",
          },
          password: {
            type: "string",
            format: "password",
            example: "password123",
          },
        },
      },
      User: {
        type: "object",
        properties: {
          _id: { type: "string" },
          fullName: { type: "string" },
          email: { type: "string" },
          role: { type: "string" },
          position: { type: "string" },
          profilePhotoUrl: { type: "string" },
          referralCode: { type: "string" },
        },
      },
      AuthSession: {
        type: "object",
        properties: {
          user: { $ref: "#/components/schemas/User" },
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
        },
      },
      MatchRequest: {
        type: "object",
        required: ["opponent", "dateTime"],
        properties: {
          opponent: { type: "string", example: "City FC" },
          dateTime: { type: "string", format: "date-time" },
          venue: { type: "string", example: "Home" },
          location: { type: "string", example: "Main Stadium" },
          competitionType: { type: "string", example: "League" },
        },
      },
      MealRequest: {
        type: "object",
        required: ["name", "mealType"],
        properties: {
          name: { type: "string", example: "Chicken rice bowl" },
          mealType: { type: "string", example: "lunch" },
          calories: { type: "number", example: 650 },
          protein: { type: "number", example: 42 },
          carbs: { type: "number", example: 70 },
          fats: { type: "number", example: 18 },
        },
      },
      WorkoutLogRequest: {
        type: "object",
        properties: {
          weeklyPlan: { type: "string" },
          sessionId: { type: "string" },
          title: { type: "string", example: "Full Body Strength" },
          durationMin: { type: "number", example: 60 },
          rpe: { type: "number", example: 7 },
          soreness: { type: "number", example: 3 },
          notes: { type: "string" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                setIndex: { type: "number" },
                weightKg: { type: "number" },
                reps: { type: "number" },
                completed: { type: "boolean" },
              },
            },
          },
        },
      },
      CommunityPostRequest: {
        type: "object",
        properties: {
          text: { type: "string", example: "Great session today." },
          mediaUrls: {
            type: "array",
            items: { type: "string" },
          },
          programGroup: { type: "string" },
        },
      },
      SupportTicketRequest: {
        type: "object",
        required: ["subject", "description"],
        properties: {
          subject: { type: "string", example: "App issue" },
          description: { type: "string", example: "I need help with my plan." },
        },
      },
    },
  },
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new player",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" },
            },
          },
        },
        responses: {
          201: apiResponse("Account created", {
            $ref: "#/components/schemas/AuthSession",
          }),
          ...errorResponses,
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login and receive JWT tokens",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
            },
          },
        },
        responses: {
          200: apiResponse("Login successful", {
            $ref: "#/components/schemas/AuthSession",
          }),
          ...errorResponses,
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current authenticated user",
        security: bearerSecurity,
        responses: {
          200: apiResponse("Current user", {
            $ref: "#/components/schemas/User",
          }),
          ...errorResponses,
        },
      },
    },
    "/auth/referrals/{code}": {
      get: {
        tags: ["Auth"],
        summary: "Validate referral code",
        parameters: [
          {
            name: "code",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: apiResponse("Referral code verified"),
          ...errorResponses,
        },
      },
    },
    "/users/dashboard": {
      get: {
        tags: ["Users"],
        summary: "Get dashboard snapshot",
        security: bearerSecurity,
        responses: {
          200: apiResponse("Dashboard snapshot"),
          ...errorResponses,
        },
      },
    },
    "/users/onboarding": {
      patch: {
        tags: ["Users"],
        summary: "Save onboarding answers",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: apiResponse("Onboarding updated"),
          ...errorResponses,
        },
      },
    },
    "/users/profile": {
      patch: {
        tags: ["Users"],
        summary: "Update user profile",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  fullName: { type: "string" },
                  countryCode: { type: "string" },
                  profilePhotoUrl: { type: "string" },
                  goals: { type: "array", items: { type: "string" } },
                  constraints: { type: "object" },
                },
              },
            },
          },
        },
        responses: { 200: apiResponse("Profile updated"), ...errorResponses },
      },
    },
    "/users/wearables": {
      post: {
        tags: ["Users"],
        summary: "Connect or disconnect wearable provider",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["provider", "connected"],
                properties: {
                  provider: { type: "string", example: "appleHealth" },
                  connected: { type: "boolean", example: true },
                },
              },
            },
          },
        },
        responses: {
          200: apiResponse("Wearable connection updated"),
          ...errorResponses,
        },
      },
    },
    "/users/referrals": {
      get: {
        tags: ["Users"],
        summary: "Get referral stats",
        security: bearerSecurity,
        responses: { 200: apiResponse("Referral stats"), ...errorResponses },
      },
    },
    "/users/notifications": {
      get: {
        tags: ["Users"],
        summary: "List notifications",
        security: bearerSecurity,
        responses: { 200: apiResponse("Notifications"), ...errorResponses },
      },
    },
    "/users/notifications/{id}/read": {
      patch: {
        tags: ["Users"],
        summary: "Mark notification read",
        security: bearerSecurity,
        parameters: [idParam],
        responses: {
          200: apiResponse("Notification updated"),
          ...errorResponses,
        },
      },
    },
    "/users/support-tickets": {
      post: {
        tags: ["Users"],
        summary: "Create support ticket",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SupportTicketRequest" },
            },
          },
        },
        responses: {
          201: apiResponse("Support ticket created"),
          ...errorResponses,
        },
      },
    },
    "/plans/generate": {
      post: {
        tags: ["Plans"],
        summary: "Generate weekly training plan",
        security: bearerSecurity,
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          201: apiResponse("Weekly plan generated"),
          ...errorResponses,
        },
      },
    },
    "/plans/regenerate": {
      post: {
        tags: ["Plans"],
        summary: "Regenerate current weekly plan",
        security: bearerSecurity,
        responses: {
          201: apiResponse("Weekly plan generated"),
          ...errorResponses,
        },
      },
    },
    "/plans/current": {
      get: {
        tags: ["Plans"],
        summary: "Get current weekly plan",
        security: bearerSecurity,
        responses: {
          200: apiResponse("Current weekly plan"),
          ...errorResponses,
        },
      },
    },
    "/plans/workouts/log": {
      post: {
        tags: ["Plans"],
        summary: "Create workout log",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkoutLogRequest" },
            },
          },
        },
        responses: { 201: apiResponse("Workout logged"), ...errorResponses },
      },
    },
    "/plans/workouts/logs": {
      get: {
        tags: ["Plans"],
        summary: "List workout logs",
        security: bearerSecurity,
        responses: { 200: apiResponse("Workout logs"), ...errorResponses },
      },
    },
    "/plans/workouts/logs/{id}": {
      patch: {
        tags: ["Plans"],
        summary: "Update workout log feedback",
        security: bearerSecurity,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkoutLogRequest" },
            },
          },
        },
        responses: {
          200: apiResponse("Workout log updated"),
          ...errorResponses,
        },
      },
    },
    "/plans/library/exercises": {
      get: {
        tags: ["Plans"],
        summary: "List workout exercise library",
        security: bearerSecurity,
        parameters: [
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "equipment", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: apiResponse("Workout library"), ...errorResponses },
      },
    },
    "/plans/progress": {
      post: {
        tags: ["Plans"],
        summary: "Add progress entry",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          201: apiResponse("Progress entry added"),
          ...errorResponses,
        },
      },
    },
    "/plans/insights": {
      get: {
        tags: ["Plans"],
        summary: "Get progress insights",
        security: bearerSecurity,
        responses: {
          200: apiResponse("Progress and insights"),
          ...errorResponses,
        },
      },
    },
    "/plans/ai-chat": {
      post: {
        tags: ["Plans"],
        summary: "Ask AI coach",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  message: {
                    type: "string",
                    example: "What should I focus on today?",
                  },
                },
              },
            },
          },
        },
        responses: { 200: apiResponse("AI coach response"), ...errorResponses },
      },
    },
    "/nutrition/today": {
      get: {
        tags: ["Nutrition"],
        summary: "Get or create today's nutrition log",
        security: bearerSecurity,
        responses: { 200: apiResponse("Nutrition log"), ...errorResponses },
      },
    },
    "/nutrition/meals": {
      post: {
        tags: ["Nutrition"],
        summary: "Add meal item",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MealRequest" },
            },
          },
        },
        responses: { 201: apiResponse("Meal logged"), ...errorResponses },
      },
    },
    "/nutrition/meals/{index}": {
      delete: {
        tags: ["Nutrition"],
        summary: "Remove meal by index in today's nutrition log",
        security: bearerSecurity,
        parameters: [
          {
            name: "index",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: { 200: apiResponse("Meal removed"), ...errorResponses },
      },
    },
    "/nutrition/hydration": {
      post: {
        tags: ["Nutrition"],
        summary: "Add hydration",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { hydrationMl: { type: "number", example: 250 } },
              },
            },
          },
        },
        responses: { 200: apiResponse("Hydration added"), ...errorResponses },
      },
    },
    "/nutrition/generate-meal-plan": {
      post: {
        tags: ["Nutrition"],
        summary: "Generate daily meal plan",
        security: bearerSecurity,
        responses: {
          200: apiResponse("Meal plan generated"),
          ...errorResponses,
        },
      },
    },
    "/nutrition/recipes": {
      get: {
        tags: ["Nutrition"],
        summary: "List recipes",
        security: bearerSecurity,
        responses: { 200: apiResponse("Recipes"), ...errorResponses },
      },
    },
    "/nutrition/meal-swap": {
      post: {
        tags: ["Nutrition"],
        summary: "Find meal swap alternative",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { recipeId: { type: "string" } },
              },
            },
          },
        },
        responses: {
          200: apiResponse("Meal swap generated"),
          ...errorResponses,
        },
      },
    },
    "/matches": {
      get: {
        tags: ["Matches"],
        summary: "List matches",
        security: bearerSecurity,
        responses: { 200: apiResponse("Matches"), ...errorResponses },
      },
      post: {
        tags: ["Matches"],
        summary: "Create match",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MatchRequest" },
            },
          },
        },
        responses: { 201: apiResponse("Match created"), ...errorResponses },
      },
    },
    "/matches/history": {
      get: {
        tags: ["Matches"],
        summary: "Get completed match history",
        security: bearerSecurity,
        responses: { 200: apiResponse("Match history"), ...errorResponses },
      },
    },
    "/matches/auto-adjust-plan": {
      post: {
        tags: ["Matches"],
        summary: "Auto-adjust plans around matches",
        security: bearerSecurity,
        responses: {
          200: apiResponse("Plans auto-adjusted around matches"),
          ...errorResponses,
        },
      },
    },
    "/matches/{id}/hub": {
      get: {
        tags: ["Matches"],
        summary: "Get match hub",
        security: bearerSecurity,
        parameters: [idParam],
        responses: { 200: apiResponse("Match hub"), ...errorResponses },
      },
    },
    "/matches/{id}/performance": {
      post: {
        tags: ["Matches"],
        summary: "Log match performance",
        security: bearerSecurity,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: apiResponse("Performance log saved"),
          ...errorResponses,
        },
      },
    },
    "/community/media": {
      post: {
        tags: ["Community"],
        summary: "Upload image to Cloudinary",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary" },
                  folder: { type: "string", example: "community" },
                },
              },
            },
          },
        },
        responses: { 201: apiResponse("Media uploaded"), ...errorResponses },
      },
    },
    "/community/posts": {
      get: {
        tags: ["Community"],
        summary: "List community posts",
        security: bearerSecurity,
        responses: { 200: apiResponse("Community feed"), ...errorResponses },
      },
      post: {
        tags: ["Community"],
        summary: "Create community post",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CommunityPostRequest" },
            },
          },
        },
        responses: { 201: apiResponse("Post created"), ...errorResponses },
      },
    },
    "/community/posts/{id}/like": {
      post: {
        tags: ["Community"],
        summary: "Like or unlike post",
        security: bearerSecurity,
        parameters: [idParam],
        responses: { 200: apiResponse("Post updated"), ...errorResponses },
      },
    },
    "/community/posts/{id}/comment": {
      post: {
        tags: ["Community"],
        summary: "Comment on post",
        security: bearerSecurity,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["text"],
                properties: { text: { type: "string", example: "Nice work!" } },
              },
            },
          },
        },
        responses: { 200: apiResponse("Comment added"), ...errorResponses },
      },
    },
    "/community/threads": {
      get: {
        tags: ["Community"],
        summary: "List message threads",
        security: bearerSecurity,
        responses: { 200: apiResponse("Threads"), ...errorResponses },
      },
      post: {
        tags: ["Community"],
        summary: "Create or get message thread",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { otherUserId: { type: "string" } },
              },
            },
          },
        },
        responses: { 200: apiResponse("Thread ready"), ...errorResponses },
      },
    },
    "/community/threads/{id}/messages": {
      post: {
        tags: ["Community"],
        summary: "Send message in thread",
        security: bearerSecurity,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  content: { type: "string", example: "Hello" },
                  mediaUrls: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: { 201: apiResponse("Message sent"), ...errorResponses },
      },
    },
    "/integrations/upload": {
      post: {
        tags: ["Integrations"],
        summary: "Upload file to Cloudinary",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: { 200: apiResponse("Upload result"), ...errorResponses },
      },
    },
    "/integrations/checkout": {
      post: {
        tags: ["Integrations"],
        summary: "Create Stripe checkout session",
        security: bearerSecurity,
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: apiResponse("Checkout session created"),
          ...errorResponses,
        },
      },
    },
    "/integrations/referral-link": {
      get: {
        tags: ["Integrations"],
        summary: "Create referral share link",
        security: bearerSecurity,
        responses: {
          200: apiResponse("Referral link created"),
          ...errorResponses,
        },
      },
    },
    "/admin/dashboard": {
      get: {
        tags: ["Admin"],
        summary: "Admin dashboard stats",
        security: bearerSecurity,
        responses: { 200: apiResponse("Dashboard stats"), ...errorResponses },
      },
    },
    "/admin/users": {
      get: {
        tags: ["Admin"],
        summary: "List users",
        security: bearerSecurity,
        responses: { 200: apiResponse("Users"), ...errorResponses },
      },
    },
    "/admin/plans/review-queue": {
      get: {
        tags: ["Admin"],
        summary: "List plans waiting for admin review",
        security: bearerSecurity,
        responses: { 200: apiResponse("Plan review queue"), ...errorResponses },
      },
    },
    "/admin/plans/{id}/approve": {
      post: {
        tags: ["Admin"],
        summary: "Approve plan",
        security: bearerSecurity,
        parameters: [idParam],
        responses: { 200: apiResponse("Plan approved"), ...errorResponses },
      },
    },
    "/admin/rules": {
      get: {
        tags: ["Admin"],
        summary: "List admin rules",
        security: bearerSecurity,
        responses: { 200: apiResponse("Rules"), ...errorResponses },
      },
      post: {
        tags: ["Admin"],
        summary: "Create admin rule",
        security: bearerSecurity,
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { 201: apiResponse("Rule created"), ...errorResponses },
      },
    },
    "/admin/exercises": {
      get: {
        tags: ["Admin"],
        summary: "List exercises",
        security: bearerSecurity,
        responses: { 200: apiResponse("Exercises"), ...errorResponses },
      },
      post: {
        tags: ["Admin"],
        summary: "Create exercise",
        security: bearerSecurity,
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { 201: apiResponse("Exercise created"), ...errorResponses },
      },
    },
    "/admin/recipes": {
      get: {
        tags: ["Admin"],
        summary: "List recipes",
        security: bearerSecurity,
        responses: { 200: apiResponse("Recipes"), ...errorResponses },
      },
      post: {
        tags: ["Admin"],
        summary: "Create recipe",
        security: bearerSecurity,
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { 201: apiResponse("Recipe created"), ...errorResponses },
      },
    },
  },
};

module.exports = openApiSpec;
