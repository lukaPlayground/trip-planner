const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('MongoDB Connection Error:', error.message);
    // process.exit(1) 제거 — 서버는 유지, 헬스체크로 원인 진단 후 복구
  }
};

module.exports = connectDB;
