const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

// Create the uploads directory if it does not exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();

// Allow cross‑origin requests so the script can be injected into storefronts
app.use(cors());
// Parse JSON and URL encoded payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from the public and uploads folders
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Load settings which define branding options for products and collections
const settingsPath = path.join(__dirname, 'settings.json');
let settings = { products: {} };
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (err) {
  console.warn('No settings file found or invalid JSON. Using empty settings.');
}

// Configure file storage for uploads. Files are stored in the uploads directory
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

/**
 * Helper endpoint to retrieve the branding configuration for a given product.
 * The frontend script uses this to determine whether to display the branding
 * selector and which price adjustments apply. The productId must be passed
 * as a query parameter. If no configuration exists for the product the
 * response will indicate failure.
 */
app.get('/api/options', (req, res) => {
  const productId = req.query.productId;
  if (!productId) {
    return res.status(400).json({ success: false, message: 'Missing productId' });
  }
  const config = settings.products[productId];
  if (config) {
    return res.json({ success: true, options: config });
  }
  return res.json({ success: false, options: null });
});

/**
 * Endpoint to handle file uploads from the product page. The uploaded file
 * is stored on the server and a relative URL is returned. The frontend
 * script can attach this URL to the cart item properties. Note that in a
 * production environment the upload should be stored on a secure service
 * such as Shopify Files or an S3 bucket. For demonstration purposes we
 * store it locally.
 */
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  // Return a relative URL so it can be referenced from within the storefront
  const url = `/uploads/${req.file.filename}`;
  return res.json({ success: true, url });
});

// The server runs on PORT or defaults to 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Branding app server is listening on port ${PORT}`);
});