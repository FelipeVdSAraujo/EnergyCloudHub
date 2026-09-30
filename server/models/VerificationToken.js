const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema(
    {
      userId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },
  

      token: {
        type: String,
        unique: true,
        required: true,
      },
  
    
  }
  ,
    {
      timestamps: true, // creates createdAt and updatedAt automatically
    }
);
module.exports = mongoose.model('Token', tokenSchema);