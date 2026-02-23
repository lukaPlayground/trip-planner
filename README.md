# Trip Planner - 여행계획 지도 도우미

지도를 보며 여행 순서를 체크리스트처럼 관리하는 풀스택 웹앱

## 기술 스택
- **Frontend**: React + Vite + Tailwind CSS v4
- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Maps**: Leaflet.js + OpenStreetMap (무료)
- **Routing**: Valhalla 공개 서버 (도로 기반), ODsay LAB (대중교통)
- **Search**: Google Places API (Text Search, 백엔드 프록시)
- **Export**: html2canvas + jsPDF
- **Auth**: JWT + bcrypt

## 주요 기능
- Leaflet.js 지도 기반 장소 검색 및 추가
- 드래그 앤 드롭으로 이동 순서 관리
- 10종 교통수단 선택 (도보, 자전거, 바이크, 버스, 지하철, 기차, 자차, 택시, 배, 비행기)
- 이동수단별 색상 + 선 패턴으로 경로 구분
- 실제 도로 기반 경로 (Valhalla), 대중교통 실제 노선 (ODsay)
- 예상 소요시간 / 거리 자동 계산 및 사이드바 표시
- 체크박스로 방문 완료 표시 + 진행률 바
- 장소별 메모 + 교통수단별 예약번호 입력
- 여행 계획 저장/수정/삭제 (CRUD)
- PDF 내보내기 (지도 캡처 + 장소 목록)
- 화면 캡처 (지도 + 목록 전체 PNG 저장)
- 여행 계획 공유 (공개 링크 생성, `/shared/:id` 공개 읽기 전용 뷰)
- 모바일 반응형 (375px~, 지도/목록 탭 전환)
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
JWT_SECRET=your_jwt_secret_key
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_PLACES_API_KEY
ODSAY_API_KEY=YOUR_ODSAY_API_KEY          # https://lab.odsay.com 에서 발급
SEOUL_BUS_API_KEY=YOUR_SEOUL_BUS_API_KEY  # 공공데이터포털에서 발급 (선택)

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

---

## 이동수단 & 경로

| 이동수단 | 색상 | 경로 방식 |
|---------|------|----------|
| 도보 | 🟢 #10b981 | Valhalla `pedestrian` (보도 우선) |
| 자전거 | 🟢 #34d399 | Valhalla `bicycle` (자전거도로 우선) |
| 바이크 | 🟣 #a855f7 | Valhalla `motor_scooter` (자동차전용도로 회피) |
| 버스 | 🔵 #3b82f6 | ODsay `SearchPathType=2` (버스 우선) |
| 지하철 | 🔵 #6366f1 | ODsay `SearchPathType=1` (지하철 우선) |
| 기차 | 🟣 #8b5cf6 | 직선 (고정 철도 노선) |
| 자차 | 🟠 #f97316 | Valhalla `auto` |
| 택시 | 🟡 #eab308 | Valhalla `auto` |
| 배 | 🔵 #06b6d4 | 직선 (해상 경로) |
| 비행기 | 🩷 #ec4899 | 직선 (항공 경로) |

---

## 라우팅 엔진 조사 기록 (2026.02)

교통수단별 실제 도로교통법에 맞는 경로를 구현하기 위해 진행한 API 조사 결과를 정리한다.

### 문제 인식

초기 구현에서 OSRM 데모 서버(`router.project-osrm.org`)를 사용했으나 두 가지 치명적인 문제를 발견했다.

1. **프로파일 동작 이상**: car / bike / foot 3개 프로파일이 동일한 경로를 반환한다. 서울→부산 장거리 테스트에서 3개 프로파일 모두 396.7km, 4321 포인트로 완전히 동일했다.
2. **exclude 파라미터 미지원**: `exclude=motorway` 등의 파라미터를 넣으면 `InvalidValue` 에러가 발생한다.

결론적으로 **OSRM 데모 서버는 단일 프로파일(car)만 서비스하고 있는 상태**였다.

### 라우팅 엔진 비교

| 엔진 | 서버 | 비용 | 프로파일 수 | 한국 적용 | 비고 |
|------|------|------|------------|----------|------|
| OSRM (데모) | router.project-osrm.org | 무료 | 1 (사실상) | 불가 | 프로파일 버그, exclude 미지원 |
| OSRM (자체) | 직접 호스팅 | 서버비용 | 3 | 가능 | OSM 데이터 기반, 한국법 미반영 |
| **Valhalla (OSM)** | valhalla1.openstreetmap.de | **무료** | **5+** | **가능** | **채택** |
| GraphHopper | graphhopper.com | 유료 | 다수 | 가능 | API 키 필수, 무료 tier 없음 |
| Kakao Map | apis.map.kakao.com | 무료 tier | 제한적 | 완벽 | 한국 특화, 월 300,000건 |
| Naver Map | navermaps.github.io | 무료 tier | 제한적 | 완벽 | 한국 특화, 월 200,000건 |

