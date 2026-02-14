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
  transport: {
    type: String,
    enum: ['walk', 'transit', 'car', 'taxi'],
    default: 'transit'
  },
  estimatedTime: String,
  category: String
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

planSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

planSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('Plan', planSchema);
