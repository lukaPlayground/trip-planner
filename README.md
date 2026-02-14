# Trip Planner - 여행계획 지도 도우미

지도를 보며 여행 순서를 체크리스트처럼 관리하는 풀스택 웹앱

## 기술 스택
- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Maps**: Google Maps Embed API
- **Auth**: JWT + bcrypt

## 로컬 실행 방법

### 1. 저장소 클론
```bash
git clone https://github.com/lukaPlayground/trip-planner.git
cd trip-planner
```

### 2. 환경 변수 설정
```bash
# frontend/.env
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_MAPS_API_KEY=YOUR_KEY

# backend/.env
PORT=5000
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

## 주요 기능
- Google Maps 기반 장소 검색 및 추가
- 드래그 앤 드롭으로 이동 순서 관리
- 체크박스로 방문 완료 표시
- 여행 계획 저장/수정/삭제 (CRUD)
- JWT 기반 인증 (회원가입/로그인)

## TODO
- [ ] Google Places Autocomplete API 연동
- [ ] 커스텀 마커 (Maps JavaScript API)
- [ ] PDF/이미지 내보내기
- [ ] 모바일 반응형 최적화
- [ ] 다크모드
