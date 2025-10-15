import { Router } from 'express';
import {
  createStudent,
  getStudent,
  listStudents,
  verifyEmail,
} from '../controllers/studentsController.js';

export const students = Router();

// POST routes - specific paths first
students.post('/students/verify-email', verifyEmail);
students.post('/students', createStudent);

// GET routes
students.get('/students', listStudents);
students.get('/students/:id', getStudent);
