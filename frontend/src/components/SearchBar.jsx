import { useState } from 'react';
import { FaSearch, FaPlus, FaSpinner } from 'react-icons/fa';
import api from '../api/axios';

const SearchBar = ({ onAddPlace }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError('');
    setSearchResults([]);

    try {
      const response = await api.get('/places/search', {
        params: { query: searchQuery }
      });

      if (response.data.length === 0) {
        setError('검색 결과가 없습니다. 다른 키워드로 시도해보세요.');
      } else {
        setSearchResults(response.data);
      }
    } catch (err) {
      console.error('검색 실패:', err);
      setError('장소 검색에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPlace = (result) => {
    onAddPlace({
      name: result.name,
      address: result.address,
      lat: result.lat,
      lng: result.lng,
      order: 0,
      checked: false,
      note: ''
    });
    setSearchQuery('');
    setSearchResults([]);
    setError('');
  };

  return (
    <div className="relative">
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="장소 검색 (예: 서울역, 해운대)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          disabled={loading}
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2 text-sm font-medium"
        >
          {loading ? <FaSpinner className="animate-spin" size={13} /> : <FaSearch size={13} />}
          {loading ? '검색 중...' : '검색'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-gray-500 px-1 mt-2">{error}</p>
      )}

      {searchResults.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 shadow-lg max-h-72 overflow-y-auto z-50">
          {searchResults.map((result, index) => (
            <div key={index} className="p-3 flex justify-between items-center hover:bg-gray-50">
              <div className="min-w-0 flex-1 mr-3">
                <h4 className="font-semibold text-gray-800 truncate">{result.name}</h4>
                <p className="text-sm text-gray-500 truncate">{result.address}</p>
              </div>
              <button
                onClick={() => handleAddPlace(result)}
                className="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-1 text-sm whitespace-nowrap flex-shrink-0"
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
