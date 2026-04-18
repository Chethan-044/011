const cloudinary = require('cloudinary').v2;

/**
 * Configure Cloudinary when credentials are present (optional for hackathon demo).
 */
const initCloudinary = () => {
  if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    console.log('[Cloudinary] Configured');
  } else {
    console.log('[Cloudinary] Skipped — credentials not set');
  }
};

module.exports = { cloudinary, initCloudinary };
