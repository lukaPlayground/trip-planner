# 🗺️ 여행계획 지도 도우미 - 로컬 개발 프로젝트 프롬프트

## 📋 프로젝트 개요

**목적**: 포트폴리오용 풀스택 웹앱으로, 지도를 보며 여행/비즈니스 이동 순서를 체크리스트처럼 추가·관리·저장하는 서비스 개발

**핵심 기능**:
- 지도에서 장소 검색 → 즐겨찾기 추가
- 순서 지정 (1순위 서울역 → 2순위 강남역)
- 체크박스로 완료 표시
- 일정 저장 및 이미지 내보내기

**개발 환경**: 로컬 개발 (localhost) → GitHub 연동 → 추후 배포

---

## 🛠️ 기술 스택

### 프론트엔드
- **React 18** + **Vite** (빠른 개발 서버)
- **Tailwind CSS** (반응형 UI)
- **React Router** (페이지 라우팅)
- **react-beautiful-dnd** (드래그 앤 드롭)

### 백엔드
- **Node.js** + **Express**
- **MongoDB** (로컬 또는 MongoDB Atlas 무료 티어)
- **JWT** + **bcrypt** (인증)
- **CORS** (프론트-백 연결)

### 지도 API
- **Google Maps Embed API** (완전 무료, 무제한)
- **Google Maps JavaScript API** (선택, 월 $200 크레딧)
- **대체 옵션**: Leaflet.js (100% 무료 오픈소스)

### 개발 도구
- **Git** + **GitHub** (버전 관리)
- **Postman** 또는 **Thunder Client** (API 테스트)
- **MongoDB Compass** (DB GUI)

---

## 📁 프로젝트 구조

```
trip-planner/
├── frontend/                 # React 프론트엔드
│   ├── src/
│   │   ├── components/       # UI 컴포넌트
│   │   │   ├── Map.jsx       # 지도 표시
│   │   │   ├── PlaceList.jsx # 장소 순서 리스트
│   │   │   ├── SearchBar.jsx # 장소 검색
│   │   │   └── Auth/         # 로그인/회원가입
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── Dashboard.jsx # 메인 지도 페이지
│   │   │   └── Login.jsx
│   │   ├── context/          # 전역 상태 관리
│   │   ├── api/              # Axios API 호출
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env                  # API 키 저장
│   ├── package.json
│   └── vite.config.js
│
├── backend/                  # Node.js 백엔드
│   ├── src/
│   │   ├── models/           # MongoDB 스키마
│   │   │   ├── User.js
│   │   │   └── Plan.js
│   │   ├── routes/           # API 라우트
│   │   │   ├── auth.js       # 로그인/회원가입
│   │   │   └── plans.js      # 계획 CRUD
│   │   ├── middleware/
│   │   │   └── auth.js       # JWT 검증
│   │   ├── config/
│   │   │   └── db.js         # MongoDB 연결
│   │   └── server.js         # Express 서버
│   ├── .env                  # DB URI, JWT Secret
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## 🚀 1단계: 프로젝트 초기 설정

### 1-1. 프로젝트 폴더 생성 및 Git 초기화

```bash
# 프로젝트 루트 폴더 생성
mkdir trip-planner
cd trip-planner

# Git 초기화
git init
echo "node_modules/" > .gitignore
echo ".env" >> .gitignore
echo "dist/" >> .gitignore

# GitHub 저장소 연결 (나중에 사용)
# git remote add origin https://github.com/YOUR_USERNAME/trip-planner.git
```

### 1-2. 프론트엔드 셋업

```bash
# Vite로 React 프로젝트 생성
npm create vite@latest frontend -- --template react
cd frontend

# 필수 패키지 설치
npm install
npm install react-router-dom axios
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# 추가 라이브러리 (드래그 앤 드롭)
npm install react-beautiful-dnd
npm install react-icons

# 개발 서버 실행 (http://localhost:5173)
npm run dev
```

**Tailwind CSS 설정** (`tailwind.config.js`):
```javascript
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**환경 변수** (`.env`):
```
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_MAPS_API_KEY=YOUR_API_KEY_HERE
```

