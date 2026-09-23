const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to MongoDB Atlas
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/leads', require('./routes/leadRoutes'));
app.use('/api/checklists', require('./routes/checklistRoutes'));
app.use('/api/history', require('./routes/historyRoutes'));

// Root Health Check Route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to International Chaya - Overseas Placement & Visa Processing CRM API',
    status: 'Running',
    version: '1.0.0'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