### 채택: Valhalla 공개 서버

**엔드포인트**: `https://valhalla1.openstreetmap.de/route`

- 무료, API 키 불필요
- OSM 데이터 기반 → 전 세계 도로망 적용
- 5개 교통수단 프로파일 지원, 실제로 다른 경로 반환

**서울역 → 강남역 프로파일별 실측값**

| costing | 거리 | 소요시간 | 특징 |
|---------|------|---------|------|
| `auto` | 9.8km | 27.6min | 자동차 최적 경로, 유료도로 가능 |
| `bicycle` | 10.5km | 37.0min | 자전거 경로, 고속도로 자동 회피 |
| `pedestrian` | 10.1km | 125.3min | 보행자 경로, 보도/횡단보도 우선 |
| `motor_scooter` | 10.8km | 34.4min | 이륜차 경로, 자동차전용도로 회피 |
| `bus` | 9.8km | 27.7min | 대형차 경로, 버스 가능 도로 |

**응답 형식 주의사항**: Valhalla는 경로를 GeoJSON이 아닌 **polyline6(precision=6) 인코딩**으로 반환한다. 또한 응답 JSON에 한글 도로명으로 인한 이스케이프 문자(`\\`)가 포함되어 표준 `JSON.parse()`가 실패할 수 있다.

```javascript
// Valhalla polyline6 디코딩 함수
function decodePolyline(encoded, precision = 6) {
  const inv = Math.pow(10, precision);
  const decoded = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    for (let d of ['lat', 'lng']) {
      let shift = 0, result = 0, byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (d === 'lat') lat += delta;
      else { lng += delta; decoded.push([lat / inv, lng / inv]); }
    }
  }
  return decoded; // [[lat, lng], ...]
}
```

**장거리 제한**: `bicycle`, `pedestrian` costing은 200km 이상 경로 계산 불가 (`Path distance exceeds the max distance limit` 에러). 장거리 자전거/도보 경로는 직선 폴백 처리가 필요하다.

### ODsay LAB 대중교통 API

- **Service URI 등록**: `http://localhost`, `http://localhost:5173`
- **API 가이드**: https://lab.odsay.com/guide/guide#guideWeb_1
- **인증 방식**: API 키 + **Origin 헤더 기반 도메인 인증** (브라우저 직접 호출 불가 → 백엔드 프록시 필수)

**핵심 발견**: ODsay는 단순 API 키 인증이 아니라 등록된 도메인에서의 `Origin` 헤더 검증을 사용한다. 백엔드에서 직접 호출 시 `[ApiKeyAuthFailed]`가 반환된다. 해결: 백엔드 fetch에 `headers: { 'Origin': 'http://localhost:5173' }` 추가.

**SearchPathType 파라미터**

| 값 | 설명 | 사용 |
|----|------|------|
| `0` | 최적 경로 (버스+지하철 혼합) | 기본값 |
| `1` | 지하철 우선 | subway 교통수단 선택 시 |
| `2` | 버스 우선 | bus 교통수단 선택 시 |

**응답 구조**

```
result.path[0]          → 최적 경로 (첫 번째)
  .info.totalTime       → 총 소요시간 (분)
  .info.totalDistance   → 총 거리 (m)
  .info.payment         → 요금 (원)
  .subPath[]            → 구간별 경로
    .trafficType        → 1=지하철, 2=버스, 3=도보
    .passStopList.stations[].x/y  → 정류장 좌표 (string)
    .startX/Y, endX/Y   → 도보 구간 시작/끝 좌표
```

**주의**: stations의 x, y 좌표는 문자열(`"126.976851"`)로 반환됨 → `parseFloat()` 필수

### 교통수단별 라우팅 전략 (대한민국 기준)

| 교통수단 | 라우팅 전략 | API | 도로교통법 근거 |
|---------|-----------|-----|--------------|
| 도보 | Valhalla | `pedestrian` | 보도 우선, 자동차전용도로 진입 불가 |
| 자전거 | Valhalla | `bicycle` | 자전거도로 우선, 고속도로/자동차전용도로 진입 불가 |
| 바이크 | Valhalla | `motor_scooter` | 125cc 이하 고속도로 진입 불가, 자동차전용도로 제한 |
| 버스 | ODsay | `SearchPathType=2` | 버스 우선 대중교통 경로 |
| 지하철 | ODsay | `SearchPathType=1` | 지하철 우선 대중교통 경로 |
| 기차 | 직선 | — | 고정 철도 노선, 도로망과 무관 |
| 자차 | Valhalla | `auto` | 일반 차량 기준 |
| 택시 | Valhalla | `auto` | 일반 차량 기준 |
| 배 | 직선 | — | 해상 경로 |
| 비행기 | 직선 | — | 항공 경로 |

