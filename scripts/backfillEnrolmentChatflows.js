import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMongo } from '../src/db/mongo.js';
import { Student } from '../src/models/Student.js';
import { DEFAULT_CHATFLOW_ID } from '../src/config/chatflowConstants.js';

async function migrateChatflows() {
  await connectMongo();

  const students = await Student.find()
    .lean()
    .select({ enrolments: 1, chatflowId: 1 });

  if (students.length === 0) {
    console.log('No students required migration. Every enrolment already has its own chatflowId and root chatflowIds were empty.');
    return;
  }

  let updatedStudents = 0;
  let enrolmentsTouched = 0;

  for (const student of students) {
    const updatedEnrolments = (student.enrolments || []).map((enrolment) => ({
      ...enrolment,
      chatflowId: DEFAULT_CHATFLOW_ID,
    }));

    await Student.updateOne(
      { _id: student._id },
      {
        $set: {
          chatflowId: DEFAULT_CHATFLOW_ID,
          enrolments: updatedEnrolments,
        },
      },
    );

    if (
      student.chatflowId ||
      updatedEnrolments.some(
        (enrolment, index) =>
          (student.enrolments?.[index]?.chatflowId ?? '') !== enrolment.chatflowId,
      )
    ) {
      updatedStudents += 1;
      enrolmentsTouched += updatedEnrolments.length;
    }
  }

  console.log(
    `Migration complete. Cleared root chatflowId and reset ${enrolmentsTouched} enrolments across ${updatedStudents} students.`,
  );
}

migrateChatflows()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
