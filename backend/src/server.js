require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

connectDB();

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // 서버 간 요청(origin 없음) 또는 허용 목록에 있으면 통과
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true
}));
app.use(express.json());

// 헬스체크 — MongoDB 연결과 무관하게 항상 응답
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV, mongo: !!process.env.MONGODB_URI });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/places', require('./routes/places'));
app.use('/api/transit', require('./routes/transit'));

// Admin dashboard — 로컬 개발 환경에서만 활성화
if (process.env.NODE_ENV !== 'production') {
  app.use('/', require('./routes/admin'));
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
