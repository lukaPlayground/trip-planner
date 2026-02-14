import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FaMapMarkedAlt, FaListOl, FaCheckSquare, FaSave } from 'react-icons/fa';

const features = [
  { icon: <FaMapMarkedAlt size={28} />, title: '지도 기반', desc: '지도를 보며 장소를 검색하고 추가' },
  { icon: <FaListOl size={28} />, title: '순서 관리', desc: '드래그 앤 드롭으로 이동 순서 변경' },
  { icon: <FaCheckSquare size={28} />, title: '체크리스트', desc: '방문한 장소를 체크하며 진행' },
  { icon: <FaSave size={28} />, title: '저장 & 공유', desc: '일정을 저장하고 언제든 확인' },
];

const Home = () => {
  const { user } = useContext(AuthContext);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* 네비게이션 */}
      <nav className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600">Trip Planner</h1>
          <div className="flex gap-3">
            {user ? (
              <Link
                to="/dashboard"
                className="px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                대시보드
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-5 py-2 text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors font-medium"
                >
                  로그인
                </Link>
                <Link
                  to="/login?tab=register"
                  className="px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                >
                  시작하기
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* 히어로 섹션 */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-4xl md:text-5xl font-extrabold text-gray-800 leading-tight">
          여행 계획,<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-600">
            지도 위에서 한눈에
          </span>
        </h2>
        <p className="mt-5 text-lg text-gray-500 max-w-2xl mx-auto">
          장소를 검색하고, 순서를 정하고, 체크리스트로 관리하세요.
          드래그 앤 드롭으로 간편하게 이동 경로를 설계할 수 있습니다.
        </p>
        <div className="mt-8">
          <Link
            to={user ? '/dashboard' : '/login?tab=register'}
            className="inline-block px-8 py-3 bg-blue-500 text-white text-lg rounded-xl hover:bg-blue-600 transition-colors font-medium shadow-lg shadow-blue-200"
          >
            무료로 시작하기
          </Link>
        </div>
      </section>

      {/* 기능 소개 */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="text-blue-500 mb-3">{f.icon}</div>
              <h3 className="font-bold text-gray-800 text-lg">{f.title}</h3>
              <p className="text-gray-500 text-sm mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 푸터 */}
      <footer className="border-t border-gray-200 bg-white/60">
        <div className="max-w-6xl mx-auto px-6 py-6 text-center text-sm text-gray-400">
          &copy; 2025 Trip Planner. Built with React + Express + MongoDB.
        </div>
      </footer>
    </div>
  );
};

export default Home;
