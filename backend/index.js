require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");

const app = express();

// Middleware to parse JSON bodies (for later use)
app.use(express.json());

// Basic health check
app.get("/", (req, res) => {
  res.json({ message: "API is running" });
});

// Start server after DB connection
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });
