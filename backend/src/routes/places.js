const express = require('express');
const router = express.Router();

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// 장소 검색 (Google Places Text Search)
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || !query.trim()) {
      return res.status(400).json({ message: '검색어를 입력해주세요' });
    }

    if (!GOOGLE_API_KEY) {
      return res.status(500).json({ message: 'Google Maps API 키가 설정되지 않았습니다' });
    }

    // Google Places API (New) - Text Search
    const url = `https://places.googleapis.com/v1/places:searchText`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.types'
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'ko',
        maxResultCount: 8
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('Google API Error:', data.error);
      return res.status(502).json({ message: 'Google API 호출 실패', error: data.error.message });
    }

    const places = (data.places || []).map(place => ({
      name: place.displayName?.text || '',
      address: place.formattedAddress || '',
      lat: place.location?.latitude || 0,
      lng: place.location?.longitude || 0,
      types: place.types || []
    }));

    res.json(places);
  } catch (error) {
    console.error('Place search error:', error.message);
    res.status(500).json({ message: '장소 검색 실패', error: error.message });
  }
});

module.exports = router;
