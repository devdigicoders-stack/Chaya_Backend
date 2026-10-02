const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `doc-${cleanName}-${uniqueSuffix}${ext}`);
  }
});

// File filter (Images, PDFs, docs, Audio, Video recordings)
const fileFilter = (req, file, cb) => {
  const allowedExtensions = /jpeg|jpg|png|webp|pdf|doc|docx|mp3|wav|m4a|aac|ogg|webm|mp4|mov|mkv|3gp|flac|avi|m4v/;
  const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
  if (extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only document, image, audio, or video files are allowed!'));
  }
};

const documentUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max size for videos and recordings
  fileFilter
});

module.exports = documentUpload;
