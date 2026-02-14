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
