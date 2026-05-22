import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import staffRoutes from './routes/staffRoutes.js';

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/api/staff', staffRoutes);

// Basic health check
app.get('/', (req, res) => {
    res.send('Outlet ERP Backend is running');
});

export default app;
