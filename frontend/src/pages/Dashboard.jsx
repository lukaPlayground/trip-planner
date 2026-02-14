import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import Map from '../components/Map';
import PlaceList from '../components/PlaceList';
import SearchBar from '../components/SearchBar';
import api from '../api/axios';
import { FaPlus, FaSave, FaSignOutAlt, FaTrash, FaChevronDown } from 'react-icons/fa';

const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [places, setPlaces] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showPlanList, setShowPlanList] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadPlans();
  }, [user, navigate]);

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
    const updatedPlaces = [
      ...places,
      { ...newPlace, order: places.length + 1, id: Date.now().toString() }
    ];
    setPlaces(updatedPlaces);
  };

  const handleReorder = (reorderedPlaces) => {
    setPlaces(reorderedPlaces);
  };

  const handleToggleCheck = (index) => {
    const updated = [...places];
    updated[index] = { ...updated[index], checked: !updated[index].checked };
    setPlaces(updated);
  };

  const handleDelete = (index) => {
    const updated = places.filter((_, i) => i !== index);
    const reordered = updated.map((place, i) => ({ ...place, order: i + 1 }));
    setPlaces(reordered);
  };

  const handleUpdateNote = (index, note) => {
    const updated = [...places];
    updated[index] = { ...updated[index], note };
    setPlaces(updated);
  };

  const handleUpdateTransport = (index, transport) => {
    const updated = [...places];
    updated[index] = { ...updated[index], transport };
    setPlaces(updated);
  };

  const handleUpdateReservation = (index, reservation) => {
    const updated = [...places];
    updated[index] = { ...updated[index], reservation };
    setPlaces(updated);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const checkedCount = places.filter(p => p.checked).length;

  return (
    <div className="h-screen flex flex-col" onClick={() => showPlanList && setShowPlanList(false)}>
      {/* 헤더 */}
      <header className="bg-blue-600 text-white px-4 py-3 flex justify-between items-center shadow-md z-[2000] relative">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold cursor-pointer" onClick={() => navigate('/')}>
            Trip Planner
          </h1>

          {/* 현재 계획 선택 드롭다운 */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowPlanList(!showPlanList); }}
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              {currentPlan ? currentPlan.planName : '계획 선택'}
              <FaChevronDown size={10} />
            </button>

            {showPlanList && (
              <div className="absolute top-full left-0 mt-1 bg-white text-gray-800 rounded-lg shadow-xl border border-gray-200 min-w-[220px] z-[2100] max-h-60 overflow-y-auto">
                {plans.map((plan) => (
                  <div
                    key={plan._id}
                    className={`flex justify-between items-center px-3 py-2 hover:bg-gray-50 cursor-pointer ${
                      currentPlan?._id === plan._id ? 'bg-blue-50 text-blue-600' : ''
                    }`}
                  >
                    <span
                      className="flex-1 truncate text-sm"
                      onClick={() => selectPlan(plan)}
                    >
                      {plan.planName}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deletePlan(plan._id); }}
                      className="text-gray-400 hover:text-red-500 p-1"
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

        <div className="flex items-center gap-2">
          <span className="text-sm text-blue-200 hidden sm:inline">{user?.name}</span>
          <button
            onClick={createNewPlan}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-blue-600 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            <FaPlus size={12} /> 새 계획
          </button>
          <button
            onClick={savePlan}
            disabled={!currentPlan || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            <FaSave size={12} /> {saving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 rounded-lg hover:bg-blue-800 text-sm transition-colors"
          >
            <FaSignOutAlt size={12} />
          </button>
        </div>
      </header>

      {/* 저장 토스트 메시지 */}
      {saveMessage && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg shadow-lg text-sm font-medium z-[3000] transition-all ${
          saveMessage === '저장되었습니다'
            ? 'bg-green-500 text-white'
            : 'bg-red-500 text-white'
        }`}>
          {saveMessage}
        </div>
      )}

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 지도 영역 (60%) */}
        <div className="w-3/5 bg-gray-200 relative">
          <Map places={places} />
        </div>

        {/* 사이드바 (40%) */}
        <div className="w-2/5 flex flex-col bg-gray-50 border-l border-gray-200">
          {currentPlan ? (
            <>
              {/* 계획 정보 */}
              <div className="p-4 border-b border-gray-200 bg-white">
                <h2 className="text-lg font-bold text-gray-800">{currentPlan.planName}</h2>
                <div className="flex gap-3 mt-1 text-sm text-gray-500">
                  <span>장소 {places.length}개</span>
                  {places.length > 0 && (
                    <span className="text-green-600">
                      완료 {checkedCount}/{places.length}
                    </span>
                  )}
                </div>
                {places.length > 0 && (
                  <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-300"
                      style={{ width: `${(checkedCount / places.length) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 검색창 (고정) */}
              <div className="p-4 border-b border-gray-200 bg-white">
                <SearchBar onAddPlace={handleAddPlace} />
              </div>

              {/* 장소 리스트 (스크롤) */}
              <div className="flex-1 overflow-y-auto p-4">
                <PlaceList
                  places={places}
                  onReorder={handleReorder}
                  onToggleCheck={handleToggleCheck}
                  onDelete={handleDelete}
                  onUpdateNote={handleUpdateNote}
                  onUpdateTransport={handleUpdateTransport}
                  onUpdateReservation={handleUpdateReservation}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <p className="text-gray-400 text-lg mb-4">계획을 만들어 시작하세요</p>
                <button
                  onClick={createNewPlan}
                  className="px-6 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium transition-colors"
                >
                  <FaPlus className="inline mr-2" /> 새 계획 만들기
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
