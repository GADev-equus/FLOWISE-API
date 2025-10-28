import express from 'express';
import {
  verifyGuardianEmail,
  getStudentsByGuardianEmail,
} from '../controllers/guardiansController.js';

const router = express.Router();

// POST /api/guardians/verify-email - Verify guardian email exists
router.post('/verify-email', verifyGuardianEmail);

// GET /api/guardians/students - Get all students for a guardian
router.get('/students', getStudentsByGuardianEmail);

export default router;
