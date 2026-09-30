import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
    {
      username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },
  
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
      },
  
      passwordHash: {
        type: String,
        required: true,
      },
  
      role: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'admin'],
        default: 'pending',
      },
  
      emailVerified: {
        type: Boolean,
        default: false,
      },
  
      verificationToken: {
        type: String,
        default: null,
      },
  
      verificationTokenExpires: {
        type: Date,
        default: null,
      },

      adminApprovalToken: {
        type: String,
        default: null,
      },

      adminApprovalTokenExpires: {
        type: Date,
        default: null,
      },

      passwordResetToken: {
        type: String,
        default: null,
      },

      passwordResetTokenExpires: {
        type: Date,
        default: null,
      },

      deleteAccountToken: {
        type: String,
        default: null,
      },

      deleteAccountTokenExpires: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true, // creates createdAt and updatedAt automatically
    }
  );


const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;