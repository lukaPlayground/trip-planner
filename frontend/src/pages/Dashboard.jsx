import { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import Map from '../components/Map';
import PlaceList from '../components/PlaceList';
import SearchBar from '../components/SearchBar';
import api from '../api/axios';
import { useExport } from '../components/ExportButton';
import {
  FaPlus, FaSave, FaSignOutAlt, FaTrash, FaChevronDown,
  FaShareAlt, FaLink, FaCopy, FaFilePdf, FaCheck,
} from 'react-icons/fa';

const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [places, setPlaces] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showPlanList, setShowPlanList] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeSegments, setRouteSegments] = useState([]); // 구간별 소요시간/거리/환승정보
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(null);
  const [focusedPlace, setFocusedPlace] = useState(null); // 장소 클릭 → 지도 flyTo
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [shareToast, setShareToast] = useState('');
  const [mobileTab, setMobileTab] = useState('map'); // 'map' | 'list'

  // 지도 컨테이너 ref (캡처용)
  const mapContainerRef = useRef(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadPlans();
  }, [user, navigate]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClick = () => {
      setShowPlanList(false);
      setShowShareMenu(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
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
    setShowPlanList(false);
  };

  const createNewPlan = async () => {
    const planName = prompt('새 계획 이름:');
    if (!planName?.trim()) return;
    try {
      const response = await api.post('/plans', {
        planName: planName.trim(),
        description: '',
        places: []
      });
      setPlans([response.data, ...plans]);
      selectPlan(response.data);
    } catch (error) {
      console.error('계획 생성 실패:', error);
    }
  };

  const deletePlan = async (planId) => {
    if (!confirm('이 계획을 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/plans/${planId}`);
      const updated = plans.filter(p => p._id !== planId);
      setPlans(updated);
      if (currentPlan?._id === planId) {
        if (updated.length > 0) {
          selectPlan(updated[0]);
        } else {
          setCurrentPlan(null);
          setPlaces([]);
        }
      }
    } catch (error) {
      console.error('삭제 실패:', error);
    }
  };

  const savePlan = async () => {
    if (!currentPlan) return;
    setSaving(true);
    try {
      const response = await api.put(`/plans/${currentPlan._id}`, {
        ...currentPlan,
        places
      });
      setCurrentPlan(response.data);
      setPlans(plans.map(p => p._id === response.data._id ? response.data : p));
      setSaveMessage('저장되었습니다');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (error) {
      console.error('저장 실패:', error);
      setSaveMessage('저장 실패');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPlace = (newPlace) => {
    setPlaces(prev => [
      ...prev,
      { ...newPlace, order: prev.length + 1, id: Date.now().toString() }
    ]);
  };

  const handleReorder = (reorderedPlaces) => setPlaces(reorderedPlaces);

  const handleToggleCheck = (index) => {
    setPlaces(prev => prev.map((p, i) => i === index ? { ...p, checked: !p.checked } : p));
  };

  const handleDelete = (index) => {
    setPlaces(prev =>
      prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, order: i + 1 }))
    );
  };

  const handleUpdateNote = (index, note) => {
    setPlaces(prev => prev.map((p, i) => i === index ? { ...p, note } : p));
  };

  const handleUpdateTransport = (index, transport) => {
    setPlaces(prev => prev.map((p, i) => i === index ? { ...p, transport } : p));
  };

  const handleUpdateReservation = (index, reservation) => {
    setPlaces(prev => prev.map((p, i) => i === index ? { ...p, reservation } : p));
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // 클립보드 복사 (HTTPS + HTTP 로컬호스트 모두 대응)
  const copyToClipboard = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // HTTP 환경 폴백: textarea + execCommand
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!ok) throw new Error('execCommand copy failed');
  };

  // 공유 링크 토글
  const handleToggleShare = async () => {
    if (!currentPlan) return;
    setShowShareMenu(false);
    try {
      const response = await api.patch(`/plans/${currentPlan._id}/share`);
      const { isPublic } = response.data;
      const updated = { ...currentPlan, isPublic };
      setCurrentPlan(updated);
      setPlans(prev => prev.map(p => p._id === currentPlan._id ? { ...p, isPublic } : p));

      if (isPublic) {
        const shareUrl = `${window.location.origin}/shared/${currentPlan._id}`;
        try {
          await copyToClipboard(shareUrl);
          showToast('링크 복사됨');
        } catch {
          showToast(`공유 링크: ${shareUrl}`);
        }
      } else {
        showToast('공유가 비활성화되었습니다');
      }
    } catch (error) {
      console.error('공유 설정 실패:', error);
      showToast('공유 설정에 실패했습니다');
    }
  };

  // 공유 링크 복사 (이미 공개 상태인 경우)
  const handleCopyLink = async () => {
    if (!currentPlan) return;
    setShowShareMenu(false);
    const shareUrl = `${window.location.origin}/shared/${currentPlan._id}`;
    try {
      await copyToClipboard(shareUrl);
      showToast('링크 복사됨');
    } catch {
      showToast(`공유 링크: ${shareUrl}`);
    }
  };

  const showToast = (msg) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(''), 3500);
  };

  // 내보내기 훅 (routeSegments: 구간별 시간/거리/환승정보/유료도로 — PDF에 포함)
  const exportHelper = useExport({
    plan: currentPlan,
    places,
    routeInfo,
    routeSegments,
    mapContainerRef,
  });

  const handleExportPDF = async () => {
    setShowShareMenu(false);
    if (exportHelper) await exportHelper.exportToPDF();
  };

  const isExporting = exportHelper?.exporting;

  const checkedCount = places.filter(p => p.checked).length;

  const formatTime = (secs) => {
    if (!secs) return '';
    if (secs >= 3600) return `${Math.floor(secs / 3600)}시간 ${Math.round((secs % 3600) / 60)}분`;
    return `${Math.round(secs / 60)}분`;
  };

  return (
    <div className="h-screen flex flex-col">

      {/* ── 헤더 ── */}
      <header className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between shadow-md z-[2000] relative flex-shrink-0">

        {/* 왼쪽: 로고 + 계획 드롭다운 */}
        <div className="flex items-center gap-2 min-w-0">
          <h1
            className="text-base font-bold cursor-pointer whitespace-nowrap"
            onClick={() => navigate('/')}
          >
            Trip Planner
          </h1>

          {/* 계획 선택 드롭다운 */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowPlanList(!showPlanList); setShowShareMenu(false); }}
              className="flex items-center gap-1 bg-blue-700 hover:bg-blue-800 px-2 py-1.5 rounded-lg text-xs transition-colors max-w-[120px] sm:max-w-[180px]"
            >
              <span className="truncate">
                {currentPlan ? currentPlan.planName : '계획 선택'}
              </span>
              <FaChevronDown size={9} className="flex-shrink-0" />
            </button>

            {showPlanList && (
              <div className="absolute top-full left-0 mt-1 bg-white text-gray-800 rounded-lg shadow-xl border border-gray-200 min-w-[200px] z-[2100] max-h-60 overflow-y-auto">
                {plans.map((plan) => (
                  <div
                    key={plan._id}
                    className={`flex justify-between items-center px-3 py-2 hover:bg-gray-50 cursor-pointer ${
                      currentPlan?._id === plan._id ? 'bg-blue-50 text-blue-600' : ''
                    }`}
                  >
                    <span className="flex-1 truncate text-sm" onClick={() => selectPlan(plan)}>
                      {plan.planName}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deletePlan(plan._id); }}
                      className="text-gray-400 hover:text-red-500 p-1 flex-shrink-0"
                    >
                      <FaTrash size={11} />
                    </button>
                  </div>
                ))}
                {plans.length === 0 && (
                  <p className="text-sm text-gray-400 px-3 py-2">계획이 없습니다</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽: 액션 버튼들 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* 새 계획 */}
          <button
            onClick={createNewPlan}
            className="flex items-center gap-1 px-2 py-1.5 bg-white text-blue-600 rounded-lg hover:bg-gray-50 text-xs font-medium transition-colors"
            title="새 계획"
          >
            <FaPlus size={11} />
            <span className="hidden sm:inline">새 계획</span>
          </button>

          {/* 저장 */}
          <button
            onClick={savePlan}
            disabled={!currentPlan || saving}
            className="flex items-center gap-1 px-2 py-1.5 bg-green-500 rounded-lg hover:bg-green-600 disabled:opacity-50 text-xs font-medium transition-colors"
            title="저장"
          >
            <FaSave size={11} />
            <span className="hidden sm:inline">{saving ? '저장 중' : '저장'}</span>
          </button>

          {/* 공유/내보내기 통합 드롭다운 */}
          {currentPlan && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowShareMenu(!showShareMenu); setShowPlanList(false); }}
                disabled={!!isExporting}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                  currentPlan.isPublic
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-blue-700 hover:bg-blue-800'
                }`}
                title="공유 / 내보내기"
              >
                {isExporting ? (
                  <span className="text-xs">{isExporting === 'pdf' ? 'PDF...' : '캡처...'}</span>
                ) : (
                  <>
                    {currentPlan.isPublic ? <FaLink size={11} /> : <FaShareAlt size={11} />}
                    <span className="hidden sm:inline">
                      {currentPlan.isPublic ? '공유 중' : '공유'}
                    </span>
                    <FaChevronDown size={8} className="opacity-70" />
                  </>
                )}
              </button>

              {showShareMenu && (
                <div
                  className="absolute top-full right-0 mt-1 bg-white text-gray-800 rounded-xl shadow-xl border border-gray-100 z-[2100] overflow-hidden min-w-[180px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 링크 공유 섹션 */}
                  <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">공유</p>
                  </div>

                  {/* 공유 토글 */}
                  <button
                    onClick={handleToggleShare}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 hover:bg-gray-50 text-sm transition-colors"
                  >
                    {currentPlan.isPublic ? (
                      <>
                        <FaCheck size={12} className="text-green-500" />
                        <span>공유 비활성화</span>
                      </>
                    ) : (
                      <>
                        <FaShareAlt size={12} className="text-blue-500" />
                        <span>링크 공유 활성화</span>
                      </>
                    )}
                  </button>

                  {/* 링크 복사 (공개 상태일 때만) */}
                  {currentPlan.isPublic && (
                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 hover:bg-gray-50 text-sm transition-colors"
                    >
                      <FaCopy size={12} className="text-gray-500" />
                      <span>링크 복사</span>
                    </button>
                  )}

                  {/* 내보내기 섹션 */}
                  <div className="px-3 py-2 border-t border-b border-gray-100 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">내보내기</p>
                  </div>

                  <button
                    onClick={handleExportPDF}
                    disabled={places.length === 0}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 hover:bg-gray-50 text-sm transition-colors disabled:opacity-40"
                  >
                    <FaFilePdf size={13} className="text-red-500" />
                    <span>PDF로 저장</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 로그아웃 */}
          <button
            onClick={handleLogout}
            className="flex items-center px-2 py-1.5 bg-blue-700 rounded-lg hover:bg-blue-800 text-xs transition-colors"
            title="로그아웃"
          >
            <FaSignOutAlt size={11} />
          </button>
        </div>
      </header>

      {/* 저장 토스트 */}
      {saveMessage && (
        <div className={`fixed top-14 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-xs font-medium z-[3000] ${
          saveMessage === '저장되었습니다' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {saveMessage}
        </div>
      )}

      {/* 공유/내보내기 토스트 */}
      {shareToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-xs font-medium z-[3000] bg-blue-600 text-white max-w-xs text-center">
          {shareToast}
        </div>
      )}

      {/* 모바일 탭 전환 */}
      <div className="flex md:hidden border-b border-gray-200 bg-white flex-shrink-0">
        <button
          onClick={() => setMobileTab('map')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            mobileTab === 'map'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500'
          }`}
        >
          지도
        </button>
        <button
          onClick={() => setMobileTab('list')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            mobileTab === 'list'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500'
          }`}
        >
          장소 목록{places.length > 0 ? ` (${places.length})` : ''}
        </button>
      </div>

      {/* 메인 콘텐츠 */}
      <div id="dashboard-main" className="flex-1 flex overflow-hidden min-h-0">

        {/* 지도 영역 */}
        <div className={`bg-gray-200 relative ${
          mobileTab === 'map' ? 'flex-1' : 'hidden'
        } md:block md:w-3/5`}>
          <Map
            places={places}
            onRouteUpdate={({ totalTime, totalDistance, segments }) => {
              setRouteInfo({ totalTime, totalDistance });
              setRouteSegments(segments || []);
            }}
            mapContainerRef={mapContainerRef}
            selectedSegmentIndex={selectedSegmentIndex}
            focusedPlace={focusedPlace}
            onSegmentClick={(i) => {
              setSelectedSegmentIndex(i);
              // 모바일: 지도 탭 → 리스트 탭으로 전환
              setMobileTab('list');
            }}
          />
        </div>

        {/* 사이드바 */}
        <div className={`flex flex-col bg-gray-50 border-l border-gray-200 min-h-0 ${
          mobileTab === 'list' ? 'flex-1' : 'hidden'
        } md:flex md:w-2/5`}>
          {currentPlan ? (
            <>
              {/* 계획 정보 */}
              <div className="px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
                <h2 className="text-base font-bold text-gray-800 truncate">{currentPlan.planName}</h2>
                <div className="flex gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                  <span>장소 {places.length}개</span>
                  {places.length > 0 && (
                    <span className="text-green-600">완료 {checkedCount}/{places.length}</span>
                  )}
                  {routeInfo?.totalDistance > 0 && (
                    <span className="text-blue-600">{routeInfo.totalDistance.toFixed(1)}km</span>
                  )}
                  {routeInfo?.totalTime > 0 && (
                    <span className="text-orange-500">{formatTime(routeInfo.totalTime)}</span>
                  )}
                </div>
                {places.length > 0 && (
                  <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-300"
                      style={{ width: `${(checkedCount / places.length) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 검색창 */}
              <div className="px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
                <SearchBar onAddPlace={handleAddPlace} />
              </div>

              {/* 장소 리스트 */}
              <div className="flex-1 overflow-y-auto p-3">
                <PlaceList
                  places={places}
                  routeSegments={routeSegments}
                  selectedSegmentIndex={selectedSegmentIndex}
                  onReorder={handleReorder}
                  onToggleCheck={handleToggleCheck}
                  onDelete={handleDelete}
                  onUpdateNote={handleUpdateNote}
                  onUpdateTransport={handleUpdateTransport}
                  onUpdateReservation={handleUpdateReservation}
                  onPlaceClick={(place) => {
                    // 장소명 클릭 → 지도 flyTo + 모바일: 지도 탭으로 전환
                    setFocusedPlace({ lat: place.lat, lng: place.lng, ts: Date.now() });
                    setMobileTab('map');
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <p className="text-gray-400 text-base mb-4">계획을 만들어 시작하세요</p>
                <button
                  onClick={createNewPlan}
                  className="px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium transition-colors text-sm"
                >
                  <FaPlus className="inline mr-1.5" /> 새 계획 만들기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