### 국가교통정보센터 API (ITS)

**엔드포인트**: `https://openapi.its.go.kr:9443`

실시간 교통 데이터를 제공한다. 라우팅 자체에는 쓸 수 없지만, 경로 위 구간별 실시간 속도/제한속도 정보로 **예상 소요시간 계산**에 활용 가능하다.

| 엔드포인트 | 데이터 | 활용 방안 |
|-----------|--------|---------|
| `/trafficInfo` | 구간별 통행속도(km/h), 통행시간(초) | 경로 위 실시간 속도 → 소요시간 보정 |
| `/vslInfo` | 가변속도제한 (limitSpeed, linkId, 좌표) | 구간별 제한속도 오버레이 |
| `/eventInfo` | 돌발상황 (사고, 공사, 정체) 좌표 | 경로 위 위험구간 경고 |
| `/vmsInfo` | 전광판 메시지, 도로등급(roadGrad) | 도로등급 참조 (101=고속도로, 103=국도) |

```
# 요청 예시 (서울 특정 영역 교통소통정보)
GET https://openapi.its.go.kr:9443/trafficInfo
  ?apiKey={YOUR_KEY}
  &type=all          # all / ex(고속도로) / its(국도)
  &minX=126.97&maxX=127.00
  &minY=37.56&maxY=37.58
  &getType=json

# 응답 필드: roadName, linkId, startNodeId, endNodeId, speed, travelTime, createdDate
```

API 키는 [ITS 국가교통정보센터](https://www.its.go.kr)에서 회원가입 후 신청. 승인까지 영업일 3~5일 소요. 일일 트래픽 제한 없음.

### 서울특별시 대중교통환승경로 API

- **Base URL**: `http://ws.bus.go.kr/api/rest/pathinfo`
- **출처**: 공공데이터포털

| 오퍼레이션 | URL | 설명 |
|-----------|-----|------|
| `getPathInfoByBus` | `.../getPathInfoByBus` | 버스 전용 경로 |
| `getPathInfoBySubway` | `.../getPathInfoBySubway` | 지하철 전용 경로 |
| `getPathInfoByBusNSub` | `.../getPathInfoByBusNSub` | 버스+지하철 환승 경로 |

**응답**: XML. 구간 출발/도착 좌표만 제공 (폴리라인 없음)
**⚠️ CORS 미지원**: 반드시 백엔드 프록시를 통해 호출해야 한다.
**서울 지역 한정**: 서울시 버스/지하철 노선 기준.

---

## TODO

- [x] OSRM 도로 기반 라우팅 적용
- [x] **Valhalla 라우팅 엔진 교체** (교통수단별 실제 다른 경로 반영)
- [x] **대중교통 노선 API 연동** (ODsay LAB)
  - 백엔드 프록시 `/api/transit/route` — Origin 헤더로 ODsay 도메인 인증 우회
  - bus(`SearchPathType=2`) / subway(`SearchPathType=1`) 분리 → 서로 다른 노선 표시
  - ODsay 소요시간(분→초) / 거리(m→km) 변환 후 사이드바 반영
- [x] **예상 소요시간/거리 계산** (Valhalla time/length, ODsay totalTime/totalDistance 활용)
- [x] **PDF/이미지 내보내기**
  - `useExport` 커스텀 훅 (html2canvas + jsPDF)
  - PDF: 지도 캡처(1페이지) + 장소 목록(이후 페이지)
  - 화면 캡처: `#dashboard-main` 전체 PNG 저장
  - html2canvas 호환을 위해 숫자 뱃지 `float:left + line-height` 방식으로 수정
- [x] **모바일 반응형 최적화** (375px 대응 — 헤더 버튼 최소화, 탭 전환, PlaceList 카드 재구성)
- [x] **여행 계획 공유 기능**
  - 공개/비공개 토글 (`isPublic` 필드, PATCH `/api/plans/:id/share`)
  - 공유 링크 클립보드 복사 (HTTPS 미적용 환경 fallback 처리)
  - `/shared/:id` 공개 읽기 전용 뷰
- [x] **공유/내보내기 통합 드롭다운** (링크공유 + PDF 저장 + 화면 캡처 한 곳으로)
- [ ] ITS API 연동 (경로 위 실시간 속도 → 소요시간 보정, API 키 신청 필요)
- [ ] 200km+ 자전거/도보 경로 폴백 개선
