const mongoose = require('mongoose');

// 연결 에러 이벤트 핸들러 — 없으면 uncaughtException으로 프로세스 종료됨
mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error event:', err.message);
});
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('MongoDB Connection Error:', error.message);
  }
};

module.exports = connectDB;
