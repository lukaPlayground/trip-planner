# Trip Planner - 여행계획 지도 도우미

지도를 보며 여행 순서를 체크리스트처럼 관리하는 풀스택 웹앱

## 기술 스택
- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Maps**: Leaflet.js + OpenStreetMap (무료)
- **Search**: Google Places API (Text Search, 백엔드 프록시)
- **Auth**: JWT + bcrypt

## 주요 기능
- Leaflet.js 지도 기반 장소 검색 및 추가
- 드래그 앤 드롭으로 이동 순서 관리
- 10종 교통수단 선택 (도보, 자전거, 바이크, 버스, 지하철, 기차, 자차, 택시, 배, 비행기)
- 이동수단별 색상 경로선 표시
- 체크박스로 방문 완료 표시
- 장소별 메모 기능
- 여행 계획 저장/수정/삭제 (CRUD)
- JWT 기반 인증 (회원가입/로그인)

## 로컬 실행 방법

### 1. 저장소 클론
```bash
git clone https://github.com/lukaPlayground/trip-planner.git
cd trip-planner
```

### 2. 환경 변수 설정
```bash
# backend/.env
PORT=5001
MONGODB_URI=mongodb://localhost:27017/trip-planner
JWT_SECRET=your_secret_key
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_PLACES_API_KEY

# frontend/.env
VITE_API_URL=http://localhost:5001/api
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

### 4. 접속
- 프론트엔드: http://localhost:5173
- 백엔드 API: http://localhost:5001/api

## 이동수단 & 경로 색상

| 이동수단 | 색상 | 경로선 |
|---------|------|--------|
| 도보 | 🟢 #10b981 | 점선 |
| 자전거 | 🟢 #34d399 | 점선 |
| 바이크 | 🟣 #a855f7 | 실선 |
| 버스 | 🔵 #3b82f6 | 실선 |
| 지하철 | 🔵 #6366f1 | 실선 |
| 기차 | 🟣 #8b5cf6 | 실선 |
| 자차 | 🟠 #f97316 | 실선 |
| 택시 | 🟡 #eab308 | 실선 |
| 배 | 🔵 #06b6d4 | 실선 |
| 비행기 | 🩷 #ec4899 | 실선 |

## TODO
- [ ] PDF/이미지 내보내기
- [ ] 모바일 반응형 최적화
- [ ] 다크모드
- [ ] 예상 소요시간/비용 계산
- [ ] 여행 계획 공유 기능