### 1-3. 백엔드 셋업

```bash
# 프로젝트 루트로 돌아가기
cd ..
mkdir backend
cd backend

# Node.js 프로젝트 초기화
npm init -y

# 필수 패키지 설치
npm install express mongoose cors dotenv
npm install jsonwebtoken bcrypt
npm install -D nodemon

# package.json 스크립트 추가
# "dev": "nodemon src/server.js"
```

**환경 변수** (`.env`):
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/trip-planner
# 또는 MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/trip-planner
JWT_SECRET=your_super_secret_key_change_this_in_production
```

---

## 🗄️ 2단계: MongoDB 스키마 설계

### User 모델 (`backend/src/models/User.js`)

```javascript
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 비밀번호 해싱
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// 비밀번호 비교 메서드
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
```

### Plan 모델 (`backend/src/models/Plan.js`)

```javascript
const mongoose = require('mongoose');

const placeSchema = new mongoose.Schema({
  order: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  address: String,
  lat: {
    type: Number,
    required: true
  },
  lng: {
    type: Number,
    required: true
  },
  note: {
    type: String,
    default: ''
  },
  checked: {
    type: Boolean,
    default: false
  },
  estimatedTime: String,  // "2시간", "30분"
  category: String  // "관광", "식당", "숙소"
});

const planSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  planName: {
    type: String,
    required: true
  },
  description: String,
  places: [placeSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 업데이트 시 updatedAt 자동 갱신
planSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Plan', planSchema);
```

---

## 🔌 3단계: 백엔드 API 구현

### 3-1. Express 서버 기본 설정 (`backend/src/server.js`)

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

// MongoDB 연결
connectDB();

// 미들웨어
app.use(cors({
  origin: 'http://localhost:5173',  // Vite 개발 서버
  credentials: true
}));
app.use(express.json());

// 라우트
app.use('/api/auth', require('./routes/auth'));
app.use('/api/plans', require('./routes/plans'));

// 기본 라우트
app.get('/', (req, res) => {
  res.json({ message: 'Trip Planner API Running' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
```

### 3-2. MongoDB 연결 (`backend/src/config/db.js`)

```javascript
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
```

### 3-3. 인증 미들웨어 (`backend/src/middleware/auth.js`)

```javascript
const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: '인증 토큰이 없습니다' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ message: '유효하지 않은 토큰입니다' });
  }
};
```

### 3-4. 인증 라우트 (`backend/src/routes/auth.js`)

```javascript
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// 회원가입
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // 이메일 중복 체크
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: '이미 존재하는 이메일입니다' });
    }

    // 사용자 생성
    const user = new User({ email, password, name });
    await user.save();

    // JWT 토큰 생성
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ message: '서버 오류', error: error.message });
  }
});

// 로그인
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 사용자 찾기
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: '이메일 또는 비밀번호가 잘못되었습니다' });
    }

    // 비밀번호 확인
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: '이메일 또는 비밀번호가 잘못되었습니다' });
    }

    // JWT 토큰 생성
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ message: '서버 오류', error: error.message });
  }
});

module.exports = router;
```

### 3-5. 계획 관리 라우트 (`backend/src/routes/plans.js`)

```javascript
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Plan = require('../models/Plan');

// 모든 계획 조회
router.get('/', auth, async (req, res) => {
  try {
    const plans = await Plan.find({ userId: req.userId })
      .sort({ updatedAt: -1 });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ message: '서버 오류', error: error.message });
  }
});

// 특정 계획 조회
router.get('/:id', auth, async (req, res) => {
  try {
    const plan = await Plan.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!plan) {
      return res.status(404).json({ message: '계획을 찾을 수 없습니다' });
    }

    res.json(plan);
  } catch (error) {
    res.status(500).json({ message: '서버 오류', error: error.message });
  }
});

// 계획 생성
router.post('/', auth, async (req, res) => {
  try {
    const { planName, description, places } = req.body;

    const plan = new Plan({
      userId: req.userId,
      planName,
      description,
      places: places || []
    });

    await plan.save();
    res.status(201).json(plan);
  } catch (error) {
    res.status(500).json({ message: '서버 오류', error: error.message });
  }
});

// 계획 수정
router.put('/:id', auth, async (req, res) => {
  try {
    const { planName, description, places } = req.body;

    const plan = await Plan.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { planName, description, places, updatedAt: Date.now() },
      { new: true }
    );

    if (!plan) {
      return res.status(404).json({ message: '계획을 찾을 수 없습니다' });
    }

    res.json(plan);
  } catch (error) {
    res.status(500).json({ message: '서버 오류', error: error.message });
  }
});

// 계획 삭제
router.delete('/:id', auth, async (req, res) => {
  try {
    const plan = await Plan.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId
    });

    if (!plan) {
      return res.status(404).json({ message: '계획을 찾을 수 없습니다' });
    }

    res.json({ message: '계획이 삭제되었습니다' });
  } catch (error) {
    res.status(500).json({ message: '서버 오류', error: error.message });
  }
});

module.exports = router;
```

---

## 🎨 4단계: 프론트엔드 구현

### 4-1. API 클라이언트 (`frontend/src/api/axios.js`)

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 요청 인터셉터 (JWT 토큰 자동 추가)
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
```

### 4-2. 인증 컨텍스트 (`frontend/src/context/AuthContext.jsx`)

```javascript
import React, { createContext, useState, useEffect } from 'react';
import api from '../api/axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { token, user } = response.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    return user;
  };

  const register = async (name, email, password) => {
    const response = await api.post('/auth/register', { name, email, password });
    const { token, user } = response.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
```

### 4-3. 지도 컴포넌트 (Google Maps Embed) (`frontend/src/components/Map.jsx`)

```javascript
import React, { useEffect, useRef } from 'react';

const Map = ({ places }) => {
  const mapRef = useRef(null);

  useEffect(() => {
    if (places.length === 0) return;

    // 첫 번째 장소를 중심으로 설정
    const center = places[0];
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    // Embed API 사용 (무료)
    const embedUrl = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${center.lat},${center.lng}&zoom=13`;

    if (mapRef.current) {
      mapRef.current.src = embedUrl;
    }
  }, [places]);

  return (
    <div className="w-full h-full">
      <iframe
        ref={mapRef}
        width="100%"
        height="100%"
        frameBorder="0"
        style={{ border: 0 }}
        allowFullScreen
      />
    </div>
  );
};

export default Map;
```

### 4-4. 장소 리스트 컴포넌트 (`frontend/src/components/PlaceList.jsx`)

```javascript
import React from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { FaGripVertical, FaTrash, FaCheck } from 'react-icons/fa';

const PlaceList = ({ places, onReorder, onToggleCheck, onDelete, onUpdateNote }) => {
  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(places);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // 순서 번호 재정렬
    const reordered = items.map((item, index) => ({
      ...item,
      order: index + 1
    }));

    onReorder(reordered);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="places">
        {(provided) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className="space-y-2"
          >
            {places.map((place, index) => (
              <Draggable key={place.id || index} draggableId={String(place.id || index)} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={`bg-white p-4 rounded-lg shadow ${
                      snapshot.isDragging ? 'shadow-lg' : ''
                    } ${place.checked ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* 드래그 핸들 */}
                      <div {...provided.dragHandleProps} className="mt-1 cursor-grab">
                        <FaGripVertical className="text-gray-400" />
                      </div>

                      {/* 순서 번호 */}
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                        {place.order}
                      </div>

                      {/* 장소 정보 */}
                      <div className="flex-1">
                        <h3 className={`font-semibold ${place.checked ? 'line-through' : ''}`}>
                          {place.name}
                        </h3>
                        <p className="text-sm text-gray-500">{place.address}</p>
                        
                        {/* 메모 입력 */}
                        <input
                          type="text"
                          placeholder="메모 추가 (예: 2시간 소요, 지하철 이용)"
                          value={place.note || ''}
                          onChange={(e) => onUpdateNote(index, e.target.value)}
                          className="mt-2 w-full text-sm border rounded px-2 py-1"
                        />
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => onToggleCheck(index)}
                          className={`p-2 rounded ${
                            place.checked ? 'bg-green-500 text-white' : 'bg-gray-200'
                          }`}
                        >
                          <FaCheck />
                        </button>
                        <button
                          onClick={() => onDelete(index)}
                          className="p-2 bg-red-500 text-white rounded"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default PlaceList;
```

### 4-5. 장소 검색 컴포넌트 (`frontend/src/components/SearchBar.jsx`)

```javascript
import React, { useState } from 'react';
import { FaSearch, FaPlus } from 'react-icons/fa';

const SearchBar = ({ onAddPlace }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // 간단한 더미 검색 (실제로는 Google Places API 사용)
  const handleSearch = async () => {
    // TODO: Google Places API 연동
    // 임시 더미 데이터
    const dummyResults = [
      {
        name: searchQuery,
        address: '서울특별시 중구',
        lat: 37.5665 + Math.random() * 0.1,
        lng: 126.9780 + Math.random() * 0.1
      }
    ];
    setSearchResults(dummyResults);
  };

  const handleAddPlace = (result) => {
    onAddPlace({
      ...result,
      order: 0,  // 순서는 부모에서 설정
      checked: false,
      note: ''
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="장소 검색 (예: 서울역)"
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center gap-2"
        >
          <FaSearch /> 검색
        </button>
      </div>

      {/* 검색 결과 */}
      {searchResults.length > 0 && (
        <div className="bg-white border rounded-lg divide-y">
          {searchResults.map((result, index) => (
            <div key={index} className="p-3 flex justify-between items-center hover:bg-gray-50">
              <div>
                <h4 className="font-semibold">{result.name}</h4>
                <p className="text-sm text-gray-500">{result.address}</p>
              </div>
              <button
                onClick={() => handleAddPlace(result)}
                className="px-3 py-1 bg-green-500 text-white rounded flex items-center gap-1"
              >
                <FaPlus /> 추가
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
```

### 4-6. 메인 대시보드 페이지 (`frontend/src/pages/Dashboard.jsx`)

```javascript
import React, { useState, useEffect } from 'react';
import Map from '../components/Map';
import PlaceList from '../components/PlaceList';
import SearchBar from '../components/SearchBar';
import api from '../api/axios';

const Dashboard = () => {
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [places, setPlaces] = useState([]);

  // 계획 목록 로드
  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const response = await api.get('/plans');
      setPlans(response.data);
      if (response.data.length > 0) {
        selectPlan(response.data[0]);
      }
    } catch (error) {
      console.error('계획 로드 실패:', error);
    }
  };

  const selectPlan = (plan) => {
    setCurrentPlan(plan);
    setPlaces(plan.places || []);
  };

  const createNewPlan = async () => {
    const planName = prompt('새 계획 이름:');
    if (!planName) return;

    try {
      const response = await api.post('/plans', {
        planName,
        description: '',
        places: []
      });
      setPlans([response.data, ...plans]);
      selectPlan(response.data);
    } catch (error) {
      console.error('계획 생성 실패:', error);
    }
  };

  const savePlan = async () => {
    if (!currentPlan) return;

    try {
      await api.put(`/plans/${currentPlan._id}`, {
        ...currentPlan,
        places
      });
      alert('저장되었습니다!');
    } catch (error) {
      console.error('저장 실패:', error);
      alert('저장 실패');
    }
  };

  const handleAddPlace = (newPlace) => {
    const updatedPlaces = [
      ...places,
      { ...newPlace, order: places.length + 1, id: Date.now() }
    ];
    setPlaces(updatedPlaces);
  };

  const handleReorder = (reorderedPlaces) => {
    setPlaces(reorderedPlaces);
  };

  const handleToggleCheck = (index) => {
    const updated = [...places];
    updated[index].checked = !updated[index].checked;
    setPlaces(updated);
  };

  const handleDelete = (index) => {
    const updated = places.filter((_, i) => i !== index);
    // 순서 재정렬
    const reordered = updated.map((place, i) => ({ ...place, order: i + 1 }));
    setPlaces(reordered);
  };

  const handleUpdateNote = (index, note) => {
    const updated = [...places];
    updated[index].note = note;
    setPlaces(updated);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* 헤더 */}
      <header className="bg-blue-600 text-white p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">🗺️ 여행 계획</h1>
        <div className="flex gap-2">
          <button onClick={createNewPlan} className="px-4 py-2 bg-white text-blue-600 rounded">
            새 계획
          </button>
          <button onClick={savePlan} className="px-4 py-2 bg-green-500 rounded">
            저장
          </button>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex">
        {/* 지도 영역 (60%) */}
        <div className="w-3/5 bg-gray-200">
          <Map places={places} />
        </div>

        {/* 사이드바 (40%) */}
        <div className="w-2/5 p-4 overflow-y-auto bg-gray-50">
          {currentPlan && (
            <div className="mb-4">
              <h2 className="text-xl font-bold">{currentPlan.planName}</h2>
              <p className="text-sm text-gray-500">장소 {places.length}개</p>
            </div>
          )}

          {/* 검색바 */}
          <SearchBar onAddPlace={handleAddPlace} />

          {/* 장소 리스트 */}
          <div className="mt-4">
            <PlaceList
              places={places}
              onReorder={handleReorder}
              onToggleCheck={handleToggleCheck}
              onDelete={handleDelete}
              onUpdateNote={handleUpdateNote}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
```

---

## 🧪 5단계: 로컬 테스트 가이드

### 5-1. MongoDB 설치 및 실행

**옵션 A: 로컬 MongoDB 설치**
```bash
# macOS (Homebrew)
brew install mongodb-community
brew services start mongodb-community

# Windows
# https://www.mongodb.com/try/download/community 에서 설치

# 연결 확인
mongosh
# > show dbs
```

**옵션 B: MongoDB Atlas (무료 클라우드)**
1. https://www.mongodb.com/cloud/atlas/register 회원가입
2. 무료 M0 클러스터 생성
3. Database Access에서 사용자 생성
4. Network Access에서 IP 허용 (0.0.0.0/0)
5. Connect → "Connect your application" → URI 복사
6. `.env` 파일에 URI 입력

### 5-2. 서버 실행

```bash
# 터미널 1: 백엔드 실행
cd backend
npm run dev
# ✅ Server running on http://localhost:5000

# 터미널 2: 프론트엔드 실행
cd frontend
npm run dev
# ✅ Local: http://localhost:5173
```

### 5-3. API 테스트 (Postman 또는 Thunder Client)

**회원가입 테스트**
```
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "name": "홍길동",
  "email": "test@example.com",
  "password": "123456"
}
```

**계획 생성 테스트**
```
POST http://localhost:5000/api/plans
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "planName": "제주도 여행",
  "description": "3박 4일",
  "places": [
    {
      "order": 1,
      "name": "제주공항",
      "lat": 33.5066,
      "lng": 126.4929,
      "checked": false
    }
  ]
}
```

---

## 📦 6단계: GitHub 연동 및 버전 관리

### 6-1. GitHub 저장소 생성

```bash
# GitHub에서 새 저장소 생성 후
git remote add origin https://github.com/YOUR_USERNAME/trip-planner.git

# 초기 커밋
git add .
git commit -m "Initial commit: Trip Planner MVP"
git branch -M main
git push -u origin main
```

### 6-2. .gitignore 설정 확인

```
# 루트 .gitignore
node_modules/
.env
dist/
.DS_Store

# 프론트엔드
frontend/dist/
frontend/.env

# 백엔드
backend/.env
```

### 6-3. README.md 작성

```markdown
# 🗺️ Trip Planner - 여행계획 지도 도우미

## 📌 프로젝트 소개
지도를 보며 여행 순서를 체크리스트처럼 관리하는 풀스택 웹앱

## 🛠️ 기술 스택
- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Database: MongoDB
- Maps: Google Maps API

## 🚀 로컬 실행 방법

### 1. 저장소 클론
```bash
git clone https://github.com/YOUR_USERNAME/trip-planner.git
cd trip-planner
```

### 2. 환경 변수 설정
```bash
# frontend/.env
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_MAPS_API_KEY=YOUR_KEY

# backend/.env
MONGODB_URI=mongodb://localhost:27017/trip-planner
JWT_SECRET=your_secret_key
```

### 3. 패키지 설치 및 실행
```bash
# 백엔드
cd backend
npm install
npm run dev

# 프론트엔드 (새 터미널)
cd frontend
npm install
npm run dev
```

## 📸 스크린샷
(추후 추가)

## 📝 TODO
- [ ] Google Places API 연동
- [ ] Maps JavaScript API 커스텀 마커
- [ ] PDF 내보내기 기능
- [ ] 모바일 반응형 최적화
```

---

## 🎯 다음 개발 단계

### Phase 1: MVP 완성 (현재)
- ✅ 인증 시스템
- ✅ 기본 CRUD
- ✅ 드래그 앤 드롭
- ✅ 지도 임베드

### Phase 2: 고급 기능
- [ ] Google Places Autocomplete 연동
- [ ] Maps JavaScript API로 커스텀 마커
- [ ] 경로 표시 (Directions API)
- [ ] 이미지 내보내기 (html2canvas)

### Phase 3: UX 개선
- [ ] 다크모드
- [ ] 모바일 최적화
- [ ] 드래그 애니메이션
- [ ] 실시간 저장 (debounce)

### Phase 4: 배포
- [ ] Vercel (프론트엔드)
- [ ] Railway (백엔드)
- [ ] 환경 변수 설정
- [ ] 도메인 연결

---

## 💡 개발 팁

### Google Maps API 비용 절약
```javascript
// 1. Debounce로 검색 요청 최소화
const debouncedSearch = debounce(searchPlaces, 500);

// 2. 캐싱 활용
const placeCache = new Map();
if (placeCache.has(query)) {
  return placeCache.get(query);
}

// 3. 개발 환경에서만 API 사용
if (import.meta.env.DEV) {
  // 실제 API 호출
} else {
  // 더미 데이터 사용
}
```

### MongoDB 쿼리 최적화
```javascript
// 인덱스 생성
planSchema.index({ userId: 1, updatedAt: -1 });

// Projection으로 필요한 필드만 조회
Plan.find({ userId }).select('planName places.name');
```

---

## 🐛 트러블슈팅

### CORS 에러
```javascript
// backend/src/server.js
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
```

### MongoDB 연결 실패
```bash
# MongoDB 실행 확인
brew services list  # macOS
net start MongoDB   # Windows

# 연결 URI 확인
mongodb://localhost:27017/trip-planner  # 로컬
```

### JWT 토큰 만료
```javascript
// 토큰 만료 시 자동 로그아웃
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

---

## 📚 참고 자료

- [Google Maps Platform 문서](https://developers.google.com/maps)
- [React Beautiful DnD](https://github.com/atlassian/react-beautiful-dnd)
- [MongoDB Atlas 가이드](https://www.mongodb.com/docs/atlas/)
- [JWT 인증 가이드](https://jwt.io/introduction)

---

## ✅ Claude Code 실행 체크리스트

1. [ ] 프로젝트 폴더 생성 및 Git 초기화
2. [ ] 프론트엔드 Vite 프로젝트 생성
3. [ ] 백엔드 Express 서버 구축
4. [ ] MongoDB 연결 설정
5. [ ] User/Plan 모델 생성
6. [ ] 인증 API 구현
7. [ ] 계획 CRUD API 구현
8. [ ] React 컴포넌트 구현
9. [ ] 로컬 테스트 실행
10. [ ] GitHub 푸시

---

## 🚀 시작하기

이 프롬프트를 Claude Code에 입력하세요:

```
위 프롬프트를 기반으로 trip-planner 프로젝트를 단계별로 구축해주세요.
먼저 프로젝트 구조를 생성하고, 백엔드부터 구현해주세요.
```

---

**작성일**: 2025-02-13  
**버전**: 1.0 - 로컬 개발 기반 MVP
