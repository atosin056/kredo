import "dotenv/config";
import mysql from "mysql2/promise";

// This file handles the app's database connection.
// Keep all DB connection setup here so other files can just import this file
// instead of creating database logic in multiple places.
//
// Right now, we are just preparing the connection and leaving the real DB setup
// flexible until you tell me when to wire it up for real.

// Example DB values should live in your .env file:
// DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
//
// Example:
// DB_HOST=localhost
// DB_USER=root
// DB_PASSWORD=your_password
// DB_NAME=kredo

// Create a database pool instead of a single connection.
// A pool lets the app reuse database connections efficiently.
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Export the database connection so other files can do:
// import db from "../db/db.js";
// and then run queries through it.
export default db;

// TODO: When you're ready, we can add:
// - user table / collection creation
// - account table / collection creation
// - helper query functions
// - MongoDB or MySQL-specific models/services
// For now, this is just the connection setup with comments.
