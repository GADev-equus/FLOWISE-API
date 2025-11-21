import { Router } from 'express';
import {
  addStudentEnrolment,
  createStudent,
  getStudent,
  listStudents,
  verifyEmail,
  updateStudentEnrolment,
} from '../controllers/studentsController.js';

export const students = Router();

// POST routes - specific paths first
students.post('/students/verify-email', verifyEmail);
students.post('/students', createStudent);
students.post('/students/:id/enrolments', addStudentEnrolment);
students.put('/students/:id/enrolments/:index', updateStudentEnrolment);

// GET routes
students.get('/students', listStudents);
students.get('/students/:id', getStudent);
