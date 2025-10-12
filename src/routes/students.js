import { Router } from 'express';
import { createStudent, getStudent, listStudents } from '../controllers/studentsController.js';

export const students = Router();

students.get('/students', listStudents);
students.get('/students/:id', getStudent);
students.post('/students', createStudent);
