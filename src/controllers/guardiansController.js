import { Student } from '../models/Student.js';

/**
 * Verify if guardian email exists and has linked students
 * POST /api/guardians/verify-email
 */
export const verifyGuardianEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find all students with this guardian email
    const students = await Student.find({
      'guardian.email': email.toLowerCase().trim(),
    }).select('_id name nickname email');

    if (!students || students.length === 0) {
      return res.status(404).json({
        message: 'No students found for this guardian email',
      });
    }

    res.json({
      message: 'Guardian email verified',
      studentCount: students.length,
      guardianEmail: email.toLowerCase().trim(),
    });
  } catch (error) {
    console.error('Error verifying guardian email:', error);
    res.status(500).json({
      message: 'Server error during guardian verification',
    });
  }
};

/**
 * Get all students for a guardian email
 * GET /api/guardians/students?email=guardian@example.com
 */
export const getStudentsByGuardianEmail = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find all students with this guardian email
    const students = await Student.find({
      'guardian.email': email.toLowerCase().trim(),
    }).select('_id name nickname email enrolments');

    if (!students || students.length === 0) {
      return res.status(404).json({
        message: 'No students found for this guardian email',
      });
    }

    res.json({
      guardianEmail: email.toLowerCase().trim(),
      students: students.map((student) => ({
        _id: student._id.toString(),
        name: student.name,
        nickname: student.nickname || null,
        email: student.email,
        enrolmentCount: student.enrolments?.length || 0,
      })),
    });
  } catch (error) {
    console.error('Error fetching students for guardian:', error);
    res.status(500).json({
      message: 'Server error fetching student data',
    });
  }
};
